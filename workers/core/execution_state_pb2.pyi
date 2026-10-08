from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class InputMappingItem(_message.Message):
    __slots__ = ("pin_key", "source_kind", "source_node_id", "source_pin_key", "literal_value_json")
    PIN_KEY_FIELD_NUMBER: _ClassVar[int]
    SOURCE_KIND_FIELD_NUMBER: _ClassVar[int]
    SOURCE_NODE_ID_FIELD_NUMBER: _ClassVar[int]
    SOURCE_PIN_KEY_FIELD_NUMBER: _ClassVar[int]
    LITERAL_VALUE_JSON_FIELD_NUMBER: _ClassVar[int]
    pin_key: str
    source_kind: str
    source_node_id: str
    source_pin_key: str
    literal_value_json: str
    def __init__(self, pin_key: _Optional[str] = ..., source_kind: _Optional[str] = ..., source_node_id: _Optional[str] = ..., source_pin_key: _Optional[str] = ..., literal_value_json: _Optional[str] = ...) -> None: ...

class GetStepInputsRequest(_message.Message):
    __slots__ = ("access_token", "pipeline_execution_id", "stage_execution_id", "step_execution_id", "input_mappings", "scope_id", "iteration_index")
    ACCESS_TOKEN_FIELD_NUMBER: _ClassVar[int]
    PIPELINE_EXECUTION_ID_FIELD_NUMBER: _ClassVar[int]
    STAGE_EXECUTION_ID_FIELD_NUMBER: _ClassVar[int]
    STEP_EXECUTION_ID_FIELD_NUMBER: _ClassVar[int]
    INPUT_MAPPINGS_FIELD_NUMBER: _ClassVar[int]
    SCOPE_ID_FIELD_NUMBER: _ClassVar[int]
    ITERATION_INDEX_FIELD_NUMBER: _ClassVar[int]
    access_token: str
    pipeline_execution_id: str
    stage_execution_id: str
    step_execution_id: str
    input_mappings: _containers.RepeatedCompositeFieldContainer[InputMappingItem]
    scope_id: str
    iteration_index: int
    def __init__(self, access_token: _Optional[str] = ..., pipeline_execution_id: _Optional[str] = ..., stage_execution_id: _Optional[str] = ..., step_execution_id: _Optional[str] = ..., input_mappings: _Optional[_Iterable[_Union[InputMappingItem, _Mapping]]] = ..., scope_id: _Optional[str] = ..., iteration_index: _Optional[int] = ...) -> None: ...

class GetStepInputsResponse(_message.Message):
    __slots__ = ("success", "error_message", "inputs_json")
    class InputsJsonEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    INPUTS_JSON_FIELD_NUMBER: _ClassVar[int]
    success: bool
    error_message: str
    inputs_json: _containers.ScalarMap[str, str]
    def __init__(self, success: _Optional[bool] = ..., error_message: _Optional[str] = ..., inputs_json: _Optional[_Mapping[str, str]] = ...) -> None: ...

class ReportStepOutputRequest(_message.Message):
    __slots__ = ("access_token", "pipeline_execution_id", "stage_execution_id", "step_execution_id", "outputs_json", "log", "scope_id", "iteration_index")
    class OutputsJsonEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    ACCESS_TOKEN_FIELD_NUMBER: _ClassVar[int]
    PIPELINE_EXECUTION_ID_FIELD_NUMBER: _ClassVar[int]
    STAGE_EXECUTION_ID_FIELD_NUMBER: _ClassVar[int]
    STEP_EXECUTION_ID_FIELD_NUMBER: _ClassVar[int]
    OUTPUTS_JSON_FIELD_NUMBER: _ClassVar[int]
    LOG_FIELD_NUMBER: _ClassVar[int]
    SCOPE_ID_FIELD_NUMBER: _ClassVar[int]
    ITERATION_INDEX_FIELD_NUMBER: _ClassVar[int]
    access_token: str
    pipeline_execution_id: str
    stage_execution_id: str
    step_execution_id: str
    outputs_json: _containers.ScalarMap[str, str]
    log: str
    scope_id: str
    iteration_index: int
    def __init__(self, access_token: _Optional[str] = ..., pipeline_execution_id: _Optional[str] = ..., stage_execution_id: _Optional[str] = ..., step_execution_id: _Optional[str] = ..., outputs_json: _Optional[_Mapping[str, str]] = ..., log: _Optional[str] = ..., scope_id: _Optional[str] = ..., iteration_index: _Optional[int] = ...) -> None: ...

class ReportStepOutputResponse(_message.Message):
    __slots__ = ("success", "error_message")
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    success: bool
    error_message: str
    def __init__(self, success: _Optional[bool] = ..., error_message: _Optional[str] = ...) -> None: ...
