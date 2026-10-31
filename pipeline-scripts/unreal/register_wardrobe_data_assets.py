# pyrefly: ignore [missing-import]
"""
Unreal Engine Pipeline Script: Modular Wardrobe & Profile DataAsset Registrar
Runs inside Unreal Engine via Python API (Unreal Engine 5.x) or Dry-Run Simulation.

Consumes:
  1. manifest (optional): Material manifest from classify_material_manifest or batch_export_fbx.
  2. objects_map (optional): Asset bindings map from setup_asset_materials.
  3. mesh_paths (optional): Skeletal mesh paths from import_skeletal_mesh.
  4. character_tag: Root GameplayTag for the character (default 'Character.Eva').
  5. destination_folder: Content Browser package directory to save PDA_WardrobeItem assets.
  6. character_profile_path: Package path to character profile DataAsset (PDA_CharacterProfile).
  7. tags_ini_path: Path to DefaultGameplayTags.ini for auto-syncing new tags.
  8. wardrobe_schema_path: Path to PDA_WardrobeItem Blueprint schema.
  9. character_schema_path: Path to PDA_CharacterProfile Blueprint schema.
  10. slot_tag_prefix: Prefix for wardrobe slot GameplayTags (default 'System.Wardrobe.Slots').
  11. item_tag_prefix: Custom prefix for item GameplayTags (defaults to '{character_tag}.Outfits').
  12. should_register: Master boolean switch to allow or skip registration.
  13. dry_run: Simulate registration without touching Unreal assets or disk files.

Performs:
  - Extracts and normalizes clothing assets, filtering out non-clothing / body items.
  - Automatically synchronizes new GameplayTags into Config/DefaultGameplayTags.ini.
  - Instantiates or updates PDA_WardrobeItem DataAssets with CharacterTag, SlotTag, ItemTag, ItemMesh.
  - Links newly registered item tags to PDA_CharacterProfile.IntialItems and binds BodyMesh if present.
  - Saves all modified assets atomically.
"""

import os
import sys
import json
import re
from typing import Dict, Any, List, Optional, Union, Tuple

try:
    import unreal
    HAS_UNREAL = True
except ImportError:
    unreal = None
    HAS_UNREAL = False


# ==============================================================================
# Helper Functions: Path and Name Normalization
# ==============================================================================

def _clean_ue_path(p: str) -> str:
    """Normalize path with forward slashes and ensure leading slash."""
    clean = str(p or "").replace("\\", "/").strip()
    clean = re.sub(r"/+", "/", clean)
    if clean and not clean.startswith("/"):
        clean = "/" + clean
    return clean.rstrip("/")


def sanitize_asset_name(name: str) -> str:
    """Sanitize string for Unreal Asset naming."""
    clean = re.sub(r"[ .\\/:\*\?\"<>\|]+", "_", str(name or ""))
    clean = re.sub(r"_+", "_", clean).strip("_")
    return clean or "Asset"


def sanitize_gameplay_tag(tag: str) -> str:
    """Sanitize string for Unreal GameplayTag (alphanumeric, dots, underscores)."""
    clean = re.sub(r"[ \-/:\*\?\"<>\|]+", "_", str(tag or "").strip())
    clean = re.sub(r"_+", "_", clean)
    clean = re.sub(r"\.+", ".", clean)
    return clean.strip("._")


def resolve_slot_tag(cloth_type: str, slot_tag_prefix: str = "System.Wardrobe.Slots") -> str:
    """
    Resolve semantic cloth type into a valid GameplayTag.
    e.g. 'Inner_Top' -> 'System.Wardrobe.Slots.Inner_Top'
    e.g. 'Hair' -> 'System.Wardrobe.Slots.Hair'
    """
    c = str(cloth_type or "").strip()
    if not c:
        return ""
    if "." in c:
        return sanitize_gameplay_tag(c)
    
    # Format canonical casing: capitalize words separated by underscore
    parts = c.split("_")
    c_clean = "_".join(p.capitalize() for p in parts if p)
    return sanitize_gameplay_tag(f"{slot_tag_prefix}.{c_clean}")


def resolve_item_tag(
    clean_asset_name: str,
    character_tag: str,
    item_tag_prefix: str = ""
) -> str:
    """
    Resolve canonical GameplayTag for a wardrobe item.
    e.g. 'Character.Eva.Outfits.Eva_Outfit1_BRZ_US_Bra'
    """
    prefix = item_tag_prefix.strip() if item_tag_prefix else f"{character_tag}.Outfits"
    return sanitize_gameplay_tag(f"{prefix}.{clean_asset_name}")


# ==============================================================================
# GameplayTags INI File Synchronization
# ==============================================================================

def sync_gameplay_tags_to_ini(
    ini_path: str,
    tags_to_add: List[str],
    dry_run: bool = False
) -> Tuple[List[str], str]:
    """
    Ensure tags exist in Config/DefaultGameplayTags.ini.
    Appends '+GameplayTagList=(Tag="...",DevComment="")' if missing.
    Returns (added_tags, resolved_ini_path).
    """
    resolved_path = ini_path.strip() if ini_path else ""

    if not resolved_path:
        # Try finding via Unreal Engine Paths if available
        if HAS_UNREAL and hasattr(unreal, "Paths"):
            try:
                candidate = os.path.join(unreal.Paths.project_config_dir(), "DefaultGameplayTags.ini")
                if os.path.exists(candidate) or os.path.exists(os.path.dirname(candidate)):
                    resolved_path = candidate
            except Exception:
                pass

    if not resolved_path or not os.path.exists(resolved_path):
        # Look for standard fallback locations
        fallbacks = [
            "D:/Games/UnrealEngine/Projects/TemplateProject/Config/DefaultGameplayTags.ini",
            os.path.abspath("Config/DefaultGameplayTags.ini")
        ]
        for fb in fallbacks:
            if os.path.exists(fb):
                resolved_path = fb
                break

    if not resolved_path or not os.path.exists(resolved_path):
        print(f"[register_wardrobe_data_assets] [WARN] DefaultGameplayTags.ini not found. Skipping disk tag sync.", flush=True)
        return [], resolved_path

    # Read existing tags
    try:
        with open(resolved_path, "r", encoding="utf-8-sig") as f:
            content = f.read()
    except Exception as e:
        print(f"[register_wardrobe_data_assets] [WARN] Error reading {resolved_path}: {e}", flush=True)
        return [], resolved_path

    existing_tags = set(re.findall(r'Tag="([^"]+)"', content))
    new_tags = [t for t in tags_to_add if t and t not in existing_tags]

    if not new_tags:
        print(f"[register_wardrobe_data_assets] [OK] All {len(tags_to_add)} GameplayTag(s) already exist in {os.path.basename(resolved_path)}.", flush=True)
        return [], resolved_path

    print(f"[register_wardrobe_data_assets] [SYNC] Adding {len(new_tags)} new GameplayTag(s) to {os.path.basename(resolved_path)}: {new_tags}", flush=True)

    if dry_run:
        print(f"[register_wardrobe_data_assets] [Dry-Run] Skipped writing to {resolved_path}.", flush=True)
        return new_tags, resolved_path

    # Construct new lines
    tag_lines = [f'+GameplayTagList=(Tag="{t}",DevComment="")' for t in new_tags]

    # Insert under [/Script/GameplayTags.GameplayTagsSettings]
    matches = list(re.finditer(r'\+GameplayTagList=\(Tag="[^"]+",DevComment="[^"]*"\)', content))
    if matches:
        last_pos = matches[-1].end()
        new_content = content[:last_pos] + "\n" + "\n".join(tag_lines) + content[last_pos:]
    elif "[/Script/GameplayTags.GameplayTagsSettings]" in content:
        header_pos = content.find("[/Script/GameplayTags.GameplayTagsSettings]") + len("[/Script/GameplayTags.GameplayTagsSettings]")
        new_content = content[:header_pos] + "\n" + "\n".join(tag_lines) + content[header_pos:]
    else:
        new_content = content.rstrip() + "\n\n[/Script/GameplayTags.GameplayTagsSettings]\n" + "\n".join(tag_lines) + "\n"

    try:
        with open(resolved_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"[register_wardrobe_data_assets] [OK] Successfully saved updated {resolved_path}.", flush=True)
    except Exception as e:
        print(f"[register_wardrobe_data_assets] [ERROR] Failed to write {resolved_path}: {e}", flush=True)

    return new_tags, resolved_path


# ==============================================================================
# Unreal Engine Property Setters
# ==============================================================================

def _make_gameplay_tag(unreal_mod, tag_str: str) -> Any:
    """Construct an FGameplayTag in Unreal Engine."""
    if not tag_str or not unreal_mod:
        return None
    try:
        if hasattr(unreal_mod, "GameplayTagsManager"):
            mgr = unreal_mod.GameplayTagsManager.get()
            if hasattr(mgr, "request_gameplay_tag"):
                return mgr.request_gameplay_tag(unreal_mod.Name(tag_str))
    except Exception:
        pass
    try:
        tag = unreal_mod.GameplayTag()
        tag.tag_name = unreal_mod.Name(tag_str)
        return tag
    except Exception:
        pass
    return unreal_mod.Name(tag_str)


def _set_tag_property(asset: Any, prop_name: str, tag_str: str, unreal_mod) -> bool:
    """Set a GameplayTag property on an Unreal asset with fallbacks."""
    if not asset or not tag_str or not unreal_mod:
        return False
    tag_val = _make_gameplay_tag(unreal_mod, tag_str)
    try:
        asset.set_editor_property(prop_name, tag_val)
        return True
    except Exception:
        try:
            asset.set_editor_property(prop_name, unreal_mod.Name(tag_str))
            return True
        except Exception as e:
            print(f"[register_wardrobe_data_assets] Warning: Could not set tag property '{prop_name}' on {asset.get_name()}: {e}", flush=True)
            return False


def _set_mesh_property(asset: Any, prop_name: str, mesh_path: str, unreal_mod) -> bool:
    """Set a SkeletalMesh / SoftObjectPtr property on an Unreal asset."""
    if not asset or not mesh_path or not unreal_mod:
        return False
    clean_path = _clean_ue_path(mesh_path)
    mesh_obj = None
    if unreal_mod.EditorAssetLibrary.does_asset_exist(clean_path):
        mesh_obj = unreal_mod.EditorAssetLibrary.load_asset(clean_path)

    try:
        if mesh_obj:
            asset.set_editor_property(prop_name, mesh_obj)
            return True
    except Exception:
        pass

    try:
        # Fallback to SoftObjectPath or string
        soft_path = unreal_mod.SoftObjectPath(clean_path)
        asset.set_editor_property(prop_name, soft_path)
        return True
    except Exception:
        try:
            asset.set_editor_property(prop_name, clean_path)
            return True
        except Exception as e:
            print(f"[register_wardrobe_data_assets] Warning: Could not set mesh property '{prop_name}' on {asset.get_name()}: {e}", flush=True)
            return False


def _load_data_asset_class(schema_path: str, unreal_mod) -> Any:
    """Resolve and load a Blueprint DataAsset class."""
    if not unreal_mod or not schema_path:
        return None

    clean_path = _clean_ue_path(schema_path)
    schema_name = clean_path.split("/")[-1]
    class_candidate = clean_path if clean_path.endswith("_C") else f"{clean_path}.{schema_name}_C"

    # Try direct load_class
    try:
        cls = unreal_mod.load_class(None, class_candidate)
        if cls:
            return cls
    except Exception:
        pass

    # Try load_blueprint_class
    if hasattr(unreal_mod.EditorAssetLibrary, "load_blueprint_class"):
        try:
            cls = unreal_mod.EditorAssetLibrary.load_blueprint_class(clean_path)
            if cls:
                return cls
        except Exception:
            pass

    # Try loading the blueprint asset and reading generated_class
    try:
        bp = unreal_mod.EditorAssetLibrary.load_asset(clean_path)
        if bp and hasattr(bp, "generated_class"):
            return bp.generated_class
    except Exception:
        pass

    return None


# ==============================================================================
# Ingestion & Normalization
# ==============================================================================

def normalize_input_items(
    manifest: Optional[Union[Dict[str, Any], List[Any], str]] = None,
    objects_map: Optional[Union[Dict[str, Any], str]] = None,
    mesh_paths: Optional[Union[List[str], Dict[str, str], str]] = None
) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Parses manifest, objects_map, and mesh_paths into standard clothing items.
    Returns (clothing_items, body_item_or_none).
    """
    raw_list: List[Dict[str, Any]] = []

    # 1. Parse manifest if provided
    if manifest is not None:
        parsed_m = manifest
        if isinstance(parsed_m, str):
            if os.path.isfile(parsed_m):
                with open(parsed_m, "r", encoding="utf-8") as f:
                    parsed_m = json.load(f)
            else:
                try:
                    parsed_m = json.loads(parsed_m)
                except Exception:
                    parsed_m = {}

        if isinstance(parsed_m, dict):
            # Might be wrapped in 'resolved_manifest', 'manifest', or 'batch_results'
            for k in ["resolved_manifest", "manifest", "batch_results"]:
                if k in parsed_m and isinstance(parsed_m[k], list):
                    raw_list.extend(parsed_m[k])
                    break
            else:
                # Dict of item_name -> item_dict
                for k, v in parsed_m.items():
                    if isinstance(v, dict):
                        item = dict(v)
                        item.setdefault("asset_name", k)
                        raw_list.append(item)
        elif isinstance(parsed_m, list):
            raw_list.extend(parsed_m)

    # 2. Parse objects_map if provided
    if objects_map is not None:
        parsed_o = objects_map
        if isinstance(parsed_o, str):
            if os.path.isfile(parsed_o):
                with open(parsed_o, "r", encoding="utf-8") as f:
                    parsed_o = json.load(f)
            else:
                try:
                    parsed_o = json.loads(parsed_o)
                except Exception:
                    parsed_o = {}

        if isinstance(parsed_o, dict):
            for k, v in parsed_o.items():
                if isinstance(v, dict):
                    item = dict(v)
                    item.setdefault("asset_name", k)
                    raw_list.append(item)

    # 3. Parse mesh_paths map for lookups
    mesh_lookup: Dict[str, str] = {}
    if mesh_paths is not None:
        parsed_mp = mesh_paths
        if isinstance(parsed_mp, str):
            if os.path.isfile(parsed_mp):
                with open(parsed_mp, "r", encoding="utf-8") as f:
                    parsed_mp = json.load(f)
            else:
                try:
                    parsed_mp = json.loads(parsed_mp)
                except Exception:
                    parsed_mp = [parsed_mp]

        if isinstance(parsed_mp, dict):
            for k, v in parsed_mp.items():
                if isinstance(v, str):
                    mesh_lookup[k.lower()] = v
        elif isinstance(parsed_mp, list):
            for p in parsed_mp:
                if isinstance(p, str):
                    clean_p = _clean_ue_path(p)
                    leaf = clean_p.split("/")[-1].lower()
                    mesh_lookup[leaf] = clean_p

    # Deduplicate and extract clean entries
    clothing_items: List[Dict[str, Any]] = []
    body_item: Optional[Dict[str, Any]] = None
    seen_names = set()

    for entry in raw_list:
        if not isinstance(entry, dict):
            continue

        raw_name = str(entry.get("source_object_name") or entry.get("raw_name") or entry.get("asset_name") or "").strip()
        clean_name = str(entry.get("clean_asset_name") or entry.get("asset_name") or raw_name).strip()
        clean_name = sanitize_asset_name(clean_name)

        if not clean_name or clean_name in seen_names:
            continue
        seen_names.add(clean_name)

        # Detect cloth_type
        cloth_type = str(entry.get("cloth_type") or entry.get("material_tag") or "").strip()
        is_body = cloth_type.lower() in ["body", "skin", "character", "genesis 9", "base"]

        # Resolve skeletal mesh path
        mesh_p = str(entry.get("mesh_path") or entry.get("skeletal_mesh") or "").strip()
        if not mesh_p:
            for candidate_key, target_p in mesh_lookup.items():
                if clean_name.lower() in candidate_key or candidate_key in clean_name.lower():
                    mesh_p = target_p
                    break

        item_record = {
            "clean_asset_name": clean_name,
            "source_object_name": raw_name,
            "cloth_type": cloth_type,
            "mesh_path": mesh_p,
            "is_body": is_body
        }

        if is_body:
            if not body_item:
                body_item = item_record
        else:
            clothing_items.append(item_record)

    return clothing_items, body_item


# ==============================================================================
# Main Registration Flow
# ==============================================================================

def main(
    manifest: Optional[Union[Dict[str, Any], List[Any], str]] = None,
    objects_map: Optional[Union[Dict[str, Any], str]] = None,
    mesh_paths: Optional[Union[List[str], Dict[str, str], str]] = None,
    character_tag: str = "Character.Eva",
    destination_folder: str = "/Game/Characters/Genesis9/Eva/Outfits",
    character_profile_path: str = "/Game/Characters/Genesis9/Eva/DA_Eva_Profile",
    tags_ini_path: str = "",
    wardrobe_schema_path: str = "/Game/Systems/Wardrobe/Schemas/PDA_WardrobeItem",
    character_schema_path: str = "/Game/Systems/Characters/Schemas/PDA_CharacterProfile",
    slot_tag_prefix: str = "System.Wardrobe.Slots",
    item_tag_prefix: str = "",
    should_register: bool = True,
    dry_run: bool = False,
    **kwargs
) -> Dict[str, Any]:
    """
    Main entry point for batch registration of modular cloth assets into Unreal Engine DataAssets.

    Args:
        manifest: Material manifest from classify_material_manifest or batch_export_fbx.
        objects_map: Asset material bindings dictionary from setup_asset_materials.
        mesh_paths: Imported skeletal mesh paths from import_skeletal_mesh.
        character_tag: Root GameplayTag for the character (default 'Character.Eva').
        destination_folder: Content Browser package directory to save PDA_WardrobeItem assets.
        character_profile_path: Package path to character profile DataAsset (PDA_CharacterProfile).
        tags_ini_path: Optional path to DefaultGameplayTags.ini for auto-syncing new tags.
        wardrobe_schema_path: Path to PDA_WardrobeItem Blueprint schema.
        character_schema_path: Path to PDA_CharacterProfile Blueprint schema.
        slot_tag_prefix: Prefix for wardrobe slot GameplayTags (default 'System.Wardrobe.Slots').
        item_tag_prefix: Custom prefix for item GameplayTags (defaults to '{character_tag}.Outfits').
        should_register: Master boolean switch to allow or skip registration.
        dry_run: Simulate registration without touching Unreal assets or disk files.
    """
    # 0. Master Switch: Circuit breaker
    if not should_register:
        print("[register_wardrobe_data_assets] [SKIP] Skipped registration: 'should_register' is False.", flush=True)
        return {
            "status": "skipped",
            "message": "Skipped registration because should_register is False",
            "items_count": 0,
            "registered_wardrobe_items": [],
            "character_profile": {},
            "tags_synced": [],
            "tags_ini_path": ""
        }

    is_dry = dry_run or not HAS_UNREAL
    clean_dest_folder = _clean_ue_path(destination_folder)
    clean_profile_path = _clean_ue_path(character_profile_path)
    clean_wardrobe_schema = _clean_ue_path(wardrobe_schema_path)
    clean_character_schema = _clean_ue_path(character_schema_path)

    # 1. Normalize items
    clothing_items, body_item = normalize_input_items(manifest, objects_map, mesh_paths)

    if not clothing_items and not body_item:
        print("[register_wardrobe_data_assets] [WARN] No items found to register.", flush=True)
        return {
            "status": "skipped",
            "message": "No valid clothing or body items found in input",
            "items_count": 0,
            "registered_wardrobe_items": [],
            "character_profile": {},
            "tags_synced": [],
            "tags_ini_path": ""
        }

    print(f"[register_wardrobe_data_assets] Found {len(clothing_items)} clothing item(s) and {1 if body_item else 0} body item for character '{character_tag}'.", flush=True)

    # 2. Gather GameplayTags to synchronize
    tags_to_sync: List[str] = [character_tag]
    for item in clothing_items:
        slot_tag = resolve_slot_tag(item["cloth_type"], slot_tag_prefix)
        item_tag = resolve_item_tag(item["clean_asset_name"], character_tag, item_tag_prefix)
        item["slot_tag"] = slot_tag
        item["item_tag"] = item_tag
        if slot_tag:
            tags_to_sync.append(slot_tag)
        if item_tag:
            tags_to_sync.append(item_tag)

    # Synchronize tags into DefaultGameplayTags.ini
    synced_tags, resolved_ini_path = sync_gameplay_tags_to_ini(
        ini_path=tags_ini_path,
        tags_to_add=tags_to_sync,
        dry_run=dry_run
    )

    # 3. Create or Update PDA_WardrobeItem DataAssets
    registered_items: List[Dict[str, Any]] = []
    asset_tools = None
    wardrobe_class = None

    if not is_dry:
        asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
        wardrobe_class = _load_data_asset_class(clean_wardrobe_schema, unreal)
        if not wardrobe_class:
            print(f"[register_wardrobe_data_assets] [WARN] Could not load schema class '{clean_wardrobe_schema}'.", flush=True)
        if not unreal.EditorAssetLibrary.does_directory_exist(clean_dest_folder):
            unreal.EditorAssetLibrary.make_directory(clean_dest_folder)

    for item in clothing_items:
        clean_name = item["clean_asset_name"]
        asset_name = f"PDA_{clean_name}"
        asset_path = f"{clean_dest_folder}/{asset_name}"
        mesh_p = item["mesh_path"] or f"{clean_dest_folder}/SKM_{clean_name}"

        item_record = {
            "asset_name": asset_name,
            "asset_path": asset_path,
            "character_tag": character_tag,
            "slot_tag": item["slot_tag"],
            "item_tag": item["item_tag"],
            "mesh_path": mesh_p,
            "status": "simulated" if is_dry else "created"
        }

        if is_dry:
            print(f"[register_wardrobe_data_assets] [Dry-Run] Simulated PDA_WardrobeItem: '{asset_path}' (Slot: {item['slot_tag']}, Item: {item['item_tag']}, Mesh: {mesh_p})", flush=True)
            registered_items.append(item_record)
            continue

        # In Unreal: create or load asset
        data_asset = None
        if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
            data_asset = unreal.EditorAssetLibrary.load_asset(asset_path)
            item_record["status"] = "updated"
            print(f"[register_wardrobe_data_assets] Updating existing DataAsset: '{asset_path}'", flush=True)
        else:
            factory = unreal.DataAssetFactory()
            if wardrobe_class:
                factory.data_asset_class = wardrobe_class
            data_asset = asset_tools.create_asset(asset_name, clean_dest_folder, None, factory)
            print(f"[register_wardrobe_data_assets] Created new DataAsset: '{asset_path}'", flush=True)

        if data_asset:
            _set_tag_property(data_asset, "CharacterTag", character_tag, unreal)
            _set_tag_property(data_asset, "SlotTag", item["slot_tag"], unreal)
            _set_tag_property(data_asset, "ItemTag", item["item_tag"], unreal)
            if mesh_p:
                _set_mesh_property(data_asset, "ItemMesh", mesh_p, unreal)
            unreal.EditorAssetLibrary.save_loaded_asset(data_asset)

        registered_items.append(item_record)

    # 4. Update PDA_CharacterProfile DataAsset
    new_item_tags = [item["item_tag"] for item in clothing_items if item["item_tag"]]
    body_mesh_path = body_item["mesh_path"] if body_item else ""

    profile_record = {
        "profile_path": clean_profile_path,
        "character_tag": character_tag,
        "new_initial_items": new_item_tags,
        "body_mesh": body_mesh_path,
        "status": "simulated" if is_dry else "unchanged"
    }

    if not is_dry and clean_profile_path:
        profile_asset = None
        if unreal.EditorAssetLibrary.does_asset_exist(clean_profile_path):
            profile_asset = unreal.EditorAssetLibrary.load_asset(clean_profile_path)
        else:
            profile_folder, profile_name = clean_profile_path.rsplit("/", 1)
            char_class = _load_data_asset_class(clean_character_schema, unreal)
            factory = unreal.DataAssetFactory()
            if char_class:
                factory.data_asset_class = char_class
            profile_asset = asset_tools.create_asset(profile_name, profile_folder, None, factory)

        if profile_asset:
            # Set CharacterTag
            _set_tag_property(profile_asset, "CharacterTag", character_tag, unreal)

            # Bind BodyMesh if present
            if body_mesh_path:
                _set_mesh_property(profile_asset, "BodyMesh", body_mesh_path, unreal)

            # Update IntialItems array
            target_prop = "IntialItems" if hasattr(profile_asset, "IntialItems") else "InitialItems"
            try:
                current_items = list(profile_asset.get_editor_property(target_prop) or [])
            except Exception:
                current_items = []

            existing_tag_strs = set()
            for it in current_items:
                t_str = str(getattr(it, "tag_name", it))
                existing_tag_strs.add(t_str)

            updated = False
            for t_str in new_item_tags:
                if t_str not in existing_tag_strs:
                    tag_obj = _make_gameplay_tag(unreal, t_str)
                    if tag_obj:
                        current_items.append(tag_obj)
                        existing_tag_strs.add(t_str)
                        updated = True

            if updated:
                try:
                    profile_asset.set_editor_property(target_prop, current_items)
                    profile_record["status"] = "updated"
                    print(f"[register_wardrobe_data_assets] [OK] Added {len(new_item_tags)} tag(s) to {clean_profile_path}.{target_prop}.", flush=True)
                except Exception as e:
                    print(f"[register_wardrobe_data_assets] Warning: Could not update {target_prop} on profile: {e}", flush=True)

            unreal.EditorAssetLibrary.save_loaded_asset(profile_asset)
    elif is_dry:
        print(f"[register_wardrobe_data_assets] [Dry-Run] Simulated profile update: '{clean_profile_path}' (Added tags: {new_item_tags})", flush=True)

    summary_msg = f"Registered {len(registered_items)} wardrobe DataAsset(s) and synced {len(synced_tags)} tag(s)."
    print(f"[register_wardrobe_data_assets] [OK] {summary_msg}", flush=True)

    return {
        "status": "success",
        "items_count": len(registered_items),
        "registered_wardrobe_items": registered_items,
        "character_profile": profile_record,
        "tags_synced": synced_tags,
        "tags_ini_path": resolved_ini_path,
        "message": summary_msg
    }


register_wardrobe_assets = main


if __name__ == "__main__":
    print("This script is designed to run via ue_stage_runner.py inside Unreal Engine or standalone dry-run.")
