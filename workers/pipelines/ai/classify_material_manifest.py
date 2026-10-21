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
# 2. Secret Key Resolver
# ==============================================================================

def resolve_api_key(explicit_key: str = "", provider: str = "gemini") -> str:
    """Resolve API key from explicit arg -> runner.toml -> secret files -> env."""
    if explicit_key and explicit_key.strip():
        return explicit_key.strip()

    # 1. Check runner.toml
    runner_toml = os.path.expandvars(r"%LOCALAPPDATA%\Forgity\runner.toml")
    if os.path.isfile(runner_toml):
        try:
            import tomllib
            with open(runner_toml, "rb") as f:
                data = tomllib.load(f)
                key = data.get("ai", {}).get("api_key", "").strip()
                if key:
                    return key
        except Exception:
            pass

    # 2. Check secret files
    candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".secret_gemini_key")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".secret_gemini_key")),
        os.path.expandvars(r"%LOCALAPPDATA%\Forgity\.gemini_key"),
    ]
    for p in candidates:
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    key = f.read().strip()
                    if key:
                        return key
            except Exception:
                pass

    return os.environ.get("GEMINI_API_KEY", "") or os.environ.get("OPENAI_API_KEY", "")


# ==============================================================================
# 3. Main Tool Entry Point
# ==============================================================================

def main(
    raw_manifest: Union[Dict[str, Any], str],
    folder_path: str = "",
    contracts: Optional[Union[Dict[str, Any], str]] = None,
    provider: str = "gemini",
    model: str = "gemini-2.5-flash",
    api_key: str = "",
    endpoint: str = "",
    **kwargs
) -> Dict[str, Any]:
    """
    AI-powered Material Manifest Classifier for Unreal Engine 5 Batch Ingestion.
    Sends raw JSON tree directly to LLM for zero-brittle semantic parsing.
    """
    start_time = time.time()

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
        return {"manifest": {}, "objects_map": {}, "object_count": 0, "summary": "Empty input"}

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

    contract_summary: Dict[str, List[str]] = {}
    if normalized_contracts:
        for c_name, c_data in normalized_contracts.items():
            if isinstance(c_data, dict):
                t_params = c_data.get("texture_params") or c_data.get("texture_map") or {}
                if isinstance(t_params, str):
                    try:
                        t_params = json.loads(t_params)
                    except Exception:
                        t_params = {}
                contract_summary[c_name] = list(t_params.keys()) if isinstance(t_params, dict) else []

    # 3. Setup AI Client
    resolved_key = resolve_api_key(api_key, provider)
    is_local_ollama = provider.lower() == "ollama" or "11434" in endpoint

    if not resolved_key and not is_local_ollama:
        print("[classify_material_manifest] [ERROR] No API key available for AI classification.", flush=True)
        return {"manifest": {}, "objects_map": {}, "object_count": 0, "summary": "No API key"}

    if not HAS_OPENAI:
        print("[classify_material_manifest] [ERROR] 'openai' package not installed.", flush=True)
        return {"manifest": {}, "objects_map": {}, "object_count": 0, "summary": "Missing openai package"}

    if is_local_ollama:
        client = OpenAI(api_key="ollama", base_url=endpoint or "http://localhost:11434/v1")
    elif provider.lower() == "gemini":
        client = OpenAI(api_key=resolved_key, base_url=endpoint or "https://generativelanguage.googleapis.com/v1beta/openai/")
    else:
        client = OpenAI(api_key=resolved_key, base_url=endpoint or None)

    # 4. Build Prompts
    contract_section = ""
    if contract_summary:
        contract_section = (
            "\nPROJECT MASTER MATERIAL CONTRACTS:\n"
            f"{json.dumps(contract_summary, indent=2)}\n\n"
            "RULES WHEN MATCHING CONTRACTS:\n"
            "- Set 'material_tag' to the matched contract key (Cloth, Skin, Eye, Hair, Mouth, etc.).\n"
            "- In 'textures', ONLY use the exact parameter names from that matched contract's parameter list!\n"
            "- If no contract matches a slot, use standard PBR parameter names (BaseColorMap, NormalMap, RoughnessMap, SpecularMap, OpacityMap).\n"
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
        "6. Ensure relative texture paths are preserved with their subfolder if declared (e.g. 'Characters/Sam/textures/image.jpg').\n"
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

    print(f"[classify_material_manifest] [INFO] Sending raw JSON tree to {model} ({provider})...", flush=True)

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
        parsed_ai = json.loads(content)
    except Exception as e:
        print(f"[classify_material_manifest] [ERROR] AI completion failed: {e}", flush=True)
        return {"manifest": {}, "objects_map": {}, "object_count": 0, "summary": f"AI Error: {e}"}

    # 5. Format & Post-process for Unreal Engine setup_asset_materials.py
    ai_objects = parsed_ai.get("objects", {})
    resolved_manifest: Dict[str, Any] = {}

    for obj_name, obj_data in ai_objects.items():
        asset_name = obj_data.get("asset_name") or obj_name
        file_path = obj_data.get("file_path") or ""

        # Make file_path absolute if folder_path is given
        if folder_path and file_path and not os.path.isabs(file_path):
            candidate = os.path.normpath(os.path.join(folder_path, file_path)).replace("\\", "/")
            file_path = candidate

        slots_list = obj_data.get("slots", [])
        formatted_slots = []

        for idx, s in enumerate(slots_list):
            s_name = s.get("slot_name") or s.get("name") or f"Slot_{idx}"
            s_tag = s.get("material_tag") or s.get("tag") or "Generic"
            s_textures = s.get("textures") or {}

            # Normalize texture paths to absolute if folder_path given
            clean_textures: Dict[str, str] = {}
            for param_k, tex_p in s_textures.items():
                if not tex_p:
                    continue
                tex_p_str = str(tex_p).strip().replace("\\", "/")
                if folder_path and not os.path.isabs(tex_p_str):
                    abs_tex = os.path.normpath(os.path.join(folder_path, tex_p_str)).replace("\\", "/")
                    clean_textures[str(param_k)] = abs_tex
                else:
                    clean_textures[str(param_k)] = tex_p_str

            formatted_slots.append({
                "name": s_name,
                "material_tag": s_tag,
                "tag": s_tag,
                "index": idx,
                "slot_anchor": f"slots[{idx}]",
                "textures": clean_textures
            })

        has_cloth = any(s["material_tag"] == "Cloth" for s in formatted_slots)
        cloth_type = "Cloth" if has_cloth else None

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
        "objects": resolved_manifest,
        "objects_map": resolved_manifest,
        "object_count": len(resolved_manifest),
        "summary": summary
    }


classify_manifest = main


if __name__ == "__main__":
    if len(sys.argv) > 1:
        res = main(sys.argv[1])
        print(json.dumps(res, indent=2))
    else:
        print("Usage: python classify_material_manifest.py <raw_manifest.json>")
