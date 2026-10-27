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
from typing import List, Dict, Optional, Any, Union

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


def resolve_api_key(provider: str = "gemini") -> str:
    """
    Resolve API key strictly from runner.toml and OS Environment.
    Validates key format and ignores mock/stale environment variables.
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
                        env_table.get(target_env_var),
                        env_table.get("GEMINI_API_KEY"),
                        env_table.get("AI_API_KEY"),
                        env_table.get("LLM_API_KEY"),
                    ]:
                        if candidate and is_valid_key(str(candidate)):
                            return str(candidate).strip()
            except Exception:
                pass

    # 2. Second priority: OS Environment variable (validate to avoid stale mock keys)
    for env_var in [target_env_var, "GEMINI_API_KEY", "AI_API_KEY", "LLM_API_KEY", "GOOGLE_API_KEY"]:
        env_val = os.environ.get(env_var, "").strip()
        if is_valid_key(env_val):
            return env_val

    return ""



# ==============================================================================
# 2. Main Tool Entry Point
# ==============================================================================

def main(
    raw_metadata: str,
    contracts: List[str],
    provider: str = "gemini",
    model: str = "gemini-2.5-flash",
    **kwargs
) -> Dict[str, Any]:
    """
    AI-powered Mesh Role & Modular Cloth Classifier.
    Analyzes raw 3D metadata tree (DAZ inspect, Blender scene, or mesh list)
    to discover character body mesh (for baking) and modular clothing slots
    (Top, Bottom, Shoes, etc. for batch FBX export & Unreal registration).

    Args:
        raw_metadata: Raw JSON metadata text/string (e.g. from Metadata JSON or file path).
        contracts: Target modular appearance categories (e.g. ['Top', 'Bottom', 'Shoes', 'Hair', 'Body']). Required.
        provider: AI provider ('gemini', 'openai', 'ollama'). Default 'gemini'.
        model: Model identifier. Default 'gemini-2.5-flash'.

    Returns:
        {
            "body_meshes": List[str],
            "cloth_map": Dict[str, str],
            "clothes": List[str]
        }
    """
    start_time = time.time()
    endpoint = kwargs.get("endpoint", "")

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

    # 2. Parse required contracts list (no fallback)
    target_slots: List[str] = []
    if isinstance(contracts, list):
        target_slots = [str(x).strip() for x in contracts if str(x).strip()]
    elif isinstance(contracts, str):
        if contracts.strip().startswith("["):
            try:
                parsed = json.loads(contracts)
                if isinstance(parsed, list):
                    target_slots = [str(x).strip() for x in parsed if str(x).strip()]
            except Exception as e:
                raise RuntimeError(f"[classify_mesh_types] Failed to parse contracts JSON: {e}") from e
        else:
            target_slots = [c.strip() for c in contracts.split(",") if c.strip()]

    if not target_slots:
        raise RuntimeError(
            "[classify_mesh_types] Missing required 'contracts' list. "
            "Please specify target modular appearance slots (e.g. ['Top', 'Bottom', 'Shoes', 'Body', 'Hair'])."
        )

    # 3. Setup AI Client
    if not HAS_OPENAI:
        raise RuntimeError(
            "[classify_mesh_types] Missing required Python package 'openai'. "
            "Please install it using 'pip install openai'."
        )

    resolved_key = resolve_api_key(provider)
    print(f"[classify_mesh_types] [INFO] Resolved API key prefix: {resolved_key[:6]!r} (len={len(resolved_key)})", flush=True)

    is_local_ollama = provider.lower() == "ollama" or "11434" in endpoint

    if not resolved_key and not is_local_ollama:
        raise RuntimeError(
            f"[classify_mesh_types] No API key found for provider '{provider}'. "
            f"Please set GEMINI_API_KEY in OS environment or configure runner.toml."
        )

    if is_local_ollama:
        client = OpenAI(api_key="ollama", base_url=endpoint or "http://localhost:11434/v1")
    elif provider.lower() == "gemini":
        client = OpenAI(api_key=resolved_key, base_url=endpoint or "https://generativelanguage.googleapis.com/v1beta/openai/")
    else:
        client = OpenAI(api_key=resolved_key, base_url=endpoint or None)

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
        "3. 'cloth_map': Map each clothing item/mesh name to one of the target modular categories listed above. Use the exact original mesh name found in the input!\n\n"
        "OUTPUT SCHEMA REQUIREMENT:\n"
        "You MUST return a JSON object with this exact structure:\n"
        "{\n"
        '  "body_mesh": ["<exact mesh name>"],\n'
        '  "cloth_map": {\n'
        '    "<mesh_name>": "<Modular_Slot_Name>"\n'
        '  }\n'
        "}"
    )

    user_prompt = (
        "Analyze the following raw 3D metadata tree or mesh list, discover all relevant objects/meshes, "
        "and produce the classified mesh structure:\n\n"
        f"```json\n{json.dumps(raw_data, indent=2)}\n```"
    )

    print(f"[classify_mesh_types] [INFO] Sending raw 3D metadata tree to {model} ({provider})...", flush=True)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content or "{}"
        parsed = json.loads(content)
    except Exception as e:
        raise RuntimeError(
            f"[classify_mesh_types] AI mesh classification failed using model '{model}' ({provider}): {e}"
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
