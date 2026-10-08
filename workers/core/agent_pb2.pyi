from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class AgentMessage(_message.Message):
    __slots__ = ("agent_id", "command_response")
    AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    COMMAND_RESPONSE_FIELD_NUMBER: _ClassVar[int]
    agent_id: str
    command_response: CommandResponse
    def __init__(self, agent_id: _Optional[str] = ..., command_response: _Optional[_Union[CommandResponse, _Mapping]] = ...) -> None: ...

class CommandResponse(_message.Message):
    __slots__ = ("command_id", "success", "error_message", "scan_result", "browse_result", "scan_executors_result", "scan_hardware_result")
    COMMAND_ID_FIELD_NUMBER: _ClassVar[int]
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    SCAN_RESULT_FIELD_NUMBER: _ClassVar[int]
    BROWSE_RESULT_FIELD_NUMBER: _ClassVar[int]
    SCAN_EXECUTORS_RESULT_FIELD_NUMBER: _ClassVar[int]
    SCAN_HARDWARE_RESULT_FIELD_NUMBER: _ClassVar[int]
    command_id: str
    success: bool
    error_message: str
    scan_result: ScanCommandResult
    browse_result: BrowseCommandResult
    scan_executors_result: ScanExecutorsCommandResult
    scan_hardware_result: ScanHardwareCommandResult
    def __init__(self, command_id: _Optional[str] = ..., success: _Optional[bool] = ..., error_message: _Optional[str] = ..., scan_result: _Optional[_Union[ScanCommandResult, _Mapping]] = ..., browse_result: _Optional[_Union[BrowseCommandResult, _Mapping]] = ..., scan_executors_result: _Optional[_Union[ScanExecutorsCommandResult, _Mapping]] = ..., scan_hardware_result: _Optional[_Union[ScanHardwareCommandResult, _Mapping]] = ...) -> None: ...

class ScanHardwareCommandResult(_message.Message):
    __slots__ = ("os_platform", "cpu_model", "total_ram_bytes", "primary_gpu_name", "primary_gpu_vram_bytes", "hardware_details_json")
    OS_PLATFORM_FIELD_NUMBER: _ClassVar[int]
    CPU_MODEL_FIELD_NUMBER: _ClassVar[int]
    TOTAL_RAM_BYTES_FIELD_NUMBER: _ClassVar[int]
    PRIMARY_GPU_NAME_FIELD_NUMBER: _ClassVar[int]
    PRIMARY_GPU_VRAM_BYTES_FIELD_NUMBER: _ClassVar[int]
    HARDWARE_DETAILS_JSON_FIELD_NUMBER: _ClassVar[int]
    os_platform: str
    cpu_model: str
    total_ram_bytes: int
    primary_gpu_name: str
    primary_gpu_vram_bytes: int
    hardware_details_json: str
    def __init__(self, os_platform: _Optional[str] = ..., cpu_model: _Optional[str] = ..., total_ram_bytes: _Optional[int] = ..., primary_gpu_name: _Optional[str] = ..., primary_gpu_vram_bytes: _Optional[int] = ..., hardware_details_json: _Optional[str] = ...) -> None: ...

class ScanCommandResult(_message.Message):
    __slots__ = ("items",)
    ITEMS_FIELD_NUMBER: _ClassVar[int]
    items: _containers.RepeatedCompositeFieldContainer[ResourceItemMessage]
    def __init__(self, items: _Optional[_Iterable[_Union[ResourceItemMessage, _Mapping]]] = ...) -> None: ...

class SystemPlaceMessage(_message.Message):
    __slots__ = ("name", "path")
    NAME_FIELD_NUMBER: _ClassVar[int]
    PATH_FIELD_NUMBER: _ClassVar[int]
    name: str
    path: str
    def __init__(self, name: _Optional[str] = ..., path: _Optional[str] = ...) -> None: ...

class DriveInfoMessage(_message.Message):
    __slots__ = ("mount", "label", "total_bytes", "free_bytes")
    MOUNT_FIELD_NUMBER: _ClassVar[int]
    LABEL_FIELD_NUMBER: _ClassVar[int]
    TOTAL_BYTES_FIELD_NUMBER: _ClassVar[int]
    FREE_BYTES_FIELD_NUMBER: _ClassVar[int]
    mount: str
    label: str
    total_bytes: int
    free_bytes: int
    def __init__(self, mount: _Optional[str] = ..., label: _Optional[str] = ..., total_bytes: _Optional[int] = ..., free_bytes: _Optional[int] = ...) -> None: ...

class BrowseCommandResult(_message.Message):
    __slots__ = ("current_path", "parent_path", "can_navigate_up", "items", "system_places", "pinned_folders", "drives")
    CURRENT_PATH_FIELD_NUMBER: _ClassVar[int]
    PARENT_PATH_FIELD_NUMBER: _ClassVar[int]
    CAN_NAVIGATE_UP_FIELD_NUMBER: _ClassVar[int]
    ITEMS_FIELD_NUMBER: _ClassVar[int]
    SYSTEM_PLACES_FIELD_NUMBER: _ClassVar[int]
    PINNED_FOLDERS_FIELD_NUMBER: _ClassVar[int]
    DRIVES_FIELD_NUMBER: _ClassVar[int]
    current_path: str
    parent_path: str
    can_navigate_up: bool
    items: _containers.RepeatedCompositeFieldContainer[BrowseItemMessage]
    system_places: _containers.RepeatedCompositeFieldContainer[SystemPlaceMessage]
    pinned_folders: _containers.RepeatedScalarFieldContainer[str]
    drives: _containers.RepeatedCompositeFieldContainer[DriveInfoMessage]
    def __init__(self, current_path: _Optional[str] = ..., parent_path: _Optional[str] = ..., can_navigate_up: _Optional[bool] = ..., items: _Optional[_Iterable[_Union[BrowseItemMessage, _Mapping]]] = ..., system_places: _Optional[_Iterable[_Union[SystemPlaceMessage, _Mapping]]] = ..., pinned_folders: _Optional[_Iterable[str]] = ..., drives: _Optional[_Iterable[_Union[DriveInfoMessage, _Mapping]]] = ...) -> None: ...

class ScanExecutorsCommandResult(_message.Message):
    __slots__ = ("items",)
    ITEMS_FIELD_NUMBER: _ClassVar[int]
    items: _containers.RepeatedCompositeFieldContainer[ExecutorCandidateMessage]
    def __init__(self, items: _Optional[_Iterable[_Union[ExecutorCandidateMessage, _Mapping]]] = ...) -> None: ...

class ExecutorCandidateMessage(_message.Message):
    __slots__ = ("executor_key", "executable_path", "version")
    EXECUTOR_KEY_FIELD_NUMBER: _ClassVar[int]
    EXECUTABLE_PATH_FIELD_NUMBER: _ClassVar[int]
    VERSION_FIELD_NUMBER: _ClassVar[int]
    executor_key: str
    executable_path: str
    version: str
    def __init__(self, executor_key: _Optional[str] = ..., executable_path: _Optional[str] = ..., version: _Optional[str] = ...) -> None: ...

class ResourceItemMessage(_message.Message):
    __slots__ = ("relative_path", "hash", "size_bytes")
    RELATIVE_PATH_FIELD_NUMBER: _ClassVar[int]
    HASH_FIELD_NUMBER: _ClassVar[int]
    SIZE_BYTES_FIELD_NUMBER: _ClassVar[int]
    relative_path: str
    hash: str
    size_bytes: int
    def __init__(self, relative_path: _Optional[str] = ..., hash: _Optional[str] = ..., size_bytes: _Optional[int] = ...) -> None: ...

class BrowseItemMessage(_message.Message):
    __slots__ = ("name", "path", "is_directory", "size_bytes")
    NAME_FIELD_NUMBER: _ClassVar[int]
    PATH_FIELD_NUMBER: _ClassVar[int]
    IS_DIRECTORY_FIELD_NUMBER: _ClassVar[int]
    SIZE_BYTES_FIELD_NUMBER: _ClassVar[int]
    name: str
    path: str
    is_directory: bool
    size_bytes: int
    def __init__(self, name: _Optional[str] = ..., path: _Optional[str] = ..., is_directory: _Optional[bool] = ..., size_bytes: _Optional[int] = ...) -> None: ...

class ServerMessage(_message.Message):
    __slots__ = ("scan_command", "browse_command", "scan_executors_command", "scan_hardware_command")
    SCAN_COMMAND_FIELD_NUMBER: _ClassVar[int]
    BROWSE_COMMAND_FIELD_NUMBER: _ClassVar[int]
    SCAN_EXECUTORS_COMMAND_FIELD_NUMBER: _ClassVar[int]
    SCAN_HARDWARE_COMMAND_FIELD_NUMBER: _ClassVar[int]
    scan_command: ScanCommand
    browse_command: BrowseCommand
    scan_executors_command: ScanExecutorsCommand
    scan_hardware_command: ScanHardwareCommand
    def __init__(self, scan_command: _Optional[_Union[ScanCommand, _Mapping]] = ..., browse_command: _Optional[_Union[BrowseCommand, _Mapping]] = ..., scan_executors_command: _Optional[_Union[ScanExecutorsCommand, _Mapping]] = ..., scan_hardware_command: _Optional[_Union[ScanHardwareCommand, _Mapping]] = ...) -> None: ...

class ScanCommand(_message.Message):
    __slots__ = ("command_id", "directory_path", "extensions")
    COMMAND_ID_FIELD_NUMBER: _ClassVar[int]
    DIRECTORY_PATH_FIELD_NUMBER: _ClassVar[int]
    EXTENSIONS_FIELD_NUMBER: _ClassVar[int]
    command_id: str
    directory_path: str
    extensions: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, command_id: _Optional[str] = ..., directory_path: _Optional[str] = ..., extensions: _Optional[_Iterable[str]] = ...) -> None: ...

class BrowseCommand(_message.Message):
    __slots__ = ("command_id", "directory_path")
    COMMAND_ID_FIELD_NUMBER: _ClassVar[int]
    DIRECTORY_PATH_FIELD_NUMBER: _ClassVar[int]
    command_id: str
    directory_path: str
    def __init__(self, command_id: _Optional[str] = ..., directory_path: _Optional[str] = ...) -> None: ...

class ScanExecutorsCommand(_message.Message):
    __slots__ = ("command_id", "executor_key")
    COMMAND_ID_FIELD_NUMBER: _ClassVar[int]
    EXECUTOR_KEY_FIELD_NUMBER: _ClassVar[int]
    command_id: str
    executor_key: str
    def __init__(self, command_id: _Optional[str] = ..., executor_key: _Optional[str] = ...) -> None: ...

class ScanHardwareCommand(_message.Message):
    __slots__ = ("command_id",)
    COMMAND_ID_FIELD_NUMBER: _ClassVar[int]
    command_id: str
    def __init__(self, command_id: _Optional[str] = ...) -> None: ...
