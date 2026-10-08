import json
import logging
import os
import subprocess
import uuid
from core.runtime_storage import settings
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Callable, List, Optional, Dict, Any

if TYPE_CHECKING:
    from worker.contracts import StageTaskMessage

logger = logging.getLogger(__name__)


@dataclass
class StepResult:
    """Result of a single script step within a batch execution."""
    step_execution_id: str
    succeeded: bool
    log: str = ""
    error_message: str | None = None
    outputs: dict = field(default_factory=dict)


@dataclass
class ExecutionResult:
    """Result returned from an executor after running a stage."""
    succeeded: bool
    log: str = ""
    error_message: str | None = None
    step_results: list[StepResult] = field(default_factory=list)


class BaseExecutor(ABC):
    """
    Abstract base class for all executors.
    Each executor inherits this class and implements the `execute` method.
    """

    @abstractmethod
    def execute(
        self,
        task: "StageTaskMessage",
        timeout: int = 600,
        progress_callback: Optional[Callable[[str, str], None]] = None
    ) -> ExecutionResult:
        """
        Execute a full Stage with all its Steps.
        """
        ...

    def _build_stdin_payload(self, data: dict) -> str:
        """Serialize data to JSON string for stdin."""
        return json.dumps(data, default=str)

    def _parse_stdout_result(self, stdout: str) -> dict:
        """
        Parse JSON result from the last line of stdout.
        Script must print JSON result as the last stdout line.
        """
        lines = stdout.strip().split("\n")
        for line in reversed(lines):
            line = line.strip()
            if line.startswith("{"):
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    continue
        return {}


class BaseSubprocessExecutor(BaseExecutor):
    """
    Standard base executor for process-based execution (Blender, Python CLI, Unreal Engine, etc.).
    Centralizes subprocess lifecycle, cross-platform UTF-8 streaming, structured PIPELINE_EVENT parsing,
    real-time progress dispatching, log capture, timeout handling, and result synthesis.
    """

    @abstractmethod
    def build_command(self, task: "StageTaskMessage") -> List[str]:
        """Build the subprocess command line argument list."""
        ...

    def prepare_environment(self, task: "StageTaskMessage") -> Dict[str, str]:
        """Hook to configure environment variables for the subprocess."""
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        env["PYTHONUNBUFFERED"] = "1"
        temp_dir = settings()[0] / "temp" / uuid.uuid4().hex
        temp_dir.mkdir(parents=True, exist_ok=True)
        for key in ("TEMP", "TMP", "TMPDIR"):
            env[key] = str(temp_dir)
        return env

    def get_stdin_payload(self, task: "StageTaskMessage") -> Optional[str]:
        """Return payload string to send via stdin, or None if stdin is not used."""
        return task.model_dump_json(by_alias=True)

    def get_log_files(self, task: "StageTaskMessage") -> List[str]:
        """Hook returning file paths where live stdout output should also be mirrored."""
        return []

    def merge_stderr_to_stdout(self, task: "StageTaskMessage") -> bool:
        """Whether to merge stderr into stdout (recommended for UE headless to avoid pipe deadlocks)."""
        return False

    def cleanup_after_execution(self, task: "StageTaskMessage") -> None:
        """Optional hook called in finally block after process finishes."""
        pass

    def execute(
        self,
        task: "StageTaskMessage",
        timeout: int = 600,
        progress_callback: Optional[Callable[[str, str], None]] = None
    ) -> ExecutionResult:
        try:
            command = self.build_command(task)
        except Exception as e:
            err_msg = f"Failed to build command for executor: {e}"
            logger.error(err_msg, exc_info=True)
            return ExecutionResult(succeeded=False, error_message=err_msg)

        logger.info(f"[{self.__class__.__name__}] Executing stage {task.stage_execution_id} ({len(task.steps)} steps)")
        logger.info(f"Command: {' '.join(str(c) for c in command)}")

        env = self.prepare_environment(task)
        stdin_payload = self.get_stdin_payload(task)
        log_files = self.get_log_files(task)
        merge_stderr = self.merge_stderr_to_stdout(task)

        # Prepare log file writers
        file_handles = []
        for lp in log_files:
            try:
                os.makedirs(os.path.dirname(os.path.abspath(lp)), exist_ok=True)
                file_handles.append(open(lp, "w", encoding="utf-8"))
            except Exception as fe:
                logger.warning(f"Could not open log file '{lp}': {fe}")

        def write_mirrored_log(text: str):
            for fh in file_handles:
                try:
                    fh.write(text)
                    fh.flush()
                except Exception:
                    pass

        proc = None
        stdout_lines: List[str] = []
        step_results: List[StepResult] = []

        try:
            proc = subprocess.Popen(
                command,
                stdin=subprocess.PIPE if stdin_payload is not None else subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT if merge_stderr else subprocess.PIPE,
                env=env,
            )

            if stdin_payload is not None and proc.stdin:
                proc.stdin.write(stdin_payload.encode("utf-8"))
                proc.stdin.close()

            # Stream stdout in real-time
            if proc.stdout:
                for raw_line in proc.stdout:
                    line = raw_line.decode("utf-8", errors="replace")
                    print(line, end="", flush=True)
                    stdout_lines.append(line)
                    write_mirrored_log(line)

                    # Parse structured PIPELINE_EVENT
                    if "PIPELINE_EVENT:" in line:
                        json_str = line.split("PIPELINE_EVENT:", 1)[1].strip()
                        try:
                            event = json.loads(json_str)
                            event_type = event.get("event")

                            if event_type == "step_started":
                                step_id = event["step_execution_id"]
                                logger.info(f"==> Step started: {step_id}")
                                if progress_callback:
                                    progress_callback(step_id, "Running")

                            elif event_type == "step_completed":
                                step_id = event["step_execution_id"]
                                succeeded = event["succeeded"]
                                error_msg = event.get("error_message")
                                outputs = event.get("outputs", {})
                                logger.info(f"<== Step completed: {step_id} (succeeded={succeeded})")
                                step_results.append(StepResult(
                                    step_execution_id=step_id,
                                    succeeded=succeeded,
                                    log=f"Completed (succeeded={succeeded})",
                                    error_message=error_msg,
                                    outputs=outputs,
                                ))
                                if progress_callback:
                                    status = "Succeeded" if succeeded else "Failed"
                                    progress_callback(step_id, status)
                        except Exception as pe:
                            logger.warning(f"Failed to parse PIPELINE_EVENT line: {pe}")

            proc.wait(timeout=timeout)
            stderr = ""
            if not merge_stderr and proc.stderr:
                stderr = proc.stderr.read().decode("utf-8", errors="replace")
                if stderr:
                    print(stderr, end="", flush=True)
                    write_mirrored_log(stderr)

            succeeded = proc.returncode == 0 and not any(not sr.succeeded for sr in step_results)
            full_log = "".join(stdout_lines)

            # Fallback if no structured results were parsed
            if not step_results and task.steps:
                step_results = [
                    StepResult(
                        step_execution_id=step.step_execution_id,
                        succeeded=succeeded,
                        log=full_log if succeeded else (stderr or full_log),
                        error_message=None if succeeded else f"Process exited with code {proc.returncode}: {stderr or 'No stderr'}",
                    )
                    for step in task.steps
                ]

            err = None
            if not succeeded:
                err = next((sr.error_message for sr in step_results if not sr.succeeded and sr.error_message), None)
                if not err:
                    err = stderr or f"Process exited with code {proc.returncode}"

            return ExecutionResult(
                succeeded=succeeded,
                log=full_log,
                error_message=err,
                step_results=step_results,
            )

        except subprocess.TimeoutExpired:
            if proc:
                proc.kill()
            err_msg = f"Stage timed out after {timeout} seconds"
            logger.error(err_msg)
            return ExecutionResult(
                succeeded=False,
                error_message=err_msg,
                log="".join(stdout_lines),
                step_results=step_results,
            )
        except Exception as e:
            if proc:
                try:
                    proc.kill()
                except Exception:
                    pass
            err_msg = f"Execution failed with exception: {e}"
            logger.exception(err_msg)
            return ExecutionResult(
                succeeded=False,
                error_message=err_msg,
                log="".join(stdout_lines),
                step_results=step_results,
            )
        finally:
            for fh in file_handles:
                try:
                    fh.close()
                except Exception:
                    pass
            try:
                self.cleanup_after_execution(task)
            except Exception as ce:
                logger.warning(f"Error during post-execution cleanup: {ce}")
