# pyrefly: ignore [missing-import]
"""
AI Mesh Role & Cloth Type Classifier (Early Topology Discovery)
Runs on Agent Worker Daemon (Generic Python Executor)

Consumes:
  1. raw_metadata: Raw JSON metadata tree (from DAZ inspector, Blender inspect, or list of mesh names).
  2. contracts: Target modular appearance categories (e.g. ['Top', 'Bottom', 'Shoes', 'Hair', 'Body']). Required.
  3. provider (optional): 'gemini' (default), 'openai', or 'ollama'.
  4. model (optional): 'gemini-2.5-flash' (default), or local model.

Outputs:
  - body_meshes: List of character body mesh names (e.g. ['Genesis 8 Female']) for baking.
  - cloth_map: Dictionary mapping each clothing mesh to its classified cloth_type, e.g. {'Warrior_Cuirass': 'Top'}.
  - clothes: List of clothing mesh names.
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
# 1. API Key Resolver (OS Environment & runner.toml only)
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


def parse_gameplay_tags_ini(tags_ini_path: str) -> List[str]:
    """Parse GameplayTags from DefaultGameplayTags.ini file or directory."""
    if not tags_ini_path:
        return []
    p = os.path.abspath(tags_ini_path.strip().strip('"').strip("'"))
    if os.path.isdir(p):
        for candidate in [
            os.path.join(p, "Config", "DefaultGameplayTags.ini"),
            os.path.join(p, "DefaultGameplayTags.ini"),
        ]:
            if os.path.isfile(candidate):
                p = candidate
                break

    if not os.path.isfile(p):
        return []

    tags: List[str] = []
    import re
    try:
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                m = re.search(r'Tag="([^"]+)"', line)
                if m:
                    tag = m.group(1).strip()
                    if tag and tag not in tags:
                        tags.append(tag)
    except Exception as ex:
        print(f"[classify_mesh_types] Warning reading tags ini '{p}': {ex}", flush=True)

    return tags


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
                    # AI_API_KEY is universal top priority
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
    contracts: Optional[List[str]] = None,
    tags_ini_path: str = "",
    endpoint: str = "groq",
    model: str = "qwen/qwen3.8-27b",
    notes: str = "",
    **kwargs
) -> Dict[str, Any]:
    """
    AI-powered Mesh Role & Modular Cloth Classifier.
    Analyzes raw 3D metadata tree (DAZ inspect, Blender scene, or mesh list)
    to discover character body mesh (for baking) and modular clothing slots
    (Top, Bottom, Shoes, etc. for batch FBX export & Unreal registration).

    Args:
        raw_metadata: Raw JSON metadata text/string (e.g. from Metadata JSON or file path).
        contracts: Target modular appearance categories (e.g. ['Top', 'Bottom', 'Shoes', 'Hair', 'Body']). Optional if tags_ini_path provided.
        tags_ini_path: Optional path to Unreal Project DefaultGameplayTags.ini file or Config/ folder to read available tags.
        endpoint: AI provider alias ('groq', 'gemini', 'ollama', 'openai') or custom URL ('http://localhost:11434/v1'). Default 'groq'.
        model: Model identifier such as llama-3.3-70b-versatile, gemini-1.5-flash, or qwen2.5:7b. Default llama-3.3-70b-versatile.
        notes: Optional user notes or prompt injection instructions for special clothing roles or hints.

    Returns:
        {
            "body_meshes": List[str],
            "cloth_map": Dict[str, str],
            "clothes": List[str]
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

    # 2. Parse contracts and/or tags_ini_path
    ini_tags = parse_gameplay_tags_ini(tags_ini_path) if tags_ini_path else []
    target_slots: List[str] = []
    if contracts:
        if isinstance(contracts, list):
            target_slots = [str(x).strip() for x in contracts if str(x).strip()]
        elif isinstance(contracts, str):
            if contracts.strip().startswith("["):
                try:
                    parsed = json.loads(contracts)
                    if isinstance(parsed, list):
                        target_slots = [str(x).strip() for x in parsed if str(x).strip()]
                except Exception:
                    pass
            if not target_slots:
                target_slots = [c.strip() for c in contracts.split(",") if c.strip()]

    standard_slots = ["Top", "Inner_Top", "Bottom", "Inner_Bottom", "Shoes", "Hair", "Accessory", "Body"]

    # Combine explicit contracts or standard slots with ini tags
    if not target_slots:
        target_slots = list(standard_slots)
        if ini_tags:
            for t in ini_tags:
                if t not in target_slots:
                    target_slots.append(t)
    elif ini_tags:
        for t in ini_tags:
            if t not in target_slots:
                target_slots.append(t)

    # 3. Setup AI Provider, Endpoint, Model & Client
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

    # 4. Prepare Prompts
    system_prompt = (
        "You are an expert 3D Technical Artist and Unreal Engine 5 Character Pipeline Automation Engineer.\n"
        "Your mission is to analyze a raw metadata JSON tree or list of 3D objects/meshes (e.g. from DAZ inspection metadata, Blender scene objects, or FBX/asset manifests) "
        "and classify them into their exact semantic roles.\n\n"
        "TARGET MODULAR SLOTS / CATEGORIES:\n"
        f"{json.dumps(target_slots, indent=2)}\n\n"
        "INSTRUCTIONS & RULES:\n"
        "1. Discover all 3D mesh assets/figures present in the input JSON (whether in 'objects', 'nodes', keys, or a direct list).\n"
        "2. 'body_mesh': Identify character body/skin meshes (e.g. Genesis 8 Female, Genesis9, Body_GND) to be baked. Return as a list of mesh names (e.g. [\"Genesis 8 Female\"]), or [] if no body is found.\n"
        "3. 'cloth_map': Map each clothing item/mesh name to one of the target modular categories or GameplayTags listed above. "
        "If a specific GameplayTag matching the slot (e.g. System.Wardrobe.Slots.Hair) exists in the list, prefer using that tag; "
        "otherwise use the appropriate standard category name (e.g. Inner_Top, Inner_Bottom, Top, Bottom, Shoes, Hair). "
        "Use the exact original mesh name found in the input!\n\n"
        "OUTPUT SCHEMA REQUIREMENT:\n"
        "You MUST return a JSON object with this exact structure:\n"
        "{\n"
        '  "body_mesh": ["<exact mesh name>"],\n'
        '  "cloth_map": {\n'
        '    "<mesh_name>": "<Modular_Slot_Name>"\n'
        '  }\n'
        "}"
    )

    user_prompt_parts = [
        "Analyze the following raw 3D metadata tree or mesh list, discover all relevant objects/meshes, "
        "and produce the classified mesh structure:\n",
        f"```json\n{json.dumps(raw_data, indent=2)}\n```"
    ]
    if ini_tags:
        user_prompt_parts.append(
            f"\nPROJECT GAMEPLAY TAGS CONTEXT (Prefer matching slot tags from this list when applicable):\n```json\n{json.dumps(ini_tags, indent=2)}\n```"
        )
    if notes and str(notes).strip():
        user_prompt_parts.append(f"\nSPECIAL USER INSTRUCTIONS / NOTES:\n{str(notes).strip()}")

    user_prompt = "\n".join(user_prompt_parts)

    print(f"[classify_mesh_types] [INFO] Sending raw 3D metadata tree to {target_model} ({provider_key})...", flush=True)

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
                print(f"[classify_mesh_types] [WARNING] Hit rate limit 429 on attempt {attempt}/{max_retries}. Waiting {wait_secs}s before retry...", flush=True)
                time.sleep(wait_secs)
                if attempt == max_retries:
                    raise RuntimeError(
                        f"[classify_mesh_types] Quota exhausted (429) for provider '{provider_key}' model '{target_model}'. "
                        f"Suggestion: Switch provider to 'groq' (14,400 free requests/day) or use local 'ollama'. Details: {e}"
                    ) from e
            else:
                raise RuntimeError(
                    f"[classify_mesh_types] AI mesh classification failed using model '{target_model}' ({provider_key}): {e}"
                ) from e

    # 5. Extract & Normalize Output
    raw_body = parsed.get("body_mesh")
    body_mesh: List[str] = []
    if isinstance(raw_body, list):
        body_mesh = [str(x).strip() for x in raw_body if str(x).strip()]
    elif isinstance(raw_body, str) and raw_body.strip():
        body_mesh = [raw_body.strip()]

    cloth_map = parsed.get("cloth_map", {})
    if not isinstance(cloth_map, dict):
        cloth_map = {}

    clothes = list(cloth_map.keys())

    elapsed = time.time() - start_time
    print(f"[classify_mesh_types] [SUCCESS] Classified: body_mesh={body_mesh}, {len(cloth_map)} clothing item(s) in {elapsed:.2f}s.", flush=True)

    return {
        "body_meshes": body_mesh,
        "cloth_map": cloth_map,
        "clothes": clothes,
    }


classify_meshes = main


if __name__ == "__main__":
    sample_contracts = ["Top", "Bottom", "Shoes", "Hair", "Body"]
    if len(sys.argv) > 1:
        res = main(sys.argv[1], contracts=sample_contracts)
        print(json.dumps(res, indent=2))
    else:
        sample_daz_metadata = {
            "summary": "DAZ 'Sam.duf': 5 Objects",
            "objects": [
                {"name": "Genesis 8 Female", "type": "Character Figure"},
                {"name": "Tactical_Combat_Shirt", "type": "Mesh Asset"},
                {"name": "Skinny_Jeans_Bottom", "type": "Mesh Asset"},
                {"name": "Combat_Boots", "type": "Mesh Asset"},
                {"name": "Long_Wavy_Hair", "type": "Mesh Asset"}
            ]
        }
        print("Sample run with DAZ metadata tree and required contracts:")
        print(json.dumps(main(sample_daz_metadata, contracts=sample_contracts), indent=2))
