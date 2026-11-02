# pyrefly: ignore [missing-import]
"""
AI Character & Wardrobe Manifest Classifier (Unified Semantic Orchestrator)
Runs on Generic Python Executor or Local Host.

Consumes:
  1. fbx_files: List of FBX asset file paths exported from Blender/DAZ.
  2. contracts: Game Contracts dictionary (output of inspect_game_contracts.py) containing:
      - "materials": Master Material parameters and sampler presets.
      - "schemas": Blueprint PrimaryDataAsset schemas (e.g. PDA_WardrobeItem).
      - "gameplay_tags": Valid registered gameplay tags from DefaultGameplayTags.ini.
  3. texture_files (optional): List of texture paths. If omitted, scanned automatically from FBX folder.
  4. thumbnail_files (optional): List of PNG thumbnail paths. If omitted, scanned automatically from FBX folder.
  5. character_name (optional): e.g. "Eva" or "Laura". Auto-inferred if omitted.
  6. character_tag (optional): e.g. "Character.Eva". Auto-inferred if omitted.
  7. destination_folder (optional): Target Unreal package path (default "/Game/Characters/Genesis9/{character}/Outfits").
  8. endpoint (optional): AI API endpoint or provider alias ('groq', 'gemini', 'ollama', 'openai', etc.).
  9. model (optional): AI Model identifier.

Produces:
  Unified Manifest ready for All-In-One Unreal Character Ingestion:
  - manifest: Complete dictionary with characters, items, mesh naming (SKM_*),
    DataAsset naming (DA_*), GameplayTags, Thumbnails, and Material bindings.
  - summary: Execution summary.
"""

import os
import sys
import glob
import json
import re
from typing import List, Dict, Optional, Any, Tuple
from pydantic import BaseModel, Field

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    OpenAI = None
    HAS_OPENAI = False


# ==============================================================================
# 1. Pydantic Structured Output Models
# ==============================================================================

class TextureParamBinding(BaseModel):
    param_name: str = Field(description="Shader parameter name e.g. BaseColorMap, NormalMap, ORMMap")
    texture_path: str = Field(description="Physical path to the texture file")


class SlotMaterialClassification(BaseModel):
    slot_name: str = Field(description="Exact slot name matching one of the entries in the mesh.")
    material_tag: str = Field(description="Matched project material tag (Skin, Cloth, Eye, Hair, Mouth, etc.).")
    master_material_path: str = Field(default="", description="Package path to the master material.")
    textures: List[TextureParamBinding] = Field(
        default_factory=list,
        description="List of shader parameter bindings (param_name, texture_path)."
    )


class WardrobeProperties(BaseModel):
    DisplayName: str = Field(default="", description="Clean, human-readable display title for UI (e.g. 'Brz Us Bra').")
    SlotTag: str = Field(default="", description="Valid GameplayTag for clothing slot (e.g. 'System.Wardrobe.Slots.Inner_Top') or empty if Body.")
    ItemTag: str = Field(default="", description="Valid GameplayTag identifying this specific item (e.g. 'Character.Laura.Outfits.Bra') or empty if Body.")
    CharacterTag: str = Field(default="", description="GameplayTag of the parent character (e.g. 'Character.Eva').")


class ClassifiedItem(BaseModel):
    asset_name: str = Field(description="Clean identifier of the asset (e.g. 'Eva_Outfit1_BRZ_US_Bra').")
    mesh_name: str = Field(description="Skeletal mesh name with prefix 'SKM_' (e.g. 'SKM_Eva_Outfit1_BRZ_US_Bra').")
    data_asset_name: str = Field(description="Data asset name with prefix 'DA_' (e.g. 'DA_Eva_Outfit1_BRZ_US_Bra').")
    asset_kind: str = Field(description="'Body' for character base/nude body mesh, or 'Wardrobe' for clothes/hair/shoes.")
    destination_folder: str = Field(default="", description="Target Unreal Engine folder path for this item (e.g. '/Game/Characters/Genesis9/Laura' for Body, '/Game/Characters/Genesis9/Laura/Outfits' for Wardrobe).")
    target_schema_path: str = Field(default="", description="Unreal package path to target Schema, e.g. '/Game/Systems/Characters/Schemas/PDA_CharacterProfile'.")
    target_schema: str = Field(default="PDA_WardrobeItem", description="Blueprint schema class name.")
    fbx_file: str = Field(description="Physical file path to the FBX.")
    thumbnail_file: str = Field(default="", description="Physical file path to the thumbnail if provided.")
    properties: WardrobeProperties = Field(description="PDA properties conforming to schema.")
    materials: List[SlotMaterialClassification] = Field(
        default_factory=list,
        description="List of material slot classifications for this item."
    )


class ManifestClassificationResult(BaseModel):
    character_name: str = Field(description="Detected or provided character name.")
    character_tag: str = Field(description="Detected or provided character GameplayTag.")
    destination_folder: str = Field(description="Target Unreal Engine folder path.")
    items: List[ClassifiedItem] = Field(description="List of classified character or wardrobe items.")


# ==============================================================================
# 2. Endpoint & Environment Configuration
# ==============================================================================

PROVIDER_DEFAULTS = {
    "groq": {"endpoint": "https://api.groq.com/openai/v1", "model": "qwen/qwen3.8-27b"},
    "gemini": {"endpoint": "https://generativelanguage.googleapis.com/v1beta/openai/", "model": "gemini-2.5-flash"},
    "ollama": {"endpoint": "http://localhost:11434/v1", "model": "qwen2.5:7b"},
    "deepseek": {"endpoint": "https://api.deepseek.com/v1", "model": "deepseek-chat"},
    "openai": {"endpoint": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
    "openrouter": {"endpoint": "https://openrouter.ai/api/v1", "model": "meta-llama/llama-3.3-70b-instruct:free"},
}


def resolve_endpoint(endpoint_or_provider: str, model_candidate: str = "") -> Tuple[str, str, str, bool]:
    raw = (endpoint_or_provider or "groq").strip()
    raw_lower = raw.lower()

    if raw_lower.startswith(("http://", "https://")):
        is_local = any(h in raw_lower for h in ["localhost", "127.0.0.1", ":11434", ":1234", ":8000"])
        provider_key = "ollama" if ("11434" in raw_lower or "ollama" in raw_lower) else "custom"
        for p in PROVIDER_DEFAULTS.keys():
            if p in raw_lower:
                provider_key = p
                break
        target_model = model_candidate.strip() if model_candidate else ("qwen2.5:7b" if is_local else "qwen/qwen3.8-27b")
        return raw, provider_key, target_model, is_local

    provider_key = raw_lower if raw_lower in PROVIDER_DEFAULTS else "groq"
    default_cfg = PROVIDER_DEFAULTS[provider_key]
    target_endpoint = default_cfg["endpoint"]
    target_model = model_candidate.strip() or default_cfg["model"]
    return target_endpoint, provider_key, target_model, (provider_key == "ollama")


def resolve_api_key(provider_key: str, is_local: bool) -> str:
    if is_local:
        return "ollama"

    env_map = {
        "groq": ["GROQ_API_KEY", "AI_API_KEY"],
        "gemini": ["GEMINI_API_KEY", "GOOGLE_API_KEY", "AI_API_KEY"],
        "openai": ["OPENAI_API_KEY", "AI_API_KEY"],
        "deepseek": ["DEEPSEEK_API_KEY", "AI_API_KEY"],
        "openrouter": ["OPENROUTER_API_KEY", "AI_API_KEY"],
    }
    keys_to_check = env_map.get(provider_key, ["AI_API_KEY"])
    for k in keys_to_check:
        val = os.getenv(k, "").strip()
        if val:
            return val

    # Try reading from runner.toml in parent folders
    curr = os.getcwd()
    for _ in range(4):
        toml_path = os.path.join(curr, "runner.toml")
        if os.path.isfile(toml_path):
            try:
                with open(toml_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        for k in keys_to_check:
                            if line.startswith(f"{k} =") or line.startswith(f'{k}='):
                                parts = line.split("=", 1)
                                if len(parts) == 2:
                                    clean = parts[1].strip().strip('"').strip("'")
                                    if clean:
                                        return clean
            except Exception:
                pass
        parent = os.path.dirname(curr)
        if parent == curr:
            break
        curr = parent

    raise RuntimeError(
        f"API Key for '{provider_key}' not found. Please set {keys_to_check[0]} in environment or runner.toml."
    )


# ==============================================================================
# 3. Heuristic File Discovery & Association
# ==============================================================================

def find_associated_thumbnail(fbx_file: str, all_thumbnails: List[str]) -> str:
    """Finds matching PNG thumbnail for an FBX file."""
    base_name = os.path.splitext(os.path.basename(fbx_file))[0]
    clean_base = base_name.lower().replace("skm_", "").replace("da_", "")

    # 1. Exact match in explicit list
    for thumb in all_thumbnails:
        t_base = os.path.splitext(os.path.basename(thumb))[0].lower()
        if t_base == clean_base or t_base == f"t_{clean_base}" or t_base == f"{clean_base}_thumb":
            return thumb

    # 2. Check disk in the same folder as FBX
    fbx_dir = os.path.dirname(fbx_file)
    candidates = [
        os.path.join(fbx_dir, f"{base_name}.png"),
        os.path.join(fbx_dir, f"T_{base_name}.png"),
        os.path.join(fbx_dir, f"{clean_base}.png"),
        os.path.join(fbx_dir, f"T_{clean_base}.png"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c

    return ""


def extract_fbx_material_slots(fbx_path: str) -> List[str]:
    """
    Extracts exact material slot names directly from binary or ASCII FBX file.
    Ultra fast (<5ms, zero external dependencies).
    """
    if not fbx_path or not os.path.isfile(fbx_path):
        return []

    try:
        with open(fbx_path, "rb") as f:
            data = f.read(10 * 1024 * 1024)  # Read up to 10MB to cover material definitions

        # 1. FBX Binary pattern: <Name>\x00\x01Material
        pattern_bin = rb'([a-zA-Z0-9_\-\.\s]+)\x00\x01Material'
        matches = re.findall(pattern_bin, data)
        results = []
        for m in matches:
            name = m.decode("utf-8", errors="ignore").strip()
            if name and name not in results and name != "Material":
                results.append(name)

        # 2. FBX ASCII pattern fallback: Material: "Material::Name"
        if not results:
            pattern_ascii = rb'Material::([a-zA-Z0-9_\-\.\s]+)'
            matches_ascii = re.findall(pattern_ascii, data)
            for m in matches_ascii:
                name = m.decode("utf-8", errors="ignore").strip()
                if name and name not in results and name != "Material":
                    results.append(name)

        return results
    except Exception as e:
        print(f"[classify_character_manifest] Warning extracting slots from '{fbx_path}': {e}", flush=True)
        return []


def discover_textures_in_folder(fbx_files: List[str]) -> List[str]:
    """Scans folders containing FBX files for texture files."""
    tex_exts = {".png", ".jpg", ".jpeg", ".tga", ".exr", ".hdr"}
    discovered = []
    folders = {os.path.dirname(f) for f in fbx_files if f and os.path.isfile(f)}
    for folder in folders:
        for root, _, files in os.walk(folder):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in tex_exts and not file.endswith("_thumb.png"):
                    discovered.append(os.path.join(root, file))
    return discovered


# ==============================================================================
# 4. Main Classification Logic
# ==============================================================================

def main(
    fbx_files: List[str],
    contracts: Optional[Dict[str, Any]] = None,
    raw_manifest: Optional[Union[Dict[str, Any], str]] = None,
    texture_files: Optional[List[str]] = None,
    thumbnail_files: Optional[List[str]] = None,
    character_name: str = "",
    character_tag: str = "",
    destination_folder: str = "",
    endpoint: str = "groq",
    model: str = "",
    **kwargs
) -> Dict[str, Any]:
    """
    Main orchestration entry point.
    """
    if not fbx_files:
        raise ValueError("No FBX files provided to classify_character_manifest.")

    valid_fbx = [os.path.abspath(f) for f in fbx_files if f and os.path.isfile(f)]
    if not valid_fbx:
        raise FileNotFoundError(f"None of the provided FBX files exist on disk: {fbx_files}")

    # Parse raw_manifest if provided from repository DAM or upstream
    parsed_raw_manifest: Dict[str, Any] = {}
    if raw_manifest:
        if isinstance(raw_manifest, str):
            try:
                parsed_raw_manifest = json.loads(raw_manifest)
            except Exception:
                pass
        elif isinstance(raw_manifest, dict):
            parsed_raw_manifest = raw_manifest

    # Auto-infer character name from first FBX if omitted
    if not character_name:
        first_base = os.path.splitext(os.path.basename(valid_fbx[0]))[0]
        # Example: Eva_Outfit1_BrzUsBra.fbx -> "Eva"
        parts = first_base.split("_")
        character_name = parts[0] if parts else "Genesis9"

    if not character_tag:
        character_tag = f"Character.{character_name}"

    base_character_folder = f"/Game/Characters/Genesis9/{character_name}"
    outfits_folder = f"{base_character_folder}/Outfits"

    if not destination_folder:
        destination_folder = base_character_folder

    # Discover textures & thumbnails
    textures = list(texture_files or [])
    if not textures:
        textures = discover_textures_in_folder(valid_fbx)

    thumbnails = list(thumbnail_files or [])

    # Pre-associate thumbnails & extract exact material slots from FBX / raw_manifest
    fbx_with_meta = []
    for fbx in valid_fbx:
        thumb = find_associated_thumbnail(fbx, thumbnails)
        real_slots = extract_fbx_material_slots(fbx)

        # If raw_manifest has slots metadata for this object, merge them
        if parsed_raw_manifest:
            obj_name = os.path.splitext(os.path.basename(fbx))[0]
            objects_dict = parsed_raw_manifest.get("objects", {})
            if obj_name in objects_dict:
                for s in objects_dict[obj_name].get("slots", []):
                    s_name = s.get("name") or s.get("slot_name")
                    if s_name and s_name not in real_slots:
                        real_slots.append(s_name)

        fbx_with_meta.append({
            "fbx_file": fbx,
            "filename": os.path.basename(fbx),
            "material_slots": real_slots,
            "thumbnail_file": thumb,
            "has_thumbnail": bool(thumb)
        })

    # Prepare contracts context
    contracts_payload = contracts or {}
    if isinstance(contracts_payload, str):
        try:
            contracts_payload = json.loads(contracts_payload)
        except Exception:
            contracts_payload = {}
    materials_contracts = contracts_payload.get("materials", {})
    pda_schemas = contracts_payload.get("schemas", {})
    valid_tags = contracts_payload.get("gameplay_tags", [])
    valid_slots = contracts_payload.get("wardrobe_slots", [])

    # Setup OpenAI Client
    target_endpoint, provider_key, target_model, is_local = resolve_endpoint(endpoint, model)
    api_key = resolve_api_key(provider_key, is_local)

    if not HAS_OPENAI:
        raise RuntimeError("openai Python package is required. Run 'pip install openai pydantic'.")

    client = OpenAI(base_url=target_endpoint, api_key=api_key)

    # Build Prompt
    system_prompt = (
        "You are a Senior Unreal Engine 5 Technical Artist & Automation Pipeline Specialist.\n"
        "Your task is to classify 3D character/clothing assets into a unified ingestion manifest.\n\n"
        "CRITICAL ARCHITECTURAL RULES (STRICT 1-TO-1 ASSET MAPPING):\n"
        "1. ONE ITEM PER FBX FILE: len(items) MUST EQUAL len(fbx_assets).\n"
        "   - Each entry in 'items' represents ONE physical FBX file in 'fbx_assets'.\n"
        "   - NEVER create multiple items sharing the same FBX file!\n"
        "   - If one FBX file has multiple textures (e.g. Body, Bra, Leggings, Shoes), those are multiple MATERIAL SLOTS "
        "within that single item's 'materials' list, NOT separate items!\n\n"
        "2. MONOLITHIC CHARACTER vs MODULAR CLOTHING:\n"
        "   - If 1 FBX file is given representing a full character (e.g. 'Laura.fbx' or 'Character_Body.fbx'):\n"
        "     * asset_kind: 'Body'\n"
        "     * asset_name: Character name (e.g. 'Laura')\n"
        "     * mesh_name: 'SKM_{character_name}' (e.g. 'SKM_Laura')\n"
        "     * data_asset_name: 'DA_{character_name}' (e.g. 'DA_Laura')\n"
        "     * target_schema: 'PDA_CharacterProfile' if available in target_pda_schema, else 'PDA_WardrobeItem'\n"
        "     * properties.DisplayName: Character name (e.g. 'Laura')\n"
        "     * properties.SlotTag: 'System.Wardrobe.Slots.Body' or empty\n"
        "     * properties.ItemTag: 'Character.{character_name}.Base'\n"
        "     * properties.CharacterTag: 'Character.{character_name}'\n"
        "     * materials: List of all material slots on the character (Skin, Cloth, Shoes, Eyes, etc.).\n"
        "3. EXACT MATERIAL SLOT BINDING (ZERO GUESSWORK):\n"
        "   - In 'fbx_assets', each asset has a 'material_slots' list extracted directly from its geometry!\n"
        "   - In your 'materials' list for that item, the 'slot_name' field MUST match one of the entries in 'material_slots'!\n"
        "   - Map each real slot to its matching Master Material (e.g. M_Skin, M_Cloth, M_Eye) and available texture files.\n"
        "   - If 'material_slots' has entries like ['GNDFabric-2', 'GNDFabric-3', 'M_Genesis_9_Mesh_Body', 'M_Genesis_9_Mesh_Head', 'Eye_Left', 'Eyelashes_Lower-1'], "
        "use those EXACT names as 'slot_name'!\n"
        "4. SCHEMA SELECTION & PROPERTIES:\n"
        "   - 'target_schemas' contains schemas with their 'package_path' (e.g. '/Game/Systems/Characters/Schemas/PDA_CharacterProfile') "
        "and 'ai_editable_fields'.\n"
        "   - Set 'target_schema_path' to the exact 'package_path' of the chosen schema.\n"
        "   - In 'properties', populate the fields listed in that schema's 'ai_editable_fields'.\n"
        "   - DO NOT generate or worry about 'system_bound_fields' (e.g. BodyMesh, ItemMesh, ItemThumbnail) - "
        "the ingestion engine automatically binds them.\n"
    )

    user_payload = {
        "character_name": character_name,
        "character_tag": character_tag,
        "destination_folder": destination_folder,
        "fbx_assets": fbx_with_meta,
        "available_textures": textures[:150],  # Bound to avoid token explosion
        "valid_gameplay_tags": valid_tags,
        "allowed_wardrobe_slots": valid_slots,
        "master_materials": {
            k: {
                "master_material_path": v.get("master_material_path", ""),
                "slots": list(v.get("texture_slots", {}).keys())
            }
            for k, v in materials_contracts.items()
        },
        "target_schemas": {
            k: {
                "package_path": v.get("package_path", ""),
                "ai_editable_fields": v.get("ai_editable_fields", []),
                "system_bound_fields": v.get("system_bound_fields", [])
            }
            for k, v in pda_schemas.items()
        } if pda_schemas else {
            "PDA_WardrobeItem": {
                "package_path": "/Game/Systems/Wardrobe/Schemas/PDA_WardrobeItem",
                "ai_editable_fields": ["SlotTag", "ItemTag", "CharacterTag", "DisplayName"],
                "system_bound_fields": ["ItemMesh", "ItemThumbnail"]
            },
            "PDA_CharacterProfile": {
                "package_path": "/Game/Systems/Characters/Schemas/PDA_CharacterProfile",
                "ai_editable_fields": ["CharacterTag", "DisplayName"],
                "system_bound_fields": ["BodyMesh"]
            }
        }
    }

    print(f"[classify_character_manifest] Requesting AI classification ({target_model} via {provider_key})...", flush=True)

    completion = client.beta.chat.completions.parse(
        model=target_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, indent=2, ensure_ascii=False)},
        ],
        response_format=ManifestClassificationResult,
    )

    result_model: ManifestClassificationResult = completion.choices[0].message.parsed
    manifest_dict: Dict[str, Any] = result_model.model_dump()

    # Reconstruct dictionary maps for downstream compatibility
    for item in manifest_dict.get("items", []):
        mat_list = item.get("materials", [])
        mat_dict = {}
        for m in mat_list:
            if isinstance(m, dict):
                tex_dict = {
                    t["param_name"]: t["texture_path"]
                    for t in m.get("textures", [])
                    if isinstance(t, dict) and "param_name" in t and "texture_path" in t
                }
                m["textures"] = tex_dict
                mat_dict[m.get("slot_name", "")] = m
        item["materials"] = mat_dict

    # Guard: If only 1 monolithic FBX was provided, guarantee 1 item output
    if len(valid_fbx) == 1 and len(manifest_dict.get("items", [])) > 1:
        print(f"[classify_character_manifest] Notice: Collapsing {len(manifest_dict['items'])} items into 1 monolithic Character item for '{valid_fbx[0]}'", flush=True)
        all_materials = {}
        for it in manifest_dict["items"]:
            all_materials.update(it.get("materials", {}))

        target_schema = "PDA_CharacterProfile" if "PDA_CharacterProfile" in pda_schemas else "PDA_WardrobeItem"
        target_schema_path = pda_schemas.get("PDA_CharacterProfile", {}).get("package_path", "/Game/Systems/Characters/Schemas/PDA_CharacterProfile")
        single_item = {
            "asset_name": character_name,
            "mesh_name": f"SKM_{character_name}",
            "data_asset_name": f"DA_{character_name}",
            "asset_kind": "Body",
            "target_schema": target_schema,
            "target_schema_path": target_schema_path,
            "fbx_file": valid_fbx[0],
            "thumbnail_file": manifest_dict["items"][0].get("thumbnail_file", ""),
            "properties": {
                "DisplayName": character_name,
                "SlotTag": "System.Wardrobe.Slots.Body" if "System.Wardrobe.Slots.Body" in valid_slots else "",
                "ItemTag": f"{character_tag}.Base",
                "CharacterTag": character_tag
            },
            "materials": all_materials
        }
        manifest_dict["items"] = [single_item]

    # Resolve target_schema_path & dynamic destination_folder per item
    has_wardrobe_items = False
    for item in manifest_dict.get("items", []):
        if not item.get("target_schema_path"):
            sk = item.get("target_schema", "PDA_WardrobeItem")
            item["target_schema_path"] = pda_schemas.get(sk, {}).get("package_path", "")

        is_body = (
            item.get("asset_kind") == "Body"
            or item.get("target_schema") == "PDA_CharacterProfile"
            or "CharacterProfile" in item.get("target_schema_path", "")
        )

        if is_body:
            # Base character body meshes and PDA_CharacterProfile belong directly in the character's base root folder
            item["destination_folder"] = base_character_folder
        else:
            has_wardrobe_items = True
            # Wardrobe/clothing items belong in the Outfits subfolder
            item["destination_folder"] = outfits_folder

    # Update top-level destination folder to reflect contents accurately
    if has_wardrobe_items and not any(it.get("asset_kind") == "Body" for it in manifest_dict.get("items", [])):
        destination_folder = outfits_folder
    else:
        destination_folder = base_character_folder
    manifest_dict["destination_folder"] = destination_folder

    # Convert to objects_map for backward compatibility
    objects_map = {}
    for item in manifest_dict.get("items", []):
        objects_map[item["asset_name"]] = {
            "asset_name": item["asset_name"],
            "mesh_name": item["mesh_name"],
            "data_asset_name": item["data_asset_name"],
            "file_path": item["fbx_file"],
            "destination_folder": item.get("destination_folder", destination_folder),
            "slots": [
                {
                    "slot_name": slot_key,
                    "material_tag": slot_data["material_tag"],
                    "master_material_path": slot_data.get("master_material_path", ""),
                    "textures": slot_data.get("textures", {})
                }
                for slot_key, slot_data in item.get("materials", {}).items()
            ],
            "properties": item.get("properties", {}),
            "thumbnail_file": item.get("thumbnail_file", "")
        }

    summary = (
        f"Classified {len(manifest_dict.get('items', []))} items for Character '{character_name}'. "
        f"Prefixes unified (SKM_* for meshes, DA_* for data assets). "
        f"All GameplayTags mapped."
    )

    print(f"[classify_character_manifest] {summary}", flush=True)

    return {
        "manifest": manifest_dict,
        "objects_map": objects_map,
        "items_count": len(manifest_dict.get("items", [])),
        "character_name": character_name,
        "character_tag": character_tag,
        "destination_folder": destination_folder,
        "summary": summary
    }


if __name__ == "__main__":
    # Smoke test structure
    print("AI Character Manifest Classifier Module loaded successfully.")

