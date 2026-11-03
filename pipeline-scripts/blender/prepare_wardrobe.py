# pyrefly: ignore [missing-import]
"""
Blender Wardrobe Preparation & Geometry Standardization Tool
Runs on Agent Worker Daemon (Blender Subprocess Executor)

Performs technical artist cleanup on wearable items before FBX export:
1. Auto-Join Component Meshes: Merges multi-part items (e.g. Hair + Scalp, Left Shoe + Right Shoe, Dress + Ribbons)
   into a single, clean Skeletal Mesh preserving all original Material Slots.
2. Geometry Validation & Curve Conversion: Converts hair strands/curves to poly meshes to prevent Unreal import errors.
3. dForce & Non-Conforming Rig Clean-Up: Detects isolated dynamic bones (e.g. Tail1, Tail2, Skirt bones) and transfers
   their skinning weights to standard Genesis 9 pelvis/thigh bones, eliminating the notorious (0,0,0) sink bug in UE5.
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


# Standard Genesis 9 / Genesis 8 humanoid bones recognized by Unreal Engine
STANDARD_G9_BONES = {
    "root", "pelvis", "hip", "hips",
    "spine1", "spine2", "spine3", "spine4", "spine", "spine_01", "spine_02", "spine_03", "spine_04",
    "neck1", "neck2", "neck", "head",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l", "toe_l",
    "thigh_r", "calf_r", "foot_r", "toe_r",
    "pectoral_l", "pectoral_r", "breast_l", "breast_r",
    # Daz Diffeomorphic bone naming variants
    "l_clavicle", "l_upperarm", "l_forearm", "l_hand",
    "r_clavicle", "r_upperarm", "r_forearm", "r_hand",
    "l_thigh", "l_shin", "l_foot", "l_toe",
    "r_thigh", "r_shin", "r_foot", "r_toe",
    "abdomenlower", "abdomenupper", "chestlower", "chestupper", "necklower", "neckupper"
}


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


def merge_vertex_group_weights(mesh_obj: Any, source_group_name: str, target_group_name: str):
    """
    Transfers skin weights from a non-conforming bone group (e.g. Left-Tail1)
    to a standard Genesis bone group (e.g. thigh_l or pelvis) and deletes the source group.
    """
    if source_group_name not in mesh_obj.vertex_groups:
        return

    src_vg = mesh_obj.vertex_groups[source_group_name]
    tgt_vg = mesh_obj.vertex_groups.get(target_group_name)
    if not tgt_vg:
        tgt_vg = mesh_obj.vertex_groups.new(name=target_group_name)

    src_idx = src_vg.index
    tgt_idx = tgt_vg.index

    # Transfer vertex by vertex
    for vert in mesh_obj.data.vertices:
        src_weight = 0.0
        tgt_weight = 0.0
        has_src = False

        for g in vert.groups:
            if g.group == src_idx:
                src_weight = g.weight
                has_src = True
            elif g.group == tgt_idx:
                tgt_weight = g.weight

        if has_src and src_weight > 0.001:
            new_weight = min(1.0, tgt_weight + src_weight)
            tgt_vg.add([vert.index], new_weight, 'REPLACE')

    # Remove the non-standard group
    mesh_obj.vertex_groups.remove(src_vg)
    print(f"   [prepare_wardrobe] Transferred weights from '{source_group_name}' -> '{target_group_name}'", flush=True)


def clean_dforce_and_extra_bones(mesh_obj: Any):
    """
    Detects dForce tail/skirt/spring bones and reparents their weights to Pelvis/Thighs
    so the garment will properly follow LeaderPoseComponent in Unreal Engine.
    """
    if not hasattr(mesh_obj, "vertex_groups") or not mesh_obj.vertex_groups:
        return

    groups_to_check = [vg.name for vg in mesh_obj.vertex_groups]
    for g_name in groups_to_check:
        clean_g = g_name.lower().replace("-", "_").replace(".", "_")

        is_dforce_bone = any(k in clean_g for k in ["tail", "skirt", "dforce", "spring", "dress_lower", "flap"])
        is_standard = clean_g in STANDARD_G9_BONES or any(s in clean_g for s in ["spine", "thigh", "pelvis", "clavicle", "arm", "hand", "calf", "foot"])

        if is_dforce_bone or not is_standard:
            # Determine appropriate recipient bone
            if any(k in clean_g for k in ["left", "l_", "_l"]):
                target_bone = "thigh_l"
            elif any(k in clean_g for k in ["right", "r_", "_r"]):
                target_bone = "thigh_r"
            else:
                target_bone = "pelvis"

            # Check if target bone exists in Armature/vertex groups
            if target_bone not in mesh_obj.vertex_groups:
                for cand in [target_bone, "Pelvis", "hip", "Hips", "thigh_l", "thigh_r", "l_thigh", "r_thigh"]:
                    if cand in mesh_obj.vertex_groups:
                        target_bone = cand
                        break

            merge_vertex_group_weights(mesh_obj, g_name, target_bone)


def main(
    wardrobe_items: Optional[Union[List[Dict[str, Any]], str]] = None,
    character_body: str = "",
    auto_join_submeshes: bool = True,
    auto_clean_dforce: bool = True,
    convert_hair_curves: bool = True,
    **kwargs
) -> Dict[str, Any]:
    """
    Main entry point for wardrobe technical preparation.

    Args:
        wardrobe_items: Output from classify_mesh_types (list of dicts with 'name' and 'meshes').
        character_body: Optional name of the main character body mesh (e.g. 'Genesis 9').
        auto_join_submeshes: Merge sub-meshes of a single item into 1 mesh (default True).
        auto_clean_dforce: Merge non-standard dForce tail/skirt weights to Genesis 9 bones (default True).
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

        # Step C: Clean dForce / non-conforming tail bones
        if auto_clean_dforce and primary_obj.type == 'MESH':
            clean_dforce_and_extra_bones(primary_obj)

        if primary_obj.name not in prepared_meshes:
            prepared_meshes.append(primary_obj.name)

    summary = (
        f"Wardrobe Preparation Completed: {len(prepared_meshes)} clean clothing item(s) ready "
        f"({merged_items_count} merged multi-mesh groups). dForce bones sanitized to Genesis 9 standard."
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
