# pyrefly: ignore [missing-import]
"""
Unified Blender FBX Exporter & Headless 3D Thumbnail Renderer.
Supports both Single (Unified Mesh / Full Body) and Batch (Modular Outfits / Separated Meshes) export modes.
Automatically frames meshes in 3/4 isometric perspective and renders transparent 512x512 PNG thumbnails via Workbench.
"""
try:
    import bpy
    from mathutils import Vector
except ImportError:
    bpy = None  # type: ignore
    Vector = None  # type: ignore

import os
import re
import json
import math
import hashlib
from typing import Dict, List, Optional, Any, Set, Tuple, Union, Literal


# ==============================================================================
# Helper Classes & Preset Capture
# ==============================================================================

class MockOp:
    """Mock operator object to capture preset options from FBX exporter presets."""
    def __init__(self):
        self.options = {}

    def __setattr__(self, name, val):
        if name == 'options':
            super().__setattr__(name, val)
        else:
            self.options[name] = val


def compute_sha256(filepath: str) -> str:
    """Compute SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
    return sha256.hexdigest()


def normalize_name(name: str) -> str:
    """Strip blender suffixes like .001 and normalize separators."""
    name = re.sub(r'\.\d{3}$', '', name)
    return name.lower().replace("-", "_").replace(" ", "_")


def clean_asset_name(raw_name: str) -> str:
    """
    Clean raw Blender/DAZ object name into a concise, PascalCase canonical asset identifier.
    Examples:
        'BRZ US Bra Mesh' -> 'BrzUsBra'
        'Iridessa Hair Genesis 9 Mesh' -> 'IridessaHair'
        'Tactical_Combat_Shirt.001' -> 'TacticalCombatShirt'
    """
    if not raw_name:
        return "UnnamedAsset"

    cleaned = re.sub(r'\.\d{3}$', '', raw_name.strip())

    # Remove DAZ figure boilerplate phrases (case-insensitive)
    noise_patterns = [
        r'\bfor\s+genesis\s*[2389]\s*(?:female|male|feminine|masculine)?\b',
        r'\bgenesis\s*[2389]\s*(?:female|male|feminine|masculine)?\b',
        r'\bg[2389][fm]?\b',
    ]
    for pat in noise_patterns:
        cleaned = re.sub(pat, '', cleaned, flags=re.IGNORECASE)

    # Strip trailing generic geometry words (Mesh, Shape, Object, Geometry)
    while True:
        next_cleaned = re.sub(
            r'[\s_\-]+(?:mesh|shape|object|geometry)$',
            '',
            cleaned.strip(),
            flags=re.IGNORECASE
        )
        if next_cleaned == cleaned:
            break
        cleaned = next_cleaned

    # Split into alphanumeric tokens and format into PascalCase
    tokens = [t for t in re.split(r'[^a-zA-Z0-9]+', cleaned) if t]
    if tokens:
        cleaned = ''.join(t.capitalize() for t in tokens)
    else:
        fallback_tokens = [t for t in re.split(r'[^a-zA-Z0-9]+', raw_name) if t]
        cleaned = ''.join(t.capitalize() for t in fallback_tokens) or "UnnamedAsset"

    return cleaned


def find_matching_meshes(target_key: str) -> list:
    """Find meshes in scene based on exact, normalized, clean canonical, or substring match."""
    if not hasattr(bpy, "data"):
        return []
    target_norm = normalize_name(target_key)
    target_clean = clean_asset_name(target_key).lower()
    all_meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']

    # 1. Exact match
    exact = [obj for obj in all_meshes if obj.name == target_key]
    if exact:
        return exact

    # 2. Normalized match
    normalized = [obj for obj in all_meshes if normalize_name(obj.name) == target_norm]
    if normalized:
        return normalized

    # 3. Clean canonical name match
    if target_clean:
        cleaned_exact = [obj for obj in all_meshes if clean_asset_name(obj.name).lower() == target_clean]
        if cleaned_exact:
            return cleaned_exact

    # 4. Substring match
    substring = [
        obj for obj in all_meshes
        if target_norm in normalize_name(obj.name)
        or normalize_name(obj.name) in target_norm
        or (
            target_clean
            and (
                target_clean in clean_asset_name(obj.name).lower()
                or clean_asset_name(obj.name).lower() in target_clean
            )
        )
    ]
    if substring:
        return substring

    # 5. Custom Property match (fallback)
    custom_props = []
    for obj in all_meshes:
        for prop_name in obj.keys():
            if prop_name.startswith("_"):
                continue
            if target_norm in normalize_name(str(obj[prop_name])):
                custom_props.append(obj)
                break

    return custom_props


def select_mesh_with_armature(target_meshes: list):
    """Deselect all and ONLY select target meshes + their armature hierarchy."""
    if not hasattr(bpy, "ops"):
        return
    bpy.ops.object.select_all(action='DESELECT')

    for mesh in target_meshes:
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh

        # 1. Armature via Parent
        if mesh.parent and mesh.parent.type == 'ARMATURE':
            mesh.parent.select_set(True)

        # 2. Armature via Modifiers
        for mod in mesh.modifiers:
            if mod.type == 'ARMATURE' and mod.object:
                mod.object.select_set(True)


# ==============================================================================
# Material & Texture Inspection Helpers
# ==============================================================================

def _normalize_target_list(raw: Optional[List[str]]) -> List[str]:
    """Batch-first: only List[str]. No comma-split string parsing."""
    if not raw:
        return []
    return [str(x).strip() for x in raw if str(x).strip()]


def _unwrap_manifest(source: Any) -> Dict[str, Any]:
    """Accept manifest dict directly or wrapped {manifest: {...}}. Always return dict."""
    if not isinstance(source, dict):
        return {}
    if "asset_name" in source or "objects" in source:
        return source
    inner = source.get("manifest")
    if isinstance(inner, dict):
        return inner
    return {}


def count_used_slot_indices(obj: Any) -> Set[int]:
    """Return indices of material slots actually assigned to at least one polygon."""
    if not hasattr(obj, "data") or not obj.data or not hasattr(obj.data, "polygons"):
        return set()
    total = len(obj.data.materials)
    return {int(poly.material_index) for poly in obj.data.polygons if 0 <= int(poly.material_index) < total}


def trace_image_node_destination(node: Any, max_depth: int = 4) -> Tuple[str, str]:
    """Traces downstream links from a ShaderNodeTexImage to find the target shader socket."""
    color_out = node.outputs.get("Color")
    if not color_out or not color_out.links:
        alpha_out = node.outputs.get("Alpha")
        if alpha_out and alpha_out.links:
            target = alpha_out.links[0]
            return "Alpha", f"{target.to_node.name}.{target.to_socket.name}"
        return "Unconnected", "None"

    first_link = color_out.links[0]
    next_node = first_link.to_node
    next_socket = first_link.to_socket

    via_node = next_node.type.replace("BSDF_", "").replace("SHADER_", "").title()
    if next_node.type == 'NORMAL_MAP':
        via_node = "Normal Map"
        norm_out = next_node.outputs.get("Normal")
        if norm_out and norm_out.links:
            dest = norm_out.links[0]
            return via_node, f"{dest.to_node.name}.{dest.to_socket.name}"
        return via_node, "Normal"
    elif next_node.type == 'BUMP':
        via_node = f"Bump ({next_socket.name})"
        norm_out = next_node.outputs.get("Normal")
        if norm_out and norm_out.links:
            dest = norm_out.links[0]
            return via_node, f"{dest.to_node.name}.{dest.to_socket.name}"
        return via_node, "Normal"
    elif next_node.type in ('SEPARATE_COLOR', 'SEPARATE_RGB'):
        via_node = "Separate Color"
        dest_sockets = []
        for out_sock in next_node.outputs:
            for l in out_sock.links:
                dest_sockets.append(f"{out_sock.name}->{l.to_node.name}.{l.to_socket.name}")
        return via_node, (", ".join(dest_sockets) if dest_sockets else "Unconnected")
    elif next_node.type == 'BSDF_PRINCIPLED':
        return "Direct", f"Principled BSDF.{next_socket.name}"
    elif next_node.type == 'GROUP':
        return f"Group ({next_node.name})", f"Group Input: {next_socket.name}"

    curr_node = next_node
    depth = 0
    while curr_node and depth < max_depth:
        depth += 1
        primary_out = next((o for o in curr_node.outputs if o.links), None)
        if not primary_out:
            break
        dest_link = primary_out.links[0]
        if dest_link.to_node.type == 'BSDF_PRINCIPLED':
            return via_node, f"Principled BSDF.{dest_link.to_socket.name}"
        elif dest_link.to_node.type == 'OUTPUT_MATERIAL':
            return via_node, f"Material Output.{dest_link.to_socket.name}"
        curr_node = dest_link.to_node

    return via_node, f"{next_node.name}.{next_socket.name}"


def extract_material_textures(mat: Any, blend_dir: str = "") -> Tuple[List[str], List[Dict[str, Any]]]:
    """Extract texture file paths and their rich semantic graph bindings (Full Absolute Paths)."""
    if not mat:
        return [], []

    textures: List[str] = []
    bindings: List[Dict[str, Any]] = []
    seen_paths: Set[str] = set()

    if getattr(mat, "use_nodes", False) and mat.node_tree:
        def _collect_image_nodes(tree, visited=None):
            if visited is None:
                visited = set()
            if tree in visited:
                return []
            visited.add(tree)
            results = []
            for node in tree.nodes:
                if node.type == 'TEX_IMAGE' and getattr(node, 'image', None):
                    results.append(node)
                elif node.type == 'GROUP' and getattr(node, 'node_tree', None):
                    results.extend(_collect_image_nodes(node.node_tree, visited))
            return results

        for node in _collect_image_nodes(mat.node_tree):
            img = node.image
            raw_path = img.filepath or ""
            abs_path = bpy.path.abspath(raw_path) if raw_path else raw_path
            abs_path = abs_path.replace("\\", "/")

            if not abs_path:
                continue

            colorspace = getattr(getattr(img, "colorspace_settings", None), "name", "sRGB")
            via_node, target_socket = trace_image_node_destination(node)

            binding_info = {
                "path": abs_path,
                "colorspace": colorspace,
                "via_node": via_node,
                "target_socket": target_socket,
            }
            bindings.append(binding_info)

            if abs_path not in seen_paths:
                seen_paths.add(abs_path)
                textures.append(abs_path)

    return textures, bindings


def inspect_selected_meshes(meshes: List[Any]) -> List[Dict[str, Any]]:
    """Inspect slots and linked textures across selected mesh objects."""
    blend_dir = os.path.dirname(os.path.abspath(bpy.data.filepath)) if hasattr(bpy, "data") and bpy.data.filepath else ""
    slots_list: List[Dict[str, Any]] = []
    seen_slot_keys: Set[str] = set()
    current_index = 0

    for obj in meshes:
        used_indices = count_used_slot_indices(obj)
        if not hasattr(obj, "material_slots"):
            continue
        for slot_idx, slot in enumerate(obj.material_slots):
            if not slot.material:
                continue

            slot_name = slot.name or slot.material.name
            slot_key = f"{slot_name}_{slot.material.name}"
            if slot_key in seen_slot_keys:
                continue
            seen_slot_keys.add(slot_key)

            is_used = slot_idx in used_indices if used_indices else True
            textures, texture_bindings = extract_material_textures(slot.material, blend_dir)

            slots_list.append({
                "index": current_index,
                "original_index": slot_idx,
                "name": slot_name,
                "material_name": slot.material.name,
                "is_used": is_used,
                "source_object": obj.name,
                "textures": textures,
                "texture_bindings": texture_bindings,
            })
            current_index += 1

    return slots_list


# ==============================================================================
# Headless 3D Thumbnail Renderer (Workbench Auto-Framing)
# ==============================================================================

def render_mesh_thumbnail(
    target_meshes: List[Any],
    output_png_path: str,
    resolution: int = 512,
    padding: float = 1.15
) -> Optional[str]:
    """
    Renders an off-screen, transparent 3/4 isometric thumbnail of target_meshes using BLENDER_WORKBENCH.
    Applies Visibility Isolation (hiding all non-target objects during render).
    """
    if not hasattr(bpy, "data") or not hasattr(bpy, "ops") or not target_meshes:
        return None

    # Filter to mesh objects with geometry
    active_meshes = [m for m in target_meshes if getattr(m, "type", None) == 'MESH' and hasattr(m, "bound_box")]
    if not active_meshes:
        return None

    # 1. Collect world coordinates of bounding boxes
    all_coords = []
    for obj in active_meshes:
        try:
            for corner in obj.bound_box:
                all_coords.append(obj.matrix_world @ Vector(corner))
        except Exception:
            pass

    if not all_coords:
        return None

    min_c = Vector((min(c.x for c in all_coords), min(c.y for c in all_coords), min(c.z for c in all_coords)))
    max_c = Vector((max(c.x for c in all_coords), max(c.y for c in all_coords), max(c.z for c in all_coords)))
    center = (min_c + max_c) / 2.0
    radius = max((c - center).length for c in all_coords)
    if radius <= 0.0001:
        radius = 1.0

    # 2. Visibility Isolation: record original hide_render states and isolate targets
    orig_hide_render: Dict[Any, bool] = {}
    for obj in bpy.data.objects:
        orig_hide_render[obj] = obj.hide_render
        obj.hide_render = True

    for obj in active_meshes:
        obj.hide_render = False

    # 3. Save original Scene render settings
    scene = bpy.context.scene
    orig_camera = scene.camera
    orig_engine = scene.render.engine
    orig_res_x = scene.render.resolution_x
    orig_res_y = scene.render.resolution_y
    orig_res_pct = scene.render.resolution_percentage
    orig_film_trans = scene.render.film_transparent
    orig_file_format = scene.render.image_settings.file_format
    orig_color_mode = scene.render.image_settings.color_mode
    orig_filepath = scene.render.filepath

    cam_obj = None
    cam_data = None

    try:
        # 4. Create and place camera in 3/4 Isometric perspective (Yaw 40°, Pitch 18°)
        cam_data = bpy.data.cameras.new("ThumbCamera")
        cam_data.lens = 50  # 50mm natural perspective
        cam_obj = bpy.data.objects.new("ThumbCamera", cam_data)
        scene.collection.objects.link(cam_obj)
        scene.camera = cam_obj
        cam_obj.hide_render = False

        half_fov = cam_data.angle / 2.0
        dist = (radius / math.sin(half_fov)) * padding

        yaw = math.radians(40)
        pitch = math.radians(18)
        cam_x = center.x + dist * math.cos(pitch) * math.sin(yaw)
        cam_y = center.y - dist * math.cos(pitch) * math.cos(yaw)
        cam_z = center.z + dist * math.sin(pitch)
        cam_obj.location = Vector((cam_x, cam_y, cam_z))

        direction = center - cam_obj.location
        rot_quat = direction.to_track_quat('-Z', 'Y')
        cam_obj.rotation_euler = rot_quat.to_euler()

        # 5. Configure Workbench Renderer for ultra-fast, professional matcap studio capture
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.render.resolution_x = resolution
        scene.render.resolution_y = resolution
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = True
        scene.render.image_settings.file_format = 'PNG'
        scene.render.image_settings.color_mode = 'RGBA'

        clean_out_png = output_png_path.replace("\\", "/")
        os.makedirs(os.path.dirname(os.path.abspath(clean_out_png)), exist_ok=True)
        scene.render.filepath = clean_out_png

        if hasattr(scene, "display") and hasattr(scene.display, "shading"):
            shading = scene.display.shading
            shading.light = 'STUDIO'
            shading.color_type = 'MATERIAL'
            if hasattr(shading, "show_cavity"):
                shading.show_cavity = True
                if hasattr(shading, "cavity_type"):
                    shading.cavity_type = 'BOTH'

        # Render offscreen still
        bpy.ops.render.render(write_still=True)
        if os.path.exists(clean_out_png):
            print(f"[export_fbx] Rendered 3D thumbnail ({resolution}x{resolution}) to '{clean_out_png}'.", flush=True)
            return clean_out_png
        return None

    except Exception as e:
        print(f"[export_fbx] Warning: Failed to render thumbnail to '{output_png_path}': {e}", flush=True)
        return None

    finally:
        # 6. Clean Restore
        if cam_obj:
            try:
                bpy.data.objects.remove(cam_obj, do_unlink=True)
            except Exception:
                pass
        if cam_data:
            try:
                bpy.data.cameras.remove(cam_data, do_unlink=True)
            except Exception:
                pass

        scene.camera = orig_camera
        scene.render.engine = orig_engine
        scene.render.resolution_x = orig_res_x
        scene.render.resolution_y = orig_res_y
        scene.render.resolution_percentage = orig_res_pct
        scene.render.film_transparent = orig_film_trans
        scene.render.image_settings.file_format = orig_file_format
        scene.render.image_settings.color_mode = orig_color_mode
        scene.render.filepath = orig_filepath

        # Restore object visibility
        for obj, state in orig_hide_render.items():
            try:
                obj.hide_render = state
            except Exception:
                pass


# ==============================================================================
# Unified Main Exporter Flow
# ==============================================================================

def main(
    output_path: str = "",
    export_mode: str = "Auto",
    target_objects: Optional[Union[List[str], Dict[str, str], str]] = None,
    prefix: str = "",
    preset_path: str = "",
    render_thumbnail: bool = True,
    thumbnail_resolution: int = 512,
    **kwargs
) -> Dict[str, Any]:
    """
    Unified FBX Exporter and Headless 3D Thumbnail Renderer.
    Supports Single (whole scene / single character) and Batch (modular outfits) export modes.

    Args:
        output_path: Destination file path for Single mode (.fbx) or destination folder for Batch mode.
        export_mode: 'Single', 'Batch', or 'Auto' (infers mode from targets and output_path).
        target_objects: List of object names, or dict mapping (e.g. cloth_map from classify_mesh_types).
        prefix: Optional prefix prepended to filenames and manifest keys.
        preset_path: Optional path to FBX exporter preset script.
        render_thumbnail: If True, renders a transparent 512x512 3/4 isometric thumbnail PNG per FBX.
        thumbnail_resolution: Resolution of thumbnail PNG (default 512).
    """
    # 1. Resolve raw target source from target_objects or supported kwargs aliases
    raw_source = target_objects if target_objects is not None else (
        kwargs.get("cloth_map") or kwargs.get("manifest") or kwargs.get("clothes") or kwargs.get("export_map") or kwargs.get("mesh_names")
    )

    if isinstance(raw_source, str) and raw_source.strip().startswith(("{", "[")):
        try:
            raw_source = json.loads(raw_source)
        except Exception:
            pass

    if isinstance(raw_source, dict):
        if "cloth_map" in raw_source and isinstance(raw_source["cloth_map"], dict):
            raw_source = raw_source["cloth_map"]
        elif "export_map" in raw_source and isinstance(raw_source["export_map"], dict):
            raw_source = raw_source["export_map"]

    # 2. Determine actual mode: 'Single' vs 'Batch'
    clean_out = (output_path or "").strip().strip('"').strip("'").replace("\\", "/")
    mode = (export_mode or "Auto").strip().capitalize()

    if mode == "Auto":
        # If raw_source is a dict with multiple keys or output_path has no .fbx extension -> Batch
        if isinstance(raw_source, dict) and len(raw_source) > 1:
            mode = "Batch"
        elif clean_out and not clean_out.lower().endswith(".fbx"):
            mode = "Batch"
        elif not clean_out and isinstance(raw_source, dict):
            mode = "Batch"
        else:
            mode = "Single"

    # 3. Load Preset Options if provided
    preset_options: Dict[str, Any] = {}
    if preset_path and os.path.exists(preset_path):
        mock = MockOp()
        with open(preset_path, 'r', encoding='utf-8') as f:
            clean_code = "".join([l for l in f if "active_operator" not in l])
            exec(clean_code, {'bpy': bpy, 'op': mock})
        preset_options = mock.options

    preset_options['use_selection'] = True
    preset_options.pop('filepath', None)

    # ==========================================================================
    # BRANCH A: SINGLE EXPORT MODE (Unified Mesh / Single Character)
    # ==========================================================================
    if mode == "Single":
        if not clean_out:
            temp_dir = getattr(bpy.app, "tempdir", ".") if hasattr(bpy, "app") else "."
            clean_out = os.path.join(temp_dir, "exported.fbx").replace("\\", "/")

        base, _ = os.path.splitext(clean_out)
        final_fbx_path = (base + ".fbx").replace("\\", "/")
        os.makedirs(os.path.dirname(os.path.abspath(final_fbx_path)), exist_ok=True)

        asset_name = os.path.splitext(os.path.basename(final_fbx_path))[0]
        if prefix and not asset_name.startswith(prefix):
            asset_name = f"{prefix.strip('_')}_{asset_name}"

        # Resolve selection
        target_list: List[str] = []
        if isinstance(raw_source, list):
            target_list = [str(x).strip() for x in raw_source if str(x).strip()]
        elif isinstance(raw_source, dict):
            target_list = list(raw_source.keys())
        elif isinstance(raw_source, str) and raw_source.strip():
            target_list = [raw_source.strip()]

        if hasattr(bpy, "ops"):
            bpy.ops.object.select_all(action='DESELECT')
        selected_count = 0
        selected_meshes: List[Any] = []
        lowered = [t.lower() for t in target_list]

        if hasattr(bpy, "data"):
            for obj in bpy.data.objects:
                if not lowered or any(t in obj.name.lower() for t in lowered):
                    if obj.type in ['MESH', 'ARMATURE', 'EMPTY', 'CAMERA', 'LIGHT']:
                        obj.select_set(True)
                        selected_count += 1
                        if obj.type == 'MESH':
                            selected_meshes.append(obj)
                        if obj.type in ['MESH', 'ARMATURE']:
                            bpy.context.view_layer.objects.active = obj

        print(f"[export_fbx] [Single Mode] Exporting FBX to '{final_fbx_path}' with {selected_count} object(s) (Asset: '{asset_name}')...", flush=True)
        if hasattr(bpy, "ops"):
            try:
                bpy.ops.export_scene.fbx(filepath=final_fbx_path, **preset_options)
                print(f"[export_fbx] Successfully exported to '{final_fbx_path}'.", flush=True)
            except Exception as e:
                raise RuntimeError(f"Failed to export FBX: {e}")

        file_size = os.path.getsize(final_fbx_path) if os.path.exists(final_fbx_path) else 0
        file_hash = compute_sha256(final_fbx_path) if file_size > 0 else ""

        # Render Thumbnail
        thumb_path: Optional[str] = None
        if render_thumbnail and selected_meshes:
            png_out = os.path.splitext(final_fbx_path)[0] + "_thumb.png"
            thumb_path = render_mesh_thumbnail(selected_meshes, png_out, resolution=thumbnail_resolution)

        # Build Manifest
        source_manifest = kwargs.get("source_manifest")
        manifest = _unwrap_manifest(source_manifest)
        file_name = os.path.basename(final_fbx_path)

        if not manifest:
            slots_list = inspect_selected_meshes(selected_meshes)
            manifest = {
                "asset_name": asset_name,
                "mode": "single",
                "file_name": file_name,
                "file_path": final_fbx_path,
                "thumbnail_path": thumb_path or "",
                "hash_sha256": file_hash,
                "slot_count": len(slots_list),
                "slots": slots_list,
                "export": {
                    "file_name": file_name,
                    "local_path": final_fbx_path,
                    "thumbnail_path": thumb_path or "",
                    "file_size": file_size,
                    "objects_count": selected_count,
                }
            }
        else:
            manifest["asset_name"] = asset_name
            manifest["file_path"] = final_fbx_path
            manifest["file_name"] = file_name
            manifest["thumbnail_path"] = thumb_path or ""
            manifest["hash_sha256"] = file_hash

        metadata_update_map: Dict[str, str] = {}
        try:
            meta_json = json.dumps(manifest, indent=2, ensure_ascii=False)
            metadata_update_map[final_fbx_path] = meta_json
            if file_name != final_fbx_path and file_name not in metadata_update_map:
                metadata_update_map[file_name] = meta_json
        except Exception as ex:
            print(f"[export_fbx] Warning: failed to serialize manifest: {ex}", flush=True)

        thumbnail_files = [thumb_path] if thumb_path else []
        thumbnail_map = {final_fbx_path: thumb_path} if thumb_path else {}

        return {
            "exported_fbx_path": final_fbx_path,
            "manifest": manifest,
            "objects_count": selected_count,
            "file_size": file_size,
            "thumbnail_path": thumb_path or "",
            "thumbnail_files": thumbnail_files,
            "thumbnail_map": thumbnail_map,
            "metadata_update_map": metadata_update_map,
            "exported_files": [final_fbx_path]
        }

    # ==========================================================================
    # BRANCH B: BATCH EXPORT MODE (Modular Outfits / Multiple Meshes)
    # ==========================================================================
    output_dir = clean_out
    if output_dir and (output_dir.lower().endswith((".blend", ".duf", ".fbx")) or os.path.isfile(output_dir)):
        output_dir = os.path.dirname(os.path.abspath(output_dir))

    if not output_dir:
        blend_file = getattr(bpy.data, "filepath", "") if hasattr(bpy, "data") else ""
        if blend_file and os.path.isdir(os.path.dirname(blend_file)):
            output_dir = os.path.dirname(blend_file)
        else:
            temp_dir = getattr(bpy.app, "tempdir", ".") if hasattr(bpy, "app") else "."
            output_dir = os.path.join(temp_dir, "modular_export")

    output_dir = output_dir.replace("\\", "/")
    os.makedirs(output_dir, exist_ok=True)

    # Normalize flat_map {object_target: cloth_type_or_filename}
    flat_map: Dict[str, str] = {}
    if isinstance(raw_source, list):
        for item in raw_source:
            if isinstance(item, dict):
                flat_map.update(item)
            elif isinstance(item, str) and ":" in item:
                k, v = item.split(":", 1)
                flat_map[k.strip()] = v.strip()
            elif isinstance(item, str) and item.strip():
                flat_map[item.strip()] = ""
    elif isinstance(raw_source, dict):
        flat_map = dict(raw_source)
    elif not raw_source and hasattr(bpy, "data"):
        for obj in bpy.data.objects:
            if obj.type == 'MESH':
                flat_map[obj.name] = ""

    manifest_map: Dict[str, Any] = {}
    export_paths: Dict[str, str] = {}
    thumbnail_map: Dict[str, str] = {}
    thumbnail_files: List[str] = []

    print(f"[export_fbx] [Batch Mode] Starting modular export for {len(flat_map)} item(s) into '{output_dir}' (Prefix: '{prefix}')...", flush=True)

    clean_prefix = re.sub(r'[\s\-]+', '_', prefix.strip()).strip('_')

    for object_target, raw_output_name in flat_map.items():
        clean_obj_name = clean_asset_name(object_target)
        raw_val = (str(raw_output_name) if raw_output_name is not None else "").strip()

        if raw_val.lower().endswith(".fbx"):
            raw_stem = os.path.splitext(os.path.basename(raw_val))[0]
            if normalize_name(raw_stem) == normalize_name(object_target):
                base_stem = clean_obj_name
            else:
                base_stem = clean_asset_name(raw_stem)
            cloth_type = ""
        else:
            base_stem = clean_obj_name
            cloth_type = raw_val

        # Apply prefix: {Prefix}_{CleanAssetName}
        if clean_prefix:
            if base_stem.lower().startswith(f"{clean_prefix.lower()}_") or base_stem.lower() == clean_prefix.lower():
                final_asset_name = base_stem
            else:
                final_asset_name = f"{clean_prefix}_{base_stem}"
        else:
            final_asset_name = base_stem

        final_filename = f"{final_asset_name}.fbx"
        target_meshes = find_matching_meshes(object_target)
        if not target_meshes:
            print(f"[export_fbx] Warning: No matching mesh found for '{object_target}'. Skipping.", flush=True)
            continue

        matched_names = [m.name for m in target_meshes]
        select_mesh_with_armature(target_meshes)

        export_path = final_filename if os.path.isabs(final_filename) else os.path.join(output_dir, final_filename)
        export_path = export_path.replace("\\", "/")
        os.makedirs(os.path.dirname(os.path.abspath(export_path)), exist_ok=True)

        try:
            print(f"[export_fbx] Exporting '{final_asset_name}' (source='{object_target}', slot='{cloth_type}') to '{export_path}'...", flush=True)
            if hasattr(bpy, "ops"):
                bpy.ops.export_scene.fbx(filepath=export_path, **preset_options)

            file_size = os.path.getsize(export_path) if os.path.exists(export_path) else 0
            file_hash = compute_sha256(export_path) if file_size > 0 else ""

            # Render Thumbnail for this modular item
            thumb_path = None
            if render_thumbnail:
                thumb_out = os.path.splitext(export_path)[0] + "_thumb.png"
                thumb_path = render_mesh_thumbnail(target_meshes, thumb_out, resolution=thumbnail_resolution)
                if thumb_path:
                    thumbnail_map[export_path] = thumb_path
                    thumbnail_files.append(thumb_path)

            slots_list = inspect_selected_meshes(target_meshes)

            manifest_map[final_asset_name] = {
                "object": final_asset_name,
                "asset_name": final_asset_name,
                "clean_asset_name": clean_obj_name,
                "source_object_name": object_target,
                "cloth_type": cloth_type,
                "file_name": os.path.basename(export_path),
                "file_path": export_path,
                "local_path": export_path,
                "thumbnail_path": thumb_path or "",
                "file_size": file_size,
                "hash_sha256": file_hash,
                "matched_meshes": matched_names,
                "slot_count": len(slots_list),
                "slots": slots_list
            }
            export_paths[final_asset_name] = export_path
            print(f"[export_fbx] Successfully exported '{final_asset_name}' ({file_size} bytes, {len(slots_list)} slots).", flush=True)

        except Exception as e:
            print(f"[export_fbx] Error exporting '{object_target}': {e}", flush=True)
            raise RuntimeError(f"Failed to export '{object_target}': {e}")

    # Build metadata_update_map for UpdateResourceMetadataTool
    metadata_update_map = {}
    for final_asset_name, item_meta in manifest_map.items():
        clean_path = item_meta.get("file_path", "")
        file_name = item_meta.get("file_name", "")
        try:
            meta_json = json.dumps(item_meta, indent=2, ensure_ascii=False)
            if clean_path:
                metadata_update_map[clean_path] = meta_json
            if file_name and file_name not in metadata_update_map:
                metadata_update_map[file_name] = meta_json
        except Exception as ex:
            print(f"[export_fbx] Warning: failed to serialize manifest for '{final_asset_name}': {ex}", flush=True)

    exported_files = list(export_paths.values())
    return {
        "export_map": export_paths,
        "manifest": manifest_map,
        "total_exported": len(manifest_map),
        "exported_files": exported_files,
        "thumbnail_files": thumbnail_files,
        "thumbnail_map": thumbnail_map,
        "metadata_update_map": metadata_update_map
    }


export_fbx = main
