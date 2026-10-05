# pyrefly: ignore [missing-import]
"""
Blender Asset Inspector: Unified Mesh Mode
Runs inside Blender via Python API (compatible with Blender 4.x / 5.x)

Inspects a scene or target objects as a single, unified entity (e.g. Character SKM or Combined Static Mesh).
Deduplicates & cleans unused material slots, enumerates real material slots by index (0, 1, 2...),
and extracts all contributing texture files without artificial guessing or classification.
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
    asset_name: str = "",
    clean_unused: bool = True,
    textures_dir: Optional[str] = None,
    output_manifest_path: str = ""
) -> Dict[str, Any]:
    """
    Inspect target objects as a single unified entity and generate a clean slot manifest.

    Args:
        target_objects: Optional list or comma-separated string of object names to process.
        asset_name: Optional name for the unified asset (defaults to active object name or 'Unified_Asset').
        clean_unused: Whether to strip slots that have no polygons assigned.
        textures_dir: Optional directory containing texture files to scan alongside shader nodes.
        output_manifest_path: Optional path to save JSON manifest.

    Returns:
        Structured dictionary representing the unified mesh manifest:
        {
            "manifest": {
                "asset_name": str,
                "mode": "unified",
                "object_count": int,
                "objects": { ... }
            }
        }
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
            "manifest": mock_manifest
        }

    blend_dir = os.path.dirname(os.path.abspath(bpy.data.filepath)) if bpy.data.filepath else ""

    # 1. Resolve target objects (Empty target_objects defaults to all MESH objects in scene)
    filter_names: List[str] = []
    if target_objects:
        if isinstance(target_objects, str):
            filter_names = [x.strip().lower() for x in target_objects.split(",") if x.strip()]
        elif isinstance(target_objects, (list, tuple, set)):
            filter_names = [str(x).strip().lower() for x in target_objects if str(x).strip()]

    meshes = [
        obj for obj in bpy.data.objects
        if obj.type == 'MESH' and (not filter_names or any(name in obj.name.lower() for name in filter_names))
    ]

    if not meshes:
        print("[inspect_unified_mesh] Warning: No matching mesh objects found.", flush=True)
        empty_manifest = {
            "asset_name": asset_name or "Unified_Asset",
            "mode": "unified",
            "slot_count": 0,
            "slots": [],
            "objects": {}
        }
        return {
            "manifest": empty_manifest
        }

    if not asset_name:
        active_obj = bpy.context.view_layer.objects.active
        asset_name = active_obj.name if active_obj and active_obj in meshes else meshes[0].name

    # 2. Clean unused material slots if requested
    if clean_unused:
        for obj in meshes:
            clean_unused_material_slots(obj)

    # 3. Enumerate unique slots across unified targets
    slots_list: List[Dict[str, Any]] = []
    seen_slot_keys: Set[str] = set()
    current_index = 0

    for obj in meshes:
        for slot in obj.material_slots:
            if not slot.material:
                continue

            slot_name = slot.name or slot.material.name
            slot_key = f"{slot_name}_{slot.material.name}"

            if slot_key in seen_slot_keys:
                continue
            seen_slot_keys.add(slot_key)

            textures = extract_material_textures(slot.material, blend_dir, textures_dir or "")

            slots_list.append({
                "index": current_index,
                "name": slot_name,
                "material_name": slot.material.name,
                "textures": textures
            })
            current_index += 1

    manifest = {
        "asset_name": asset_name,
        "mode": "unified",
        "object_count": 1,
        "objects": {
            asset_name: {
                "slot_count": len(slots_list),
                "slots": slots_list
            }
        }
    }

    if output_manifest_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_manifest_path)), exist_ok=True)
        with open(output_manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        print(f"[inspect_unified_mesh] Saved unified manifest ({len(slots_list)} slots) to: {output_manifest_path}", flush=True)

    return {
        "manifest": manifest
    }


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2))
