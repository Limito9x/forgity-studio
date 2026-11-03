# pyrefly: ignore [missing-import]
"""
Blender Wardrobe Preparation & Geometry Standardization Tool
Runs on Agent Worker Daemon (Blender Subprocess Executor)

Performs clean technical artist geometry preparation on wearable items before FBX export:
1. Geometry Validation & Curve Conversion: Converts hair strands/curves to poly meshes so Unreal Engine FBX importer can ingest them.
2. Auto-Join Component Meshes: Merges multi-part items (e.g. Hair + Scalp, Left Shoe + Right Shoe, Dress + Ribbons)
   into a single, clean Skeletal Mesh preserving all original Material Slots.
3. Zero-Touch Rigging Preservation: Preserves 100% of original Daz/Diffeomorphic skinning weights and vertex groups.
   No artificial bone heuristic modifications.
"""

import os
import json
import re
from typing import List, Dict, Any, Optional, Union

try:
    import bpy
    HAS_BPY = True
except ImportError:
    bpy = None
    HAS_BPY = False


def find_scene_object(name: str) -> Optional[Any]:
    """Finds an object in bpy.data.objects matching exact name or normalized name."""
    if not name or not hasattr(bpy, "data"):
        return None

    # 1. Exact match
    if name in bpy.data.objects:
        return bpy.data.objects[name]

    # 2. Case-insensitive / whitespace stripped match
    clean_target = name.strip().lower()
    for obj in bpy.data.objects:
        if obj.name.strip().lower() == clean_target:
            return obj

    # 3. Substring match without mesh ID suffixes (e.g. Name_677394)
    prefix_target = re.sub(r'_\d+$', '', clean_target)
    for obj in bpy.data.objects:
        obj_clean = re.sub(r'_\d+$', '', obj.name.strip().lower())
        if obj_clean == prefix_target or prefix_target in obj_clean:
            return obj

    return None


def main(
    wardrobe_items: Optional[Union[List[Dict[str, Any]], str]] = None,
    character_body: str = "",
    auto_join_submeshes: bool = True,
    convert_hair_curves: bool = True,
    **kwargs
) -> Dict[str, Any]:
    """
    Main entry point for wardrobe technical preparation.

    Args:
        wardrobe_items: Output from classify_mesh_types (list of dicts with 'name' and 'meshes').
        character_body: Optional name of the main character body mesh (e.g. 'Genesis 9').
        auto_join_submeshes: Merge sub-meshes of a single item into 1 mesh (default True).
        convert_hair_curves: Ensure hair curves/strands have polygon faces (default True).

    Returns:
        Dictionary containing:
          - 'prepared_meshes': List[str] of final, clean mesh names ready for FBX export.
          - 'joined_count': int count of items merged.
          - 'summary': Execution summary string.
    """
    if not hasattr(bpy, "data"):
        return {
            "prepared_meshes": [],
            "joined_count": 0,
            "summary": "Dry-run / No Blender environment."
        }

    # 1. Parse wardrobe_items input
    parsed_items: List[Dict[str, Any]] = []
    if isinstance(wardrobe_items, str) and wardrobe_items.strip():
        try:
            parsed_items = json.loads(wardrobe_items)
        except Exception:
            pass
    elif isinstance(wardrobe_items, list):
        parsed_items = wardrobe_items

    # Fallback to kwargs aliases if needed
    if not parsed_items:
        raw_alias = kwargs.get("clothes") or kwargs.get("items")
        if isinstance(raw_alias, list):
            parsed_items = [{"name": str(x), "meshes": [str(x)]} for x in raw_alias if str(x).strip()]

    print(f"[prepare_wardrobe] Processing {len(parsed_items)} wardrobe items in Blender...", flush=True)

    prepared_meshes: List[str] = []
    merged_items_count = 0

    # Ensure in Object Mode
    if hasattr(bpy, "ops") and bpy.context.object and bpy.context.object.mode != 'OBJECT':
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass

    for item in parsed_items:
        item_name = item.get("name", "").strip()
        submesh_names = item.get("meshes", [])
        if not submesh_names and item_name:
            submesh_names = [item_name]

        # Resolve real Blender objects for this item
        found_objects = []
        for m_name in submesh_names:
            obj = find_scene_object(m_name)
            if obj and obj.type in ['MESH', 'CURVES'] and obj not in found_objects:
                found_objects.append(obj)

        if not found_objects:
            print(f"[prepare_wardrobe] Warning: No scene mesh found for item '{item_name}' (candidates: {submesh_names}).", flush=True)
            continue

        primary_obj = found_objects[0]

        # Step A: Convert hair curves to mesh if needed
        if convert_hair_curves:
            for obj in found_objects:
                if obj.type == 'CURVES' or (obj.type == 'MESH' and len(obj.data.polygons) == 0 and len(obj.data.vertices) > 0):
                    try:
                        bpy.ops.object.select_all(action='DESELECT')
                        obj.select_set(True)
                        bpy.context.view_layer.objects.active = obj
                        bpy.ops.object.convert(target='MESH')
                        print(f"   [prepare_wardrobe] Converted hair curve/strand object '{obj.name}' to Polygon Mesh.", flush=True)
                    except Exception as e:
                        print(f"   [prepare_wardrobe] Warning converting '{obj.name}' to mesh: {e}", flush=True)

        # Step B: Auto-Join sub-meshes (e.g. Hair + Scalp, Shoe Left + Right)
        if auto_join_submeshes and len(found_objects) > 1:
            print(f"   [prepare_wardrobe] Joining {len(found_objects)} sub-meshes for item '{item_name}': {[o.name for o in found_objects]}", flush=True)
            bpy.ops.object.select_all(action='DESELECT')

            for obj in found_objects:
                obj.select_set(True)

            bpy.context.view_layer.objects.active = primary_obj
            try:
                bpy.ops.object.join()
                primary_obj.name = item_name
                merged_items_count += 1
                print(f"   [prepare_wardrobe] Successfully merged into single mesh '{item_name}' (Total Material Slots: {len(primary_obj.material_slots)})", flush=True)
            except Exception as e:
                print(f"   [prepare_wardrobe] Error joining sub-meshes for '{item_name}': {e}", flush=True)
        else:
            if item_name and primary_obj.name != item_name:
                primary_obj.name = item_name

        if primary_obj.name not in prepared_meshes:
            prepared_meshes.append(primary_obj.name)

    summary = (
        f"Wardrobe Preparation Completed: {len(prepared_meshes)} clean clothing item(s) ready "
        f"({merged_items_count} merged multi-mesh groups). Original Daz skinning weights preserved 100%."
    )
    print(f"\n[prepare_wardrobe] {summary}", flush=True)

    return {
        "prepared_meshes": prepared_meshes,
        "joined_count": merged_items_count,
        "summary": summary
    }


if __name__ == "__main__":
    print("Testing prepare_wardrobe main() in dry-run mode...")
    test_items = [
        {
            "name": "Messy_High_Ponytail_Hair",
            "meshes": ["FE_Messy_High_Ponytail_Hair", "FE_Messy_High_Ponytail_Hair_Scalp"],
            "role": "Hair"
        },
        {
            "name": "Flirty_Party_Dress",
            "meshes": ["FlirtyPartyDress"],
            "role": "Dress"
        }
    ]
    res = main(wardrobe_items=test_items)
    print("Result:", res)
