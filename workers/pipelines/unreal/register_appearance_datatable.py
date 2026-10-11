# pyrefly: ignore [missing-import]
"""
Unreal Engine Pipeline Script: Appearance DataTable Registrar
Runs inside Unreal Engine via Python API (Unreal Engine 5.x) or Agent Worker Dry-Run.

Consumes:
  1. objects_map (or batch_items): Dictionary or List of asset bindings produced by setup_asset_materials.py.
     Structure:
       {
         "<object_name>": {
           "skeletal_mesh": "/Game/.../MeshPath",
           "material_slots": {
             "SlotName": {
               "material_instance": "/Game/.../MI_Path",
               "color_param_name": "Tint_Color",
               "default_color": {"R": 0.0, "G": 0.5, "B": 1.0, "A": 1.0}
             }
           }
         }
       }
  2. cloth_types: Optional mapping of object_name -> cloth_type (e.g. {"G9 Base Shorts": "Bottom", "G9 Base Shirt": "Top"})
  3. datatable_directory: Destination folder in Content Browser (e.g. '/Game/Characters/Genesis9/Eva/Database')
  4. datatable_name: Name of the DataTable (e.g. 'DT_EvaWardrobe')
  5. datatable_path: Optional full path overriding directory & name (e.g. '/Game/Characters/Genesis9/Eva/Database/DT_EvaWardrobe')
  6. struct_path: Path to UScriptStruct / UserDefinedStruct (default: '/Game/Characters/Database/ST_AppearanceItem.ST_AppearanceItem')
  7. character_name: Character identifier (default: 'Eva')

Performs:
  - Ensures target DataTable exists, creating it from struct_path if necessary.
  - Dynamically adapts to either UserDefinedStruct GUID keys or friendly property names.
  - Reads existing rows into memory to prevent overwriting unrelated wardrobe items (Safe Upsert).
  - Merges new appearance rows in RAM.
  - Commits all rows in a single atomic transaction via fill_data_table_from_json_string.
"""

import os
import sys
import json
import re
from typing import Dict, Any, List, Optional, Union

try:
    import unreal
    HAS_UNREAL = True
except ImportError:
    unreal = None
    HAS_UNREAL = False

# Known GUIDs for ST_AppearanceItem in Content/Characters/Database/ST_AppearanceItem.uasset
DEFAULT_ITEM_GUID_KEYS = {
    "base_name": "BaseName_2_CD25710448053B38EA1445ADB415793E",
    "display_name": "DisplayName_7_06F835A94BE4DB25E8EA3B9AE90405B9",
    "cloth_type": "ClothType_9_910166824FABC97A18E317AB56575C90",
    "material_slots": "MaterialSlots_21_4B2D92A44EE91760FB28D5821B360D41",
    "skeletal_mesh": "SkeletalMesh_20_08CA85E44FE57347E65E3C882561B4E9"
}

# Known GUIDs for ST_MaterialParams in Content/Characters/Database/ST_MaterialParams.uasset
DEFAULT_PARAM_GUID_KEYS = {
    "material_instance": "MaterialInstance_2_E1FADD6B4B3F5867EAAE818283182287",
    "default_color": "DefaultColor_6_ED0794B244E1E7393F305190C859FBA9",
    "color_param_name": "ColorParamName_9_972615A240A0181F05E109A046EE13C4"
}

VALID_CLOTH_TYPES = ["Top", "Bottom", "Bra", "Panty", "Hair", "Shoes", "Gloves", "Accessory"]


def _clean_ue_path(p: str) -> str:
    """Normalize path with forward slashes and ensure leading slash."""
    clean = str(p or "").replace("\\", "/").strip()
    clean = re.sub(r"/+", "/", clean)
    if clean and not clean.startswith("/"):
        clean = "/" + clean
    return clean.rstrip("/")


def sanitize_asset_name(name: str) -> str:
    """Sanitize string for Unreal Asset naming."""
    clean = re.sub(r"[ .\\/:\*\?\"<>\|]+", "_", name)
    clean = re.sub(r"_+", "_", clean).strip("_")
    return clean or "Asset"


def format_display_name(name: str) -> str:
    """Convert snake_case or technical name into human-readable Title Case."""
    clean = re.sub(r"^([A-Za-z0-9]+_)+", "", name) if "_" in name else name
    clean = re.sub(r"[_\-]+", " ", clean)
    clean = re.sub(r"([a-z])([A-Z])", r"\1 \2", clean)
    return clean.strip().title()


def _sanitize_type_value(val: Any) -> str:
    """Validate and clean candidate cloth_type string. Rejects .NET collection type dumps."""
    if not val:
        return ""
    if isinstance(val, (list, tuple)):
        for elem in val:
            cleaned = _sanitize_type_value(elem)
            if cleaned:
                return cleaned
        return ""
    s = str(val).strip()
    # Reject .NET type dump strings like System.Collections.Generic.List`1[...]
    if any(k in s.lower() for k in ["system.collections", "generic.list", "`1", "[", "]"]):
        return ""
    # Remove surrounding non-alphanumeric noise
    s_clean = re.sub(r"^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$", "", s)
    if not s_clean:
        return ""
    # Map to canonical casing if matches known types
    for v in VALID_CLOTH_TYPES:
        if s_clean.lower() == v.lower():
            return v
    return s_clean.capitalize()


def extract_cloth_type(
    item_key: str,
    item_data: Dict[str, Any],
    cloth_types_map: Optional[Union[Dict[str, str], str, List[Any]]] = None
) -> str:
    """
    Extract semantic cloth type with 3-tier priority:
      1. cloth_types_map (explicit mapping or list)
      2. Resource tags / manifest category
      3. Heuristic keyword matching
    """
    # 1. Check explicit cloth_types mapping
    if isinstance(cloth_types_map, (str, list, tuple)):
        cleaned = _sanitize_type_value(cloth_types_map)
        if cleaned:
            return cleaned
    elif isinstance(cloth_types_map, dict):
        for k, v in cloth_types_map.items():
            cleaned_v = _sanitize_type_value(v)
            if cleaned_v:
                if k.lower() == item_key.lower() or k.lower() in item_key.lower():
                    return cleaned_v
                raw_name = str(item_data.get("raw_name", "")).lower()
                if k.lower() in raw_name:
                    return cleaned_v

    # 2. Check item's own metadata / tags
    cleaned_own = _sanitize_type_value(item_data.get("cloth_type"))
    if cleaned_own:
        return cleaned_own

    tags = item_data.get("resource_tags") or item_data.get("tags") or []
    if isinstance(tags, str):
        tags = [tags]

    for tag in tags:
        t_str = str(tag).strip()
        if "ClothType." in t_str:
            c = _sanitize_type_value(t_str.split("ClothType.")[-1])
            if c:
                return c
        if "Cloth." in t_str:
            c = _sanitize_type_value(t_str.split("Cloth.")[-1])
            if c:
                return c
        c = _sanitize_type_value(t_str)
        if c in VALID_CLOTH_TYPES:
            return c

    # 3. Fallback: Heuristic keyword detection on item name
    name_lower = f"{item_key} {item_data.get('raw_name', '')} {item_data.get('asset_name', '')}".lower()

    if any(w in name_lower for w in ["panty", "panties", "underwear", "briefs", "thong"]):
        return "Panty"
    if any(w in name_lower for w in ["bra", "bikini_top"]):
        return "Bra"
    if any(w in name_lower for w in ["shorts", "pant", "bottom", "skirt", "jeans", "trouser", "legging"]):
        return "Bottom"
    if any(w in name_lower for w in ["shirt", "top", "jacket", "hoodie", "sweater", "coat", "vest", "tshirt"]):
        return "Top"
    if any(w in name_lower for w in ["shoe", "boot", "sneaker", "heel", "sandal", "sock"]):
        return "Shoes"
    if any(w in name_lower for w in ["hair", "wig"]):
        return "Hair"
    if any(w in name_lower for w in ["glove", "mitt"]):
        return "Gloves"

    return "Bottom" if "short" in name_lower else "Top"


def detect_field_keys(sample_row: Dict[str, Any]) -> tuple:
    """
    Inspect an existing DataTable row to dynamically detect property GUIDs or friendly names.
    Returns (item_keys, param_keys).
    """
    item_keys = dict(DEFAULT_ITEM_GUID_KEYS)
    param_keys = dict(DEFAULT_PARAM_GUID_KEYS)

    if not sample_row:
        return item_keys, param_keys

    # Check top-level row keys
    for k in sample_row.keys():
        k_lower = k.lower()
        if "basename" in k_lower or "base_name" in k_lower:
            item_keys["base_name"] = k
        elif "displayname" in k_lower or "display_name" in k_lower:
            item_keys["display_name"] = k
        elif "clothtype" in k_lower or "cloth_type" in k_lower:
            item_keys["cloth_type"] = k
        elif "materialslots" in k_lower or "material_slots" in k_lower:
            item_keys["material_slots"] = k
        elif "skeletalmesh" in k_lower or "skeletal_mesh" in k_lower:
            item_keys["skeletal_mesh"] = k

    # Check inner MaterialSlot struct keys
    mat_slots_dict = sample_row.get(item_keys["material_slots"]) or sample_row.get("MaterialSlots")
    if isinstance(mat_slots_dict, dict) and mat_slots_dict:
        sample_slot_val = next(iter(mat_slots_dict.values()), {})
        if isinstance(sample_slot_val, dict):
            for sk in sample_slot_val.keys():
                sk_lower = sk.lower()
                if "materialinstance" in sk_lower or "material_instance" in sk_lower:
                    param_keys["material_instance"] = sk
                elif "defaultcolor" in sk_lower or "default_color" in sk_lower:
                    param_keys["default_color"] = sk
                elif "colorparamname" in sk_lower or "color_param_name" in sk_lower:
                    param_keys["color_param_name"] = sk

    return item_keys, param_keys


def ensure_datatable_exists(datatable_path: str, struct_path: str = "") -> Any:
    """Ensure DataTable asset exists, create it from struct_path if necessary."""
    if not HAS_UNREAL:
        return None

    if unreal.EditorAssetLibrary.does_asset_exist(datatable_path):
        return unreal.EditorAssetLibrary.load_asset(datatable_path)

    # Resolve row struct
    row_struct = None
    resolved_struct_path = struct_path.strip() if struct_path else ""
    if resolved_struct_path:
        row_struct = unreal.load_object(None, resolved_struct_path)

    if not row_struct:
        fallback_structs = [
            "/Game/Characters/Database/ST_AppearanceItem.ST_AppearanceItem",
            "/Game/Characters/Eva/Data/ST_AppearanceItem.ST_AppearanceItem",
            "/Game/Blueprints/Appearance/ST_AppearanceItem.ST_AppearanceItem",
        ]
        for candidate in fallback_structs:
            pkg_name = candidate.split(".")[0]
            if unreal.EditorAssetLibrary.does_asset_exist(pkg_name):
                row_struct = unreal.load_object(None, candidate)
                if row_struct:
                    print(f"[register_appearance_datatable] Found row struct at: '{candidate}'", flush=True)
                    break

    package_path, asset_name = datatable_path.rsplit("/", 1)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.DataTableFactory()
    if row_struct:
        factory.struct = row_struct
    else:
        print(f"[register_appearance_datatable] Warning: Could not find struct '{struct_path}'. Creating empty DataTable.", flush=True)

    dt = asset_tools.create_asset(asset_name, package_path, unreal.DataTable, factory)
    if dt:
        print(f"[register_appearance_datatable] 📂 Created new DataTable at '{datatable_path}' (Struct: '{struct_path}')", flush=True)
    return dt


def main(
    objects_map: Optional[Union[Dict[str, Any], List[Dict[str, Any]], str]] = None,
    cloth_types: Optional[Union[Dict[str, str], str]] = None,
    datatable_directory: str = "",
    datatable_name: str = "",
    struct_path: str = "/Game/Characters/Database/ST_AppearanceItem.ST_AppearanceItem",
    **kwargs
) -> Dict[str, Any]:
    """
    Main entry point for batch registration of modular cloth assets into Wardrobe DataTable.
    """
    # Read optional configuration from kwargs
    datatable_path = kwargs.get("datatable_path", "")
    character_name = kwargs.get("character_name") or "Eva"
    default_color = kwargs.get("default_color")
    color_param_name = kwargs.get("color_param_name") or "Tint_Color"
    row_name_prefix = kwargs.get("row_name_prefix")
    batch_items = kwargs.get("batch_items")
    # 1. Normalize input items (objects_map or fallback batch_items)
    raw_input = objects_map if objects_map is not None else batch_items
    items_dict: Dict[str, Any] = {}

    if isinstance(raw_input, str):
        if os.path.isfile(raw_input):
            with open(raw_input, "r", encoding="utf-8") as f:
                parsed = json.load(f)
        else:
            parsed = json.loads(raw_input)
    else:
        parsed = raw_input or {}

    if isinstance(parsed, dict):
        if "objects_map" in parsed and isinstance(parsed["objects_map"], dict):
            items_dict = parsed["objects_map"]
        elif "batch_results" in parsed and isinstance(parsed["batch_results"], list):
            for res in parsed["batch_results"]:
                k = sanitize_asset_name(os.path.splitext(os.path.basename(res.get("asset_name", "")))[0])
                items_dict[k] = res
        else:
            items_dict = parsed
    elif isinstance(parsed, list):
        for idx, item in enumerate(parsed):
            k = item.get("asset_name") or f"Item_{idx}"
            clean_k = sanitize_asset_name(os.path.splitext(os.path.basename(k))[0])
            items_dict[clean_k] = item

    if not items_dict:
        print("[register_appearance_datatable] Warning: No items provided in objects_map.", flush=True)
        return {"status": "skipped", "message": "No items provided"}

    # 2. Resolve DataTable Path
    if datatable_path and datatable_path.strip():
        final_dt_path = _clean_ue_path(datatable_path)
    else:
        # Resolve directory
        resolved_dir = datatable_directory.strip() if datatable_directory else ""
        if not resolved_dir:
            # Check if mesh path provides directory hint
            for v in items_dict.values():
                mesh_p = v.get("skeletal_mesh") or v.get("mesh_path") or ""
                if mesh_p and mesh_p.startswith("/Game/"):
                    char_root = mesh_p.split("/Outfits")[0] if "/Outfits" in mesh_p else os.path.dirname(mesh_p)
                    resolved_dir = f"{char_root}/Database"
                    break
            if not resolved_dir:
                resolved_dir = f"/Game/Characters/Genesis9/{character_name}/Database"

        # Resolve table name
        resolved_name = datatable_name.strip() if datatable_name else f"DT_{character_name}Wardrobe"
        final_dt_path = f"{_clean_ue_path(resolved_dir)}/{resolved_name}"

    def_color = default_color or {"R": 0.0, "G": 0.5, "B": 1.0, "A": 1.0}
    prefix = row_name_prefix or f"{character_name}_outfit"

    print(f"[register_appearance_datatable] Registering {len(items_dict)} asset(s) to DataTable: '{final_dt_path}'...", flush=True)
    print(f"  Struct Path: '{struct_path}'", flush=True)

    # 3. Load or create DataTable and retrieve existing rows
    existing_rows_dict: Dict[str, Dict[str, Any]] = {}
    dt_asset = None
    item_guid_keys = dict(DEFAULT_ITEM_GUID_KEYS)
    param_guid_keys = dict(DEFAULT_PARAM_GUID_KEYS)

    if HAS_UNREAL:
        dt_asset = ensure_datatable_exists(final_dt_path, struct_path)
        if dt_asset:
            try:
                raw_json = unreal.DataTableFunctionLibrary.export_data_table_to_json_string(dt_asset)
                if raw_json and raw_json.strip():
                    existing_list = json.loads(raw_json)
                    if isinstance(existing_list, list) and len(existing_list) > 0:
                        # Detect key mapping from sample existing row
                        sample_row = existing_list[0]
                        item_guid_keys, param_guid_keys = detect_field_keys(sample_row)

                        for row in existing_list:
                            r_name = row.get("Name")
                            if r_name:
                                existing_rows_dict[r_name] = row
            except Exception as e:
                print(f"[register_appearance_datatable] Note: Could not export existing rows ({e}). Proceeding fresh.", flush=True)

    # 4. Upsert each item in RAM
    registered_rows: List[Dict[str, Any]] = []

    for item_key, item_data in items_dict.items():
        cloth_type = extract_cloth_type(item_key, item_data, cloth_types)
        mesh_path = item_data.get("skeletal_mesh") or item_data.get("mesh_path") or ""
        base_name = item_data.get("base_name") or item_key
        display_name = item_data.get("display_name") or format_display_name(item_key)

        # Unique row name (e.g. Eva_outfit_bottom_G9_Base_Shorts)
        clean_item_stem = sanitize_asset_name(os.path.splitext(os.path.basename(item_key))[0])
        short_stem = clean_item_stem
        for p_part in ["eva_outfit_duf_", "eva_outfit_", "outfit_duf_", "outfit_"]:
            if short_stem.lower().startswith(p_part):
                short_stem = short_stem[len(p_part):]
                break

        safe_type = cloth_type.lower() if cloth_type and "system.collections" not in cloth_type.lower() else "item"
        row_name = f"{prefix}_{safe_type}_{short_stem}" if prefix else f"{short_stem}"

        # Build Material Slots Map conforming to ST_MaterialParams
        slots_source = item_data.get("material_slots") or item_data.get("slot_bindings") or {}
        mat_slots_dict: Dict[str, Any] = {}

        if isinstance(slots_source, dict):
            for s_name, s_val in slots_source.items():
                slot_clean = str(s_name).strip()
                if isinstance(s_val, dict):
                    mic_path = s_val.get("material_instance") or s_val.get("mic") or ""
                    slot_color = s_val.get("default_color") or def_color
                    slot_param = s_val.get("color_param_name") or color_param_name
                else:
                    mic_path = str(s_val)
                    slot_color = def_color
                    slot_param = color_param_name

                mat_slots_dict[slot_clean] = {
                    param_guid_keys["material_instance"]: mic_path,
                    param_guid_keys["default_color"]: slot_color,
                    param_guid_keys["color_param_name"]: slot_param
                }

        # Build row object conforming to ST_AppearanceItem
        row_data = {
            "Name": row_name,
            item_guid_keys["base_name"]: base_name,
            item_guid_keys["display_name"]: display_name,
            item_guid_keys["cloth_type"]: cloth_type,
            item_guid_keys["skeletal_mesh"]: mesh_path,
            item_guid_keys["material_slots"]: mat_slots_dict
        }

        is_new = row_name not in existing_rows_dict
        existing_rows_dict[row_name] = row_data

        registered_rows.append({
            "row_name": row_name,
            "base_name": base_name,
            "display_name": display_name,
            "cloth_type": cloth_type,
            "skeletal_mesh": mesh_path,
            "slots_count": len(mat_slots_dict),
            "is_new": is_new
        })

        action_label = "➕ Added" if is_new else "🔄 Updated"
        print(f"  {action_label} row: '{row_name}' [ClothType: {cloth_type}, Mesh: '{mesh_path}', Slots: {len(mat_slots_dict)}]", flush=True)

    # 5. Commit all rows in 1 single transaction
    full_rows_list = list(existing_rows_dict.values())
    full_json_str = json.dumps(full_rows_list, indent=2)

    save_success = False
    if HAS_UNREAL and dt_asset:
        success = unreal.DataTableFunctionLibrary.fill_data_table_from_json_string(dt_asset, full_json_str)
        if success:
            save_success = unreal.EditorAssetLibrary.save_loaded_asset(dt_asset)
            print(f"[register_appearance_datatable] ✔ Successfully committed DataTable '{final_dt_path}' with {len(full_rows_list)} total rows (Saved: {save_success}).", flush=True)
        else:
            print(f"[register_appearance_datatable] ❌ Error: fill_data_table_from_json_string failed for '{final_dt_path}'.", flush=True)
    else:
        print(f"[register_appearance_datatable] [Dry-Run] Generated JSON for '{final_dt_path}' with {len(full_rows_list)} total rows.", flush=True)

    return {
        "status": "success",
        "datatable_path": final_dt_path,
        "struct_path": struct_path,
        "items_registered_count": len(registered_rows),
        "total_rows_in_datatable": len(full_rows_list),
        "registered_rows": registered_rows
    }


register_datatable = main

if __name__ == "__main__":
    if len(sys.argv) > 1:
        input_arg = sys.argv[1]
        dt_p = sys.argv[2] if len(sys.argv) > 2 else ""
        main(objects_map=input_arg, datatable_path=dt_p)
