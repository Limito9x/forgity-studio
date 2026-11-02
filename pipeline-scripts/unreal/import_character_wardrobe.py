# pyrefly: ignore [missing-import]
"""
All-In-One Character & Wardrobe Ingestion Node for Unreal Engine
Runs inside Unreal Engine via Python API (Unreal Engine 5.x) or Agent Worker Dry-Run.

Consumes:
  1. fbx_files: List of FBX asset file paths.
  2. manifest: Unified Character Manifest from classify_character_manifest.py.
  3. destination_folder (optional): Unreal destination package path (overrides manifest).
  4. skeleton_path (optional): Skeletal Mesh Skeleton asset path.
  5. normal_import_method (optional): 'FBXNIM_IMPORT_NORMALS' (default).
  6. dry_run (optional): Simulate without modifying Unreal assets.

Performs:
  - Batch imports FBX files with standard prefix 'SKM_*'.
  - Automatically creates and binds Material Instances ('MI_*') from Master Materials.
  - Ingests associated PNG thumbnails with prefix 'T_*'.
  - Registers Primary Data Assets with standard prefix 'DA_*' (never 'PDA_*').
  - Sets all struct GameplayTags (SlotTag, ItemTag, CharacterTag) and DisplayName.
  - Saves all created assets cleanly in a single session.

Outputs:
  - status: "Success" or "Failed"
  - items_count: Total processed items
  - imported_meshes: List of Skeletal Mesh package paths
  - created_data_assets: List of Data Asset package paths
  - summary: Human-readable execution summary.
"""

import os
import sys
import json
import hashlib
from typing import Dict, Any, List, Optional, Union, Literal

NormalImportMethodType = Literal[
    "FBXNIM_IMPORT_NORMALS",
    "FBXNIM_COMPUTE_NORMALS",
    "FBXNIM_IMPORT_NORMALS_AND_TANGENTS"
]

try:
    import unreal
    HAS_UNREAL = True
except ImportError:
    unreal = None
    HAS_UNREAL = False


def _clean_ue_path(path: str) -> str:
    if not path:
        return ""
    path = path.strip().replace("\\", "/")
    if not path.startswith("/"):
        path = "/" + path
    return path.rstrip("/")


def sanitize_asset_name(name: str) -> str:
    for ch in [" ", "-", ".", ":", "/", "\\", "(", ")", "[", "]"]:
        name = name.replace(ch, "_")
    while "__" in name:
        name = name.replace("__", "_")
    return name.strip("_")


def sync_tags_to_ini(tags: List[str]) -> List[str]:
    """
    Ensures that dynamically generated tags exist in Config/DefaultGameplayTags.ini.
    Appends missing tags to prevent Unreal from returning empty gameplay tag structs.
    """
    if not tags:
        return []

    ini_path = ""
    if HAS_UNREAL and hasattr(unreal, "Paths"):
        try:
            cand = os.path.join(unreal.Paths.project_config_dir(), "DefaultGameplayTags.ini")
            if os.path.exists(cand) or os.path.exists(os.path.dirname(cand)):
                ini_path = cand
        except Exception:
            pass

    if not ini_path or not os.path.exists(ini_path):
        curr = os.getcwd()
        for _ in range(6):
            for item in os.listdir(curr):
                if item.endswith(".uproject"):
                    candidate = os.path.join(curr, "Config", "DefaultGameplayTags.ini")
                    if os.path.exists(candidate) or os.path.exists(os.path.dirname(candidate)):
                        ini_path = candidate
                        break
            if ini_path:
                break
            parent = os.path.dirname(curr)
            if parent == curr:
                break
            curr = parent

    if not ini_path:
        return []

    existing_content = ""
    if os.path.exists(ini_path):
        try:
            with open(ini_path, "r", encoding="utf-8", errors="ignore") as f:
                existing_content = f.read()
        except Exception:
            pass

    new_tags_added = []
    lines_to_append = []
    for tag in tags:
        tag_clean = tag.strip()
        if not tag_clean:
            continue
        pattern = f'Tag="{tag_clean}"'
        if pattern not in existing_content:
            lines_to_append.append(f'+GameplayTagList=(Tag="{tag_clean}",DevComment="")\n')
            new_tags_added.append(tag_clean)

    if lines_to_append:
        try:
            # Ensure folder exists
            os.makedirs(os.path.dirname(ini_path), exist_ok=True)
            with open(ini_path, "a", encoding="utf-8") as f:
                if existing_content and not existing_content.endswith("\n"):
                    f.write("\n")
                if "[/Script/GameplayTags.GameplayTagsList]" not in existing_content:
                    f.write("[/Script/GameplayTags.GameplayTagsList]\n")
                f.writelines(lines_to_append)
            print(f"[import_wardrobe] Registered {len(new_tags_added)} new GameplayTags to '{ini_path}': {new_tags_added}", flush=True)
        except Exception as ex:
            print(f"[import_wardrobe] Warning appending tags to ini: {ex}", flush=True)

    return new_tags_added


def import_fbx_mesh(
    fbx_path: str,
    dest_folder: str,
    mesh_name: str,
    skeleton_path: str,
    normal_import_method: str = "FBXNIM_IMPORT_NORMALS"
):
    """Imports FBX as Skeletal Mesh."""
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", os.path.abspath(fbx_path))
    task.set_editor_property("destination_path", dest_folder)
    task.set_editor_property("destination_name", mesh_name)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)

    fbx_options = unreal.FbxImportUI()
    fbx_options.set_editor_property("import_mesh", True)
    fbx_options.set_editor_property("import_as_skeletal", True)
    fbx_options.set_editor_property("import_materials", False)
    fbx_options.set_editor_property("import_textures", False)
    fbx_options.set_editor_property("create_physics_asset", False)

    if skeleton_path and unreal.EditorAssetLibrary.does_asset_exist(skeleton_path):
        fbx_options.skeleton = unreal.EditorAssetLibrary.load_asset(skeleton_path)

    if hasattr(fbx_options, "skeletal_mesh_import_data") and fbx_options.skeletal_mesh_import_data:
        try:
            if hasattr(unreal, "FBXImportContentType"):
                fbx_options.skeletal_mesh_import_data.set_editor_property(
                    "import_content_type", unreal.FBXImportContentType.FBXIT_GEOMETRY_AND_SKINNING
                )
            if hasattr(unreal, "FBXNormalImportMethod"):
                method_enum = getattr(unreal.FBXNormalImportMethod, normal_import_method, unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS)
                fbx_options.skeletal_mesh_import_data.set_editor_property("normal_import_method", method_enum)
        except Exception as e:
            print(f"[import_wardrobe] Warning setting skeletal mesh options: {e}", flush=True)

    task.set_editor_property("options", fbx_options)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

    imported_path = f"{dest_folder}/{mesh_name}"
    if unreal.EditorAssetLibrary.does_asset_exist(imported_path):
        return unreal.EditorAssetLibrary.load_asset(imported_path)
    return None


def import_texture_file(file_path: str, dest_folder: str, texture_name: str, is_normal: bool = False, is_ui: bool = False):
    """Imports image file into Unreal as Texture2D."""
    target_path = f"{dest_folder}/{texture_name}"
    if unreal.EditorAssetLibrary.does_asset_exist(target_path):
        return unreal.EditorAssetLibrary.load_asset(target_path)

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", os.path.abspath(file_path))
    task.set_editor_property("destination_path", dest_folder)
    task.set_editor_property("destination_name", texture_name)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

    if unreal.EditorAssetLibrary.does_asset_exist(target_path):
        tex = unreal.EditorAssetLibrary.load_asset(target_path)
        if tex:
            if is_normal and hasattr(unreal, "TextureCompressionSettings"):
                tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
                tex.set_editor_property("s_rgb", False)
            elif is_ui and hasattr(unreal, "TextureCompressionSettings"):
                tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_EDITOR_ICON)
            unreal.EditorAssetLibrary.save_loaded_asset(tex)
        return tex
    return None


def create_material_instance(
    master_mat_path: str,
    dest_folder: str,
    mi_name: str,
    textures: Dict[str, str]
):
    """Creates a MaterialInstanceConstant and binds texture parameters."""
    if not master_mat_path or not unreal.EditorAssetLibrary.does_asset_exist(master_mat_path):
        master_mat_path = "/Game/Characters/Materials/M_Cloth"
        if not unreal.EditorAssetLibrary.does_asset_exist(master_mat_path):
            print(f"[import_wardrobe] Warning: Master Material '{master_mat_path}' not found.", flush=True)
            return None

    master_mat = unreal.EditorAssetLibrary.load_asset(master_mat_path)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.MaterialInstanceConstantFactoryNew()

    mi_asset = asset_tools.create_asset(mi_name, dest_folder, unreal.MaterialInstanceConstant, factory)
    if not mi_asset:
        target_path = f"{dest_folder}/{mi_name}"
        if unreal.EditorAssetLibrary.does_asset_exist(target_path):
            mi_asset = unreal.EditorAssetLibrary.load_asset(target_path)

    if not mi_asset:
        return None

    unreal.MaterialEditingLibrary.set_material_instance_parent(mi_asset, master_mat)

    # Bind textures
    for param_name, tex_path in textures.items():
        if tex_path and os.path.isfile(tex_path):
            tex_base = sanitize_asset_name(os.path.splitext(os.path.basename(tex_path))[0])
            is_norm = "normal" in param_name.lower() or "normal" in tex_base.lower()
            tex_obj = import_texture_file(tex_path, dest_folder, tex_base, is_normal=is_norm)
            if tex_obj:
                unreal.MaterialEditingLibrary.set_material_instance_texture_parameter_value(
                    mi_asset, param_name, tex_obj
                )

    unreal.EditorAssetLibrary.save_loaded_asset(mi_asset)
    return mi_asset


def create_and_populate_data_asset(
    schema_name_or_path: str,
    dest_folder: str,
    data_asset_name: str,
    mesh_obj,
    thumbnail_obj,
    properties: Dict[str, Any]
):
    """Creates Data Asset instance (DA_*) and sets properties."""
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.DataAssetFactory()

    # Resolve target schema class
    clean_schema = schema_name_or_path.strip().strip("'").strip('"')
    if "/" not in clean_schema:
        # Search common wardrobe schema locations
        candidates = [
            f"/Game/Systems/Wardrobe/Schemas/{clean_schema}.{clean_schema}_C",
            f"/Game/Characters/Genesis9/Common/Schemas/{clean_schema}.{clean_schema}_C",
            f"/Game/Characters/Schemas/{clean_schema}.{clean_schema}_C",
        ]
        target_class_path = candidates[0]
        for c in candidates:
            pkg = c.split(".")[0]
            if unreal.EditorAssetLibrary.does_asset_exist(pkg):
                target_class_path = c
                break
    else:
        target_class_path = clean_schema
        if not target_class_path.endswith("_C"):
            target_class_path = f"{target_class_path}_C"

    target_class = unreal.EditorAssetLibrary.load_blueprint_class(target_class_path)
    if not target_class:
        print(f"[import_wardrobe] Error: Failed to load Blueprint Schema Class '{target_class_path}'.", flush=True)
        return None

    # Delete existing asset if present to ensure clean recreation
    full_path = f"{dest_folder}/{data_asset_name}"
    if unreal.EditorAssetLibrary.does_asset_exist(full_path):
        unreal.EditorAssetLibrary.delete_asset(full_path)

    da_asset = asset_tools.create_asset(data_asset_name, dest_folder, target_class, factory)
    if not da_asset:
        return None

    # 1. Bind Mesh & Thumbnail
    if mesh_obj:
        for prop in ["ItemMesh", "Mesh", "SkeletalMesh", "CharacterMesh"]:
            if hasattr(da_asset, prop):
                try:
                    da_asset.set_editor_property(prop, mesh_obj)
                    break
                except Exception:
                    pass

    if thumbnail_obj:
        for prop in ["ItemThumbnail", "Thumbnail", "Icon", "Texture"]:
            if hasattr(da_asset, prop):
                try:
                    da_asset.set_editor_property(prop, thumbnail_obj)
                    break
                except Exception:
                    pass

    # 2. Bind GameplayTags
    tag_manager = unreal.GameplayTagsManager.get_gameplay_tags_manager()
    for tag_field in ["SlotTag", "ItemTag", "CharacterTag"]:
        tag_val = properties.get(tag_field, "")
        if tag_val and hasattr(da_asset, tag_field):
            try:
                tag_struct = tag_manager.request_gameplay_tag(tag_val)
                da_asset.set_editor_property(tag_field, tag_struct)
            except Exception as e:
                print(f"[import_wardrobe] Warning setting tag '{tag_field}={tag_val}': {e}", flush=True)

    # 3. Bind DisplayName & Strings
    display_name = properties.get("DisplayName", "")
    if display_name:
        for prop in ["DisplayName", "ItemName", "Title"]:
            if hasattr(da_asset, prop):
                try:
                    da_asset.set_editor_property(prop, unreal.Text(display_name))
                    break
                except Exception:
                    pass

    unreal.EditorAssetLibrary.save_loaded_asset(da_asset)
    return da_asset


def main(
    fbx_files: List[str],
    manifest: Dict[str, Any],
    destination_folder: str = "",
    skeleton_path: str = "/Game/Characters/Genesis9/Common/Skeleton/Genesis9_Skeleton.Genesis9_Skeleton",
    normal_import_method: NormalImportMethodType = "FBXNIM_IMPORT_NORMALS",
    dry_run: bool = False,
    **kwargs
) -> Dict[str, Any]:
    """
    Main entry point for All-In-One Character & Wardrobe Ingestion.
    """
    if not fbx_files:
        raise ValueError("No FBX files provided to import_character_wardrobe.")

    manifest_items = manifest.get("items", [])
    if not manifest_items and "objects_map" in manifest:
        # Backward compatibility with objects_map format
        manifest_items = list(manifest["objects_map"].values())

    clean_dest_folder = _clean_ue_path(
        destination_folder or manifest.get("destination_folder", "/Game/Characters/Genesis9/Wardrobe")
    )

    if dry_run or not HAS_UNREAL:
        sim_meshes = [f"{clean_dest_folder}/SKM_{os.path.splitext(os.path.basename(f))[0]}" for f in fbx_files]
        sim_das = [f"{clean_dest_folder}/DA_{os.path.splitext(os.path.basename(f))[0]}" for f in fbx_files]
        summary = f"[DryRun] Simulated ingestion of {len(fbx_files)} items to '{clean_dest_folder}'."
        print(summary, flush=True)
        return {
            "status": "Success",
            "items_count": len(fbx_files),
            "imported_meshes": sim_meshes,
            "created_data_assets": sim_das,
            "summary": summary
        }

    # Unreal Engine Execution
    unreal.EditorAssetLibrary.make_directory(clean_dest_folder)
    fbx_map = {os.path.abspath(f): f for f in fbx_files}

    # Pre-scan and register all dynamic Character/Item/Slot tags to DefaultGameplayTags.ini
    tags_to_sync = []
    for item in manifest_items:
        props = item.get("properties", {})
        for tf in ["SlotTag", "ItemTag", "CharacterTag"]:
            t_val = props.get(tf, "").strip()
            if t_val and t_val not in tags_to_sync:
                tags_to_sync.append(t_val)
    if tags_to_sync:
        sync_tags_to_ini(tags_to_sync)

    imported_meshes = []
    created_data_assets = []

    for item in manifest_items:
        fbx_path = os.path.abspath(item.get("fbx_file", item.get("file_path", "")))
        if not fbx_path or not os.path.isfile(fbx_path):
            # Match by filename if absolute path differs
            cand_name = os.path.basename(fbx_path).lower()
            matched = None
            for p in fbx_map.keys():
                if os.path.basename(p).lower() == cand_name:
                    matched = p
                    break
            if matched:
                fbx_path = matched
            else:
                print(f"[import_wardrobe] Warning: FBX file not found for item '{item.get('asset_name')}'. Skipping.", flush=True)
                continue

        asset_name = sanitize_asset_name(item.get("asset_name", os.path.splitext(os.path.basename(fbx_path))[0]))
        mesh_name = item.get("mesh_name", f"SKM_{asset_name}")
        da_name = item.get("data_asset_name", f"DA_{asset_name}")

        print(f"\n[import_wardrobe] Processing item '{asset_name}' -> Mesh: {mesh_name}, DA: {da_name}...", flush=True)

        # 1. Import Mesh
        mesh_obj = import_fbx_mesh(fbx_path, clean_dest_folder, mesh_name, skeleton_path, normal_import_method)
        if mesh_obj:
            imported_meshes.append(f"{clean_dest_folder}/{mesh_name}")
        else:
            print(f"[import_wardrobe] Error: Failed to import Skeletal Mesh '{mesh_name}'.", flush=True)
            continue

        # 2. Setup Material Instances & Bind to Mesh Slots
        materials_dict = item.get("materials", {})
        if isinstance(materials_dict, list):
            # Support list of slot dicts
            materials_dict = {s.get("slot_name", f"slot_{i}"): s for i, s in enumerate(materials_dict)}

        for slot_idx, (slot_name, slot_info) in enumerate(materials_dict.items()):
            master_path = slot_info.get("master_material_path", "/Game/Characters/Materials/M_Cloth")
            textures = slot_info.get("textures", {})
            mi_name = f"MI_{mesh_name}_{sanitize_asset_name(slot_name)}"

            mi_obj = create_material_instance(master_path, clean_dest_folder, mi_name, textures)
            if mi_obj and hasattr(mesh_obj, "materials") and slot_idx < len(mesh_obj.materials):
                mesh_obj.materials[slot_idx].material_interface = mi_obj

        unreal.EditorAssetLibrary.save_loaded_asset(mesh_obj)

        # 3. Ingest Thumbnail
        thumbnail_obj = None
        thumb_path = item.get("thumbnail_file", "")
        if thumb_path and os.path.isfile(thumb_path):
            thumb_name = f"T_{asset_name}"
            thumbnail_obj = import_texture_file(thumb_path, clean_dest_folder, thumb_name, is_ui=True)

        # 4. Create Data Asset (DA_*)
        target_schema = item.get("target_schema", "PDA_WardrobeItem")
        properties = item.get("properties", {})
        da_obj = create_and_populate_data_asset(target_schema, clean_dest_folder, da_name, mesh_obj, thumbnail_obj, properties)
        if da_obj:
            created_data_assets.append(f"{clean_dest_folder}/{da_name}")
            print(f"[import_wardrobe] Successfully created Data Asset '{clean_dest_folder}/{da_name}' with Tags.", flush=True)

    summary = (
        f"Completed Ingestion: {len(imported_meshes)} Skeletal Meshes (SKM_*), "
        f"{len(created_data_assets)} Data Assets (DA_*) into '{clean_dest_folder}'."
    )
    print(f"\n[import_wardrobe] {summary}", flush=True)

    return {
        "status": "Success",
        "items_count": len(created_data_assets),
        "imported_meshes": imported_meshes,
        "created_data_assets": created_data_assets,
        "summary": summary
    }


if __name__ == "__main__":
    # Smoke test on host without unreal
    print("Testing import_character_wardrobe main() in Dry-Run mode...")
    test_manifest = {
        "destination_folder": "/Game/Characters/Genesis9/Eva/Outfits",
        "items": [
            {
                "asset_name": "Eva_Outfit1_BRZ_US_Bra",
                "mesh_name": "SKM_Eva_Outfit1_BRZ_US_Bra",
                "data_asset_name": "DA_Eva_Outfit1_BRZ_US_Bra",
                "fbx_file": "D:/test/Eva_Outfit1_BRZ_US_Bra.fbx",
                "target_schema": "PDA_WardrobeItem",
                "properties": {
                    "DisplayName": "BRZ US Bra",
                    "SlotTag": "System.Wardrobe.Slots.Inner_Top",
                    "ItemTag": "Character.Eva.Outfits.Eva_Outfit1_BRZ_US_Bra",
                    "CharacterTag": "Character.Eva"
                }
            }
        ]
    }
    res = main(fbx_files=["D:/test/Eva_Outfit1_BRZ_US_Bra.fbx"], manifest=test_manifest, dry_run=True)
    print("Result:", res)

