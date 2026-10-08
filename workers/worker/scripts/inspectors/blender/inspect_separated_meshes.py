# pyrefly: ignore [missing-import]
"""
Blender Asset Inspector: Separated Meshes Mode
Runs inside Blender via Python API (compatible with Blender 4.x / 5.x)

READ-ONLY: never modifies the scene. Use merge_materials to clean/merge slots.
Inspects scene mesh objects as distinct, modular entities (e.g. Modular Armor, Weapons, Props).
Preserves separate identity for each object, keyed by input target object names,
flags unused slots per object, and extracts texture files actually linked in shader nodes (no folder guessing).
Outputs a dictionary keyed by input object names.
"""

import os
import sys
import json
from typing import Dict, Any, List, Optional, Set

try:
    import bpy
    HAS_BLENDER = True
except ImportError:
    bpy = None
    HAS_BLENDER = False


def count_used_slot_indices(obj: Any) -> Set[int]:
    """Return indices of material slots actually assigned to at least one polygon (read-only)."""
    if not HAS_BLENDER or obj.type != 'MESH' or not obj.data or not obj.data.polygons:
        return set()
    total = len(obj.data.materials)
    return {int(poly.material_index) for poly in obj.data.polygons if 0 <= int(poly.material_index) < total}


def extract_material_textures(mat: Any, blend_dir: str = "") -> List[str]:
    """
    Extract texture file paths actually linked in this material's node tree (incl. node groups).
    Source of truth only: unlinked files in textures/ folder are NOT guessed.
    """
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

    return textures


def main(
    target_objects: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Inspect target objects as distinct entities, returning a dictionary keyed by the input object names.

    READ-ONLY: never modifies the scene. Unused slots are flagged with "is_used": false.
    Run merge_materials (clean_unused=True) before batch_export_fbx to actually strip them.

    Batch-first: target_objects is Array<Text>. Empty means all MESH objects in scene.

    Args:
        target_objects: List of object names to process, e.g. ["Top_GND", "Panty_GND"]. Empty = all meshes.

    Returns:
        {
            "objects": {"<target>": {"object_name": str, "slot_count": int, "unused_slot_count": int, "slots": [...]}},
            "count": int
        }
        objects keys feed batch_export_fbx.export_map (each key -> 1 FBX).
    """
    # Batch-first: only List[str]. No str/dict parsing.
    target_names: List[str] = []
    if target_objects:
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
        used_indices = count_used_slot_indices(obj)
        slots_list: List[Dict[str, Any]] = []
        unused = 0
        for idx, slot in enumerate(obj.material_slots):
            if not slot.material:
                continue

            is_used = idx in used_indices if used_indices else True
            if not is_used:
                unused += 1

            slot_name = slot.name or slot.material.name
            textures = extract_material_textures(slot.material, blend_dir)

            slots_list.append({
                "index": idx,
                "name": slot_name,
                "material_name": slot.material.name,
                "is_used": is_used,
                "textures": textures
            })

        return {
            "object_name": obj.name,
            "slot_count": len(slots_list),
            "unused_slot_count": unused,
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
                    "unused_slot_count": 0,
                    "slots": []
                }
    else:
        # Fallback to all mesh objects if no specific targets were passed
        for obj in all_meshes:
            objects[obj.name] = _process_obj_slots(obj)

    return {
        "objects": objects,
        "count": len(objects)
    }


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2))
