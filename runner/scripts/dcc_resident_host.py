"""
Forgity Native DCC Resident Host Script
Keeps DCC process (e.g. Unreal Engine UnrealEditor-Cmd) alive across multiple pipeline stages.
Communicates with Host Rust Daemon via Control Named Pipe (NDJSON).
For each RunStage command, delegates execution to stage_runner_guest.py and reports completion without killing the engine.
"""
import importlib
import io
import json
import os
import sys
import traceback

# Reconfigure stdout/stderr for unbuffered UTF-8
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


class ControlPipeClient:
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

    def read_line(self) -> str:
        if not self._file:
            return ""
        line = self._file.readline()
        if not line:
            return ""
        return line.decode("utf-8", errors="replace").strip()

    def close(self):
        if self._file:
            try:
                self._file.close()
            except Exception:
                pass
            self._file = None


def purge_step_modules():
    """Removes previously imported step_module_* scripts so modified nodes load immediately."""
    for mod_name in list(sys.modules.keys()):
        if mod_name.startswith("step_module_"):
            sys.modules.pop(mod_name, None)


def refresh_engine_state():
    """Refreshes Unreal Engine Asset Registry for /Game so newly written assets on disk are indexed."""
    try:
        import unreal
        asset_reg = unreal.AssetRegistryHelpers.get_asset_registry()
        asset_reg.scan_paths_synchronous(["/Game"], True)
    except Exception:
        pass


def main():
    control_pipe_path = os.environ.get("FORGITY_DCC_CONTROL_PIPE")

    if not control_pipe_path and len(sys.argv) > 1:
        for i, arg in enumerate(sys.argv):
            if arg == "--control-pipe" and i + 1 < len(sys.argv):
                control_pipe_path = sys.argv[i + 1]
            elif arg.startswith("--control-pipe="):
                control_pipe_path = arg.split("=", 1)[1]

    if not control_pipe_path:
        sys.stderr.write("ERROR: FORGITY_DCC_CONTROL_PIPE environment variable or --control-pipe argument required.\n")
        sys.exit(1)

    # Ensure scripts directory is in sys.path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    dcc_name, dcc_version = get_dcc_info()
    client = ControlPipeClient(control_pipe_path)

    try:
        client.connect()
    except Exception as e:
        sys.stderr.write(f"ERROR: Failed to connect to Control Pipe '{control_pipe_path}': {e}\n")
        sys.exit(2)

    # Send Ready signal
    client.send({
        "type": "ready",
        "pid": os.getpid(),
        "dcc_name": dcc_name,
        "dcc_version": dcc_version,
    })

    print(f"[ResidentHost] Warm DCC resident session active for '{dcc_name}' (PID: {os.getpid()}). Listening for stages...", flush=True)

    # Resident message loop
    while True:
        try:
            line = client.read_line()
            if not line:
                print("[ResidentHost] Control pipe disconnected or EOF. Exiting resident loop.", flush=True)
                break

            msg = json.loads(line)
            msg_type = msg.get("type")

            if msg_type == "shutdown":
                print("[ResidentHost] Received Shutdown command. Exiting cleanly.", flush=True)
                break

            if msg_type == "run_stage":
                stage_id = msg.get("stage_execution_id", "unknown")
                task_json_path = msg.get("task_json_path", "")
                stage_pipe = msg.get("stage_pipe", "")

                print(f"[ResidentHost] === Starting Stage {stage_id} ===", flush=True)

                os.environ["FORGITY_IPC_PIPE"] = stage_pipe
                os.environ["FORGITY_TASK_JSON"] = task_json_path

                purge_step_modules()
                refresh_engine_state()

                exit_code = 0
                success = True
                err_msg = None

                try:
                    import stage_runner_guest
                    importlib.reload(stage_runner_guest)
                    stage_runner_guest.main()
                except SystemExit as se:
                    code = se.code if isinstance(se.code, int) else (0 if se.code is None else 1)
                    exit_code = code
                    if code != 0:
                        success = False
                        err_msg = f"Guest execution exited with code {code}"
                except Exception as ex:
                    exit_code = 1
                    success = False
                    err_msg = f"{ex}\n{traceback.format_exc()}"

                client.send({
                    "type": "stage_finished",
                    "stage_execution_id": stage_id,
                    "exit_code": exit_code,
                    "success": success,
                    "error_message": err_msg,
                })
                print(f"[ResidentHost] === Completed Stage {stage_id} (success={success}, code={exit_code}) ===", flush=True)

        except Exception as e:
            sys.stderr.write(f"[ResidentHost] Error processing message: {e}\n")
            traceback.print_exc()
            break

    client.close()
    print("[ResidentHost] Resident host shutdown complete.", flush=True)


if __name__ == "__main__":
    main()

