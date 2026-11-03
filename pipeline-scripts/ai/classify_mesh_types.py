# pyrefly: ignore [missing-import]
"""
AI Mesh Role & Geometry Separator (Early Topology Discovery)
Runs on Agent Worker Daemon (Generic Python Executor)

Consumes:
  1. raw_metadata: Raw JSON metadata tree (from DAZ inspector, Blender inspect, or list of mesh names).
  2. provider (optional): 'groq' (default), 'gemini', 'openai', or 'ollama'.
  3. model (optional): 'qwen/qwen3.8-27b' (default), or local model.

Outputs:
  - body_meshes: List of character body mesh names (e.g. ['Genesis 9']) for baking and base character avatar.
  - wardrobe_items: List of structured wardrobe items with grouped sub-meshes (e.g. [{'name': 'Messy_High_Ponytail_Hair', 'meshes': ['...Hair', '...Hair_Scalp'], 'role': 'Hair'}]).
  - clothes: List of clean clothing item names (e.g. ['Messy_High_Ponytail_Hair', 'Flirty_Party_Dress']).
  - clothes_flat: Flattened list of all individual sub-mesh names.
"""

import os
import sys
import time
import json
from typing import List, Dict, Optional, Any, Union, Tuple

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    OpenAI = None
    HAS_OPENAI = False


# ==============================================================================
# 1. API Key & Endpoint Resolver
# ==============================================================================

def is_valid_key(val: str) -> bool:
    if not val:
        return False
    v = val.strip().lower()
    if len(v) < 15:
        return False
    if v in {"123456", "12345678", "none", "null", "gemini", "openai"}:
        return False
    return True


PROVIDER_DEFAULTS = {
    "groq": {
        "endpoint": "https://api.groq.com/openai/v1",
        "model": "qwen/qwen3.8-27b",
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


def resolve_endpoint_and_provider(endpoint_or_provider: str, model_candidate: str = "") -> Tuple[str, str, str, bool]:
    """
    Resolves unified endpoint input into (base_url, provider_key, target_model, is_local).
    Accepts:
      - Short aliases: 'groq', 'gemini', 'ollama', 'openai', 'deepseek', 'openrouter'
      - Direct URLs: 'http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', 'https://api.groq.com/openai/v1'
    """
    raw = (endpoint_or_provider or "groq").strip()
    raw_lower = raw.lower()

    if raw_lower.startswith(("http://", "https://")):
        is_local = any(h in raw_lower for h in ["localhost", "127.0.0.1", ":11434", ":1234", ":8000"])
        provider_key = "ollama" if ("11434" in raw_lower or "ollama" in raw_lower) else "custom"
        for p in PROVIDER_DEFAULTS.keys():
            if p in raw_lower:
                provider_key = p
                break
        target_model = model_candidate.strip() if model_candidate else ("qwen2.5:7b" if is_local else "llama-3.3-70b-versatile")
        return raw, provider_key, target_model, is_local

    provider_key = raw_lower if raw_lower in PROVIDER_DEFAULTS else "groq"
    default_config = PROVIDER_DEFAULTS[provider_key]
    target_endpoint = default_config["endpoint"]
    target_model = model_candidate.strip() or default_config["model"]
    if provider_key == "groq" and "llama" in target_model.lower():
        target_model = "qwen/qwen3.8-27b"
    is_local = provider_key == "ollama"
    return target_endpoint, provider_key, target_model, is_local


def resolve_api_key(provider: str = "gemini") -> str:
    """
    Resolve API key strictly from runner.toml and OS Environment.
    Priority: AI_API_KEY -> {PROVIDER}_API_KEY -> LLM_API_KEY -> GEMINI_API_KEY.
    """
    provider_clean = (provider or "gemini").strip().upper()
    target_env_var = f"{provider_clean}_API_KEY"

    # 1. First priority: Read directly from runner.toml (always fresh from disk)
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

    # 2. Second priority: OS Environment variable
    for env_var in ["AI_API_KEY", target_env_var, "LLM_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY"]:
        env_val = os.environ.get(env_var, "").strip()
        if is_valid_key(env_val):
            return env_val

    return ""


# ==============================================================================
# 2. Main Tool Entry Point
# ==============================================================================

def main(
    raw_metadata: str,
    contracts: Optional[Any] = None,
    endpoint: str = "groq",
    model: str = "qwen/qwen3.8-27b",
    notes: str = "",
    **kwargs
) -> Dict[str, Any]:
    """
    Decoupled AI 3D Mesh Role Separator.
    Pure geometric discovery: identifies character body/skin mesh (for baking/rigging)
    and modular clothing/wearable meshes (for FBX packaging), with zero Game-Contract coupling.

    Args:
        raw_metadata: Raw JSON metadata text/string (e.g. from Metadata JSON or file path).
        endpoint: AI provider alias ('groq', 'gemini', 'ollama', 'openai') or custom URL. Default 'groq'.
        model: Model identifier. Default 'qwen/qwen3.8-27b'.
        notes: Optional user notes or prompt injection instructions for special clothing roles.

    Returns:
        {
            "body_meshes": List[str],
            "clothes": List[str],
            "cloth_map": Dict[str, str],
            "is_monolithic": bool,
            "summary": str
        }
    """
    start_time = time.time()

    # 1. Parse raw_metadata to Python object
    input_source = raw_metadata or kwargs.get("mesh_names") or kwargs.get("metadata") or kwargs.get("manifest")
    if isinstance(input_source, str):
        if os.path.isfile(input_source):
            with open(input_source, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
        else:
            try:
                raw_data = json.loads(input_source)
            except Exception:
                if "," in input_source:
                    raw_data = [x.strip() for x in input_source.split(",") if x.strip()]
                else:
                    raw_data = {"raw_text": input_source}
    elif isinstance(input_source, (dict, list)):
        raw_data = input_source
    else:
        raw_data = []

    if not raw_data:
        raise RuntimeError("[classify_mesh_types] Empty or invalid input 'raw_metadata'.")

    # 2. Setup AI Provider, Endpoint, Model & Client
    if not HAS_OPENAI:
        raise RuntimeError(
            "[classify_mesh_types] Missing required Python package 'openai'. "
            "Please install it using 'pip install openai'."
        )

    endpoint_param = endpoint or kwargs.get("provider") or "groq"
    target_endpoint, provider_key, target_model, is_local = resolve_endpoint_and_provider(endpoint_param, model)

    resolved_key = resolve_api_key(provider_key)
    print(f"[classify_mesh_types] [INFO] Provider: '{provider_key}', Model: '{target_model}', Endpoint: '{target_endpoint}' (Local: {is_local})", flush=True)

    if not resolved_key and not is_local:
        raise RuntimeError(
            f"[classify_mesh_types] No API key found for provider '{provider_key}'. "
            f"Please configure AI_API_KEY (or {provider_key.upper()}_API_KEY) in runner.toml or OS environment."
        )

    client = OpenAI(
        api_key="local-llm" if is_local else resolved_key,
        base_url=target_endpoint or None
    )

    # 3. Pure Geometric Separation & Semantic Clustering Prompt
    system_prompt = (
        "You are an expert 3D Technical Artist and Character Pipeline Automation Engineer.\n"
        "Your mission is to analyze a list or metadata tree of 3D objects/meshes from a character scene (DAZ Studio / Blender) and:\n"
        "1. Identify 'body_meshes': Character body / anatomical figure meshes (e.g. Genesis 8 Female, Genesis 9, Body, Head, Eyes, Eyelashes, Mouth, Teeth, Cornea) to be retained as the base avatar.\n"
        "2. Group modular wearable items into 'wardrobe_items' with SEMANTIC CLUSTERING:\n"
        "   - CRITICAL CLUSTERING RULE: If multiple sub-meshes are components of ONE functional garment, hair piece, or pair, you MUST group them together into a single item!\n"
        "     * Hair and Scalp/Cap (e.g. ['FE_Messy_High_Ponytail_Hair', 'FE_Messy_High_Ponytail_Hair_Scalp']) MUST be grouped into ONE item (name: 'Messy_High_Ponytail_Hair', role: 'Hair').\n"
        "     * Paired items like shoes, boots, gloves, earrings (e.g. ['Boot_Left', 'Boot_Right']) MUST be grouped into ONE item (name: 'Boots', role: 'Shoes').\n"
        "     * Main cloth and subordinate trims/straps/buttons/bows (e.g. ['Dress', 'Dress_Straps', 'Dress_Belt']) MUST be grouped into ONE item.\n"
        "     * Standalone garments (e.g. ['A_Bra_Brown']) remain in their own item group.\n"
        "   - 'name': Clean, human-readable identifier (e.g. 'Messy_High_Ponytail_Hair', 'Flirty_Party_Dress', 'Brown_Bra').\n"
        "   - 'meshes': List of EXACT mesh names from the input belonging to this item.\n"
        "   - 'role': Semantic role (e.g. 'Hair', 'Top', 'Bottom', 'Dress', 'Shoes', 'Underwear', 'Accessory').\n\n"
        "CRITICAL RULES:\n"
        "- Return the EXACT object/mesh names found in the input inside 'meshes' and 'body_meshes'.\n"
        "- Anatomical parts (Eyes, Teeth, Tongue, Eyelashes, Cornea, Tear) belong in 'body_meshes', NEVER in 'wardrobe_items'!\n"
        "- Filter out non-mesh helpers, bone widgets, cameras, and lights.\n\n"
        "OUTPUT FORMAT (STRICT JSON):\n"
        "{\n"
        '  "body_meshes": ["<exact body mesh name>"],\n'
        '  "wardrobe_items": [\n'
        '    {\n'
        '      "name": "<clean item name>",\n'
        '      "meshes": ["<exact mesh 1>", "<exact mesh 2>"],\n'
        '      "role": "<role>"\n'
        '    }\n'
        '  ]\n'
        "}"
    )

    user_prompt_parts = [
        "Analyze the following 3D scene objects/metadata and classify them into body_mesh and clothes:\n",
        f"```json\n{json.dumps(raw_data, indent=2)}\n```"
    ]
    if notes and str(notes).strip():
        user_prompt_parts.append(f"\nSPECIAL USER NOTES / HINTS:\n{str(notes).strip()}")

    user_prompt = "\n".join(user_prompt_parts)

    print(f"[classify_mesh_types] [INFO] Sending scene mesh list to {target_model} ({provider_key})...", flush=True)

    max_retries = 3
    parsed = {}
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
            parsed = json.loads(content)
            break
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                wait_secs = attempt * 4
                print(f"[classify_mesh_types] [WARNING] Rate limit 429 on attempt {attempt}/{max_retries}. Waiting {wait_secs}s...", flush=True)
                time.sleep(wait_secs)
                if attempt == max_retries:
                    raise RuntimeError(
                        f"[classify_mesh_types] Quota exhausted (429) for provider '{provider_key}'. Details: {e}"
                    ) from e
            else:
                raise RuntimeError(
                    f"[classify_mesh_types] AI mesh separation failed using model '{target_model}' ({provider_key}): {e}"
                ) from e

    # 4. Extract & Normalize Output
    raw_body = parsed.get("body_meshes") or parsed.get("body_mesh", [])
    body_meshes: List[str] = []
    if isinstance(raw_body, list):
        body_meshes = [str(x).strip() for x in raw_body if str(x).strip()]
    elif isinstance(raw_body, str) and raw_body.strip():
        body_meshes = [raw_body.strip()]

    # Extract structured wardrobe items (Semantic Groups)
    raw_wardrobe = parsed.get("wardrobe_items", [])
    wardrobe_items: List[Dict[str, Any]] = []

    if isinstance(raw_wardrobe, list) and raw_wardrobe:
        for it in raw_wardrobe:
            if not isinstance(it, dict):
                continue
            item_name = str(it.get("name") or "").strip()
            item_role = str(it.get("role") or "Wardrobe").strip()
            raw_submeshes = it.get("meshes", [])
            submeshes: List[str] = []
            if isinstance(raw_submeshes, list):
                submeshes = [str(m).strip() for m in raw_submeshes if str(m).strip()]
            elif isinstance(raw_submeshes, str) and raw_submeshes.strip():
                submeshes = [raw_submeshes.strip()]

            if not item_name and submeshes:
                item_name = submeshes[0]

            if item_name and submeshes:
                wardrobe_items.append({
                    "name": item_name,
                    "meshes": submeshes,
                    "role": item_role
                })

    # Fallback if AI returned legacy flat 'clothes' format
    if not wardrobe_items:
        raw_clothes = parsed.get("clothes", [])
        legacy_list: List[str] = []
        if isinstance(raw_clothes, list):
            legacy_list = [str(x).strip() for x in raw_clothes if str(x).strip()]
        elif isinstance(raw_clothes, dict):
            legacy_list = [str(k).strip() for k in raw_clothes.keys() if str(k).strip()]
        elif isinstance(raw_clothes, str) and raw_clothes.strip():
            legacy_list = [raw_clothes.strip()]

        for c_mesh in legacy_list:
            wardrobe_items.append({
                "name": c_mesh,
                "meshes": [c_mesh],
                "role": "Wardrobe"
            })

    # Clean representation lists
    clothes: List[str] = [it["name"] for it in wardrobe_items]
    clothes_flat: List[str] = []
    for it in wardrobe_items:
        for m in it["meshes"]:
            if m not in clothes_flat:
                clothes_flat.append(m)

    is_monolithic = len(wardrobe_items) == 0
    elapsed = time.time() - start_time
    summary = (
        f"Semantic Geometry Separation: {len(body_meshes)} Body Mesh(es) ({body_meshes}), "
        f"{len(wardrobe_items)} Wardrobe Group(s) ({len(clothes_flat)} sub-meshes) in {elapsed:.2f}s. "
        f"Structure: {'Monolithic (Full Body)' if is_monolithic else 'Modular (Wardrobe Array)'}."
    )
    print(f"[classify_mesh_types] [SUCCESS] {summary}", flush=True)

    return {
        "body_meshes": body_meshes,
        "wardrobe_items": wardrobe_items,
        "clothes": clothes,
        "clothes_flat": clothes_flat,
        "is_monolithic": is_monolithic,
        "summary": summary
    }


classify_meshes = main


if __name__ == "__main__":
    if len(sys.argv) > 1:
        res = main(sys.argv[1])
        print(json.dumps(res, indent=2))
    else:
        sample_daz_metadata = {
            "summary": "DAZ 'Laura.duf': 5 Objects",
            "objects": [
                {"name": "Genesis 9", "type": "Character Figure"},
                {"name": "A_Bra_Brown", "type": "Mesh Asset"},
                {"name": "A_Leggings_Brown", "type": "Mesh Asset"},
                {"name": "A_Shoes_Brown", "type": "Mesh Asset"},
                {"name": "Long_Wavy_Hair", "type": "Mesh Asset"}
            ]
        }
        print("Sample run with DAZ metadata tree (Pure Geometric Separation):")
        print(json.dumps(main(sample_daz_metadata), indent=2))
