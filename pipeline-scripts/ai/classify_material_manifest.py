# pyrefly: ignore [missing-import]
"""
AI Material Manifest Classifier (Raw JSON Tree Direct Ingestion)
Runs on Agent Worker Daemon (Generic Python Executor)

Consumes:
  1. raw_manifest: Raw metadata JSON tree from GetResourceRelativePaths, Blender Inspection,
     or any upstream step. Passed DIRECTLY to AI for semantic comprehension.
  2. folder_path (optional): Root folder of repository for resolving absolute file paths.
  3. contracts (optional): Master Material Contracts dictionary (ContentMap) for exact shader parameter names.
  4. provider (optional): 'gemini' (default), 'openai', or 'ollama'.
  5. model (optional): 'gemini-2.5-flash' (default), or local model.

Outputs:
  Map <object_name, metadata> conforming 100% to Unreal Engine setup_asset_materials.py:
  - manifest: Dict[object_name, metadata]
  - objects_map: Dict[object_name, metadata]
  - object_count: int
  - summary: str
"""

import os
import sys
import time
import json
from typing import List, Dict, Optional, Any, Union
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

class SlotClassification(BaseModel):
    slot_name: str = Field(description="Exact slot name matching one of the entries in the mesh.")
    material_tag: str = Field(description="Matched project contract key or semantic category (Cloth, Skin, Eye, Hair, Mouth, etc.).")
    textures: Dict[str, str] = Field(
        default_factory=dict,
        description="Dictionary mapping shader parameter names (e.g. Cloth_Normal, Skin_BaseColor, or NormalMap, BaseColorMap) to matching texture file path."
    )


class ClassifiedObject(BaseModel):
    asset_name: str = Field(description="Name or identifier of the 3D asset.")
    file_path: str = Field(description="Relative or absolute geometry file path of the FBX asset.")
    slots: List[SlotClassification] = Field(description="List of all classified material slots for this asset.")


class BatchClassificationResult(BaseModel):
    objects: Dict[str, ClassifiedObject] = Field(description="Dictionary mapping each asset name to its classified structure.")


# ==============================================================================
# 2. API Key Resolver (Generic Runner Environment)
# ==============================================================================

PROVIDER_DEFAULTS = {
    "groq": {
        "endpoint": "https://api.groq.com/openai/v1",
        "model": "llama-3.3-70b-versatile",
    },
    "gemini": {
        "endpoint": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "model": "gemini-1.5-flash",
    },
    "ollama": {
        "endpoint": "http://localhost:11434/v1",
        "model": "qwen2.5:7b",
    },
    "deepseek": {
        "endpoint": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
    },
    "openai": {
        "endpoint": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
    },
    "openrouter": {
        "endpoint": "https://openrouter.ai/api/v1",
        "model": "meta-llama/llama-3.3-70b-instruct:free",
    },
}


def is_valid_key(val: str) -> bool:
    if not val:
        return False
    v = val.strip().lower()
    if len(v) < 15:
        return False
    if v in {"123456", "12345678", "none", "null", "gemini", "openai"}:
        return False
    return True


def resolve_api_key(explicit_key: str = "", provider: str = "gemini") -> str:
    """
    Resolve API key for AI provider strictly verifying validity:
    1. First priority: runner.toml [env] (always fresh from disk)
       Priority: AI_API_KEY -> {PROVIDER}_API_KEY -> LLM_API_KEY
    2. Explicit key (if valid format and not mock string)
    3. OS Environment variables (validated)
    """
    provider_clean = (provider or "gemini").strip().upper()
    target_env_var = f"{provider_clean}_API_KEY"

    # 1. Read runner.toml directly from disk
    config_paths = [
        r"D:\FullStack\Automation\runner\runner.toml",
        os.path.expandvars(r"%LOCALAPPDATA%\Forgity\runner.toml"),
        os.path.abspath("runner.toml"),
        os.path.join(os.getcwd(), "runner.toml"),
    ]
    for p in config_paths:
        if os.path.isfile(p):
            try:
                import tomllib
                with open(p, "rb") as f:
                    cfg = tomllib.load(f)
                    env_table = cfg.get("env", {})
                    for candidate in [
                        env_table.get("AI_API_KEY"),
                        env_table.get(target_env_var),
                        env_table.get("LLM_API_KEY"),
                        env_table.get("GEMINI_API_KEY"),
                        env_table.get("GROQ_API_KEY"),
                    ]:
                        if candidate and is_valid_key(str(candidate)):
                            return str(candidate).strip()
            except Exception:
                pass

    # 2. Check explicit key
    if explicit_key and is_valid_key(explicit_key):
        return explicit_key.strip()

    # 3. Check OS Environment variable
    for env_var in ["AI_API_KEY", target_env_var, "LLM_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY"]:
        env_val = os.environ.get(env_var, "").strip()
        if is_valid_key(env_val):
            return env_val

    return ""



# ==============================================================================
# 3. Main Tool Entry Point
# ==============================================================================

def main(
    raw_manifest: Union[Dict[str, Any], str],
    contracts: Optional[Dict[str, Any]] = None,
    provider: str = "groq",
    model: str = "llama-3.3-70b-versatile",
    **kwargs
) -> Dict[str, Any]:
    """
    AI-powered Material Manifest Classifier for Unreal Engine 5 Batch Ingestion.
    Sends raw JSON tree directly to LLM for zero-brittle semantic parsing.
    Focuses purely on classifying material slots, textures, and shader parameter mapping.
    Object identity and cloth_type are preserved directly from raw_manifest.

    Args:
        raw_manifest: Raw metadata JSON tree from GetResourceRelativePaths, Blender Inspection, or upstream.
        contracts: Master Material Contracts dictionary (ContentMap) for shader parameter names.
        provider: AI provider ('groq', 'gemini', 'ollama', 'openai', 'deepseek', 'openrouter'). Default 'groq'.
        model: Model identifier such as llama-3.3-70b-versatile, gemini-1.5-flash, or qwen2.5:7b. Default llama-3.3-70b-versatile.
    """
    start_time = time.time()
    api_key = kwargs.get("api_key", "")
    endpoint = kwargs.get("endpoint", "")
    folder_path = kwargs.get("folder_path", "")

    # Backward compatibility: read cloth_map from kwargs if passed
    cloth_map = kwargs.get("cloth_map")
    resolved_cloth_map: Dict[str, str] = {}
    if cloth_map:
        if isinstance(cloth_map, str) and cloth_map.strip().startswith("{"):
            try:
                resolved_cloth_map = json.loads(cloth_map)
            except Exception:
                pass
        elif isinstance(cloth_map, dict):
            resolved_cloth_map = cloth_map

    # 1. Parse raw_manifest to Python object if string
    if isinstance(raw_manifest, str):
        if os.path.isfile(raw_manifest):
            with open(raw_manifest, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
        else:
            try:
                raw_data = json.loads(raw_manifest)
            except Exception:
                raw_data = {"raw_text": raw_manifest}
    elif isinstance(raw_manifest, dict):
        raw_data = raw_manifest
    else:
        raw_data = {}

    if not raw_data:
        print("[classify_material_manifest] [WARN] Empty input manifest.", flush=True)
        return {"manifest": {}, "summary": "Empty input"}

    # 2. Parse project contracts if provided
    raw_contracts = contracts or kwargs.get("contracts_map")
    normalized_contracts: Dict[str, Any] = {}
    if isinstance(raw_contracts, str):
        try:
            normalized_contracts = json.loads(raw_contracts)
        except Exception:
            pass
    elif isinstance(raw_contracts, dict):
        normalized_contracts = raw_contracts

    contract_summary: Dict[str, Any] = {}
    if normalized_contracts:
        for c_name, c_data in normalized_contracts.items():
            if isinstance(c_data, dict):
                t_params = c_data.get("texture_map") or c_data.get("texture_params") or {}
                if isinstance(t_params, str):
                    try:
                        t_params = json.loads(t_params)
                    except Exception:
                        t_params = {}
                contract_summary[c_name] = t_params if isinstance(t_params, dict) else {}

    # 3. Setup AI Provider, Endpoint, Model & Client
    if not HAS_OPENAI:
        raise RuntimeError(
            "[classify_material_manifest] Missing required Python package 'openai'. "
            "Please install it using 'pip install openai'."
        )

    provider_key = (provider or "gemini").strip().lower()
    default_config = PROVIDER_DEFAULTS.get(provider_key, {})

    target_endpoint = (endpoint or "").strip() or default_config.get("endpoint", "")
    target_model = (model or "").strip()
    if not target_model or (provider_key == "groq" and "gemini" in target_model) or (provider_key == "gemini" and "llama" in target_model):
        target_model = default_config.get("model", "llama-3.3-70b-versatile" if provider_key == "groq" else "gemini-1.5-flash")

    resolved_key = resolve_api_key(api_key, provider_key)
    print(f"[classify_material_manifest] [INFO] Provider: '{provider_key}', Model: '{target_model}', Endpoint: '{target_endpoint or 'default'}'", flush=True)

    is_local_ollama = provider_key == "ollama" or "11434" in target_endpoint

    if not resolved_key and not is_local_ollama:
        raise RuntimeError(
            f"[classify_material_manifest] No API key found for provider '{provider_key}'. "
            f"Please configure AI_API_KEY (or {provider_key.upper()}_API_KEY) in runner.toml or OS environment."
        )

    if is_local_ollama:
        client = OpenAI(api_key="ollama", base_url=target_endpoint or "http://localhost:11434/v1")
    else:
        client = OpenAI(api_key=resolved_key, base_url=target_endpoint or None)

    # 4. Build Prompts
    contract_section = ""
    if contract_summary:
        contract_section = (
            "\nPROJECT MASTER MATERIAL CONTRACTS:\n"
            "Each contract defines expected shader parameters and their map type (e.g. BASE_COLOR, NORMAL, MASKS/ORM, ART, GRAYSCALE):\n"
            f"{json.dumps(contract_summary, indent=2)}\n\n"
            "RULES WHEN MATCHING CONTRACTS:\n"
            "- Set 'material_tag' to the matched contract key (Cloth, Skin, Eye, Hair, Mouth, etc.).\n"
            "- In 'textures', map each texture file to the exact shader parameter name based on its texture type.\n"
            "- If no contract matches a slot, use standard PBR parameter names (BaseColorMap, NormalMap, ORMMap, OpacityMap).\n"
        )

    system_prompt = (
        "You are an expert 3D Technical Artist and Unreal Engine 5 Pipeline Automation Engineer.\n"
        "Your mission is to analyze a raw metadata JSON tree representing 3D assets, discover all meshes, "
        "their material slots, and map available texture files to appropriate shader parameters.\n\n"
        "INSTRUCTIONS:\n"
        "1. Identify all 3D assets in the input JSON tree (e.g. from keys, 'asset_name', or 'file_name').\n"
        "2. Locate their geometry file path (e.g. 'relative_path' or 'file_path').\n"
        "3. Locate all material slots for each mesh (e.g. from 'slots', 'fbx_slots', or nested 'objects').\n"
        "4. Assign each slot a semantic 'material_tag' (Cloth for clothing/fabrics, Skin for human body/face, Eye, Hair, Mouth, etc.).\n"
        "5. For each slot, map its available texture files to appropriate shader parameter names (NormalMap, BaseColorMap, etc.).\n"
        "6. In 'textures' and 'file_path', you MUST preserve the EXACT FULL FILE PATHS from the input metadata. Do NOT shorten, truncate, or convert them to relative paths.\n"
        f"{contract_section}\n"
        "OUTPUT SCHEMA REQUIREMENT:\n"
        "You MUST return a JSON object with this exact top-level structure:\n"
        "{\n"
        '  "objects": {\n'
        '    "<asset_name>": {\n'
        '      "asset_name": "<name>",\n'
        '      "file_path": "<relative_or_absolute_fbx_path>",\n'
        '      "slots": [\n'
        '        {\n'
        '          "slot_name": "<exact slot name on mesh>",\n'
        '          "material_tag": "<Cloth/Skin/Eye/Hair/Mouth/etc>",\n'
        '          "textures": {\n'
        '            "<ShaderParamName>": "<texture_file_path>"\n'
        "          }\n"
        "        }\n"
        "      ]\n"
        "    }\n"
        "  }\n"
        "}"
    )

    user_prompt = f"Analyze the following raw metadata JSON tree and produce the classified material structure:\n\n```json\n{json.dumps(raw_data, indent=2)}\n```"

    print(f"[classify_material_manifest] [INFO] Sending raw JSON tree to {target_model} ({provider_key})...", flush=True)

    max_retries = 3
    parsed_ai = {}
    for attempt in range(1, max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=target_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"}
            )
            content = response.choices[0].message.content or "{}"
            parsed_ai = json.loads(content)
            break
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                wait_secs = attempt * 4
                print(f"[classify_material_manifest] [WARNING] Hit rate limit 429 on attempt {attempt}/{max_retries}. Waiting {wait_secs}s before retry...", flush=True)
                time.sleep(wait_secs)
                if attempt == max_retries:
                    raise RuntimeError(
                        f"[classify_material_manifest] Quota exhausted (429) for provider '{provider_key}' model '{target_model}'. "
                        f"Suggestion: Switch provider to 'groq' (14,400 free requests/day) or use local 'ollama'. Details: {e}"
                    ) from e
            else:
                raise RuntimeError(
                    f"[classify_material_manifest] AI material classification failed using model '{target_model}' ({provider_key}): {e}"
                ) from e

    # 5. Format & Post-process for Unreal Engine setup_asset_materials.py
    ai_objects = parsed_ai.get("objects", {})
    resolved_manifest: Dict[str, Any] = {}

    for obj_name, obj_data in ai_objects.items():
        asset_name = obj_data.get("asset_name") or obj_name
        file_path = obj_data.get("file_path") or ""

        # Extract raw object metadata from input for reverse lookup fallback
        raw_obj_meta = {}
        if isinstance(raw_data, dict):
            raw_obj_meta = (
                raw_data.get("objects", {}).get(obj_name, {})
                or raw_data.get("objects", {}).get(asset_name, {})
                or raw_data.get(obj_name, {})
                or raw_data.get(asset_name, {})
            )
            if not isinstance(raw_obj_meta, dict):
                raw_obj_meta = {}

        # Collect all known raw texture paths from raw metadata for reverse lookup
        known_raw_textures: List[str] = []
        if "raw_textures" in raw_obj_meta and isinstance(raw_obj_meta["raw_textures"], list):
            known_raw_textures.extend([str(p).replace("\\", "/") for p in raw_obj_meta["raw_textures"] if p])
        for raw_slot in raw_obj_meta.get("slots", []):
            if isinstance(raw_slot, dict):
                raw_slot_tex = raw_slot.get("textures", [])
                if isinstance(raw_slot_tex, list):
                    known_raw_textures.extend([str(p).replace("\\", "/") for p in raw_slot_tex if p])
                elif isinstance(raw_slot_tex, dict):
                    known_raw_textures.extend([str(p).replace("\\", "/") for p in raw_slot_tex.values() if p])

        def _resolve_to_full_path(candidate_p: str) -> str:
            if not candidate_p:
                return ""
            c_clean = candidate_p.strip().replace("\\", "/")
            if os.path.isabs(c_clean):
                return c_clean
            # Reverse lookup in known_raw_textures by suffix or base filename
            c_base = os.path.basename(c_clean).lower()
            for raw_p in known_raw_textures:
                if raw_p.endswith(c_clean) or os.path.basename(raw_p).lower() == c_base:
                    return raw_p
            # Fallback to folder_path if supplied
            if folder_path:
                norm_cand = os.path.normpath(os.path.join(folder_path, c_clean)).replace("\\", "/")
                return norm_cand
            return c_clean

        # Recover full file_path of mesh if truncated
        if not os.path.isabs(file_path):
            raw_file_p = raw_obj_meta.get("file_path") or raw_obj_meta.get("local_path")
            if raw_file_p and os.path.isabs(str(raw_file_p)):
                file_path = str(raw_file_p).replace("\\", "/")
            elif folder_path:
                file_path = os.path.normpath(os.path.join(folder_path, file_path)).replace("\\", "/")

        slots_list = obj_data.get("slots", [])
        formatted_slots = []

        for idx, s in enumerate(slots_list):
            s_name = s.get("slot_name") or s.get("name") or f"Slot_{idx}"
            s_tag = s.get("material_tag") or s.get("tag") or "Generic"
            s_textures = s.get("textures") or {}

            # Normalize texture paths to full absolute paths via Reverse Lookup
            clean_textures: Dict[str, str] = {}
            for param_k, tex_p in s_textures.items():
                if not tex_p:
                    continue
                clean_textures[str(param_k)] = _resolve_to_full_path(str(tex_p))

            formatted_slots.append({
                "name": s_name,
                "material_tag": s_tag,
                "tag": s_tag,
                "index": idx,
                "slot_anchor": f"slots[{idx}]",
                "textures": clean_textures
            })

        # Resolve cloth_type with precedence:
        # 1. Explicit cloth_map from classify_mesh_types
        # 2. Existing cloth_type in raw_manifest (from inspect_separated_meshes / export_fbx)
        # 3. AI returned cloth_type
        # 4. Fallback to "Cloth" if any slot tag is "Cloth"
        raw_obj_meta = {}
        if isinstance(raw_data, dict):
            raw_obj_meta = (
                raw_data.get("objects", {}).get(obj_name, {})
                or raw_data.get("objects", {}).get(asset_name, {})
                or raw_data.get(obj_name, {})
                or raw_data.get(asset_name, {})
            )
            if not isinstance(raw_obj_meta, dict):
                raw_obj_meta = {}

        cloth_type = (
            resolved_cloth_map.get(asset_name)
            or resolved_cloth_map.get(obj_name)
            or raw_obj_meta.get("cloth_type")
            or obj_data.get("cloth_type")
        )

        resolved_manifest[asset_name] = {
            "asset_name": asset_name,
            "cloth_type": cloth_type,
            "file_path": file_path,
            "slot_count": len(formatted_slots),
            "slots": formatted_slots
        }

    elapsed_time = time.time() - start_time
    total_slots = sum(o["slot_count"] for o in resolved_manifest.values())
    summary = f"Classified {len(resolved_manifest)} object(s) with {total_slots} total slots in {elapsed_time:.2f}s"
    print(f"[classify_material_manifest] [SUCCESS] {summary}", flush=True)

    return {
        "manifest": resolved_manifest,
        "summary": summary
    }


classify_manifest = main


if __name__ == "__main__":
    if len(sys.argv) > 1:
        res = main(sys.argv[1])
        print(json.dumps(res, indent=2))
    else:
        print("Usage: python classify_material_manifest.py <raw_manifest.json>")
