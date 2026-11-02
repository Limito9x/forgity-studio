# pyrefly: ignore [missing-import]
"""
All-In-One Character & Wardrobe Ingestion Node for Unreal Engine
Runs inside Unreal Engine via Python API (Unreal Engine 5.x) or Agent Worker Dry-Run.

Consumes:
  1. manifest: Unified Character Manifest from classify_character_manifest.py.
  2. fbx_files (optional): List of FBX asset file paths (auto-extracted from manifest if omitted).
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


def find_neighbor_thumbnail(fbx_path: str) -> Optional[str]:
    """
    Automatically discovers an image in the same directory as the FBX
    matching the asset's base name (e.g. Laura.png, Laura_thumb.jpg, etc.).
    """
    if not fbx_path or not os.path.isfile(fbx_path):
        return None
    fbx_dir = os.path.dirname(os.path.abspath(fbx_path))
    fbx_base = os.path.splitext(os.path.basename(fbx_path))[0]

    extensions = [".png", ".jpg", ".jpeg", ".tga", ".webp", ".bmp"]

    # 1. Exact match: <base><ext>
    for ext in extensions:
        cand = os.path.join(fbx_dir, f"{fbx_base}{ext}")
        if os.path.isfile(cand):
            return cand

    # 2. Suffix match: <base>_thumb<ext>, <base>_icon<ext>
    for suffix in ["_thumb", "_thumbnail", "_icon", "_Icon", "_Preview", "_preview"]:
        for ext in extensions:
            cand = os.path.join(fbx_dir, f"{fbx_base}{suffix}{ext}")
            if os.path.isfile(cand):
                return cand

    return None


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


def import_texture_file(file_path: str, dest_folder: str, texture_name: str, is_normal: bool = False, is_ui: bool = False, is_virtual: bool = False):
    """Imports image file into Unreal as Texture2D, handling normal maps, UI, and Virtual Texture streaming."""
    target_path = f"{dest_folder}/{texture_name}"
    tex = None
    if unreal.EditorAssetLibrary.does_asset_exist(target_path):
        tex = unreal.EditorAssetLibrary.load_asset(target_path)
    else:
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
        changed = False
        if is_normal and hasattr(unreal, "TextureCompressionSettings"):
            tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_NORMALMAP)
            try:
                tex.set_editor_property("srgb", False)
            except Exception:
                pass
            changed = True
        elif is_ui and hasattr(unreal, "TextureCompressionSettings"):
            tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_EDITOR_ICON)
            try:
                tex.set_editor_property("srgb", True)
            except Exception:
                pass
            changed = True

        if is_virtual:
            try:
                if not tex.get_editor_property("virtual_texture_streaming"):
                    tex.set_editor_property("virtual_texture_streaming", True)
                    changed = True
            except Exception:
                pass

        if changed:
            unreal.EditorAssetLibrary.save_loaded_asset(tex)
        return tex
    return None


def create_material_instance(
    master_mat_path: str,
    materials_folder: str,
    textures_folder: str,
    mi_name: str,
    textures: Dict[str, str]
):
    """Creates a MaterialInstanceConstant in materials_folder and binds textures stored in textures_folder."""
    if not master_mat_path or not unreal.EditorAssetLibrary.does_asset_exist(master_mat_path):
        master_mat_path = "/Game/Characters/Materials/M_Cloth"
        if not unreal.EditorAssetLibrary.does_asset_exist(master_mat_path):
            print(f"[import_wardrobe] Warning: Master Material '{master_mat_path}' not found.", flush=True)
            return None

    master_mat = unreal.EditorAssetLibrary.load_asset(master_mat_path)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.MaterialInstanceConstantFactoryNew()

    mi_asset = asset_tools.create_asset(mi_name, materials_folder, unreal.MaterialInstanceConstant, factory)
    if not mi_asset:
        target_path = f"{materials_folder}/{mi_name}"
        if unreal.EditorAssetLibrary.does_asset_exist(target_path):
            mi_asset = unreal.EditorAssetLibrary.load_asset(target_path)

    if not mi_asset:
        return None

    unreal.MaterialEditingLibrary.set_material_instance_parent(mi_asset, master_mat)

    # Detect if master material expects Virtual Textures (e.g. M_Skin)
    is_skin_master = "skin" in master_mat_path.lower()

    # Bind textures
    for param_name, tex_path in textures.items():
        if tex_path and os.path.isfile(tex_path):
            raw_base = sanitize_asset_name(os.path.splitext(os.path.basename(tex_path))[0])
            tex_base = f"T_{raw_base}" if not raw_base.startswith("T_") else raw_base
            is_norm = "normal" in param_name.lower() or "normal" in tex_base.lower() or "nm" in tex_base.lower()
            is_vt = is_skin_master or "vt" in param_name.lower()
            tex_obj = import_texture_file(tex_path, textures_folder, tex_base, is_normal=is_norm, is_virtual=is_vt)
            if tex_obj:
                unreal.MaterialEditingLibrary.set_material_instance_texture_parameter_value(
                    mi_asset, param_name, tex_obj
                )

    unreal.EditorAssetLibrary.save_loaded_asset(mi_asset)
    return mi_asset


def resolve_data_asset_class(schema_name_or_path: str):
    """
    Robustly resolves a Blueprint PrimaryDataAsset class in Unreal Engine.
    Tries package path without _C for load_blueprint_class,
    and class_candidate with .ClassName_C for load_class.
    """
    clean = (schema_name_or_path or "").strip().strip("'").strip('"')
    if not clean:
        clean = "PDA_WardrobeItem"

    # Strip any trailing .ClassName_C or _C to get clean base package path
    base_pkg = clean.split(".")[0]
    if base_pkg.endswith("_C"):
        base_pkg = base_pkg[:-2]

    # Generate candidate package paths
    candidates = []
    if "/" in base_pkg:
        candidates.append(base_pkg)
    else:
        candidates.extend([
            f"/Game/Systems/Wardrobe/Schemas/{base_pkg}",
            f"/Game/Characters/Genesis9/Common/Schemas/{base_pkg}",
            f"/Game/Characters/Schemas/{base_pkg}",
            f"/Game/Systems/Characters/Schemas/{base_pkg}",
        ])

    for pkg_path in candidates:
        if not unreal.EditorAssetLibrary.does_asset_exist(pkg_path):
            continue

        schema_name = pkg_path.split("/")[-1]

        # 1. Try load_blueprint_class (expects clean asset path without _C)
        if hasattr(unreal.EditorAssetLibrary, "load_blueprint_class"):
            try:
                cls = unreal.EditorAssetLibrary.load_blueprint_class(pkg_path)
                if cls:
                    print(f"   [FORGITY] Loaded Schema Class via load_blueprint_class: '{pkg_path}'", flush=True)
                    return cls
            except Exception:
                pass

        # 2. Try load_class with object path .ClassName_C
        try:
            cls = unreal.load_class(None, f"{pkg_path}.{schema_name}_C")
            if cls:
                print(f"   [FORGITY] Loaded Schema Class via load_class: '{pkg_path}.{schema_name}_C'", flush=True)
                return cls
        except Exception:
            pass

        # 3. Try load_asset and read generated_class
        try:
            bp = unreal.EditorAssetLibrary.load_asset(pkg_path)
            if bp and hasattr(bp, "generated_class") and bp.generated_class:
                print(f"   [FORGITY] Loaded Schema Class via bp.generated_class: '{pkg_path}'", flush=True)
                return bp.generated_class
        except Exception:
            pass

    return None


def _make_gameplay_tag(tag_str: str) -> Any:
    """Construct an FGameplayTag in Unreal Engine."""
    if not tag_str:
        return None
    try:
        tag = unreal.GameplayTag()
        tag.import_text(tag_str)
        return tag
    except Exception:
        pass
    try:
        tag = unreal.GameplayTag()
        tag.tag_name = unreal.Name(tag_str)
        return tag
    except Exception:
        pass
    return unreal.Name(tag_str)


def create_and_populate_data_asset(
    schema_name_or_path: str,
    dest_folder: str,
    data_asset_name: str,
    mesh_obj,
    thumbnail_obj,
    properties: Dict[str, Any]
):
    """Creates Data Asset instance (DA_*) and sets properties."""
    target_class = resolve_data_asset_class(schema_name_or_path)
    if not target_class:
        print(f"   [FORGITY :: ERROR] Failed to resolve Schema Class for '{schema_name_or_path}'", flush=True)
        return None

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.DataAssetFactory()
    try:
        factory.set_editor_property("data_asset_class", target_class)
    except Exception:
        pass

    # Delete existing asset if present to ensure clean recreation
    full_path = f"{dest_folder}/{data_asset_name}"
    if unreal.EditorAssetLibrary.does_asset_exist(full_path):
        unreal.EditorAssetLibrary.delete_asset(full_path)

    da_asset = asset_tools.create_asset(data_asset_name, dest_folder, target_class, factory)
    if not da_asset:
        print(f"   [FORGITY :: ERROR] Failed to create Data Asset '{data_asset_name}' with factory.", flush=True)
        return None

    # 1. Bind Mesh & Thumbnail
    if mesh_obj:
        for prop in ["BodyMesh", "ItemMesh", "Mesh", "SkeletalMesh", "CharacterMesh"]:
            if hasattr(da_asset, prop):
                try:
                    da_asset.set_editor_property(prop, mesh_obj)
                    print(f"   [FORGITY] Bound Mesh to '{prop}' on '{data_asset_name}'", flush=True)
                    break
                except Exception:
                    pass

    if thumbnail_obj:
        for prop in ["ItemThumbnail", "Thumbnail", "Icon", "Texture"]:
            if hasattr(da_asset, prop):
                try:
                    da_asset.set_editor_property(prop, thumbnail_obj)
                    print(f"   [FORGITY] Bound Thumbnail to '{prop}' on '{data_asset_name}'", flush=True)
                    break
                except Exception:
                    pass

    # 2. Bind GameplayTags
    for tag_field in ["SlotTag", "ItemTag", "CharacterTag"]:
        tag_val = properties.get(tag_field, "")
        if tag_val and hasattr(da_asset, tag_field):
            tag_obj = _make_gameplay_tag(tag_val)
            try:
                da_asset.set_editor_property(tag_field, tag_obj)
                print(f"   [FORGITY] Set GameplayTag '{tag_field}' = '{tag_val}' on '{data_asset_name}'", flush=True)
            except Exception as e:
                try:
                    da_asset.set_editor_property(tag_field, unreal.Name(tag_val))
                except Exception:
                    print(f"   [FORGITY :: WARN] Could not set tag '{tag_field}={tag_val}': {e}", flush=True)

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
    manifest: Dict[str, Any],
    fbx_files: Optional[List[str]] = None,
    destination_folder: str = "",
    skeleton_path: str = "/Game/Characters/Genesis9/Common/Skeleton/Genesis9_Skeleton.Genesis9_Skeleton",
    normal_import_method: NormalImportMethodType = "FBXNIM_IMPORT_NORMALS",
    dry_run: bool = False,
    **kwargs
) -> Dict[str, Any]:
    """
    Main entry point for All-In-One Character & Wardrobe Ingestion.
    """
    if isinstance(manifest, str):
        try:
            manifest = json.loads(manifest)
        except Exception:
            manifest = {}

    manifest_items = manifest.get("items", [])
    if not manifest_items and "objects_map" in manifest:
        # Backward compatibility with objects_map format
        manifest_items = list(manifest["objects_map"].values())

    resolved_fbx_files: List[str] = list(fbx_files or [])
    if not resolved_fbx_files:
        for item in manifest_items:
            p = item.get("fbx_file", item.get("file_path", ""))
            if p and p not in resolved_fbx_files:
                resolved_fbx_files.append(p)

    if not resolved_fbx_files and not manifest_items:
        raise ValueError("Neither fbx_files nor valid items in manifest were provided to import_character_wardrobe.")

    fbx_files = resolved_fbx_files

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
        item_dest_folder = _clean_ue_path(item.get("destination_folder") or clean_dest_folder)
        root_dest_folder = item_dest_folder
        materials_folder = f"{root_dest_folder}/Materials"
        textures_folder = f"{root_dest_folder}/Textures"

        unreal.EditorAssetLibrary.make_directory(root_dest_folder)
        unreal.EditorAssetLibrary.make_directory(materials_folder)
        unreal.EditorAssetLibrary.make_directory(textures_folder)

        print(f"\n[import_wardrobe] Processing item '{asset_name}' -> Root: {root_dest_folder} (Materials: {materials_folder}, Textures: {textures_folder})", flush=True)

        # Resolve target skeleton path
        item_skeleton = item.get("skeleton_path") or skeleton_path
        if not item_skeleton or not unreal.EditorAssetLibrary.does_asset_exist(item_skeleton):
            candidates = [
                "/Game/Characters/Genesis9/Base/Rig/G9_Skeleton",
                "/Game/Characters/Genesis9/Base/Rig/G9_Skeleton.G9_Skeleton",
                "/Game/Characters/Genesis9/Common/Skeleton/Genesis9_Skeleton",
            ]
            contracts_skeletons = manifest.get("contracts", {}).get("skeletons", {})
            for sk_info in contracts_skeletons.values():
                if isinstance(sk_info, dict) and sk_info.get("package_path"):
                    candidates.insert(0, sk_info["package_path"])

            for c in candidates:
                if c and unreal.EditorAssetLibrary.does_asset_exist(c):
                    item_skeleton = c
                    print(f"   [FORGITY] Auto-resolved Skeleton for '{asset_name}': '{item_skeleton}'", flush=True)
                    break

        # 1. Import Mesh into Root
        mesh_obj = import_fbx_mesh(fbx_path, root_dest_folder, mesh_name, item_skeleton, normal_import_method)
        if mesh_obj:
            imported_meshes.append(f"{root_dest_folder}/{mesh_name}")
        else:
            print(f"[import_wardrobe] Error: Failed to import Skeletal Mesh '{mesh_name}'.", flush=True)
            continue

        # 2. Setup Material Instances in Materials/ and Textures in Textures/
        materials_dict = item.get("materials", {})
        if isinstance(materials_dict, list):
            materials_dict = {s.get("slot_name", f"slot_{i}"): s for i, s in enumerate(materials_dict)}

        created_mis = {}
        for slot_key, slot_info in materials_dict.items():
            master_path = slot_info.get("master_material_path", "/Game/Characters/Materials/M_Cloth")
            textures = slot_info.get("textures", {})
            mi_name = f"MI_{mesh_name}_{sanitize_asset_name(slot_key)}"

            mi_obj = create_material_instance(master_path, materials_folder, textures_folder, mi_name, textures)
            if mi_obj:
                created_mis[slot_key] = mi_obj
                mat_tag = slot_info.get("material_tag", "")
                if mat_tag:
                    created_mis[mat_tag] = mi_obj

        # 3. Bind Material Instances to Skeletal Mesh Slots (Direct Contract-driven 1-to-1)
        if hasattr(mesh_obj, "materials") and mesh_obj.materials:
            mesh_materials = list(mesh_obj.materials)

            for slot_idx, skeletal_mat in enumerate(mesh_materials):
                slot_name = str(skeletal_mat.material_slot_name)
                slot_clean = sanitize_asset_name(slot_name).lower()

                assigned_mi = None
                # Direct lookup by slot name or sanitized slot key
                for k, mi in created_mis.items():
                    if k.lower() == slot_name.lower() or sanitize_asset_name(k).lower() == slot_clean:
                        assigned_mi = mi
                        break

                if assigned_mi:
                    skeletal_mat.material_interface = assigned_mi
                    print(f"   [FORGITY] Bound Slot {slot_idx} ('{slot_name}') -> '{assigned_mi.get_name()}'", flush=True)
                else:
                    print(f"   [FORGITY] Notice: Slot {slot_idx} ('{slot_name}') has no direct mapping in manifest.", flush=True)

            # Persist updated materials to SkeletalMesh
            mesh_obj.set_editor_property("materials", mesh_materials)
            unreal.EditorAssetLibrary.save_loaded_asset(mesh_obj)

        # 4. Ingest Thumbnail into Textures/ (Auto-scan neighbor files if not provided in manifest)
        thumbnail_obj = None
        thumb_path = item.get("thumbnail_file", "")
        if not thumb_path or not os.path.isfile(thumb_path):
            thumb_path = find_neighbor_thumbnail(fbx_path)

        if thumb_path and os.path.isfile(thumb_path):
            thumb_name = f"T_{asset_name}"
            print(f"   [FORGITY] Ingesting Thumbnail: '{thumb_path}' -> '{thumb_name}' into '{textures_folder}'", flush=True)
            thumbnail_obj = import_texture_file(thumb_path, textures_folder, thumb_name, is_ui=True)

        # 5. Create Data Asset (DA_*) in Root
        target_schema = item.get("target_schema_path") or item.get("target_schema", "PDA_WardrobeItem")
        properties = item.get("properties", {})
        da_obj = create_and_populate_data_asset(target_schema, root_dest_folder, da_name, mesh_obj, thumbnail_obj, properties)
        if da_obj:
            created_data_assets.append(f"{root_dest_folder}/{da_name}")
            print(f"[import_wardrobe] Successfully created Data Asset '{root_dest_folder}/{da_name}' with Tags.", flush=True)

    summary = (
        f"Completed Ingestion: {len(imported_meshes)} Skeletal Meshes (SKM_*), "
        f"{len(created_data_assets)} Data Assets (DA_*) into '{clean_dest_folder}'."
    )
    print(f"\n[import_wardrobe] {summary}", flush=True)

    return {
        "status": "Success",
        "items_count": max(len(imported_meshes), len(created_data_assets)),
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

