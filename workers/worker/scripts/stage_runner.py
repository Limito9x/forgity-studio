import json
import sys
import inspect
import importlib.util
import os

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

try:
    import bpy
    HAS_BPY = True
except ImportError:
    HAS_BPY = False
import traceback

# Ensure Automation-Agent root, scripts, pipeline dirs, inspectors dirs, and worker venv site-packages are in sys.path
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
_agent_root = os.path.dirname(os.path.dirname(_scripts_dir))
_venv_site = os.path.join(_agent_root, "worker", "venv", "Lib", "site-packages")
_sub_paths = [
    _venv_site,
    _agent_root,
    _scripts_dir,
    os.path.join(_scripts_dir, "pipeline"),
    os.path.join(_scripts_dir, "pipeline", "blender"),
    os.path.join(_scripts_dir, "pipeline", "daz"),
    os.path.join(_scripts_dir, "inspectors"),
    os.path.join(_scripts_dir, "inspectors", "blender"),
    os.path.join(_scripts_dir, "inspectors", "daz"),
]
for _p in _sub_paths:
    if os.path.exists(_p) and _p not in sys.path:
        sys.path.insert(0, _p)



def purge_orphans():
    """Purge orphaned data blocks to save RAM."""
    if not HAS_BPY:
        return
    for _ in range(3):
        if hasattr(bpy, 'app') and bpy.app.version >= (3, 0, 0):
            bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
        elif hasattr(bpy, 'ops') and hasattr(bpy.ops, 'outliner'):
            bpy.ops.outliner.orphans_purge()


from lib.runner_common import resolve_step_inputs, call_script_main, apply_input_mappings



def main():
    print("STAGE RUNNER STARTING", flush=True)
    raw_input = sys.stdin.read()
    if not raw_input:
        print("STAGE RUNNER ERROR: raw_input is empty!", flush=True)
        sys.exit(1)

    try:
        payload = json.loads(raw_input)
    except json.JSONDecodeError as e:
        print(f"STAGE RUNNER ERROR: Invalid JSON: {e}", flush=True)
        sys.exit(2)

    steps = payload.get("steps", [])
    resolved_data = payload.get("resolved_data", {})
    print(f"STAGE RUNNER PARSED PAYLOAD WITH {len(steps)} STEPS", flush=True)

    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    for _sub in ["pipeline", os.path.join("pipeline", "blender"), os.path.join("pipeline", "daz"), "inspectors", os.path.join("inspectors", "blender"), os.path.join("inspectors", "daz")]:
        _sub_p = os.path.join(scripts_dir, _sub)
        if os.path.exists(_sub_p) and _sub_p not in sys.path:
            sys.path.insert(0, _sub_p)

    from lib.pipeline_hooks import PipelineHooks

    # Giữ outputs của từng step trong RAM — Step sau dùng $ref trỏ vào đây.
    all_step_outputs: dict[str, dict] = {}

    has_failed_step = False

    for step in steps:
        step_execution_id = step.get("step_execution_id", "")
        step_name = step.get("name") or step_execution_id
        script_path = step.get("script_path", "")
        script_url = step.get("script_url")
        script_hash = step.get("script_hash")
        entry_point = step.get("entry_point")
        step_inputs_raw = step.get("inputs", {})

        # Resolve script path (Remote asset cache or local built-in scripts)
        try:
            from core.script_resolver import resolve_script_path
            resolved_script_path = resolve_script_path(script_path, script_url, script_hash, entry_point)
        except Exception as resolve_err:
            print(f"STAGE RUNNER RESOLVER EXCEPTION: {resolve_err}\n{traceback.format_exc()}", flush=True)
            resolved_script_path = ""

        if not resolved_script_path:
            err = f"Script '{script_path}' could not be resolved! (Hash: {script_hash}, Url: {script_url})"
            print(f"STAGE RUNNER ERROR: {err}", flush=True)
            PipelineHooks.report_step_result(step_execution_id, False, error=err)
            has_failed_step = True
            break

        # JIT Pull: Resolve fresh step inputs via gRPC on-demand
        try:
            from core.execution_state_client import ExecutionStateClient
            grpc_inputs = ExecutionStateClient.resolve_step_inputs(payload, step)
            if grpc_inputs:
                step_inputs_raw.update(grpc_inputs)
        except Exception as pull_err:
            print(f"[STAGE RUNNER] gRPC JIT pull fallback: {pull_err}", flush=True)

        # Resolve explicit $ref / $data inputs (local RAM cache or intra-segment links)
        step_inputs = resolve_step_inputs(step_inputs_raw, all_step_outputs, resolved_data)

        # Support intra-stage data flow from previous steps in this stage via InputMappings
        step_inputs = apply_input_mappings(step, step_inputs, all_step_outputs)

        # TRACE LOG: PRINT INPUTS
        print(f"\n=======================================================", flush=True)
        print(f"> [STEP START] #{step.get('order', '?')} {step_name} [{step_execution_id}]", flush=True)
        print(f"  Script: {resolved_script_path}", flush=True)
        print(f"  Inputs: {json.dumps(step_inputs, indent=2, default=str)}", flush=True)
        print(f"=======================================================", flush=True)

        PipelineHooks.set_step_context(step_execution_id, step_inputs)

        try:
            PipelineHooks.report_step_started(step_execution_id)

            # Load và execute script động
            spec = importlib.util.spec_from_file_location("step_module", resolved_script_path)
            if not spec or not spec.loader:
                raise ImportError(f"Could not load module spec for script: '{resolved_script_path}'")

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            res = call_script_main(module, step_inputs, resolved_script_path)

            if isinstance(res, dict):
                # Script trả về outputs tường minh → lưu vào PipelineHooks để step sau dùng $ref.
                for k, v in res.items():
                    PipelineHooks.set_output(k, v)
            else:
                # Script thuần side-effect không cần return dict.
                pass

            step_outputs = PipelineHooks.get_outputs()
            all_step_outputs[step_execution_id] = step_outputs

            # Report step outputs to Backend MemoryStore in real-time via gRPC
            try:
                from core.execution_state_client import ExecutionStateClient
                ExecutionStateClient.report_step_output(payload, step_execution_id, step_outputs)
            except Exception:
                pass

            # TRACE LOG: PRINT OUTPUTS
            print(f"\n-------------------------------------------------------", flush=True)
            print(f"+ [STEP FINISH] #{step.get('order', '?')} {step_name}", flush=True)
            print(f"  Outputs: {json.dumps(step_outputs, indent=2, default=str)}", flush=True)
            print(f"-------------------------------------------------------\n", flush=True)

            PipelineHooks.report_step_result(step_execution_id, True, outputs=step_outputs)

        except Exception as e:
            err_msg = "".join(traceback.format_exception(type(e), e, e.__traceback__))
            print(f"STAGE RUNNER ERROR in step {step_execution_id}: {err_msg}", flush=True)
            PipelineHooks.report_step_result(step_execution_id, False, error=err_msg)
            # Một step fail → dừng toàn bộ batch (fail-fast).
            has_failed_step = True
            break

        finally:
            # Purge orphaned Blender data sau mỗi step để tiết kiệm RAM.
            try:
                purge_orphans()
            except Exception as purge_err:
                print(f"WARNING: purge_orphans failed after step {step_execution_id}: {purge_err}", flush=True)

    if has_failed_step:
        print("[STAGE RUNNER] Aborting stage due to failed step.", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
