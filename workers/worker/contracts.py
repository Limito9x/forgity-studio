from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class ContractModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class StepExecutionParam(ContractModel):
    key: str
    value: str


class StepInputMapping(ContractModel):
    pin_key: str
    source_kind: str = ""  # "start_input" | "node_output" | "literal"
    source_node_id: str | None = None
    source_pin_key: str = ""
    literal_value: Any | None = None


class StepExecution(ContractModel):
    step_execution_id: str
    step_type: str = ""
    name: str = ""
    script_path: str = ""
    script_url: str | None = None
    script_hash: str | None = None
    entry_point: str | None = None
    arguments: str = ""
    order: int = 0
    input_mappings: list[StepInputMapping] = Field(default_factory=list)
    params: list[StepExecutionParam] = Field(default_factory=list)
    inputs: dict[str, Any] = Field(default_factory=dict)
    outputs: list[str] = Field(default_factory=list)


class StageTaskMessage(ContractModel):
    """Message received from 'stage_tasks.{agentId}' queue."""
    stage_execution_id: str
    pipeline_execution_id: str
    pipeline_id: str = ""
    stage_id: str = ""
    executor: str  # "blender" | "python"
    access_token: str = ""
    grpc_endpoint: str = ""
    steps: list[StepExecution]
    resolved_data: dict[str, Any] = Field(default_factory=dict)
    environment_config: dict[str, Any] = Field(default_factory=dict)


class StepProgressMessage(ContractModel):
    """Message sent to 'step_progress' queue to update step execution status."""
    pipeline_execution_id: str = ""
    pipeline_id: str = ""
    stage_execution_id: str
    step_execution_id: str
    status: str  # "Running" | "Succeeded" | "Failed" | "Cancelled"
    outputs: dict[str, Any] | None = None
    error_message: str | None = None


class StepResult(ContractModel):
    step_execution_id: str
    succeeded: bool
    log: str | None = None
    error_message: str | None = None
    outputs: dict[str, Any] = Field(default_factory=dict)


class StageResultMessage(ContractModel):
    """Message sent to 'stage_results' queue upon stage completion."""
    stage_execution_id: str
    pipeline_execution_id: str = ""
    pipeline_id: str = ""
    succeeded: bool
    log: str | None = None
    error_message: str | None = None
    step_results: list[StepResult] = Field(default_factory=list)
