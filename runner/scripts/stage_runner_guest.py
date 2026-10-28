"""
Forgity Native Guest Runner Script
Executed inside Blender, Unreal Engine, or standalone Python subprocess.
Communicates with Host Rust Daemon via Windows Named Pipe / Unix Domain Socket (NDJSON).
Zero external dependencies (pure Python standard library).
"""
import importlib.util
import inspect
import io
import json
import os
import sys
import traceback
from typing import Any, Dict, Optional

# UTF-8 stdout/stderr reconfiguration
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def get_dcc_info():
    try:
        import bpy
        return "blender", ".".join(map(str, bpy.app.version))
    except ImportError:
        pass
    try:
        import unreal
        return "unreal", "5.x"
    except ImportError:
        pass
    return "python", sys.version.split()[0]


class PipeClient:
    def __init__(self, pipe_path: str):
        self.pipe_path = pipe_path
        self._file = None

    def connect(self):
        # Open Windows Named Pipe in binary read/write unbuffered mode
        self._file = io.open(self.pipe_path, "r+b", buffering=0)

    def send(self, msg: dict):
        if not self._file:
            return
        payload = json.dumps(msg, default=str).encode("utf-8") + b"\n"
        self._file.write(payload)

    def close(self):
        if self._file:
            try:
                self._file.close()
            except Exception:
                pass
            self._file = None


class PipelineHooks:
    """Universal PipelineHooks compatible with Legacy Python Worker scripts."""
    _current_step_execution_id: Optional[str] = None
    _current_step_inputs: Dict[str, Any] = {}
    _current_step_outputs: Dict[str, Any] = {}

    @classmethod
    def set_step_context(cls, step_execution_id: str, inputs: dict):
        cls._current_step_execution_id = step_execution_id
        cls._current_step_inputs = inputs or {}
        cls._current_step_outputs = {}

    @classmethod
    def get_input(cls, key: str, default=None):
        return cls._current_step_inputs.get(key, default)

    @classmethod
    def set_output(cls, key: str, value: Any):
        cls._current_step_outputs[key] = value

    @classmethod
    def get_outputs(cls) -> Dict[str, Any]:
        return cls._current_step_outputs


# Inject PipelineHooks into sys.modules so imported scripts can use:
# 'from lib.pipeline_hooks import PipelineHooks' or 'from pipeline_hooks import PipelineHooks'
import types
hooks_module = types.ModuleType("lib.pipeline_hooks")
hooks_module.PipelineHooks = PipelineHooks
sys.modules["lib.pipeline_hooks"] = hooks_module
sys.modules["pipeline_hooks"] = hooks_module

parent_lib_module = types.ModuleType("lib")
parent_lib_module.pipeline_hooks = hooks_module
parent_lib_module.PipelineHooks = PipelineHooks
sys.modules["lib"] = parent_lib_module


def resolve_step_inputs(step_inputs: dict, all_step_outputs: dict, resolved_data: dict) -> dict:
    """Resolve final input values for a step by substituting $ref, $file, and $data markers."""
    resolved = {}
    for key, val in (step_inputs or {}).items():
        if isinstance(val, dict):
            # 1. $file or file object representation
            file_info = val.get("$file") if "$file" in val else (val if "url" in val else None)
            if file_info and isinstance(file_info, dict):
                # Check if local_path is already provided
                if file_info.get("local_path"):
                    resolved[key] = str(file_info["local_path"])
                    continue

                url = file_info.get("url")
                filename = file_info.get("filename") or file_info.get("name") or "asset_file"
                hash_val = file_info.get("hash")

                matched_local = None
                # Check runner cache/assets
                if hash_val:
                    for ext_try in ["", ".py", ".fbx", ".obj", ".duf", ".png", ".jpg"]:
                        candidate = os.path.join("cache", "assets", f"{hash_val.lower()}{ext_try}")
                        if os.path.isfile(candidate):
                            matched_local = os.path.abspath(candidate)
                            break
                if not matched_local and filename:
                    candidate = os.path.join("cache", "assets", filename)
                    if os.path.isfile(candidate):
                        matched_local = os.path.abspath(candidate)

                if matched_local:
                    resolved[key] = matched_local
                elif url:
                    # Fallback download
                    try:
                        import urllib.request
                        cache_dir = os.path.join("cache", "assets")
                        os.makedirs(cache_dir, exist_ok=True)
                        dest_path = os.path.join(cache_dir, filename)
                        urllib.request.urlretrieve(url, dest_path)
                        resolved[key] = os.path.abspath(dest_path)
                    except Exception as de:
                        sys.stderr.write(f"WARNING: Could not download asset '{filename}': {de}\n")
                        resolved[key] = filename
                else:
                    resolved[key] = filename
                continue

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
    """Support intra-stage data flow from previous steps in this stage via InputMappings."""
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


def purge_blender_orphans():
    try:
        import bpy
        for _ in range(3):
            if hasattr(bpy, 'app') and bpy.app.version >= (3, 0, 0):
                bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
            elif hasattr(bpy, 'ops') and hasattr(bpy.ops, 'outliner'):
                bpy.ops.outliner.orphans_purge()
    except Exception:
        pass


def main():
    pipe_path = os.environ.get("FORGITY_IPC_PIPE")
    task_json_path = os.environ.get("FORGITY_TASK_JSON")

    original_argv = list(sys.argv)

    # Fallback to argv if env vars not provided
    if not pipe_path and len(sys.argv) > 1:
        for i, arg in enumerate(sys.argv):
            if arg == "--pipe" and i + 1 < len(sys.argv):
                pipe_path = sys.argv[i + 1]
            elif arg == "--task" and i + 1 < len(sys.argv):
                task_json_path = sys.argv[i + 1]

    if not pipe_path:
        sys.stderr.write("ERROR: FORGITY_IPC_PIPE environment variable or --pipe argument required.\n")
        sys.exit(1)

    dcc_name, dcc_version = get_dcc_info()
    client = PipeClient(pipe_path)

    try:
        client.connect()
    except Exception as e:
        sys.stderr.write(f"ERROR: Failed to connect to IPC pipe '{pipe_path}': {e}\n")
        sys.exit(2)

    # 1. Send Handshake
    client.send({
        "type": "handshake",
        "dcc_name": dcc_name,
        "dcc_version": dcc_version,
        "pid": os.getpid()
    })

    # 2. Load Task Specification
    task_data = {}
    if task_json_path and os.path.exists(task_json_path):
        try:
            with open(task_json_path, "r", encoding="utf-8") as f:
                task_data = json.load(f)
        except Exception as e:
            sys.stderr.write(f"WARNING: Could not parse task json: {e}\n")

    steps = task_data.get("steps", [])
    resolved_data = task_data.get("resolved_data", {})

    # Inject isolated python dependencies if provided
    site_packages = task_data.get("site_packages_path")
    if site_packages and os.path.isdir(site_packages):
        try:
            import site
            site.addsitedir(site_packages)
            print(f"[GuestRunner] Injected isolated site-packages from: {site_packages}", flush=True)
        except Exception as se:
            sys.stderr.write(f"WARNING: Could not inject site-packages: {se}\n")
    all_step_outputs = {}
    overall_success = True
    error_msg = None

    print(f"[GuestRunner] Initialized DCC guest session for '{dcc_name}' with {len(steps)} step(s).", flush=True)

    # 3. Iterate through steps
    for idx, step in enumerate(steps):
        step_id = step.get("step_execution_id", f"step_{idx}")
        step_name = step.get("name") or step_id
        script_path = step.get("script_path")

        client.send({
            "type": "step_started",
            "step_execution_id": step_id,
            "step_index": idx
        })

        client.send({
            "type": "step_progress",
            "step_execution_id": step_id,
            "status": "Running",
            "progress": 0.5,
            "message": f"Processing step {step_name}..."
        })

        # Resolve inputs ($ref, $data) & intra-stage mappings
        step_inputs_raw = step.get("inputs", {})
        step_inputs = resolve_step_inputs(step_inputs_raw, all_step_outputs, resolved_data)
        step_inputs = apply_input_mappings(step, step_inputs, all_step_outputs)

        PipelineHooks.set_step_context(step_id, step_inputs)

        step_outputs = {}
        step_succeeded = True
        step_err = None

        if script_path and os.path.exists(script_path):
            try:
                # Isolate sys.argv to avoid scripts reading host CLI flags like --pipe
                sys.argv = [script_path]

                # Ensure script directory is on sys.path
                script_dir = os.path.dirname(os.path.abspath(script_path))
                if script_dir not in sys.path:
                    sys.path.insert(0, script_dir)

                # Load and execute module dynamically
                spec = importlib.util.spec_from_file_location(f"step_module_{idx}", script_path)
                if not spec or not spec.loader:
                    raise ImportError(f"Could not load module spec for script: '{script_path}'")

                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                # Call main() or execute()
                res = call_script_main(module, step_inputs, script_path)

                if isinstance(res, dict):
                    step_outputs.update(res)

                # Also collect any outputs set via PipelineHooks
                hook_outs = PipelineHooks.get_outputs()
                if hook_outs:
                    step_outputs.update(hook_outs)

                all_step_outputs[step_id] = step_outputs

                print(f"[GuestRunner] Step '{step_name}' completed. Outputs: {list(step_outputs.keys())}", flush=True)

            except Exception as e:
                step_succeeded = False
                step_err = f"{e}\n{traceback.format_exc()}"
                overall_success = False
                error_msg = step_err
                print(f"[GuestRunner] ERROR in step '{step_name}': {step_err}", flush=True)
            finally:
                sys.argv = original_argv
        else:
            step_succeeded = False
            step_err = f"Script not found at: '{script_path}'"
            overall_success = False
            error_msg = step_err
            print(f"[GuestRunner] ERROR: {step_err}", flush=True)

        purge_blender_orphans()

        client.send({
            "type": "step_completed",
            "step_execution_id": step_id,
            "succeeded": step_succeeded,
            "outputs": step_outputs,
            "error_message": step_err
        })

        if not step_succeeded:
            break

    # 4. Finish Stage
    client.send({
        "type": "stage_completed",
        "succeeded": overall_success,
        "error_message": error_msg
    })

    client.close()


if __name__ == "__main__":
    main()
