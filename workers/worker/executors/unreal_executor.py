import os
import glob
import logging
import tempfile
import datetime
from typing import List, Optional, Dict

from .base import BaseSubprocessExecutor
from worker.contracts import StageTaskMessage

logger = logging.getLogger(__name__)

UE_STAGE_RUNNER_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "scripts", "ue_stage_runner.py"
)

# Common default Unreal Engine installation paths on Windows
DEFAULT_UE_CMD_PATHS = [
    os.environ.get("UNREAL_CMD_PATH", ""),
    os.environ.get("UE_CMD_PATH", ""),
    r"C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
    r"C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
    r"C:\Program Files\Epic Games\UE_5.6\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
    r"C:\Program Files\Epic Games\UE_5.5\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
    r"C:\Program Files\Epic Games\UE_5.4\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
    r"C:\Program Files\Epic Games\UE_5.3\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
    r"C:\Program Files\Epic Games\UE_5.2\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
]


class UnrealEngineExecutor(BaseSubprocessExecutor):
    """
    Executor that runs a batch of steps inside Unreal Engine Headless CLI (UnrealEditor-Cmd.exe).
    Requires a valid .uproject path specified in task.environment_config.
    """

    def __init__(self, unreal_cmd_path: str | None = None):
        self.unreal_cmd_path = unreal_cmd_path or self._detect_unreal_cmd()
        self._temp_payload_files: Dict[str, str] = {}

    @staticmethod
    def _detect_unreal_cmd() -> str:
        # 1. Environment variables
        for env_var in ["UNREAL_CMD_PATH", "UE_CMD_PATH"]:
            val = os.environ.get(env_var, "").strip()
            if val and os.path.isfile(val):
                return val

        # 2. Dynamic scan in common installation roots (reverse sort so newest version is picked)
        scan_patterns = [
            r"C:\Program Files\Epic Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"D:\Program Files\Epic Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"D:\Epic Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
            r"C:\Epic Games\UE_*\Engine\Binaries\Win64\UnrealEditor-Cmd.exe",
        ]
        for pat in scan_patterns:
            matches = sorted(glob.glob(pat), reverse=True)
            for m in matches:
                if os.path.isfile(m):
                    return m

        # 3. Known hardcoded fallbacks
        for path in DEFAULT_UE_CMD_PATHS:
            if path and os.path.isfile(path):
                return path

        return "UnrealEditor-Cmd.exe"

    def _resolve_unreal_cmd(self, task: StageTaskMessage) -> str:
        env = task.environment_config or {}
        custom_path = (
            env.get("unrealCmdPath")
            or env.get("unreal_cmd_path")
            or env.get("ueCmdPath")
            or env.get("ue_cmd_path")
            or env.get("UnrealCmdPath")
        )
        if custom_path and os.path.isfile(custom_path):
            return custom_path
        return self.unreal_cmd_path or self._detect_unreal_cmd()

    def _resolve_project_path(self, task: StageTaskMessage) -> str | None:
        env = task.environment_config or {}
        return (
            env.get("fullPathProject")
            or env.get("full_path_project")
            or env.get("project_path")
            or env.get("uproject_path")
            or env.get("ProjectPath")
        )

    def build_command(self, task: StageTaskMessage) -> List[str]:
        unreal_cmd = self._resolve_unreal_cmd(task)
        if not os.path.isfile(unreal_cmd):
            raise FileNotFoundError(
                f"UnrealEditor-Cmd executable not found at '{unreal_cmd}'. "
                "Please install Unreal Engine or configure UNREAL_CMD_PATH."
            )

        project_path = self._resolve_project_path(task)
        if not project_path:
            raise ValueError(
                "UnrealEngineExecutor requires 'fullPathProject' in environment_config. "
                "Please configure Runner → Unreal executor → Registered Unreal Projects (.uproject) for this Studio project."
            )

        if not os.path.isfile(project_path):
            raise FileNotFoundError(f"Unreal .uproject file not found at: '{project_path}'")

        return [
            unreal_cmd,
            project_path,
            "-run=pythonscript",
            f"-script={UE_STAGE_RUNNER_PATH}",
            "-stdout",
            "-FullStdOutLogOutput",
            "-UTF8Output",
            "-unattended",
            "-nosplash",
        ]

    def prepare_environment(self, task: StageTaskMessage) -> Dict[str, str]:
        env = super().prepare_environment(task)

        # Write payload to a temporary JSON file as fallback for UE Python environment
        stdin_payload = task.model_dump_json(by_alias=True)
        temp_payload_file = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8", dir=env["TEMP"]
        )
        temp_payload_file.write(stdin_payload)
        temp_payload_file.close()

        self._temp_payload_files[task.stage_execution_id] = temp_payload_file.name
        env["UE_STAGE_TASK_FILE"] = temp_payload_file.name
        return env

    def get_stdin_payload(self, task: StageTaskMessage) -> Optional[str]:
        # UnrealEditor-Cmd takes input via UE_STAGE_TASK_FILE; stdin is DEVNULL
        return None

    def merge_stderr_to_stdout(self, task: StageTaskMessage) -> bool:
        # Merging stderr into stdout prevents pipe buffer deadlock in UE headless
        return True

    def get_log_files(self, task: StageTaskMessage) -> List[str]:
        from core.runtime_storage import settings
        log_dir = str(settings()[0] / "logs")
        os.makedirs(log_dir, exist_ok=True)
        live_log_path = os.path.join(log_dir, "unreal_latest.log")

        exec_id = getattr(task, "execution_id", None) or getattr(task, "stage_execution_id", None) or "unknown"
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        exec_log_path = os.path.join(log_dir, f"unreal_{ts}_{str(exec_id)[:8]}.log")
        return [live_log_path, exec_log_path]

    def cleanup_after_execution(self, task: StageTaskMessage) -> None:
        temp_path = self._temp_payload_files.pop(task.stage_execution_id, None)
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                logger.warning(f"Could not remove temp payload file '{temp_path}': {e}")
