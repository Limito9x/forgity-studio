# pyrefly: ignore [missing-import]
import bpy
import os
import hashlib
import re
from typing import Dict, Any, List, Optional, Set, Union


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


def find_matching_meshes(target_key: str) -> list:
    """
    Find meshes in scene based on exact, normalized, substring, or custom property match.
    """
    if not hasattr(bpy, "data"):
        return []
    target_norm = normalize_name(target_key)
    all_meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']

    # 1. Exact match
    exact = [obj for obj in all_meshes if obj.name == target_key]
    if exact:
        return exact

    # 2. Normalized match
    normalized = [obj for obj in all_meshes if normalize_name(obj.name) == target_norm]
    if normalized:
        return normalized

    # 3. Substring match
    substring = [
        obj for obj in all_meshes
        if target_norm in normalize_name(obj.name) or normalize_name(obj.name) in target_norm
    ]
    if substring:
        return substring

    # 4. Custom Property match (fallback)
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
    """
    Deselect all and ONLY select target meshes + their armature hierarchy.
    """
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


def extract_material_textures(mat: Any) -> List[str]:
    """Extract texture file paths actually linked in shader nodes."""
    if not mat:
        return []

    textures: List[str] = []
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
            abs_path = bpy.path.abspath(raw_path) if raw_path and hasattr(bpy, "path") else raw_path
            abs_path = abs_path.replace("\\", "/")

            if not abs_path:
                continue

            if abs_path not in seen_paths:
                seen_paths.add(abs_path)
                textures.append(abs_path)

    return textures


def inspect_single_mesh_slots(target_meshes: list) -> List[Dict[str, Any]]:
    """Inspect slots and linked textures for a modular mesh group."""
    slots_list: List[Dict[str, Any]] = []
    seen_slot_keys: Set[str] = set()
    current_index = 0

    for obj in target_meshes:
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

            textures = extract_material_textures(slot.material)
            slots_list.append({
                "index": current_index,
                "original_index": slot_idx,
                "name": slot_name,
                "material_name": slot.material.name,
                "is_used": True,
                "source_object": obj.name,
                "textures": textures
            })
            current_index += 1

    return slots_list


def main(
    export_map: Optional[Union[Dict[str, str], List[str], str]] = None,
    output_dir: str = "",
    prefix: str = "",
    preset_path: str = ""
) -> Dict[str, Any]:
    """
    Batch export modular scene meshes to FBX and auto-inspect material slots/textures.

    Args:
        export_map: Mapping object_target -> filename, list of object names, or empty for all scene meshes.
        output_dir: Directory where FBX files will be saved.
        prefix: Optional prefix prepended to output filenames and manifest keys (e.g. 'Eva_').
        preset_path: Optional path to Blender FBX export preset file.

    Returns:
        {
            "export_map": {object_key: export_filepath},
            "manifest": {object_key: {asset_name, file_path, slot_count, slots}},
            "total_exported": int,
            "exported_files": [export_filepath]
        }
    """
    # 1. Normalize export_map
    if isinstance(export_map, str) and export_map.strip().startswith("{"):
        import json
        try:
            export_map = json.loads(export_map)
        except Exception:
            pass

    flat_map: Dict[str, str] = {}
    if isinstance(export_map, list):
        for item in export_map:
            if isinstance(item, dict):
                flat_map.update(item)
            elif isinstance(item, str) and ":" in item:
                k, v = item.split(":", 1)
                flat_map[k.strip()] = v.strip()
            elif isinstance(item, str) and item.strip():
                k = item.strip()
                flat_map[k] = f"{k}.fbx"
    elif isinstance(export_map, dict):
        flat_map = dict(export_map)
    elif not export_map and hasattr(bpy, "data"):
        # Auto-detect all mesh objects in scene if export_map omitted
        for obj in bpy.data.objects:
            if obj.type == 'MESH':
                flat_map[obj.name] = f"{obj.name}.fbx"

    print(f"[batch_export_fbx] Normalized export_map with {len(flat_map)} items (Prefix: '{prefix}').", flush=True)

    if not output_dir:
        blend_file = getattr(bpy.data, "filepath", "") if hasattr(bpy, "data") else ""
        if blend_file and os.path.isdir(os.path.dirname(blend_file)):
            output_dir = os.path.dirname(blend_file)
        else:
            temp_dir = getattr(bpy.app, "tempdir", ".") if hasattr(bpy, "app") else "."
            output_dir = os.path.join(temp_dir, "modular_export")

    os.makedirs(output_dir, exist_ok=True)

    # 2. Preset options
    preset_options = {}
    if preset_path and os.path.exists(preset_path):
        mock = MockOp()
        with open(preset_path, 'r', encoding='utf-8') as f:
            clean_code = "".join([l for l in f if "active_operator" not in l])
            exec(clean_code, {'bpy': bpy, 'op': mock})
        preset_options = mock.options

    preset_options['use_selection'] = True
    preset_options.pop('filepath', None)

    manifest: Dict[str, Any] = {}
    export_paths: Dict[str, str] = {}

    print(f"[batch_export_fbx] Starting modular export for {len(flat_map)} item(s)...", flush=True)

    for object_target, raw_output_name in flat_map.items():
        base_name = raw_output_name or f"{object_target}.fbx"
        if not base_name.lower().endswith(".fbx"):
            base_name += ".fbx"

        # Apply prefix to output filename if not already present
        clean_prefix = prefix.strip()
        stem_name = os.path.splitext(os.path.basename(base_name))[0]
        if clean_prefix and not stem_name.startswith(clean_prefix):
            final_filename = f"{clean_prefix}{base_name}"
            final_asset_name = f"{clean_prefix}{stem_name}"
        else:
            final_filename = base_name
            final_asset_name = stem_name

        target_meshes = find_matching_meshes(object_target)
        if not target_meshes:
            print(f"[batch_export_fbx] Warning: No matching mesh found for '{object_target}'. Skipping.", flush=True)
            continue

        matched_names = [m.name for m in target_meshes]
        select_mesh_with_armature(target_meshes)

        export_path = final_filename if os.path.isabs(final_filename) else os.path.join(output_dir, final_filename)
        export_path = export_path.replace("\\", "/")
        os.makedirs(os.path.dirname(os.path.abspath(export_path)), exist_ok=True)

        try:
            print(f"[batch_export_fbx] Exporting '{final_asset_name}' to '{export_path}'...", flush=True)
            if hasattr(bpy, "ops"):
                bpy.ops.export_scene.fbx(filepath=export_path, **preset_options)

            file_size = os.path.getsize(export_path) if os.path.exists(export_path) else 0
            file_hash = compute_sha256(export_path) if file_size > 0 else ""

            # Auto-inspect slots & textures for this modular item
            slots_list = inspect_single_mesh_slots(target_meshes)

            manifest[final_asset_name] = {
                "object": final_asset_name,
                "asset_name": final_asset_name,
                "cloth_type": stem_name,
                "file_name": os.path.basename(export_path),
                "file_path": export_path,
                "local_path": export_path,
                "file_size": file_size,
                "hash_sha256": file_hash,
                "matched_meshes": matched_names,
                "slot_count": len(slots_list),
                "slots": slots_list
            }
            export_paths[final_asset_name] = export_path
            print(f"[batch_export_fbx] Successfully exported '{final_asset_name}' ({file_size} bytes, {len(slots_list)} slots).", flush=True)

        except Exception as e:
            print(f"[batch_export_fbx] Error exporting '{object_target}': {e}", flush=True)
            raise RuntimeError(f"Failed to export '{object_target}': {e}")

    exported_files = list(export_paths.values())
    return {
        "export_map": export_paths,
        "manifest": manifest,
        "total_exported": len(manifest),
        "exported_files": exported_files
    }
