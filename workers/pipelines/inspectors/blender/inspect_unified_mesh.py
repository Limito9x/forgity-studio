# pyrefly: ignore [missing-import]
"""
Blender Asset Inspector: Unified Mesh Mode
Runs inside Blender via Python API (compatible with Blender 4.x / 5.x)

READ-ONLY: never modifies the scene. Use merge_materials to clean/merge slots.
Inspects a scene or target objects as a single, unified entity (e.g. Character SKM or Combined Static Mesh).
Enumerates material slots by original index (0, 1, 2...), flags unused slots,
and extracts texture files actually linked in shader nodes (no folder guessing).
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
    target_objects: Optional[List[str]] = None,
    asset_name: str = ""
) -> Dict[str, Any]:
    """
    Inspect target objects as a single unified entity and generate a clean slot manifest.

    READ-ONLY: never modifies the scene. Unused slots are flagged with "is_used": false + "unused_slot_count".
    Run merge_materials (clean_unused=True) before export to actually strip them.

    Batch-first: target_objects is Array<Text>. Empty means all MESH objects in scene.

    Args:
        target_objects: List of object names to process, e.g. ["Body_GND"]. Empty = all meshes.
        asset_name: Optional name for the unified asset (defaults to common prefix of targets, else first mesh sorted, else 'Unified_Asset').

    Returns:
        {
            "manifest": {"asset_name": str, "mode": "unified", "object_count": 1, "objects": {...}, "unused_slot_count": int},
            "asset_name": str,
            "slot_count": int,
            "unused_slot_count": int
        }
        manifest feeds export_fbx.source_manifest (1 combo -> 1 FBX).
    """
    if not HAS_BLENDER:
        # Mock response for testing outside Blender
        clean_asset_name = asset_name or "Unified_Asset"
        mock_manifest = {
            "asset_name": clean_asset_name,
            "mode": "unified",
            "object_count": 1,
            "objects": {
                clean_asset_name: {
                    "slot_count": 2,
                    "slots": [
                        {
                            "index": 0,
                            "name": "Body",
                            "material_name": "M_Body",
                            "textures": [
                                "textures/body_diff.png",
                                "textures/body_norm.png"
                            ]
                        },
                        {
                            "index": 1,
                            "name": "Jacket",
                            "material_name": "M_Jacket",
                            "textures": [
                                "textures/jacket_diff.png"
                            ]
                        }
                    ]
                }
            }
        }
        return {
            "manifest": mock_manifest,
            "asset_name": clean_asset_name,
            "slot_count": 2
        }

    blend_dir = os.path.dirname(os.path.abspath(bpy.data.filepath)) if bpy.data.filepath else ""

    # 1. Resolve target objects (Empty target_objects defaults to all MESH objects in scene)
    # Batch-first: only List[str]. No comma-split string parsing.
    filter_names: List[str] = []
    if target_objects:
        filter_names = [str(x).strip().lower() for x in target_objects if str(x).strip()]

    meshes = [
        obj for obj in bpy.data.objects
        if obj.type == 'MESH' and (not filter_names or any(name in obj.name.lower() for name in filter_names))
    ]

    if not meshes:
        print("[inspect_unified_mesh] Warning: No matching mesh objects found.", flush=True)
        resolved_name = asset_name or "Unified_Asset"
        empty_manifest = {
            "asset_name": resolved_name,
            "mode": "unified",
            "slot_count": 0,
            "slots": [],
            "objects": {},
            "unused_slot_count": 0
        }
        return {
            "manifest": empty_manifest,
            "asset_name": resolved_name,
            "slot_count": 0,
            "unused_slot_count": 0
        }

    if not asset_name:
        # Deterministic: common prefix of targets -> first mesh sorted -> fallback. No active-object.
        candidates = sorted({obj.name for obj in meshes})
        if filter_names and len(filter_names) == 1:
            asset_name = filter_names[0]
        elif len(candidates) == 1:
            asset_name = candidates[0]
        else:
            prefix = os.path.commonprefix(candidates).strip().strip("_- ")
            asset_name = prefix or candidates[0]
        if not asset_name:
            asset_name = "Unified_Asset"
    # 2. Enumerate unique slots across unified targets (read-only, keep original indices)
    slots_list: List[Dict[str, Any]] = []
    seen_slot_keys: Set[str] = set()
    current_index = 0
    unused_count = 0

    for obj in meshes:
        used_indices = count_used_slot_indices(obj)
        for slot_idx, slot in enumerate(obj.material_slots):
            if not slot.material:
                continue

            slot_name = slot.name or slot.material.name
            slot_key = f"{slot_name}_{slot.material.name}"

            if slot_key in seen_slot_keys:
                continue
            seen_slot_keys.add(slot_key)

            is_used = slot_idx in used_indices if used_indices else True
            if not is_used:
                unused_count += 1

            textures = extract_material_textures(slot.material, blend_dir)

            slots_list.append({
                "index": current_index,
                "original_index": slot_idx,
                "name": slot_name,
                "material_name": slot.material.name,
                "is_used": is_used,
                "source_object": obj.name,
                "textures": textures
            })
            current_index += 1

    manifest = {
        "asset_name": asset_name,
        "mode": "unified",
        "object_count": 1,
        "unused_slot_count": unused_count,
        "objects": {
            asset_name: {
                "slot_count": len(slots_list),
                "slots": slots_list
            }
        }
    }

    if unused_count > 0:
        print(f"[inspect_unified_mesh] Found {unused_count} unused slot(s). Run merge_materials before export to strip them.", flush=True)

    return {
        "manifest": manifest,
        "asset_name": asset_name,
        "slot_count": len(slots_list),
        "unused_slot_count": unused_count
    }


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2))
