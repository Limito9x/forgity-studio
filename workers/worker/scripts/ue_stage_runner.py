import json
import sys
import inspect
import importlib.util
import os
import traceback

# Optional unreal module import when running inside Unreal Engine
try:
    import unreal
    HAS_UNREAL = True
except ImportError:
    unreal = None
    HAS_UNREAL = False

# Ensure Automation-Agent root, scripts, and pipeline dirs are in sys.path
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
_agent_root = os.path.dirname(os.path.dirname(_scripts_dir))
for _p in [_agent_root, _scripts_dir, os.path.join(_scripts_dir, "pipeline")]:
    if _p not in sys.path:
        sys.path.insert(0, _p)


def purge_ue_garbage():
    """Collect Unreal Engine garbage to release memory between steps."""
    if HAS_UNREAL and hasattr(unreal, "SystemLibrary"):
        try:
            unreal.SystemLibrary.collect_garbage()
        except Exception as e:
            print(f"[UE] Garbage collection warning: {e}", flush=True)


from lib.runner_common import resolve_step_inputs, call_script_main, apply_input_mappings



def load_task_payload() -> dict:
    # 1. Check environment variable for temporary payload file
    env_file = os.environ.get("UE_STAGE_TASK_FILE")
    if env_file and os.path.isfile(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[UE STAGE RUNNER] Failed to read payload file {env_file}: {e}", flush=True)

    # 2. Fallback to stdin
    raw_input = sys.stdin.read()
    if raw_input:
        try:
            return json.loads(raw_input)
        except Exception as e:
            print(f"[UE STAGE RUNNER] Failed to parse stdin JSON: {e}", flush=True)

    raise RuntimeError("No valid StageTaskMessage payload provided to Unreal stage runner!")


def main():
    print("========================================", flush=True)
    print("UNREAL ENGINE STAGE RUNNER STARTING", flush=True)
    print(f"Unreal Python module available: {HAS_UNREAL}", flush=True)
    print("========================================", flush=True)

    try:
        payload = load_task_payload()
    except Exception as e:
        print(f"UNREAL STAGE RUNNER FATAL ERROR: {e}", flush=True)
        sys.exit(1)

    steps = payload.get("steps", [])
    resolved_data = payload.get("resolved_data", {})
    environment_config = payload.get("environment_config", {})

    print(f"UNREAL STAGE RUNNER PARSED {len(steps)} STEPS", flush=True)

    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    pipeline_dir = os.path.join(scripts_dir, "pipeline")
    if pipeline_dir not in sys.path:
        sys.path.insert(0, pipeline_dir)

    from lib.pipeline_hooks import PipelineHooks

    all_step_outputs: dict[str, dict] = {}

    for step in steps:
        step_execution_id = step.get("step_execution_id", "")
        step_name = step.get("name") or step_execution_id
        script_path = step.get("script_path", "")
        script_url = step.get("script_url")
        script_hash = step.get("script_hash")
        entry_point = step.get("entry_point")
        step_inputs_raw = step.get("inputs", {})

        # Resolve script path
        try:
            from core.script_resolver import resolve_script_path
            resolved_script_path = resolve_script_path(script_path, script_url, script_hash, entry_point)
        except Exception as resolve_err:
            print(f"UE STAGE RUNNER RESOLVER EXCEPTION: {resolve_err}\n{traceback.format_exc()}", flush=True)
            resolved_script_path = ""

        if not resolved_script_path:
            err = f"Script '{script_path}' could not be resolved! (Hash: {script_hash}, Url: {script_url})"
            print(f"UE STAGE RUNNER ERROR: {err}", flush=True)
            PipelineHooks.report_step_result(step_execution_id, False, error=err)
            break

        step_inputs = resolve_step_inputs(step_inputs_raw, all_step_outputs, resolved_data)

        # Support intra-stage data flow from previous steps in this stage via InputMappings
        step_inputs = apply_input_mappings(step, step_inputs, all_step_outputs)

        # Auto-propagate mesh_paths from prior steps in this stage if not explicitly wired
        if not step_inputs.get("mesh_paths") and not step_inputs.get("mesh_uasset_path"):
            for prev_id, prev_out in reversed(list(all_step_outputs.items())):
                if isinstance(prev_out, dict):
                    if prev_out.get("mesh_paths"):
                        step_inputs["mesh_paths"] = prev_out["mesh_paths"]
                        print(f"  🔗 [ue_stage_runner] Auto-linked 'mesh_paths' from prior step '{prev_id}'", flush=True)
                    if prev_out.get("mesh_uasset_path"):
                        step_inputs["mesh_uasset_path"] = prev_out["mesh_uasset_path"]

        # Auto-propagate objects_map from prior steps in this stage if not explicitly wired
        if not step_inputs.get("objects_map") and not step_inputs.get("batch_items"):
            for prev_id, prev_out in reversed(list(all_step_outputs.items())):
                if isinstance(prev_out, dict):
                    if prev_out.get("objects_map"):
                        step_inputs["objects_map"] = prev_out["objects_map"]
                        print(f"  🔗 [ue_stage_runner] Auto-linked 'objects_map' from prior step '{prev_id}'", flush=True)
                        break
                    elif prev_out.get("batch_results"):
                        step_inputs["objects_map"] = prev_out["batch_results"]
                        print(f"  🔗 [ue_stage_runner] Auto-linked 'batch_results' as objects_map from prior step '{prev_id}'", flush=True)
                        break

        # TRACE LOG: PRINT INPUTS
        print(f"\n=======================================================", flush=True)
        print(f"▶ [UE STEP START] #{step.get('order', '?')} {step_name} [{step_execution_id}]", flush=True)
        print(f"  📂 Script: {resolved_script_path}", flush=True)
        print(f"  📥 Inputs: {json.dumps(step_inputs, indent=2, default=str)}", flush=True)
        print(f"=======================================================", flush=True)

        PipelineHooks.set_step_context(step_execution_id, step_inputs)

        try:
            PipelineHooks.report_step_started(step_execution_id)

            spec = importlib.util.spec_from_file_location("ue_step_module", resolved_script_path)
            if not spec or not spec.loader:
                raise ImportError(f"Could not load module spec for script: '{resolved_script_path}'")

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            res = call_script_main(module, step_inputs, resolved_script_path)

            if isinstance(res, dict):
                for k, v in res.items():
                    PipelineHooks.set_output(k, v)

            step_outputs = PipelineHooks.get_outputs()
            all_step_outputs[step_execution_id] = step_outputs

            print(f"\n-------------------------------------------------------", flush=True)
            print(f"✔ [UE STEP FINISH] #{step.get('order', '?')} {step_name}", flush=True)
            print(f"  📤 Outputs: {json.dumps(step_outputs, indent=2, default=str)}", flush=True)
            print(f"-------------------------------------------------------\n", flush=True)

            PipelineHooks.report_step_result(step_execution_id, True, outputs=step_outputs)

        except Exception as e:
            err_msg = "".join(traceback.format_exception(type(e), e, e.__traceback__))
            print(f"UE STAGE RUNNER ERROR in step {step_execution_id}: {err_msg}", flush=True)
            PipelineHooks.report_step_result(step_execution_id, False, error=err_msg)
            break

        finally:
            purge_ue_garbage()


if __name__ == "__main__":
    main()
