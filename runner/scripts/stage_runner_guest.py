"""
Forgity Native Guest Runner Script
Executed inside Blender or standalone Python subprocess.
Communicates with Host Rust Daemon via Windows Named Pipe / Unix Domain Socket (NDJSON).
Zero external dependencies (pure Python standard library).
"""
import io
import json
import os
import sys
import traceback

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
        payload = json.dumps(msg).encode("utf-8") + b"\n"
        self._file.write(payload)

    def close(self):
        if self._file:
            try:
                self._file.close()
            except Exception:
                pass
            self._file = None

def main():
    pipe_path = os.environ.get("FORGITY_IPC_PIPE")
    task_json_path = os.environ.get("FORGITY_TASK_JSON")

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
    overall_success = True
    error_msg = None

    # 3. Iterate through steps
    for idx, step in enumerate(steps):
        step_id = step.get("step_execution_id", f"step_{idx}")
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
            "message": f"Processing step {step.get('name', step_id)}..."
        })

        # Execute script if provided
        script_path = step.get("script_path")
        step_outputs = {}
        step_succeeded = True
        step_err = None

        if script_path and os.path.exists(script_path):
            try:
                # Provide a clean execution context
                ctx = {
                    "__file__": script_path,
                    "__name__": "__main__",
                    "step_inputs": step.get("inputs", {}),
                    "step_outputs": step_outputs
                }
                with open(script_path, "r", encoding="utf-8") as sf:
                    code = compile(sf.read(), script_path, "exec")
                    exec(code, ctx)
            except Exception as e:
                step_succeeded = False
                step_err = f"{e}\n{traceback.format_exc()}"
                overall_success = False
                error_msg = step_err

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
