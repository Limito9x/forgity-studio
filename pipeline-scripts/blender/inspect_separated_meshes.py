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
from typing import Dict, Any, List, Optional, Set, Union

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

            if abs_path not in seen_paths:
                seen_paths.add(abs_path)
                textures.append(abs_path)

    return textures


def main(
    target_objects: Optional[Union[List[str], Dict[str, Any], str]] = None,
    cloth_map: Optional[Union[Dict[str, str], str]] = None
) -> Dict[str, Any]:
    """
    Inspect target objects as distinct entities, returning a dictionary keyed by object names.
    Supports modular cloth workflow by accepting cloth_map (from classify_mesh_types)
    to pre-package 'cloth_type' in metadata and generate 'export_map' for batch_export_fbx.

    READ-ONLY: never modifies the scene. Unused slots are flagged with "is_used": false.

    Args:
        target_objects: List of object names or Dict mapping mesh to type. Empty = all meshes.
        cloth_map: Optional mapping of mesh name -> cloth_type (e.g. {'Armor': 'Top', 'Pants': 'Bottom'}).

    Returns:
        {
            "objects": {"<target>": {"object_name": str, "cloth_type": str, "asset_name": str, "slot_count": int, "slots": [...]}},
            "export_map": {"<target>": "<cloth_type_or_name>.fbx"},
            "count": int
        }
    """
    # 1. Parse cloth_map if provided
    resolved_cloth_map: Dict[str, str] = {}
    if cloth_map:
        if isinstance(cloth_map, str) and cloth_map.strip().startswith("{"):
            try:
                resolved_cloth_map = json.loads(cloth_map)
            except Exception:
                pass
        elif isinstance(cloth_map, dict):
            resolved_cloth_map = {str(k).strip(): str(v).strip() for k, v in cloth_map.items()}

    # 2. Parse target_objects
    target_names: List[str] = []
    if target_objects:
        if isinstance(target_objects, dict):
            target_names = [str(k).strip() for k in target_objects.keys() if str(k).strip()]
            if not resolved_cloth_map:
                resolved_cloth_map = {str(k).strip(): str(v).strip() for k, v in target_objects.items()}
        elif isinstance(target_objects, list):
            target_names = [str(x).strip() for x in target_objects if str(x).strip()]
        elif isinstance(target_objects, str):
            if target_objects.strip().startswith("{"):
                try:
                    d = json.loads(target_objects)
                    target_names = list(d.keys())
                    if not resolved_cloth_map:
                        resolved_cloth_map = d
                except Exception:
                    target_names = [target_objects.strip()]
            elif target_objects.strip().startswith("["):
                try:
                    target_names = json.loads(target_objects)
                except Exception:
                    target_names = [target_objects.strip()]
            else:
                target_names = [x.strip() for x in target_objects.split(",") if x.strip()]

    # If target_names empty but cloth_map provided, use cloth_map keys
    if not target_names and resolved_cloth_map:
        target_names = list(resolved_cloth_map.keys())

    if not HAS_BLENDER:
        # Mock response for testing outside Blender
        mock_objects = {
            "Helmet": {
                "object_name": "Helmet",
                "cloth_type": resolved_cloth_map.get("Helmet", "Headwear"),
                "asset_name": resolved_cloth_map.get("Helmet", "Helmet"),
                "slot_count": 2,
                "slots": [
                    {
                        "index": 0,
                        "name": "Visor",
                        "material_name": "M_Visor",
                        "textures": [
                            "/textures/visor_diff.png"
                        ]
                    },
                    {
                        "index": 1,
                        "name": "Shell",
                        "material_name": "M_Shell",
                        "textures": [
                            "/textures/shell_norm.png"
                        ]
                    }
                ]
            },
            "Rifle": {
                "object_name": "Rifle",
                "cloth_type": resolved_cloth_map.get("Rifle", "Weapon"),
                "asset_name": resolved_cloth_map.get("Rifle", "Rifle"),
                "slot_count": 1,
                "slots": [
                    {
                        "index": 0,
                        "name": "Metal_Body",
                        "material_name": "M_RifleMetal",
                        "textures": [
                            "/textures/rifle_diff.png"
                        ]
                    }
                ]
            }
        }

        mock_export_map = {
            k: f"{v.get('cloth_type') or k}.fbx"
            for k, v in mock_objects.items()
        }

        if target_names:
            mock_res: Dict[str, Any] = {}
            for name in target_names:
                c_type = resolved_cloth_map.get(name) or resolved_cloth_map.get(name.lower(), "")
                if name in mock_objects:
                    mock_res[name] = mock_objects[name]
                    if c_type:
                        mock_res[name]["cloth_type"] = c_type
                        mock_res[name]["asset_name"] = c_type
                else:
                    mock_res[name] = {
                        "object_name": name,
                        "cloth_type": c_type,
                        "asset_name": c_type or name,
                        "slot_count": 1,
                        "slots": [
                            {
                                "index": 0,
                                "name": f"{name}_Mat",
                                "material_name": f"M_{name}",
                                "textures": [
                                    f"/textures/{name.lower()}_diff.png"
                                ]
                            }
                        ]
                    }
            return {
                "objects": mock_res,
                "export_map": {k: f"{v.get('cloth_type') or k}.fbx" for k, v in mock_res.items()},
                "count": len(mock_res)
            }
        return {"objects": mock_objects, "export_map": mock_export_map, "count": len(mock_objects)}

    blend_dir = os.path.dirname(os.path.abspath(bpy.data.filepath)) if bpy.data.filepath else ""
    all_meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']

    objects: Dict[str, Any] = {}
    export_map: Dict[str, str] = {}

    def _get_cloth_type(name: str) -> Optional[str]:
        if not resolved_cloth_map:
            return None
        if name in resolved_cloth_map:
            return resolved_cloth_map[name]
        for k, v in resolved_cloth_map.items():
            if k.lower() == name.lower() or k.lower() in name.lower():
                return v
        return None

    def _process_obj_slots(obj: Any, c_type: Optional[str] = None) -> Dict[str, Any]:
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
            "cloth_type": c_type,
            "asset_name": c_type or obj.name,
            "slot_count": len(slots_list),
            "unused_slot_count": unused,
            "slots": slots_list
        }

    if target_names:
        for target_name in target_names:
            match = next((obj for obj in all_meshes if obj.name == target_name), None)
            if not match:
                match = next((obj for obj in all_meshes if obj.name.lower() == target_name.lower()), None)
            if not match:
                match = next((obj for obj in all_meshes if target_name.lower() in obj.name.lower() or obj.name.lower() in target_name.lower()), None)

            c_type = _get_cloth_type(target_name)

            if match:
                objects[target_name] = _process_obj_slots(match, c_type)
                export_map[target_name] = f"{c_type}.fbx" if c_type else f"{target_name}.fbx"
            else:
                print(f"[inspect_separated_meshes] Warning: Target object '{target_name}' not found in scene.", flush=True)
                objects[target_name] = {
                    "object_name": target_name,
                    "cloth_type": c_type,
                    "asset_name": c_type or target_name,
                    "slot_count": 0,
                    "unused_slot_count": 0,
                    "slots": []
                }
                export_map[target_name] = f"{c_type}.fbx" if c_type else f"{target_name}.fbx"
    else:
        for obj in all_meshes:
            c_type = _get_cloth_type(obj.name)
            objects[obj.name] = _process_obj_slots(obj, c_type)
            export_map[obj.name] = f"{c_type}.fbx" if c_type else f"{obj.name}.fbx"

    return {
        "objects": objects,
        "export_map": export_map,
        "count": len(objects)
    }


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2))
