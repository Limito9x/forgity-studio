import os
import inspect
from typing import Dict, Any, Optional


def resolve_step_inputs(step_inputs: dict, all_step_outputs: dict, resolved_data: dict) -> dict:
    """
    Resolve final input values for a step by substituting $ref, $file, and $data markers.

    - $file: { "url": "...", "hash": "...", "filename": "..." } → resolves local file path via cache.
    - $ref: "source_step_id.output_key"                        → pulls output from prior step in RAM.
    - $data: "data_key"                                        → pre-computed value from backend.
    """
    resolved = {}
    for key, val in (step_inputs or {}).items():
        if isinstance(val, dict):
            if "$file" in val:
                file_info = val["$file"]
                if isinstance(file_info, dict):
                    try:
                        from core.script_resolver import resolve_file_asset
                        local_path = resolve_file_asset(
                            url=file_info.get("url"),
                            file_hash=file_info.get("hash"),
                            file_name=file_info.get("filename") or file_info.get("name")
                        )
                        resolved[key] = local_path
                    except Exception as fe:
                        print(f"[runner_common] Failed to resolve $file asset for '{key}': {fe}", flush=True)
                        resolved[key] = file_info
                else:
                    resolved[key] = file_info
            elif "$ref" in val:
                ref_str = val["$ref"]
                parts = ref_str.split(".", 1)
                if len(parts) == 2:
                    src_step_id, out_key = parts
                    src_outputs = all_step_outputs.get(src_step_id, {})
                    resolved[key] = src_outputs.get(out_key)
                else:
                    resolved[key] = None
            elif "$data" in val:
                data_key = val["$data"]
                resolved[key] = (resolved_data or {}).get(data_key)
            else:
                resolved[key] = val
        else:
            resolved[key] = val
    return resolved


def apply_input_mappings(step: dict, step_inputs: dict, all_step_outputs: dict) -> dict:
    """
    Support intra-stage data flow from previous steps in this stage via InputMappings.
    """
    mappings = step.get("input_mappings", [])
    for m in mappings:
        target_pin = m.get("pin_key")
        src_node = m.get("source_node_id")
        src_pin = m.get("source_pin_key")
        if target_pin and src_node and src_pin and src_node in all_step_outputs:
            src_outs = all_step_outputs[src_node]
            if src_pin in src_outs and src_outs[src_pin] is not None:
                step_inputs[target_pin] = src_outs[src_pin]
            else:
                for out_k, out_v in src_outs.items():
                    if out_k.lower() == src_pin.lower() or out_k.lower().replace("-", "_") == src_pin.lower().replace("-", "_"):
                        if out_v is not None:
                            step_inputs[target_pin] = out_v
                        break
    return step_inputs


def call_script_main(module: Any, step_inputs: dict, script_path: str = "") -> Any:
    """
    Call main() or execute() in the step script with arguments mapped to its signature.
    Supports case-insensitive, kebab-case <-> snake_case translation, and auto-casting.
    """
    func = getattr(module, "main", None) or getattr(module, "execute", None)
    if not func:
        return None

    sig = inspect.signature(func)
    kwargs = {}
    has_var_keyword = False

    normalized_inputs = {}
    for k, v in (step_inputs or {}).items():
        normalized_inputs[k] = v
        normalized_inputs[k.lower()] = v
        normalized_inputs[k.lower().replace("-", "_")] = v
        normalized_inputs[k.lower().replace("_", "-")] = v
        normalized_inputs[k.lower().replace(" ", "_")] = v
        normalized_inputs[k.lower().replace(" ", "")] = v

    for name, param in sig.parameters.items():
        if param.kind == inspect.Parameter.VAR_KEYWORD:
            has_var_keyword = True
            continue

        param_norm = name.lower().replace("-", "_")
        val = None
        if name in step_inputs:
            val = step_inputs[name]
        elif param_norm in normalized_inputs:
            val = normalized_inputs[param_norm]
        elif param.default != inspect.Parameter.empty:
            continue
        else:
            raise ValueError(
                f"Missing required param '{name}' for script '{script_path}'. "
                f"Available inputs: {list((step_inputs or {}).keys())}"
            )

        # Auto-cast based on param annotation
        if val is not None and param.annotation != inspect.Parameter.empty:
            ann = param.annotation
            try:
                if ann is float or ann == "float":
                    val = float(val)
                elif ann is int or ann == "int":
                    val = int(val)
                elif ann is bool or ann == "bool":
                    if isinstance(val, str):
                        val = val.lower() in ("true", "1", "yes")
                    else:
                        val = bool(val)
            except Exception:
                pass

        kwargs[name] = val

    if has_var_keyword:
        for k, v in (step_inputs or {}).items():
            if k not in kwargs:
                kwargs[k] = v

    return func(**kwargs)
