# pyrefly: ignore [missing-import]
"""
All-In-One Character & Wardrobe Ingestion Node for Unreal Engine
Runs inside Unreal Engine via Python API (Unreal Engine 5.x) or Agent Worker Dry-Run.

Strictly Contract-Driven Pipeline:
  1. Import Skeletal Mesh (SKM_*) with designated Skeleton.
  2. Ingest Textures with exact settings from Master Material Contract (TC_*, sRGB, VT).
  3. Create Material Instances (MI_*) and bind texture parameters.
  4. Bind Material Instances to Skeletal Mesh material slots 1-to-1.
  5. Ingest companion Thumbnail (T_*) with TC_EditorIcon.
  6. Create Primary Data Asset (DA_*) and bind Mesh, Thumbnail, and GameplayTags.
"""

import os
import sys
import json
from typing import Dict, Any, List, Optional, Literal, Tuple

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


def ensure_gameplay_tags(tags: List[str]):
    """Registers missing tags to DefaultGameplayTags.ini to prevent Unreal from ignoring them."""
    if not tags or not HAS_UNREAL or not hasattr(unreal, "Paths"):
        return
    try:
        ini_path = os.path.join(unreal.Paths.project_config_dir(), "DefaultGameplayTags.ini")
        if not os.path.isfile(ini_path):
            return

        with open(ini_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        lines_to_add = [
            f'+GameplayTagList=(Tag="{t.strip()}",DevComment="")\n'
            for t in tags if t.strip() and f'Tag="{t.strip()}"' not in content
        ]
        if not lines_to_add:
            return

        section = "[/Script/GameplayTags.GameplayTagsSettings]"
        if section in content:
            content = content.replace(section, section + "\n" + "".join(lines_to_add), 1)
        else:
            content += f"\n{section}\n" + "".join(lines_to_add)

        with open(ini_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"[import_wardrobe] Registered {len(lines_to_add)} new GameplayTags to '{ini_path}'", flush=True)
    except Exception as ex:
        print(f"[import_wardrobe] Warning registering tags: {ex}", flush=True)


def find_neighbor_thumbnail(fbx_path: str) -> Optional[str]:
    """Finds companion thumbnail image next to the FBX."""
    if not fbx_path or not os.path.isfile(fbx_path):
        return None
    base_dir = os.path.dirname(os.path.abspath(fbx_path))
    stem = os.path.splitext(os.path.basename(fbx_path))[0]
    for ext in [".png", ".jpg", ".jpeg", ".webp"]:
        for suffix in ["", "_thumb", "_thumbnail", "_icon", "_preview"]:
            cand = os.path.join(base_dir, f"{stem}{suffix}{ext}")
            if os.path.isfile(cand):
                return cand
    return None


def extract_skeleton_from_asset(asset: Any) -> Optional[Any]:
    """Ensures asset is an unreal.Skeleton. If it is a SkeletalMesh, extracts its underlying skeleton."""
    if not asset or not HAS_UNREAL:
        return None
    if hasattr(unreal, "Skeleton") and isinstance(asset, unreal.Skeleton):
        return asset
    if hasattr(unreal, "SkeletalMesh") and isinstance(asset, unreal.SkeletalMesh):
        try:
            skel = asset.get_editor_property("skeleton")
            if skel and (not hasattr(unreal, "Skeleton") or isinstance(skel, unreal.Skeleton)):
                return skel
        except Exception:
            pass
        skel = getattr(asset, "skeleton", None)
        if skel and (not hasattr(unreal, "Skeleton") or isinstance(skel, unreal.Skeleton)):
            return skel
    return None


def normalize_unreal_package_path(raw_path: str) -> str:
    """Normalizes Windows disk path, typo root (/Games/), or relative path to standard Unreal /Game/... package path."""
    if not raw_path or not raw_path.strip():
        return ""
    p = raw_path.strip().replace("\\", "/")
    
    # Strip extension (.uasset)
    if p.endswith(".uasset"):
        p = p[:-7]
        
    # Check if Windows disk path containing /Content/
    if "/content/" in p.lower():
        idx = p.lower().find("/content/")
        rel = p[idx + 9:].lstrip("/")
        return f"/Game/{rel}"
        
    # Fix common typo /Games/ -> /Game/
    if p.lower().startswith("/games/"):
        return f"/Game/{p[7:]}"
    elif p.lower().startswith("games/"):
        return f"/Game/{p[6:]}"
        
    # If starts with Content/
    if p.lower().startswith("/content/"):
        return f"/Game/{p[9:]}"
    elif p.lower().startswith("content/"):
        return f"/Game/{p[8:]}"
        
    if p.startswith("/Game/"):
        return p
    if p.startswith("/"):
        return p
        
    return f"/Game/{p}"


def resolve_skeleton(
    target_skeleton: str,
    contracts: Optional[Dict[str, Any]] = None,
    character_name: str = ""
) -> Tuple[Optional[Any], str]:
    """
    Finds and loads the target unreal.Skeleton asset.
    Checks target_skeleton variations, then falls back to contracts['skeletons'].
    """
    if not HAS_UNREAL:
        return None, target_skeleton

    candidates = []
    target_stem = ""
    if target_skeleton and target_skeleton.strip():
        raw_s = target_skeleton.strip()
        norm_s = normalize_unreal_package_path(raw_s)
        for s in (norm_s, raw_s):
            if not s:
                continue
            candidates.append(s)
            base = s.split(".")[0]
            sub = base.split("/")[-1]
            candidates.append(base)
            candidates.append(f"{base}.{sub}")
        target_stem = os.path.splitext(os.path.basename(norm_s))[0].lower()

    # Check contracts skeletons
    skeletons_map = (contracts or {}).get("skeletons", {})
    if skeletons_map:
        for skel_key, skel_info in skeletons_map.items():
            pkg = skel_info.get("package_path", "")
            if not pkg:
                continue
            if target_stem and target_stem in skel_key.lower():
                candidates.insert(0, pkg)
            elif character_name and character_name.lower() in skel_key.lower():
                candidates.insert(0, pkg)
            elif "g9" in skel_key.lower() or "genesis9" in skel_key.lower() or "genesis_9" in skel_key.lower():
                candidates.append(pkg)
            else:
                candidates.append(pkg)

    for cand in candidates:
        if not cand:
            continue
        cand_clean = cand.split(".")[0]
        cand_sub = f"{cand_clean}.{cand_clean.split('/')[-1]}"
        for c in (cand, cand_clean, cand_sub):
            if not c.startswith("/Game"):
                continue
            if unreal.EditorAssetLibrary.does_asset_exist(c):
                raw_asset = unreal.EditorAssetLibrary.load_asset(c)
                skel = extract_skeleton_from_asset(raw_asset)
                if skel:
                    return skel, c

    # 3. Dynamic Unreal AssetRegistry query fallback for Skeleton
    if HAS_UNREAL and hasattr(unreal, "AssetRegistryHelpers"):
        try:
            ar = unreal.AssetRegistryHelpers.get_asset_registry()
            assets = []
            if hasattr(unreal, "TopLevelAssetPath"):
                try:
                    class_path = unreal.TopLevelAssetPath("/Script/Engine", "Skeleton")
                    assets = ar.get_assets_by_class(class_path_name=class_path, search_sub_classes=False)
                except Exception:
                    pass
            if not assets:
                try:
                    assets = ar.get_assets_by_class(class_name="Skeleton", search_sub_classes=False)
                except Exception:
                    pass

            for ad in assets:
                pkg_name = str(getattr(ad, "package_name", ""))
                asset_name = str(getattr(ad, "asset_name", ""))
                if not pkg_name.startswith("/Game"):
                    continue
                full_path = f"{pkg_name}.{asset_name}"
                if target_stem and target_stem in asset_name.lower():
                    raw_asset = unreal.EditorAssetLibrary.load_asset(full_path)
                    skel = extract_skeleton_from_asset(raw_asset)
                    if skel:
                        print(f"[import_character_wardrobe] Auto-matched designated skeleton by stem '{target_stem}' from Unreal AssetRegistry: '{full_path}'", flush=True)
                        return skel, full_path
                elif character_name and character_name.lower() in asset_name.lower():
                    raw_asset = unreal.EditorAssetLibrary.load_asset(full_path)
                    skel = extract_skeleton_from_asset(raw_asset)
                    if skel:
                        print(f"[import_character_wardrobe] Auto-discovered character skeleton from Unreal AssetRegistry: '{full_path}'", flush=True)
                        return skel, full_path
                elif "g9" in asset_name.lower() or "genesis9" in asset_name.lower() or "genesis_9" in asset_name.lower():
                    raw_asset = unreal.EditorAssetLibrary.load_asset(full_path)
                    skel = extract_skeleton_from_asset(raw_asset)
                    if skel:
                        print(f"[import_character_wardrobe] Auto-discovered G9/Genesis9 skeleton from Unreal AssetRegistry: '{full_path}'", flush=True)
                        return skel, full_path
        except Exception as ex:
            print(f"[import_character_wardrobe] Notice during AssetRegistry skeleton scan: {ex}", flush=True)

    return None, ""


def import_fbx_mesh(
    fbx_path: str,
    dest_folder: str,
    mesh_name: str,
    skeleton_obj: Any,
    skeleton_path_log: str,
    normal_import_method: str = "FBXNIM_IMPORT_NORMALS"
):
    """Imports FBX as Skeletal Mesh with designated Skeleton."""
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", os.path.abspath(fbx_path))
    task.set_editor_property("destination_path", dest_folder)
    task.set_editor_property("destination_name", mesh_name)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)

    fbx_options = unreal.FbxImportUI()
    fbx_options.set_editor_property("automated_import_should_detect_type", False)
    fbx_options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    fbx_options.set_editor_property("import_mesh", True)
    fbx_options.set_editor_property("import_as_skeletal", True)
    fbx_options.set_editor_property("import_materials", False)
    fbx_options.set_editor_property("import_textures", False)
    fbx_options.set_editor_property("create_physics_asset", False)

    if skeleton_obj:
        try:
            fbx_options.set_editor_property("skeleton", skeleton_obj)
        except Exception:
            fbx_options.skeleton = skeleton_obj
        print(f"[import_character_wardrobe] Bound designated Skeleton: '{skeleton_path_log}'", flush=True)
    else:
        print(f"[import_character_wardrobe] WARNING: No designated Skeleton found ('{skeleton_path_log}'). Unreal will generate a new skeleton.", flush=True)

    import_data = getattr(fbx_options, "skeletal_mesh_import_data", None)
    if import_data:
        if hasattr(unreal, "FBXImportContentType"):
            content_type = getattr(unreal.FBXImportContentType, "FBXICT_ALL", None)
            if content_type is not None:
                import_data.set_editor_property("import_content_type", content_type)
        if hasattr(unreal, "FBXNormalImportMethod"):
            method_enum = getattr(unreal.FBXNormalImportMethod, normal_import_method, unreal.FBXNormalImportMethod.FBXNIM_IMPORT_NORMALS)
            import_data.set_editor_property("normal_import_method", method_enum)

    task.set_editor_property("options", fbx_options)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

    target_path = f"{dest_folder}/{mesh_name}"
    return unreal.EditorAssetLibrary.load_asset(target_path) if unreal.EditorAssetLibrary.does_asset_exist(target_path) else None


# ==============================================================================
# Texture Compression & sRGB Presets
# ==============================================================================

TEXTURE_PRESET_PACKAGES: Dict[str, Dict[str, Any]] = {
    "NORMAL": {
        "compression": "TC_NORMALMAP",
        "srgb": False,
        "vt": True,
        "flip_green_channel": True,
    },
    "BASE_COLOR": {
        "compression": "TC_DEFAULT",
        "srgb": True,
        "vt": True,
    },
    "MASKS": {  # ORM, Roughness, Metallic, Specular, AO, Mask
        "compression": "TC_MASKS",
        "srgb": False,
        "vt": True,
    },
    "OPACITY": {  # Hair Opacity, Alpha, Cutout, Transparency (AAA Hair Card Standard)
        "compression": "TC_MASKS",
        "srgb": False,
        "vt": True,
    },
    "GRAYSCALE": {  # Height, Displacement
        "compression": "TC_GRAYSCALE",
        "srgb": False,
        "vt": True,
    },
}


def resolve_texture_preset(
    param_name: str,
    file_path: str,
    contract_slots: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Robust 3-tier resolver for texture compression, sRGB, and virtual texture flags:
      Tier 1: Explicit Match in Contract Slots (exact or case-insensitive/alias).
              Auto-corrects if contract misclassified masks/opacity as sRGB Color.
      Tier 2: Parameter Name Semantics (Opacity/Alpha/Mask -> TC_MASKS, sRGB=False).
      Tier 3: File Name Heuristic (e.g. *_Opacity.png -> TC_MASKS, sRGB=False).
    """
    p_clean = param_name.strip()
    p_lower = p_clean.lower()
    file_base = os.path.splitext(os.path.basename(file_path))[0].lower() if file_path else ""

    # Check if param or filename indicates an Opacity / Alpha / Cutout texture (Hair, Eyelashes, etc.)
    is_opacity = any(k in p_lower for k in ["opacity", "alpha", "mask", "trans", "cutout"]) or \
                 any(k in file_base for k in ["_opacity", "_alpha", "_mask", "_trans", "_cutout", "_hair_alpha", "_opac", "opacity", "alpha"])

    is_mask_or_orm = any(k in p_lower for k in ["orm", "rough", "metal", "spec", "ao", "cavity"]) or \
                     any(k in file_base for k in ["_orm", "_rma", "_rough", "_metal", "_spec", "_ao"])

    is_normal = any(k in p_lower for k in ["norm", "nm", "tangent"]) or \
                any(k in file_base for k in ["_norm", "_nrm", "_normal", "_n"])

    # 1. Tier 1: Try contract lookup
    slot_spec = None
    if contract_slots:
        if param_name in contract_slots:
            slot_spec = contract_slots[param_name]
        else:
            # Case-insensitive & alias lookup
            for k, v in contract_slots.items():
                k_low = k.lower()
                if k_low == p_lower or k_low == p_lower.replace("map", "") or p_lower == k_low.replace("map", ""):
                    slot_spec = v
                    break

    if isinstance(slot_spec, dict) and slot_spec:
        comp = slot_spec.get("compression", "TC_DEFAULT")
        srgb = slot_spec.get("srgb", True)
        vt = slot_spec.get("vt", True)

        # Fail-safe auto-correction: If contract declared sRGB=True or TC_DEFAULT for an obvious Opacity/Mask/Normal texture
        if is_opacity:
            comp = "TC_MASKS"
            srgb = False
        elif is_mask_or_orm:
            comp = "TC_MASKS"
            srgb = False
        elif is_normal:
            comp = "TC_NORMALMAP"
            srgb = False

        return {
            "compression": comp,
            "srgb": srgb,
            "vt": vt
        }

    # 2. Tier 2 & 3: Semantic & File Name Heuristic Fallbacks
    if is_opacity:
        return TEXTURE_PRESET_PACKAGES["OPACITY"]
    if is_normal:
        return TEXTURE_PRESET_PACKAGES["NORMAL"]
    if is_mask_or_orm:
        return TEXTURE_PRESET_PACKAGES["MASKS"]

    # Default to Color/Albedo
    return TEXTURE_PRESET_PACKAGES["BASE_COLOR"]


def import_texture_file(
    file_path: str,
    dest_folder: str,
    texture_name: str,
    compression: str = "TC_DEFAULT",
    srgb: bool = True,
    is_virtual: bool = True
):
    """Imports image file into Unreal as Texture2D with contract specifications."""
    target_path = f"{dest_folder}/{texture_name}"
    tex = unreal.EditorAssetLibrary.load_asset(target_path) if unreal.EditorAssetLibrary.does_asset_exist(target_path) else None

    if not tex:
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", os.path.abspath(file_path))
        task.set_editor_property("destination_path", dest_folder)
        task.set_editor_property("destination_name", texture_name)
        task.set_editor_property("replace_existing", True)
        task.set_editor_property("automated", True)
        task.set_editor_property("save", True)
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        tex = unreal.EditorAssetLibrary.load_asset(target_path) if unreal.EditorAssetLibrary.does_asset_exist(target_path) else None

    if tex:
        changed = False
        if compression and hasattr(unreal, "TextureCompressionSettings"):
            comp_enum = getattr(unreal.TextureCompressionSettings, compression, None)
            if comp_enum is not None:
                current_comp = tex.get_editor_property("compression_settings")
                if current_comp != comp_enum:
                    tex.set_editor_property("compression_settings", comp_enum)
                    changed = True

        if srgb is not None:
            current_srgb = tex.get_editor_property("srgb")
            if bool(current_srgb) != bool(srgb):
                tex.set_editor_property("srgb", bool(srgb))
                changed = True

        if hasattr(tex, "virtual_texture_streaming"):
            try:
                current_vt = tex.get_editor_property("virtual_texture_streaming")
                if bool(current_vt) != bool(is_virtual):
                    tex.set_editor_property("virtual_texture_streaming", bool(is_virtual))
                    changed = True
            except Exception:
                pass

        if changed:
            try:
                tex.post_edit_change()
            except Exception:
                pass
            try:
                tex.update_resource()
            except Exception:
                pass
            unreal.EditorAssetLibrary.save_loaded_asset(tex)
            print(f"   [FORGITY :: TEXTURE] Updated '{texture_name}': compression={compression}, srgb={srgb}", flush=True)

    return tex


def create_material_instance(
    master_mat_path: str,
    materials_folder: str,
    textures_folder: str,
    mi_name: str,
    textures: Dict[str, str],
    contract_slots: Dict[str, Any]
):
    """Creates a MaterialInstanceConstant and binds textures strictly following contract slots."""
    if not master_mat_path or not unreal.EditorAssetLibrary.does_asset_exist(master_mat_path):
        print(f"[import_wardrobe] Warning: Master Material '{master_mat_path}' not found.", flush=True)
        return None

    master_mat = unreal.EditorAssetLibrary.load_asset(master_mat_path)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.MaterialInstanceConstantFactoryNew()

    mi_asset = asset_tools.create_asset(mi_name, materials_folder, unreal.MaterialInstanceConstant, factory)
    if not mi_asset:
        target_path = f"{materials_folder}/{mi_name}"
        mi_asset = unreal.EditorAssetLibrary.load_asset(target_path) if unreal.EditorAssetLibrary.does_asset_exist(target_path) else None

    if not mi_asset:
        return None

    unreal.MaterialEditingLibrary.set_material_instance_parent(mi_asset, master_mat)

    # Discover actual Texture Parameter names on Master Material
    real_texture_param_names: List[str] = []
    try:
        raw_names = unreal.MaterialEditingLibrary.get_texture_parameter_names(master_mat)
        real_texture_param_names = [str(n) for n in raw_names]
    except Exception:
        pass

    def _resolve_real_param_name(target_param: str) -> str:
        if not real_texture_param_names:
            return target_param
        # 1. Exact match
        if target_param in real_texture_param_names:
            return target_param
        # 2. Case-insensitive match
        t_low = target_param.lower()
        for r in real_texture_param_names:
            if r.lower() == t_low:
                return r
        # 3. Match without 'Map' / 'Texture' suffixes
        t_stripped = t_low.replace("map", "").replace("texture", "").replace("tex", "").strip("_")
        for r in real_texture_param_names:
            r_stripped = r.lower().replace("map", "").replace("texture", "").replace("tex", "").strip("_")
            if r_stripped == t_stripped:
                return r
        # 4. Semantic keywords matching
        if any(k in t_low for k in ["opacity", "alpha", "trans", "cutout"]):
            for r in real_texture_param_names:
                if any(k in r.lower() for k in ["opacity", "alpha", "trans", "cutout"]):
                    return r
        if any(k in t_low for k in ["norm", "nm"]):
            for r in real_texture_param_names:
                if any(k in r.lower() for k in ["norm", "nm"]):
                    return r
        if any(k in t_low for k in ["color", "base", "albedo", "diff"]):
            for r in real_texture_param_names:
                if any(k in r.lower() for k in ["color", "base", "albedo", "diff"]):
                    return r
        if any(k in t_low for k in ["art", "orm", "mask", "rough", "spec", "ao"]):
            for r in real_texture_param_names:
                if any(k in r.lower() for k in ["art", "orm", "mask", "rough", "spec", "ao"]):
                    return r
        return target_param

    for param_name, raw_tex_path in textures.items():
        if not raw_tex_path:
            continue
        norm_path = os.path.normpath(raw_tex_path).replace("\\", "/")
        if not os.path.isfile(norm_path):
            print(f"   [FORGITY :: WARN] Texture file missing: '{norm_path}'", flush=True)
            continue

        resolved_param = _resolve_real_param_name(param_name)
        preset = resolve_texture_preset(resolved_param, norm_path, contract_slots)

        raw_base = sanitize_asset_name(os.path.splitext(os.path.basename(norm_path))[0])
        tex_base = f"T_{raw_base}" if not raw_base.startswith("T_") else raw_base

        tex_obj = import_texture_file(
            norm_path,
            textures_folder,
            tex_base,
            compression=preset.get("compression", "TC_DEFAULT"),
            srgb=preset.get("srgb", True),
            is_virtual=preset.get("vt", True)
        )
        if tex_obj:
            unreal.MaterialEditingLibrary.set_material_instance_texture_parameter_value(
                mi_asset, resolved_param, tex_obj
            )
            print(f"   [FORGITY] Param '{resolved_param}' (from '{param_name}') -> '{tex_base}' on '{mi_name}' [Comp: {preset.get('compression')}, sRGB: {preset.get('srgb')}]", flush=True)

    try:
        unreal.MaterialEditingLibrary.update_material_instance(mi_asset)
    except Exception:
        pass

    unreal.EditorAssetLibrary.save_loaded_asset(mi_asset)
    return mi_asset


def bind_materials_to_mesh(mesh_obj, created_mis: Dict[str, Any]):
    """Assigns created Material Instances to Skeletal Mesh slots 1-to-1."""
    if not mesh_obj or not hasattr(mesh_obj, "materials") or not mesh_obj.materials:
        return
    mesh_materials = list(mesh_obj.materials)
    for slot_idx, skeletal_mat in enumerate(mesh_materials):
        slot_name = str(skeletal_mat.material_slot_name)
        assigned_mi = created_mis.get(slot_name)
        if not assigned_mi:
            clean_name = sanitize_asset_name(slot_name).lower()
            for k, mi in created_mis.items():
                if sanitize_asset_name(k).lower() == clean_name:
                    assigned_mi = mi
                    break
        if not assigned_mi and len(mesh_materials) == 1 and len(created_mis) == 1:
            assigned_mi = list(created_mis.values())[0]

        if assigned_mi:
            skeletal_mat.material_interface = assigned_mi
            print(f"   [FORGITY] Mesh Slot '{slot_name}' -> '{assigned_mi.get_name()}'", flush=True)
        else:
            print(f"   [FORGITY :: WARN] Mesh Slot '{slot_name}' has no matching Material Instance.", flush=True)

    mesh_obj.set_editor_property("materials", mesh_materials)
    unreal.EditorAssetLibrary.save_loaded_asset(mesh_obj)


def load_schema_class(schema_path: str):
    """Loads UClass for Blueprint DataAsset schema."""
    if not schema_path:
        schema_path = "/Game/Systems/Wardrobe/Schemas/PDA_WardrobeItem"
    clean_path = schema_path.split(".")[0]
    schema_name = clean_path.split("/")[-1]

    if hasattr(unreal.EditorAssetLibrary, "load_blueprint_class"):
        try:
            cls = unreal.EditorAssetLibrary.load_blueprint_class(clean_path)
            if cls:
                return cls
        except Exception:
            pass

    try:
        return unreal.load_class(None, f"{clean_path}.{schema_name}_C")
    except Exception:
        pass
    return None


def create_and_populate_data_asset(
    schema_path: str,
    dest_folder: str,
    data_asset_name: str,
    mesh_obj,
    thumbnail_obj,
    properties: Dict[str, Any]
):
    """Creates a PrimaryDataAsset (DA_*) and sets mesh, thumbnail, and semantic properties."""
    target_class = load_schema_class(schema_path)
    if not target_class:
        print(f"   [FORGITY :: ERROR] Could not load schema class for '{schema_path}'", flush=True)
        return None

    full_path = f"{dest_folder}/{data_asset_name}"
    factory = unreal.DataAssetFactory()
    try:
        factory.set_editor_property("data_asset_class", target_class)
    except Exception:
        pass

    da_asset = unreal.EditorAssetLibrary.load_asset(full_path) if unreal.EditorAssetLibrary.does_asset_exist(full_path) else None
    if not da_asset:
        da_asset = unreal.AssetToolsHelpers.get_asset_tools().create_asset(data_asset_name, dest_folder, target_class, factory)

    if not da_asset:
        return None

    # Bind Mesh
    if mesh_obj:
        for prop in ["ItemMesh", "BodyMesh", "Mesh"]:
            try:
                da_asset.set_editor_property(prop, mesh_obj)
                print(f"   [FORGITY] Bound Mesh -> '{prop}'", flush=True)
                break
            except Exception:
                pass

    # Bind Thumbnail
    if thumbnail_obj:
        for prop in ["ItemThumbnail", "Thumbnail", "Icon"]:
            try:
                da_asset.set_editor_property(prop, thumbnail_obj)
                print(f"   [FORGITY] Bound Thumbnail -> '{prop}'", flush=True)
                break
            except Exception:
                pass

    # Bind Properties (Tags, DisplayName, custom fields)
    for field_name, field_val in properties.items():
        if field_val is None or field_val == "":
            continue
        clean_val = str(field_val).strip()

        if "tag" in field_name.lower():
            tag_obj = unreal.GameplayTag()
            tag_obj.import_text(clean_val)
            try:
                da_asset.set_editor_property(field_name, tag_obj)
                print(f"   [FORGITY] Set Tag '{field_name}' = '{clean_val}'", flush=True)
            except Exception:
                try:
                    da_asset.set_editor_property(field_name, unreal.Name(clean_val))
                except Exception as ex:
                    print(f"   [FORGITY :: WARN] Could not set tag '{field_name}': {ex}", flush=True)
        elif field_name in ["DisplayName", "ItemName", "Title"]:
            try:
                da_asset.set_editor_property(field_name, unreal.Text(clean_val))
                print(f"   [FORGITY] Set Text '{field_name}' = '{clean_val}'", flush=True)
            except Exception:
                try:
                    da_asset.set_editor_property(field_name, clean_val)
                except Exception:
                    pass
        else:
            try:
                da_asset.set_editor_property(field_name, field_val)
                print(f"   [FORGITY] Set '{field_name}' = '{field_val}'", flush=True)
            except Exception:
                pass

    unreal.EditorAssetLibrary.save_loaded_asset(da_asset)
    return da_asset


def main(
    manifest: Dict[str, Any],
    contracts: Dict[str, Any],
    destination_folder: str = "",
    skeleton_path: str = "/Game/Characters/Genesis9/Common/Skeleton/Genesis9_Skeleton.Genesis9_Skeleton",
    normal_import_method: NormalImportMethodType = "FBXNIM_IMPORT_NORMALS",
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Main entry point for Character & Wardrobe Ingestion.
    Executes in 5 standardized steps driven strictly by Manifest and Shader Contracts.

    Inputs:
      - manifest: Semantic classification manifest produced by classify_character_manifest.py. (Required)
      - contracts: Technical game contracts produced by inspect_game_contracts.py. (Required)
      - destination_folder: Optional Unreal destination package folder override.
      - skeleton_path: Optional Skeleton asset package path override.
      - normal_import_method: Method for normal import ('FBXNIM_IMPORT_NORMALS').
      - dry_run: Simulate ingestion without modifying Unreal assets.

    Outputs:
      - status: "Success" or "Failed".
      - items_count: Number of processed items.
      - imported_meshes: List of Skeletal Mesh package paths.
      - created_data_assets: List of Primary Data Asset package paths.
      - summary: Human-readable execution summary.
    """
    if isinstance(manifest, str):
        try:
            manifest = json.loads(manifest)
        except Exception:
            manifest = {}

    if isinstance(contracts, str):
        try:
            contracts = json.loads(contracts)
        except Exception:
            contracts = {}

    manifest_items = manifest.get("items", [])
    if not manifest_items:
        raise ValueError("No items found in manifest for import_character_wardrobe.")

    clean_dest_folder = _clean_ue_path(
        destination_folder or manifest.get("destination_folder", "/Game/Characters/Genesis9/Wardrobe")
    )

    if dry_run or not HAS_UNREAL:
        sim_meshes = [f"{clean_dest_folder}/SKM_{item.get('asset_name', 'Item')}" for item in manifest_items]
        sim_das = [f"{clean_dest_folder}/DA_{item.get('asset_name', 'Item')}" for item in manifest_items]
        summary = f"[DryRun] Simulated ingestion of {len(manifest_items)} items to '{clean_dest_folder}'."
        print(summary, flush=True)
        return {
            "status": "Success",
            "items_count": len(manifest_items),
            "imported_meshes": sim_meshes,
            "created_data_assets": sim_das,
            "summary": summary
        }

    # Register missing GameplayTags once
    all_tags = []
    for item in manifest_items:
        props = item.get("properties", {})
        for tf in ["SlotTag", "ItemTag", "CharacterTag"]:
            val = props.get(tf, "").strip()
            if val and val not in all_tags:
                all_tags.append(val)
    if all_tags:
        ensure_gameplay_tags(all_tags)

    contracts_materials = contracts.get("materials", {})
    if isinstance(contracts_materials, list):
        contracts_materials = {
            m.get("material_tag", m.get("tag", f"mat_{i}")): m for i, m in enumerate(contracts_materials)
        }

    imported_meshes = []
    created_data_assets = []

    for item in manifest_items:
        fbx_path = os.path.abspath(item.get("fbx_file", item.get("file_path", "")))
        if not fbx_path or not os.path.isfile(fbx_path):
            print(f"[import_wardrobe] Warning: FBX file not found: '{fbx_path}'. Skipping.", flush=True)
            continue

        asset_name = sanitize_asset_name(item.get("asset_name", os.path.splitext(os.path.basename(fbx_path))[0]))
        mesh_name = item.get("mesh_name", f"SKM_{asset_name}")
        da_name = item.get("data_asset_name", f"DA_{asset_name}")

        root_folder = _clean_ue_path(item.get("destination_folder") or clean_dest_folder)
        materials_folder = f"{root_folder}/Materials"
        textures_folder = f"{root_folder}/Textures"

        unreal.EditorAssetLibrary.make_directory(root_folder)
        unreal.EditorAssetLibrary.make_directory(materials_folder)
        unreal.EditorAssetLibrary.make_directory(textures_folder)

        print(f"\n[import_wardrobe] Processing '{asset_name}' -> '{root_folder}'", flush=True)

        # 1. Import Skeletal Mesh with designated Skeleton
        target_skeleton = item.get("skeleton_path") or skeleton_path
        char_tag = item.get("properties", {}).get("CharacterTag", "")
        skel_obj, skel_resolved_path = resolve_skeleton(target_skeleton, contracts, character_name=char_tag)
        mesh_obj = import_fbx_mesh(fbx_path, root_folder, mesh_name, skel_obj, skel_resolved_path or target_skeleton, normal_import_method)
        if not mesh_obj:
            print(f"[import_wardrobe] Error: Failed to import Skeletal Mesh '{mesh_name}'.", flush=True)
            continue
        imported_meshes.append(f"{root_folder}/{mesh_name}")

        # 2. Ingest Textures & Create Material Instances
        materials_dict = item.get("materials", {})
        if isinstance(materials_dict, list):
            materials_dict = {s.get("slot_name", f"slot_{i}"): s for i, s in enumerate(materials_dict)}

        created_mis = {}
        for slot_key, slot_info in materials_dict.items():
            master_path = slot_info.get("master_material_path", "/Game/Characters/Materials/M_Cloth")
            mat_tag = slot_info.get("material_tag", "")
            textures = slot_info.get("textures", {})
            mi_name = f"MI_{mesh_name}_{sanitize_asset_name(slot_key)}"

            # Resolve contract texture slots
            mat_contract = contracts_materials.get(mat_tag, {})
            if not mat_contract:
                clean_target = master_path.split(".")[0].lower()
                for c_mat in contracts_materials.values():
                    if c_mat.get("master_material_path", "").split(".")[0].lower() == clean_target:
                        mat_contract = c_mat
                        break

            contract_slots = (mat_contract.get("texture_slots") or mat_contract.get("texture_map") or {}) if mat_contract else {}
            mi_obj = create_material_instance(
                master_path, materials_folder, textures_folder, mi_name, textures, contract_slots
            )
            if mi_obj:
                created_mis[slot_key] = mi_obj

        # 3. Bind Material Instances to Skeletal Mesh Slots
        bind_materials_to_mesh(mesh_obj, created_mis)

        # 4. Ingest Thumbnail (if present)
        thumbnail_obj = None
        thumb_path = item.get("thumbnail_file") or find_neighbor_thumbnail(fbx_path)
        if thumb_path and os.path.isfile(thumb_path):
            thumb_name = f"T_{asset_name}"
            print(f"   [FORGITY] Ingesting Thumbnail: '{thumb_path}' -> '{thumb_name}'", flush=True)
            thumbnail_obj = import_texture_file(
                thumb_path, textures_folder, thumb_name,
                compression="TC_EditorIcon", srgb=True, is_virtual=False
            )

        # 5. Create Primary Data Asset (DA_*)
        target_schema = item.get("target_schema_path") or item.get("target_schema", "PDA_WardrobeItem")
        properties = item.get("properties", {})
        da_obj = create_and_populate_data_asset(target_schema, root_folder, da_name, mesh_obj, thumbnail_obj, properties)
        if da_obj:
            created_data_assets.append(f"{root_folder}/{da_name}")
            print(f"[import_wardrobe] Successfully created Data Asset '{root_folder}/{da_name}'", flush=True)

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
    print("Testing import_character_wardrobe main() in Dry-Run mode...")
    test_manifest = {
        "destination_folder": "/Game/Characters/Genesis9/Laura/Outfits",
        "items": [
            {
                "asset_name": "Laura_Outfit1_Dress",
                "mesh_name": "SKM_Laura_Outfit1_Dress",
                "data_asset_name": "DA_Laura_Outfit1_Dress",
                "fbx_file": "D:/test/Laura_Outfit1_Dress.fbx",
                "target_schema": "PDA_WardrobeItem",
                "properties": {
                    "DisplayName": "Laura Dress",
                    "SlotTag": "System.Wardrobe.Slots.Torso",
                    "ItemTag": "Character.Laura.Outfits.Dress",
                    "CharacterTag": "Character.Laura"
                }
            }
        ]
    }
    test_contracts = {
        "materials": {},
        "schemas": {},
        "skeletons": {}
    }
    res = main(manifest=test_manifest, contracts=test_contracts, dry_run=True)
    print("Result:", res)
