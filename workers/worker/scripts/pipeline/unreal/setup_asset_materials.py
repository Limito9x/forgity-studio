# pyrefly: ignore [missing-import]
"""
Unreal Engine Pipeline Script: Batch Asset Materials Orchestrator
Runs inside Unreal Engine via Python API (Unreal Engine 5.x) or Agent Worker Dry-Run.

Consumes:
  1. Asset Material Manifest (from resolve_material_manifest.py):
     Contains objects, slots, and textures as { "ParamName": "Absolute_File_Path" }
  2. Material Contracts (from LookupContentMapTool):
     Master Material dictionary mapping texture parameter names to texture types:
     {
       "master_material_path": "/Game/Materials/M_Master_Cloth",
       "texture_map": {
         "BaseColorMap": "BASE_COLOR",
         "NormalMap": "NORMAL",
         "ORMMap": "MASKS",
         "OpacityMap": "GRAYSCALE"
       }
     }
  3. Optional Skeletal/Static Mesh map or path (from import_skeletal_mesh.py) to bind MICs to slots.

Performs:
  - Resolves compression and sRGB presets directly from the Master Material Contract dictionary.
  - Ingests textures with hash-based deduplication cache.
  - Creates specialized Material Instance Constants (MICs) inheriting from Master Materials.
  - Binds MICs directly to matching mesh material slots.
  - Returns structured batch results ready for DataTable registration.
"""

import os
import sys
import json
import re
import hashlib
from typing import Dict, Any, List, Optional, Union

try:
    import unreal
    HAS_UNREAL = True
except ImportError:
    unreal = None
    HAS_UNREAL = False


# ==============================================================================
# 1. Texture Compression Presets
# ==============================================================================

TEXTURE_PRESET_PACKAGES: Dict[str, Dict[str, Any]] = {
    "NORMAL": {
        "compression": "TC_NORMALMAP",
        "srgb": False,
        "lod_group": "TEXTUREGROUP_CHARACTER",
        "vt": True,
    },
    "BASE_COLOR": {
        "compression": "TC_DEFAULT",
        "srgb": True,
        "lod_group": "TEXTUREGROUP_CHARACTER",
        "vt": True,
    },
    "MASKS": {  # ORM, Roughness, Metallic, Specular, AO, Mask
        "compression": "TC_MASKS",
        "srgb": False,
        "lod_group": "TEXTUREGROUP_CHARACTER",
        "vt": True,
    },
    "ART": {  # AO, Roughness, Transmission / Thickness channel-packed mask
        "compression": "TC_MASKS",
        "srgb": False,
        "lod_group": "TEXTUREGROUP_CHARACTER",
        "vt": True,
    },
    "GRAYSCALE": {  # Opacity, Height, Displacement
        "compression": "TC_GRAYSCALE",
        "srgb": False,
        "lod_group": "TEXTUREGROUP_CHARACTER",
        "vt": True,
    }
}


def sanitize_asset_name(name: str) -> str:
    """Sanitize string for Unreal Engine asset naming convention."""
    for ch in [" ", "-", ".", ":", "/", "\\", "(", ")", "[", "]"]:
        name = name.replace(ch, "_")
    while "__" in name:
        name = name.replace("__", "_")
    return name.strip("_")


def _clean_ue_path(path: str) -> str:
    """Ensure Unreal Engine package path starts with / and uses forward slashes."""
    if not path:
        return ""
    path = path.strip().replace("\\", "/")
    if not path.startswith("/"):
        path = "/" + path
    return path.rstrip("/")


def _get_file_hash(file_path: str) -> str:
    """Quick MD5 hash for file content deduplication (first 1MB + size)."""
    try:
        size = os.path.getsize(file_path)
        with open(file_path, "rb") as f:
            chunk = f.read(1024 * 1024)
        return hashlib.md5(f"{size}_".encode("utf-8") + chunk).hexdigest()
    except Exception:
        return ""


def resolve_texture_preset(param_name: str, texture_type_dict: Dict[str, str]) -> Dict[str, Any]:
    """
    Resolve texture preset using Contract dictionary as single source of truth.
    Falls back gracefully to keyword matching if parameter is not registered in dictionary.
    """
    # 1. Exact match from contract dictionary
    tex_type = texture_type_dict.get(param_name)
    if not tex_type:
        # Case-insensitive lookup
        p_low = param_name.lower()
        for k, v in texture_type_dict.items():
            if str(k).lower() == p_low:
                tex_type = str(v)
                break

    if tex_type:
        key = str(tex_type).upper().strip()
        if key in TEXTURE_PRESET_PACKAGES:
            return TEXTURE_PRESET_PACKAGES[key]
        if any(k in key for k in ["NORM"]):
            return TEXTURE_PRESET_PACKAGES["NORMAL"]
        if any(k in key for k in ["COLOR", "BASE", "ALBEDO", "DIFF"]):
            return TEXTURE_PRESET_PACKAGES["BASE_COLOR"]
        if any(k in key for k in ["ORM", "MASK", "ROUGH", "METAL", "SPEC", "ART"]):
            return TEXTURE_PRESET_PACKAGES["MASKS"]
        if any(k in key for k in ["OPACITY", "ALPHA", "HEIGHT"]):
            return TEXTURE_PRESET_PACKAGES["GRAYSCALE"]

    # 2. Fallback keyword heuristic from param_name
    p_upper = param_name.upper()
    if any(k in p_upper for k in ["NORMAL", "NORM", "NM"]):
        return TEXTURE_PRESET_PACKAGES["NORMAL"]
    if any(k in p_upper for k in ["COLOR", "BASE", "ALBEDO", "DIFF"]):
        return TEXTURE_PRESET_PACKAGES["BASE_COLOR"]
    if any(k in p_upper for k in ["ORM", "MASK", "ROUGH", "METAL", "SPEC", "AO", "ART"]):
        return TEXTURE_PRESET_PACKAGES["MASKS"]
    if any(k in p_upper for k in ["OPACITY", "ALPHA", "HEIGHT", "DISP"]):
        return TEXTURE_PRESET_PACKAGES["GRAYSCALE"]

    return TEXTURE_PRESET_PACKAGES["BASE_COLOR"]


def map_slot_textures_to_parameters(
    raw_textures: Dict[str, str],
    contract: Dict[str, Any]
) -> Dict[str, tuple[str, str]]:
    """
    Maps raw textures dictionary into Unreal shader parameter assignments.
    Returns:
        Dict[shader_param_name, (file_path, texture_type_hint)]
    
    Supports Hybrid 2-Tier Mapping:
      - Tier 1 (Auto Default): Generic types (BASE_COLOR, NORMAL, ART, ORM, etc.)
        are mapped to shader parameter names via contract's texture_map (or fallback conventions).
      - Tier 2 (Explicit Override): If key matches an explicit shader parameter name,
        it binds directly to that parameter.
    """
    if not raw_textures or not isinstance(raw_textures, dict):
        return {}

    texture_type_dict = contract.get("texture_map") or contract.get("texture_params") or {}
    if isinstance(texture_type_dict, str):
        try:
            texture_type_dict = json.loads(texture_type_dict)
        except Exception:
            texture_type_dict = {}

    # Build reverse map from texture_type -> shader_param_name
    # e.g. "BASE_COLOR" -> "BaseColorMap", "NORMAL" -> "NormalMap", "ART" -> "ARTMap"
    reverse_map: Dict[str, str] = {}
    known_param_names = set()
    for param_name, tex_type in texture_type_dict.items():
        known_param_names.add(str(param_name).lower())
        t_key = str(tex_type).strip().upper()
        if t_key:
            reverse_map[t_key] = str(param_name)

    FALLBACK_PARAM_MAP = {
        "BASE_COLOR": "BaseColorMap",
        "BASECOLOR": "BaseColorMap",
        "ALBEDO": "BaseColorMap",
        "DIFFUSE": "BaseColorMap",
        "NORMAL": "NormalMap",
        "NORM": "NormalMap",
        "ART": "ARTMap",
        "ORM": "ORMMap",
        "MASKS": "ORMMap",
        "MASK": "ORMMap",
        "GRAYSCALE": "OpacityMap",
        "OPACITY": "OpacityMap",
        "ALPHA": "OpacityMap",
        "HEIGHT": "HeightMap",
        "DISPLACEMENT": "DisplacementMap",
        "ROUGHNESS": "RoughnessMap",
        "METALLIC": "MetallicMap",
        "SPECULAR": "SpecularMap",
        "EMISSIVE": "EmissiveMap",
    }

    result: Dict[str, tuple[str, str]] = {}

    for raw_key, file_path in raw_textures.items():
        if not file_path:
            continue

        raw_key_clean = str(raw_key).strip()
        raw_key_upper = raw_key_clean.upper()
        raw_key_lower = raw_key_clean.lower()

        # 1. Tier 2: Check if raw_key is an explicit parameter name
        is_known_contract_param = raw_key_lower in known_param_names
        is_generic_type = raw_key_upper in FALLBACK_PARAM_MAP or raw_key_upper in reverse_map

        if is_known_contract_param or not is_generic_type:
            param_name = raw_key_clean
            tex_type = texture_type_dict.get(param_name) or raw_key_clean
            result[param_name] = (file_path, tex_type)
        else:
            # 2. Tier 1: Generic type translation
            param_name = reverse_map.get(raw_key_upper)
            if not param_name:
                if "COLOR" in raw_key_upper or "BASE" in raw_key_upper:
                    param_name = reverse_map.get("BASE_COLOR")
                elif "NORM" in raw_key_upper:
                    param_name = reverse_map.get("NORMAL")
                elif "ART" in raw_key_upper:
                    param_name = reverse_map.get("ART") or reverse_map.get("MASKS")
                elif "ORM" in raw_key_upper or "MASK" in raw_key_upper:
                    param_name = reverse_map.get("ORM") or reverse_map.get("MASKS")

            if not param_name:
                param_name = FALLBACK_PARAM_MAP.get(raw_key_upper, raw_key_clean)

            tex_type = texture_type_dict.get(param_name) or raw_key_upper
            result[param_name] = (file_path, tex_type)

    return result


def apply_texture_settings(tex_asset, preset: Dict[str, Any]):
    """Apply compression settings and sRGB directly to Unreal Texture2D asset."""
    if not HAS_UNREAL or not tex_asset:
        return

    COMPRESSION_MAP = {
        "TC_NORMALMAP": getattr(unreal.TextureCompressionSettings, "TC_NORMALMAP", None),
        "TC_MASKS": getattr(unreal.TextureCompressionSettings, "TC_MASKS", None),
        "TC_GRAYSCALE": getattr(unreal.TextureCompressionSettings, "TC_GRAYSCALE", None),
        "TC_DEFAULT": getattr(unreal.TextureCompressionSettings, "TC_DEFAULT", None),
    }

    comp_enum = COMPRESSION_MAP.get(preset.get("compression"))
    if comp_enum is not None:
        tex_asset.set_editor_property("compression_settings", comp_enum)
        if preset.get("compression") == "TC_NORMALMAP" and preset.get("flip_green_channel", False):
            try:
                tex_asset.set_editor_property("b_flip_green_channel", True)
            except Exception:
                pass

    if "srgb" in preset:
        tex_asset.set_editor_property("srgb", bool(preset["srgb"]))

    if preset.get("vt", True):
        try:
            tex_asset.set_editor_property("virtual_texture_streaming", True)
        except Exception:
            pass


def import_single_texture(file_path: str, destination_path: str, asset_name: str, preset: Dict[str, Any]) -> str:
    """Import a single texture into Unreal Content Browser and apply compression preset."""
    destination_path = destination_path.rstrip("/")
    uasset_target = f"{destination_path}/{asset_name}"

    if not HAS_UNREAL:
        return uasset_target

    if not os.path.isfile(file_path):
        print(f"[setup_asset_materials] Warning: File not found: {file_path}", flush=True)
        return ""

    task = unreal.AssetImportTask()
    task.set_editor_property("filename", os.path.abspath(file_path))
    task.set_editor_property("destination_path", destination_path)
    task.set_editor_property("destination_name", asset_name)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("automated", True)
    task.set_editor_property("save", True)

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    asset_tools.import_asset_tasks([task])

    imported_paths = task.get_editor_property("imported_object_paths")
    actual_path = str(imported_paths[0]) if imported_paths and len(imported_paths) > 0 else uasset_target

    if unreal.EditorAssetLibrary.does_asset_exist(actual_path):
        tex_obj = unreal.EditorAssetLibrary.load_asset(actual_path)
        if tex_obj:
            apply_texture_settings(tex_obj, preset)
            unreal.EditorAssetLibrary.save_loaded_asset(tex_obj)
        return actual_path

    return ""


def create_single_mic(
    master_material_path: str,
    instance_name: str,
    destination_path: str,
    texture_parameters: Optional[Dict[str, str]] = None,
    overwrite: bool = True
) -> str:
    """Create or update a Material Instance Constant inheriting from master material."""
    destination_path = destination_path.rstrip("/")
    mic_uasset_path = f"{destination_path}/{instance_name}"

    if not HAS_UNREAL:
        return mic_uasset_path

    parent_mat = unreal.EditorAssetLibrary.load_asset(master_material_path) if master_material_path else None
    if not parent_mat:
        print(f"[setup_asset_materials] Warning: Master Material not found at '{master_material_path}'. Skipping MIC creation.", flush=True)
        return ""

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    if unreal.EditorAssetLibrary.does_asset_exist(mic_uasset_path):
        if overwrite:
            mic_asset = unreal.EditorAssetLibrary.load_asset(mic_uasset_path)
        else:
            return mic_uasset_path
    else:
        factory = unreal.MaterialInstanceConstantFactoryNew()
        mic_asset = asset_tools.create_asset(
            asset_name=instance_name,
            package_path=destination_path,
            asset_class=unreal.MaterialInstanceConstant,
            factory=factory
        )

    if not mic_asset:
        print(f"[setup_asset_materials] Warning: Failed to create MIC asset '{mic_uasset_path}'", flush=True)
        return ""

    unreal.MaterialEditingLibrary.set_material_instance_parent(mic_asset, parent_mat)

    if texture_parameters:
        for param_name, tex_path in texture_parameters.items():
            if not tex_path:
                continue
            tex_obj = unreal.EditorAssetLibrary.load_asset(tex_path)
            if tex_obj:
                unreal.MaterialEditingLibrary.set_material_instance_texture_parameter_value(
                    mic_asset, param_name, tex_obj
                )
            else:
                print(f"[setup_asset_materials] Warning: Texture asset not found at '{tex_path}'", flush=True)

    unreal.MaterialEditingLibrary.update_material_instance(mic_asset)
    unreal.EditorAssetLibrary.save_loaded_asset(mic_asset)
    return mic_uasset_path


def bind_materials_to_mesh(mesh_uasset_path: str, slot_to_mic_map: Dict[str, str]) -> Dict[str, Any]:
    """Automatically bind created Material Instances to matching slots of Skeletal or Static Mesh."""
    if not HAS_UNREAL:
        return {"mesh": mesh_uasset_path, "bound_count": len(slot_to_mic_map), "dry_run": True}

    if not mesh_uasset_path or not unreal.EditorAssetLibrary.does_asset_exist(mesh_uasset_path):
        print(f"[setup_asset_materials] Warning: Mesh asset not found at '{mesh_uasset_path}'", flush=True)
        return {"error": "Mesh not found", "mesh": mesh_uasset_path}

    mesh_asset = unreal.EditorAssetLibrary.load_asset(mesh_uasset_path)
    if not mesh_asset:
        return {"error": "Failed to load mesh asset", "mesh": mesh_uasset_path}

    bound_slots = []
    failed_slots = []

    def _find_mic_for_slot(slot_name: str, slot_idx: int) -> Optional[str]:
        clean_name = sanitize_asset_name(slot_name).lower()
        if slot_name in slot_to_mic_map and slot_to_mic_map[slot_name]:
            return slot_to_mic_map[slot_name]
        if str(slot_idx) in slot_to_mic_map and slot_to_mic_map[str(slot_idx)]:
            return slot_to_mic_map[str(slot_idx)]
        for k, v in slot_to_mic_map.items():
            if v and sanitize_asset_name(str(k)).lower() == clean_name:
                return v
        return None

    # Handle SkeletalMesh (UE 5.x)
    if isinstance(mesh_asset, unreal.SkeletalMesh):
        try:
            sk_materials = list(mesh_asset.get_editor_property("materials"))
            for idx, sk_mat in enumerate(sk_materials):
                slot_name = str(sk_mat.get_editor_property("material_slot_name"))
                mic_path = _find_mic_for_slot(slot_name, idx)
                if not mic_path:
                    failed_slots.append({"slot": slot_name, "index": idx, "reason": "No matching MIC in bindings"})
                    continue

                mic_asset = unreal.EditorAssetLibrary.load_asset(mic_path)
                if not mic_asset:
                    failed_slots.append({"slot": slot_name, "index": idx, "mic": mic_path, "reason": "MIC asset not found"})
                    continue

                try:
                    sk_mat.set_editor_property("material_interface", mic_asset)
                except Exception:
                    sk_mat.material_interface = mic_asset
                bound_slots.append({"slot": slot_name, "index": idx, "mic": mic_path})

            mesh_asset.set_editor_property("materials", sk_materials)
        except Exception as e:
            print(f"[setup_asset_materials] Error setting SkeletalMesh materials: {e}", flush=True)

    # Handle StaticMesh (UE 5.x)
    elif isinstance(mesh_asset, unreal.StaticMesh):
        try:
            static_materials = list(mesh_asset.get_editor_property("static_materials"))
            for idx, sm_mat in enumerate(static_materials):
                slot_name = str(sm_mat.get_editor_property("material_slot_name"))
                mic_path = _find_mic_for_slot(slot_name, idx)
                if not mic_path:
                    failed_slots.append({"slot": slot_name, "index": idx, "reason": "No matching MIC in bindings"})
                    continue

                mic_asset = unreal.EditorAssetLibrary.load_asset(mic_path)
                if not mic_asset:
                    failed_slots.append({"slot": slot_name, "index": idx, "mic": mic_path, "reason": "MIC asset not found"})
                    continue

                try:
                    mesh_asset.set_material(idx, mic_asset)
                except Exception:
                    sm_mat.set_editor_property("material_interface", mic_asset)
                bound_slots.append({"slot": slot_name, "index": idx, "mic": mic_path})

            try:
                mesh_asset.set_editor_property("static_materials", static_materials)
            except Exception:
                pass
        except Exception as e:
            print(f"[setup_asset_materials] Error setting StaticMesh materials: {e}", flush=True)

    unreal.EditorAssetLibrary.save_loaded_asset(mesh_asset)
    print(f"[setup_asset_materials] Mesh '{mesh_uasset_path}' bound {len(bound_slots)} slots.", flush=True)
    return {
        "mesh": mesh_uasset_path,
        "bound_slots": bound_slots,
        "failed_slots": failed_slots,
        "bound_count": len(bound_slots)
    }


def _find_contract(key: str, contracts_map: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Lookup material contract by tag or slot name."""
    if not key or not contracts_map:
        return None

    if key in contracts_map and isinstance(contracts_map[key], dict):
        return contracts_map[key]

    clean_key = str(key).strip().lower()
    for k, v in contracts_map.items():
        if isinstance(v, dict) and str(k).strip().lower() == clean_key:
            return v

    return None


def _find_contract_for_slot(
    slot_info: Dict[str, Any],
    contracts_map: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Intelligently resolve Master Material Contract for a given slot.
    Resolution priority:
      1. Explicit material_tag or tag (if not "Generic")
      2. Exact slot name
      3. Keys in slot_info["textures"] matching a contract key
      4. Prefixes of texture keys (e.g. "Skin_BaseColor" -> prefix "Skin" matching contract "Skin")
      5. Substring / word match between contract names and slot_name
      6. Fallback to "DEFAULT" contract if registered
    """
    if not contracts_map:
        return None

    # 1. Check material_tag / tag
    for tag_field in ["material_tag", "tag"]:
        val = slot_info.get(tag_field)
        if val and str(val).strip().lower() != "generic":
            c = _find_contract(str(val), contracts_map)
            if c:
                return c

    # 2. Check exact slot name
    slot_name = slot_info.get("name") or ""
    if slot_name:
        c = _find_contract(slot_name, contracts_map)
        if c:
            return c

    # 3 & 4. Check texture keys
    textures = slot_info.get("textures") or {}
    if isinstance(textures, dict):
        # 3. Direct texture key matching contract key (e.g. key "Skin", "Eye", "Eyelash", "Mouth")
        for tex_k in textures.keys():
            c = _find_contract(str(tex_k), contracts_map)
            if c:
                return c

        # 4. Prefix before underscore in texture keys (e.g. "Skin_ART" -> "Skin", "Eyes_Normal" -> "Eye")
        for tex_k in textures.keys():
            prefix = str(tex_k).split("_")[0].strip()
            c = _find_contract(prefix, contracts_map) or _find_contract(prefix.rstrip("s"), contracts_map)
            if c:
                return c

    # 5. Word / substring match: check if contract name is contained as a word in slot_name
    if slot_name:
        clean_slot = slot_name.lower().replace("_", " ").replace("-", " ")
        slot_words = clean_slot.split()
        for c_key, c_val in contracts_map.items():
            if not isinstance(c_val, dict):
                continue
            c_low = str(c_key).lower().strip()
            # If contract name is a word in slot name (e.g. "eye" in "eye left", "skin" in "skin mesh")
            if c_low in slot_words or clean_slot.startswith(c_low) or any(c_low in w for w in slot_words):
                return c_val

    # 6. Fallback contract
    return _find_contract("DEFAULT", contracts_map)


# ==============================================================================
# 2. Main Entry Point (Batch-First)
# ==============================================================================

def main(
    manifest: Union[Dict[str, Any], str],
    material_contracts: Optional[Union[Dict[str, Any], str]] = None,
    destination_root: str = "/Game/Assets",
    mesh_paths: Optional[Union[Dict[str, str], str]] = None,
    mesh_uasset_path: Optional[str] = None,
    destination_path: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Orchestrate full material setup for an asset based on Manifest and Master Material Contracts.

    Args:
        manifest: Manifest dict (or JSON string) containing objects, slots, and textures.
        material_contracts: Master Material lookup registry dict (or JSON string).
        destination_root: Unreal Content destination root (e.g. /Game/Characters/Eva).
        mesh_paths: Dict[obj_name, uasset_path] or single mesh path for binding.
        mesh_uasset_path: Backward-compatibility alias for single mesh.
        destination_path: Alias for destination_root.

    Returns:
        Dictionary with batch_results, created_instances, and imported_textures.
    """
    # 1. Parse Manifest
    if isinstance(manifest, str):
        if os.path.isfile(manifest):
            with open(manifest, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)
        else:
            manifest_data = json.loads(manifest)
    elif isinstance(manifest, dict):
        manifest_data = manifest
    else:
        raise TypeError(f"Expected manifest to be dict or JSON string, got {type(manifest)}")

    # 2. Parse Material Contracts
    contracts_map: Dict[str, Any] = {}
    if material_contracts:
        if isinstance(material_contracts, str):
            if os.path.isfile(material_contracts):
                with open(material_contracts, "r", encoding="utf-8") as f:
                    contracts_map = json.load(f)
            else:
                try:
                    contracts_map = json.loads(material_contracts)
                except Exception:
                    contracts_map = {}
        elif isinstance(material_contracts, dict):
            contracts_map = material_contracts

    # Normalize mesh paths map
    mesh_map: Dict[str, str] = {}
    raw_meshes = mesh_paths if mesh_paths is not None else mesh_uasset_path
    if isinstance(raw_meshes, dict):
        mesh_map = {str(k).strip(): str(v).strip() for k, v in raw_meshes.items() if v}
    elif isinstance(raw_meshes, str) and raw_meshes.strip():
        # Single mesh path given: map default or first
        single_p = raw_meshes.strip()
        mesh_map["*"] = single_p

    # Destination resolution: priority to explicit destination_path, then destination_root
    chosen_dest = destination_path or destination_root
    destination_root = _clean_ue_path(chosen_dest or "/Game/Assets")

    # If destination_root is still default "/Game/Assets", auto-infer from mesh_map directory if available!
    if destination_root == "/Game/Assets" and mesh_map:
        for m_p in mesh_map.values():
            if m_p and m_p.startswith("/Game/"):
                inferred_dir = os.path.dirname(m_p).replace("\\", "/")
                if inferred_dir and inferred_dir != "/Game":
                    destination_root = inferred_dir
                    print(f"[setup_asset_materials] 📂 Auto-inferred destination root from mesh location: '{destination_root}'", flush=True)
                    break

    textures_dest = f"{destination_root}/Textures"
    materials_dest = f"{destination_root}/Materials"

    asset_name = manifest_data.get("asset_name") or kwargs.get("character_name") or "Asset"
    objects_dict: Dict[str, Any] = manifest_data.get("objects", {})
    if not objects_dict and "slots" in manifest_data:
        objects_dict = {asset_name: {"slots": manifest_data["slots"]}}
    elif not objects_dict and isinstance(manifest_data, dict):
        # Support direct ObjectsMap: { "outfit/top.fbx": { "slots": [...] } }
        is_obj_map = any(isinstance(v, dict) and ("slots" in v or "file_path" in v) for v in manifest_data.values())
        if is_obj_map:
            objects_dict = {k: v for k, v in manifest_data.items() if isinstance(v, dict)}

    print(f"[setup_asset_materials] Starting Batch Material Setup for '{asset_name}' ({len(objects_dict)} object(s)) into '{destination_root}'...", flush=True)

    imported_textures_cache: Dict[str, str] = {}  # norm_file_path -> uasset_path
    file_hash_cache: Dict[str, str] = {}          # file_hash -> uasset_path
    mic_cache: Dict[tuple, str] = {}              # (master_path, sorted_params) -> mic_path
    all_created_mics: List[str] = []
    batch_results: List[Dict[str, Any]] = []

    for obj_name, obj_data in objects_dict.items():
        slots = obj_data.get("slots", []) if isinstance(obj_data, dict) else []
        obj_slot_bindings: Dict[str, str] = {}
        obj_created_mics: List[str] = []

        for slot_info in slots:
            slot_name = slot_info.get("name") or f"Slot_{slot_info.get('index', 0)}"
            slot_tag = slot_info.get("tag") or slot_name

            # Resolve Contract (lookup by material_tag, tag, name, textures, or DEFAULT)
            contract = _find_contract_for_slot(slot_info, contracts_map) or {}

            master_path = (
                contract.get("master_material_path")
                or contract.get("master_material")
                or contract.get("material_path")
                or ""
            )

            # Contract Texture Dictionary: param_name -> texture_type
            texture_type_dict = contract.get("texture_map") or contract.get("texture_params") or {}
            if isinstance(texture_type_dict, str):
                try:
                    texture_type_dict = json.loads(texture_type_dict)
                except Exception:
                    texture_type_dict = {}

            # Process textures for this slot: { param_name: file_path }
            raw_textures = slot_info.get("textures", {})
            param_texture_map: Dict[str, str] = {}

            # Filter out non-image files (such as slot pseudo paths)
            IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".tga", ".exr", ".tif", ".tiff", ".bmp", ".dds", ".hdr")
            valid_textures: Dict[str, str] = {}
            if isinstance(raw_textures, dict):
                for k, v in raw_textures.items():
                    if not v:
                        continue
                    v_str = str(v).strip()
                    if any(v_str.lower().endswith(ext) for ext in IMAGE_EXTS) or os.path.isfile(v_str):
                        valid_textures[str(k)] = v_str

            if valid_textures:
                mapped_params = map_slot_textures_to_parameters(valid_textures, contract)

                for final_param, (file_path, tex_type) in mapped_params.items():
                    if not file_path or not os.path.exists(file_path):
                        continue

                    norm_path = os.path.normpath(os.path.abspath(file_path)).replace("\\", "/").lower()
                    uasset_path = imported_textures_cache.get(norm_path)

                    if not uasset_path:
                        f_hash = _get_file_hash(file_path)
                        if f_hash and f_hash in file_hash_cache:
                            uasset_path = file_hash_cache[f_hash]
                            imported_textures_cache[norm_path] = uasset_path

                    if not uasset_path:
                        preset = resolve_texture_preset(tex_type or final_param, texture_type_dict)
                        file_stem = sanitize_asset_name(os.path.splitext(os.path.basename(file_path))[0])
                        tex_asset_name = f"T_{asset_name}_{file_stem}"

                        uasset_path = import_single_texture(
                            file_path=file_path,
                            destination_path=textures_dest,
                            asset_name=tex_asset_name,
                            preset=preset
                        )
                        if uasset_path:
                            imported_textures_cache[norm_path] = uasset_path
                            if f_hash:
                                file_hash_cache[f_hash] = uasset_path

                    if uasset_path:
                        param_texture_map[final_param] = uasset_path

            # Assign Material: Always create a dedicated Material Instance (MIC) for every slot
            final_material_path = ""
            if master_path:
                mic_name = sanitize_asset_name(f"MI_{asset_name}_{obj_name}_{slot_name}")
                final_material_path = create_single_mic(
                    master_material_path=master_path,
                    instance_name=mic_name,
                    destination_path=materials_dest,
                    texture_parameters=param_texture_map,
                    overwrite=True
                )
                if final_material_path:
                    obj_created_mics.append(final_material_path)
                    all_created_mics.append(final_material_path)
            else:
                print(f"[setup_asset_materials] Warning: No Master Material found for slot '{slot_name}'.", flush=True)

            if final_material_path:
                obj_slot_bindings[slot_name] = final_material_path

        # Find matching mesh for this object and bind materials
        stem = os.path.splitext(os.path.basename(obj_name))[0]
        clean_stem = sanitize_asset_name(stem)
        target_mesh_path = (
            mesh_map.get(obj_name)
            or mesh_map.get(os.path.basename(obj_name))
            or mesh_map.get(stem)
            or mesh_map.get(clean_stem)
            or mesh_map.get(sanitize_asset_name(obj_name))
            or mesh_map.get("*", "")
        )

        if not target_mesh_path and HAS_UNREAL:
            candidate = f"{destination_root}/{clean_stem}"
            if unreal.EditorAssetLibrary.does_asset_exist(candidate):
                target_mesh_path = candidate
                print(f"[setup_asset_materials] 🔍 Resolved mesh via direct candidate check: '{candidate}'", flush=True)

        mesh_bind_result = None
        if target_mesh_path and obj_slot_bindings:
            mesh_bind_result = bind_materials_to_mesh(target_mesh_path, obj_slot_bindings)

        batch_results.append({
            "asset_name": obj_name,
            "cloth_type": obj_data.get("cloth_type"),
            "resource_tags": obj_data.get("resource_tags", []),
            "mesh_path": target_mesh_path,
            "slot_bindings": obj_slot_bindings,
            "created_instances": obj_created_mics,
            "mesh_bind_result": mesh_bind_result
        })

    # Construct objects_map dictionary for downstream DataTable registration and graph usage
    objects_map: Dict[str, Any] = {}
    for res in batch_results:
        raw_name = res["asset_name"]
        stem_name = os.path.splitext(os.path.basename(raw_name))[0]
        clean_key = sanitize_asset_name(stem_name)

        # Map slot_bindings into structured material_slots conforming to ST_AppearanceItem
        formatted_slots: Dict[str, Any] = {}
        for slot_k, mic_v in res["slot_bindings"].items():
            formatted_slots[slot_k] = {
                "material_instance": mic_v,
                "color_param_name": "Tint_Color",
                "default_color": {"R": 0.0, "G": 0.5, "B": 1.0, "A": 1.0}
            }

        objects_map[clean_key] = {
            "asset_name": clean_key,
            "raw_name": raw_name,
            "cloth_type": res.get("cloth_type"),
            "resource_tags": res.get("resource_tags", []),
            "skeletal_mesh": res["mesh_path"],
            "mesh_path": res["mesh_path"],
            "slot_bindings": res["slot_bindings"],
            "material_slots": formatted_slots
        }

    print(f"[setup_asset_materials] Batch setup complete. Processed {len(batch_results)} object(s), created {len(all_created_mics)} MIC(s).", flush=True)

    return {
        "asset_name": asset_name,
        "batch_results": batch_results,
        "objects_map": objects_map,
        "created_instances": all_created_mics,
        "imported_textures": list(imported_textures_cache.values())
    }


setup_materials = main


if __name__ == "__main__":
    print("This script is designed to run via ue_stage_runner.py inside Unreal Engine.")
