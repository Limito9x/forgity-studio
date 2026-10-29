# pyrefly: ignore [missing-import]
import bpy
import json
import os
import re
from typing import Dict, List, Optional, Any, Set, Tuple


class MockOp:
    """Mock operator object to capture preset options from FBX exporter presets."""
    def __init__(self):
        self.options = {}

    def __setattr__(self, name, val):
        if name == 'options':
            super().__setattr__(name, val)
        else:
            self.options[name] = val


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
    """
    Traces downstream links from a ShaderNodeTexImage to find the immediate intermediate node
    and the final target shader socket (e.g. Principled BSDF / Material Output).
    Returns: (via_node, target_socket)
    """
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
        # Check downstream of Normal Map
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

    # General traversal for Mix, Math, Invert, etc.
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
    """
    Extract texture file paths and their rich semantic graph bindings (Full Absolute Paths).
    Returns: (textures, texture_bindings)
    """
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


def inspect_selected_meshes(meshes: List[bpy.types.Object]) -> List[Dict[str, Any]]:
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


def main(
    output_path: str,
    target_objects: Optional[List[str]] = None,
    preset_path: str = "",
    **kwargs
) -> dict:
    """
    Export scene objects to FBX and auto-inspect material slots/textures into a unified manifest.

    Args:
        output_path: Absolute destination path for the .fbx file (e.g. D:/Exports/Laura.fbx).
        target_objects: Optional list of object names to filter for export. Empty = export all meshes.
        preset_path: Optional path to FBX export preset script.

    Returns:
        {
            "exported_fbx_path": str,
            "manifest": dict,
            "objects_count": int,
            "file_size": int,
            "metadata_update_map": {full_fbx_path: metadata_json},
            "exported_files": [str]
        }
    """
    targets = _normalize_target_list(target_objects)

    if not output_path:
        output_path = os.path.join(bpy.app.tempdir if hasattr(bpy, "app") else ".", "exported.fbx")

    # Ensure .fbx extension and posix path
    base, _ = os.path.splitext(output_path)
    output_path = (base + ".fbx").replace("\\", "/")
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # Derive canonical asset name directly from file stem (e.g. "Laura")
    asset_name = os.path.splitext(os.path.basename(output_path))[0]

    # 1. Selection
    if hasattr(bpy, "ops"):
        bpy.ops.object.select_all(action='DESELECT')
    selected_count = 0
    selected_meshes: List[bpy.types.Object] = []
    lowered = [t.lower() for t in targets]

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

    if selected_count == 0:
        print("[export_fbx] Warning: No objects selected for export based on filter.", flush=True)

    # 2. Preset Options
    preset_options = {}
    if preset_path and os.path.exists(preset_path):
        mock = MockOp()
        with open(preset_path, 'r', encoding='utf-8') as f:
            clean_code = "".join([l for l in f if "active_operator" not in l])
            exec(clean_code, {'bpy': bpy, 'op': mock})
        preset_options = mock.options

    if targets:
        preset_options['use_selection'] = True

    preset_options.pop('filepath', None)

    # 3. Export FBX
    print(f"[export_fbx] Exporting FBX to '{output_path}' with {selected_count} object(s) (Asset: '{asset_name}')...", flush=True)
    if hasattr(bpy, "ops"):
        try:
            bpy.ops.export_scene.fbx(filepath=output_path, **preset_options)
            print(f"[export_fbx] Successfully exported to '{output_path}'.", flush=True)
        except Exception as e:
            raise RuntimeError(f"Failed to export FBX: {e}")

    file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0

    # 4. Generate self-contained Manifest (Auto-inspect exported meshes)
    source_manifest = kwargs.get("source_manifest")
    manifest = _unwrap_manifest(source_manifest)
    clean_output = output_path.replace("\\", "/").strip()
    file_name = os.path.basename(clean_output)

    if not manifest:
        slots_list = inspect_selected_meshes(selected_meshes)
        manifest = {
            "asset_name": asset_name,
            "mode": "unified",
            "file_name": file_name,
            "file_path": clean_output,
            "slot_count": len(slots_list),
            "objects": {
                asset_name: {
                    "asset_name": asset_name,
                    "file_path": clean_output,
                    "slot_count": len(slots_list),
                    "slots": slots_list
                }
            },
            "export": {
                "file_name": file_name,
                "local_path": clean_output,
                "file_size": file_size,
                "objects_count": selected_count,
            }
        }
        print(f"[export_fbx] Auto-inspected {len(slots_list)} slot(s) for asset '{asset_name}'.", flush=True)
    else:
        manifest["asset_name"] = asset_name
        manifest["file_path"] = clean_output
        manifest["file_name"] = file_name
        manifest["export"] = {
            "file_name": file_name,
            "local_path": clean_output,
            "file_size": file_size,
            "objects_count": selected_count,
        }

    # 5. Build metadata_update_map for UpdateResourceMetadataTool
    metadata_update_map: Dict[str, str] = {}
    try:
        meta_json = json.dumps(manifest, indent=2, ensure_ascii=False)
        metadata_update_map[clean_output] = meta_json
        if file_name != clean_output and file_name not in metadata_update_map:
            metadata_update_map[file_name] = meta_json
    except Exception as ex:
        print(f"[export_fbx] Warning: failed to serialize manifest: {ex}", flush=True)

    return {
        "exported_fbx_path": output_path,
        "manifest": manifest,
        "objects_count": selected_count,
        "file_size": file_size,
        "metadata_update_map": metadata_update_map,
        "exported_files": [output_path]
    }
