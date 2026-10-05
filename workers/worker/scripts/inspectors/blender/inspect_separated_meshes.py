# pyrefly: ignore [missing-import]
"""
Blender Asset Inspector: Separated Meshes Mode
Runs inside Blender via Python API (compatible with Blender 4.x / 5.x)

Inspects scene mesh objects as distinct, modular entities (e.g. Modular Armor, Weapons, Props).
Preserves separate identity for each object, keyed by input target object names,
cleans unused slots per object, and maps out each object's respective material slots & contributing textures.
Outputs a dictionary keyed by input object names.
"""

import os
import sys
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Set

try:
    import bpy
    HAS_BLENDER = True
except ImportError:
    bpy = None
    HAS_BLENDER = False


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tga", ".exr", ".tif", ".tiff", ".bmp", ".webp"}


def clean_unused_material_slots(obj: Any) -> int:
    """
    Remove material slots that have zero polygons assigned on the mesh.
    Operates directly on mesh.materials data-block to avoid bpy.ops context issues.
    """
    if not HAS_BLENDER or obj.type != 'MESH' or not obj.data or not obj.data.polygons or len(obj.data.materials) <= 1:
        return 0

    mesh = obj.data
    initial_slot_count = len(mesh.materials)
    used_indices = sorted({poly.material_index for poly in mesh.polygons if 0 <= poly.material_index < initial_slot_count})

    if len(used_indices) == initial_slot_count:
        return 0

    old_to_new = {old_idx: new_idx for new_idx, old_idx in enumerate(used_indices)}
    new_materials = [mesh.materials[i] for i in used_indices]

    for poly in mesh.polygons:
        poly.material_index = old_to_new.get(poly.material_index, 0)

    mesh.materials.clear()
    for mat in new_materials:
        mesh.materials.append(mat)

    return initial_slot_count - len(mesh.materials)


def extract_material_textures(mat: Any, blend_dir: str = "", textures_dir: str = "") -> List[str]:
    """
    Extract all unique texture file paths contributing to this material.
    Scans:
    1. Connected image texture nodes inside the material node tree (including node groups).
    2. Optional external textures folder (matching material name).
    """
    if not mat:
        return []

    textures: List[str] = []
    seen_paths: Set[str] = set()

    # 1. Shader Node Tree scan
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
            abs_path = bpy.path.abspath(raw_path) if raw_path and HAS_BLENDER else raw_path
            abs_path = abs_path.replace("\\", "/")

            if not abs_path:
                continue

            rel_path = abs_path
            if blend_dir and os.path.isabs(abs_path):
                try:
                    rel_path = os.path.relpath(abs_path, blend_dir).replace("\\", "/")
                except ValueError:
                    rel_path = abs_path

            if rel_path not in seen_paths:
                seen_paths.add(rel_path)
                textures.append(rel_path)

    # 2. Folder scan (Folder-First / Hybrid)
    search_dir = textures_dir
    if not search_dir and blend_dir:
        candidate = os.path.join(blend_dir, "textures")
        if os.path.isdir(candidate):
            search_dir = candidate

    if search_dir and os.path.isdir(search_dir):
        mat_lower = mat.name.lower()
        for root, _, files in os.walk(search_dir):
            for f in files:
                f_path = Path(root) / f
                if f_path.suffix.lower() in IMAGE_EXTS:
                    stem_lower = f_path.stem.lower()
                    if mat_lower in stem_lower or stem_lower.startswith(mat_lower) or mat_lower in f_path.parent.name.lower():
                        rel = str(f_path.resolve()).replace("\\", "/")
                        if blend_dir:
                            try:
                                rel = os.path.relpath(f_path, blend_dir).replace("\\", "/")
                            except ValueError:
                                pass
                        if rel not in seen_paths:
                            seen_paths.add(rel)
                            textures.append(rel)

    return textures


def main(
    target_objects: Optional[List[str]] = None,
    clean_unused: bool = True,
    textures_dir: Optional[str] = None,
    output_manifest_path: str = ""
) -> Dict[str, Any]:
    """
    Inspect target objects as distinct entities, returning a dictionary keyed by the input object names.

    Args:
        target_objects: Optional list, dict, or comma-separated string of object names to process.
        asset_name: Optional bundle name.
        clean_unused: Whether to strip slots that have no polygons assigned per object.
        textures_dir: Optional directory containing texture files to scan alongside shader nodes.
        output_manifest_path: Optional path to save JSON manifest.

    Returns:
        Dictionary mapping each input object name to its inspected slots and textures:
        {
            "<target_object_name>": {
                "object_name": str,
                "slot_count": int,
                "slots": [...]
            },
            ...
        }
    """
    # 1. Normalize input target_objects
    target_names: List[str] = []
    if target_objects:
        if isinstance(target_objects, str):
            target_names = [x.strip() for x in target_objects.split(",") if x.strip()]
        elif isinstance(target_objects, dict):
            target_names = [str(x).strip() for x in target_objects.keys() if str(x).strip()]
        elif isinstance(target_objects, (list, tuple, set)):
            target_names = [str(x).strip() for x in target_objects if str(x).strip()]

    if not HAS_BLENDER:
        # Mock response for testing outside Blender
        mock_objects = {
            "Helmet": {
                "object_name": "Helmet",
                "slot_count": 2,
                "slots": [
                    {
                        "index": 0,
                        "name": "Visor",
                        "material_name": "M_Visor",
                        "textures": [
                            "textures/visor_diff.png"
                        ]
                    },
                    {
                        "index": 1,
                        "name": "Shell",
                        "material_name": "M_Shell",
                        "textures": [
                            "textures/shell_norm.png"
                        ]
                    }
                ]
            },
            "Rifle": {
                "object_name": "Rifle",
                "slot_count": 1,
                "slots": [
                    {
                        "index": 0,
                        "name": "Metal_Body",
                        "material_name": "M_RifleMetal",
                        "textures": [
                            "textures/rifle_diff.png"
                        ]
                    }
                ]
            }
        }

        if target_names:
            mock_res: Dict[str, Any] = {}
            for name in target_names:
                if name in mock_objects:
                    mock_res[name] = mock_objects[name]
                else:
                    mock_res[name] = {
                        "object_name": name,
                        "slot_count": 1,
                        "slots": [
                            {
                                "index": 0,
                                "name": f"{name}_Mat",
                                "material_name": f"M_{name}",
                                "textures": [
                                    f"textures/{name.lower()}_diff.png"
                                ]
                            }
                        ]
                    }
            return {"objects": mock_res}
        return {"objects": mock_objects}

    blend_dir = os.path.dirname(os.path.abspath(bpy.data.filepath)) if bpy.data.filepath else ""
    all_meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']

    objects: Dict[str, Any] = {}

    def _process_obj_slots(obj: Any) -> Dict[str, Any]:
        if clean_unused:
            clean_unused_material_slots(obj)

        slots_list: List[Dict[str, Any]] = []
        for idx, slot in enumerate(obj.material_slots):
            if not slot.material:
                continue

            slot_name = slot.name or slot.material.name
            textures = extract_material_textures(slot.material, blend_dir, textures_dir or "")

            slots_list.append({
                "index": idx,
                "name": slot_name,
                "material_name": slot.material.name,
                "textures": textures
            })

        return {
            "object_name": obj.name,
            "slot_count": len(slots_list),
            "slots": slots_list
        }

    if target_names:
        for target_name in target_names:
            # Match priority: Exact -> Case-insensitive exact -> Substring
            match = next((obj for obj in all_meshes if obj.name == target_name), None)
            if not match:
                match = next((obj for obj in all_meshes if obj.name.lower() == target_name.lower()), None)
            if not match:
                match = next((obj for obj in all_meshes if target_name.lower() in obj.name.lower() or obj.name.lower() in target_name.lower()), None)

            if match:
                objects[target_name] = _process_obj_slots(match)
            else:
                print(f"[inspect_separated_meshes] Warning: Target object '{target_name}' not found in scene.", flush=True)
                objects[target_name] = {
                    "object_name": "",
                    "slot_count": 0,
                    "slots": []
                }
    else:
        # Fallback to all mesh objects if no specific targets were passed
        for obj in all_meshes:
            objects[obj.name] = _process_obj_slots(obj)

    if output_manifest_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_manifest_path)), exist_ok=True)
        with open(output_manifest_path, "w", encoding="utf-8") as f:
            json.dump(objects, f, indent=2, ensure_ascii=False)
        print(f"[inspect_separated_meshes] Saved separated objects manifest ({len(objects)} objects) to: {output_manifest_path}", flush=True)

    return {
        "objects": objects
    }


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2))
