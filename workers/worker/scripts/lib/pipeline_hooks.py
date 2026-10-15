import json
import sys

class PipelineHooks:
    # Set by stage_runner before running each step
    _current_step_execution_id: str | None = None
    _current_step_inputs: dict = {}
    _current_step_outputs: dict = {}

    @staticmethod
    def _emit(event: dict):
        print("PIPELINE_EVENT:" + json.dumps(event), flush=True)

    @staticmethod
    def set_step_context(step_execution_id: str, inputs: dict):
        PipelineHooks._current_step_execution_id = step_execution_id
        PipelineHooks._current_step_inputs = inputs or {}
        PipelineHooks._current_step_outputs = {}

    @staticmethod
    def get_input(key: str, default=None):
        return PipelineHooks._current_step_inputs.get(key, default)

    @staticmethod
    def set_output(key: str, value):
        PipelineHooks._current_step_outputs[key] = value

    @staticmethod
    def get_outputs() -> dict:
        return PipelineHooks._current_step_outputs

    @staticmethod
    def report_step_started(step_execution_id: str):
        PipelineHooks._emit({
            "event": "step_started",
            "step_execution_id": step_execution_id
        })

    @staticmethod
    def report_step_result(step_execution_id: str, succeeded: bool, outputs: dict = None, error: str = None):
        PipelineHooks._emit({
            "event": "step_completed",
            "step_execution_id": step_execution_id,
            "succeeded": succeeded,
            "outputs": outputs if outputs is not None else PipelineHooks._current_step_outputs,
            "error_message": error
        })
