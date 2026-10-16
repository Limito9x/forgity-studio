from __future__ import annotations
import json
import logging
import urllib.parse
import grpc
from typing import Any
from core import execution_state_pb2
from core import execution_state_pb2_grpc

logger = logging.getLogger(__name__)


def _get(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        val = obj.get(key)
        return val if val is not None else default
    return getattr(obj, key, default)


def _get_channel_for_endpoint(grpc_endpoint: str | None = None):
    endpoint = grpc_endpoint or "http://127.0.0.1:50051"
    parsed = urllib.parse.urlparse(endpoint)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 50051)
    target = f"{host}:{port}"

    if parsed.scheme == "https":
        credentials = grpc.ssl_channel_credentials()
        return grpc.secure_channel(target, credentials)
    else:
        return grpc.insecure_channel(target)


class ExecutionStateClient:
    """
    gRPC Client to communicate with Backend ExecutionStateService.
    Resolves runtime step inputs and reports step outputs on-demand (JIT).
    """

    @staticmethod
    def resolve_step_inputs(task: Any, step: Any) -> dict[str, Any]:
        """
        Resolves input pins for a step via gRPC JIT Pull.
        Supports both Pydantic models and raw dicts.
        Returns a Python dict of { pin_key: resolved_value }.
        """
        resolved: dict[str, Any] = {}

        # 1. Take initial fallback inputs (if any)
        raw_inputs = _get(step, "inputs", {})
        if isinstance(raw_inputs, dict):
            for k, v in raw_inputs.items():
                resolved[k] = v

        grpc_endpoint = _get(task, "grpc_endpoint") or "http://127.0.0.1:50051"
        pipeline_exec_id = _get(task, "pipeline_execution_id", "")
        stage_exec_id = _get(task, "stage_execution_id", "")
        access_token = _get(task, "access_token", "")
        step_id = _get(step, "step_execution_id", "")
        input_mappings_raw = _get(step, "input_mappings", [])

        # 2. Build gRPC request items
        grpc_mappings = []
        for mapping in input_mappings_raw:
            pin_key = _get(mapping, "pin_key", "")
            source_kind = _get(mapping, "source_kind", "")
            source_node_id = _get(mapping, "source_node_id", "")
            source_pin_key = _get(mapping, "source_pin_key", "")
            literal_val = _get(mapping, "literal_value")
            literal_json = ""
            if literal_val is not None:
                literal_json = literal_val if isinstance(literal_val, str) else json.dumps(literal_val)

            grpc_mappings.append(
                execution_state_pb2.InputMappingItem(
                    pin_key=pin_key,
                    source_kind=source_kind,
                    source_node_id=str(source_node_id or ""),
                    source_pin_key=source_pin_key or "",
                    literal_value_json=literal_json,
                )
            )

        # 3. Call gRPC Backend
        try:
            channel = _get_channel_for_endpoint(grpc_endpoint)
            stub = execution_state_pb2_grpc.ExecutionStateServiceStub(channel)

            request = execution_state_pb2.GetStepInputsRequest(
                access_token=access_token or "",
                pipeline_execution_id=str(pipeline_exec_id),
                stage_execution_id=str(stage_exec_id),
                step_execution_id=str(step_id),
                input_mappings=grpc_mappings,
            )

            response = stub.GetStepInputs(request, timeout=10)

            if response.success:
                for k, json_str in response.inputs_json.items():
                    try:
                        resolved[k] = json.loads(json_str)
                    except Exception:
                        resolved[k] = json_str
            else:
                logger.warning(
                    f"gRPC GetStepInputs returned warning/error for step {step_id}: {response.error_message}"
                )

        except Exception as e:
            logger.warning(
                f"Failed to call gRPC GetStepInputs for step {step_id} (falling back to initial inputs): {e}"
            )

        # 4. Resolve any $file markers to local cached files
        for k, v in list(resolved.items()):
            if isinstance(v, dict) and "$file" in v:
                file_info = v["$file"]
                if isinstance(file_info, dict):
                    from core.script_resolver import resolve_file_asset
                    resolved[k] = resolve_file_asset(
                        url=file_info.get("url"),
                        file_hash=file_info.get("hash"),
                        file_name=file_info.get("filename") or file_info.get("name")
                    )

        return resolved

    @staticmethod
    def report_step_output(
        task: Any,
        step_id: str,
        outputs: dict[str, Any],
        log: str = ""
    ) -> bool:
        """
        Reports step outputs immediately to Backend MemoryStore via gRPC.
        Supports both Pydantic models and raw dicts.
        """
        grpc_endpoint = _get(task, "grpc_endpoint") or "http://127.0.0.1:50051"
        pipeline_exec_id = _get(task, "pipeline_execution_id", "")
        stage_exec_id = _get(task, "stage_execution_id", "")
        access_token = _get(task, "access_token", "")

        try:
            channel = _get_channel_for_endpoint(grpc_endpoint)
            stub = execution_state_pb2_grpc.ExecutionStateServiceStub(channel)

            outputs_json = {
                k: json.dumps(v, default=str) for k, v in outputs.items()
            }

            request = execution_state_pb2.ReportStepOutputRequest(
                access_token=access_token or "",
                pipeline_execution_id=str(pipeline_exec_id),
                stage_execution_id=str(stage_exec_id),
                step_execution_id=str(step_id),
                outputs_json=outputs_json,
                log=log,
            )

            response = stub.ReportStepOutput(request, timeout=10)
            return response.success
        except Exception as e:
            logger.warning(f"Failed to call gRPC ReportStepOutput for step {step_id}: {e}")
            return False
