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
  - clothes: List of modular clothing/wearable mesh names (e.g. ['A_Bra_Brown', 'A_Leggings_Brown', 'A_Shoes_Brown']).
  - cloth_map: Backward-compatible dictionary mapping each clothing mesh to its generic role.
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

    # 3. Pure Geometric Separation Prompt (Zero Game-Contract Coupling)
    system_prompt = (
        "You are an expert 3D Technical Artist and Character Pipeline Automation Engineer.\n"
        "Your mission is to analyze a list or metadata tree of 3D objects/meshes from a character scene (DAZ Studio / Blender) "
        "and separate them into two clean geometric categories:\n\n"
        "1. 'body_mesh': Character body/anatomical figure meshes (e.g. Genesis 8 Female, Genesis 9, Body, Head, Eyes, Eyelashes, Mouth, Cornea) to be retained as the base avatar.\n"
        "2. 'clothes': All wearable clothing items, outfits, garments, hair, shoes, and accessories (e.g. Bra, Panties, Shirt, Jeans, Boots, Hair, Hat, Gloves).\n\n"
        "CRITICAL RULES:\n"
        "- Return the EXACT object/mesh names found in the input.\n"
        "- Anatomical parts (Eyes, Teeth, Tongue, Eyelashes, Cornea, Tear) belong in 'body_mesh' or helper, NEVER in 'clothes'!\n"
        "- Filter out non-mesh helpers, bone widgets, cameras, and lights.\n\n"
        "OUTPUT FORMAT (STRICT JSON):\n"
        "{\n"
        '  "body_mesh": ["<exact body mesh name>"],\n'
        '  "clothes": ["<cloth mesh 1>", "<cloth mesh 2>", ...]\n'
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
    raw_body = parsed.get("body_mesh", [])
    body_mesh: List[str] = []
    if isinstance(raw_body, list):
        body_mesh = [str(x).strip() for x in raw_body if str(x).strip()]
    elif isinstance(raw_body, str) and raw_body.strip():
        body_mesh = [raw_body.strip()]

    raw_clothes = parsed.get("clothes", [])
    clothes: List[str] = []
    if isinstance(raw_clothes, list):
        clothes = [str(x).strip() for x in raw_clothes if str(x).strip()]
    elif isinstance(raw_clothes, dict):
        clothes = [str(k).strip() for k in raw_clothes.keys() if str(k).strip()]
    elif isinstance(raw_clothes, str) and raw_clothes.strip():
        clothes = [raw_clothes.strip()]

    # Backward-compatible cloth_map for downstream nodes expecting a mapping
    cloth_map = parsed.get("cloth_map", {})
    if not isinstance(cloth_map, dict) or not cloth_map:
        cloth_map = {item: "Wardrobe" for item in clothes}
    else:
        for c in clothes:
            if c not in cloth_map:
                cloth_map[c] = "Wardrobe"

    is_monolithic = len(clothes) == 0
    elapsed = time.time() - start_time
    summary = (
        f"Separated Geometry: {len(body_mesh)} Body Mesh(es) ({body_mesh}), "
        f"{len(clothes)} Clothing Item(s) ({clothes}) in {elapsed:.2f}s. "
        f"Structure: {'Monolithic (Full Body)' if is_monolithic else 'Modular (Wardrobe Array)'}."
    )
    print(f"[classify_mesh_types] [SUCCESS] {summary}", flush=True)

    return {
        "body_meshes": body_mesh,
        "clothes": clothes,
        "cloth_map": cloth_map,
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
