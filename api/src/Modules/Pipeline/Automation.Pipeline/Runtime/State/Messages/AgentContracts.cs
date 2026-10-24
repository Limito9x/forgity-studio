using System.Text.Json.Serialization;
namespace Automation.Pipeline.Runtime.State.Messages;

public class StepExecutionParam
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = string.Empty;

    [JsonPropertyName("value")]
    public string Value { get; set; } = string.Empty;
}

public class StepInputMapping
{
    [JsonPropertyName("pin_key")]
    public string PinKey { get; set; } = string.Empty;

    [JsonPropertyName("source_kind")]
    public string SourceKind { get; set; } = string.Empty; // "start_input" | "node_output" | "literal"

    [JsonPropertyName("source_node_id")]
    public string? SourceNodeId { get; set; }

    [JsonPropertyName("source_pin_key")]
    public string SourcePinKey { get; set; } = string.Empty;

    [JsonPropertyName("literal_value")]
    public object? LiteralValue { get; set; }
}

public class StepExecution
{
    [JsonPropertyName("step_execution_id")]
    public string StepExecutionId { get; set; } = string.Empty;

    [JsonPropertyName("step_type")]
    public string StepType { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("script_path")]
    public string ScriptPath { get; set; } = string.Empty;

    [JsonPropertyName("script_url")]
    public string? ScriptUrl { get; set; }

    [JsonPropertyName("script_hash")]
    public string? ScriptHash { get; set; }

    [JsonPropertyName("entry_point")]
    public string? EntryPoint { get; set; }

    [JsonPropertyName("arguments")]
    public string Arguments { get; set; } = string.Empty;

    [JsonPropertyName("order")]
    public int Order { get; set; }

    [JsonPropertyName("input_mappings")]
    public List<StepInputMapping> InputMappings { get; set; } = [];

    [JsonPropertyName("params")]
    public List<StepExecutionParam> Params { get; set; } = [];

    [JsonPropertyName("inputs")]
    public Dictionary<string, object?> Inputs { get; set; } = [];

    [JsonPropertyName("outputs")]
    public List<string> Outputs { get; set; } = [];
}

public class StageTaskMessage
{
    [JsonPropertyName("stage_execution_id")]
    public string StageExecutionId { get; set; } = string.Empty;

    [JsonPropertyName("pipeline_execution_id")]
    public string PipelineExecutionId { get; set; } = string.Empty;

    [JsonPropertyName("pipeline_id")]
    public string PipelineId { get; set; } = string.Empty;

    [JsonPropertyName("stage_id")]
    public string StageId { get; set; } = string.Empty;

    [JsonPropertyName("executor")]
    public string Executor { get; set; } = string.Empty;

    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = string.Empty;

    [JsonPropertyName("grpc_endpoint")]
    public string GrpcEndpoint { get; set; } = string.Empty;

    [JsonPropertyName("steps")]
    public List<StepExecution> Steps { get; set; } = [];

    [JsonPropertyName("resolved_data")]
    public Dictionary<string, object?> ResolvedData { get; set; } = [];

    [JsonPropertyName("environment_config")]
    public Dictionary<string, object?> EnvironmentConfig { get; set; } = [];
}

public class StepProgressMessage
{
    [JsonPropertyName("pipeline_execution_id")]
    public string PipelineExecutionId { get; set; } = string.Empty;

    [JsonPropertyName("pipeline_id")]
    public string PipelineId { get; set; } = string.Empty;

    [JsonPropertyName("stage_execution_id")]
    public string StageExecutionId { get; set; } = string.Empty;

    [JsonPropertyName("step_execution_id")]
    public string StepExecutionId { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("outputs")]
    public Dictionary<string, object?>? Outputs { get; set; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; set; }
}

public record StageTimeoutCheckMessage(Guid ExecutionId, string StageExecutionId);

public class StepResult
{
    [JsonPropertyName("step_execution_id")]
    public string StepExecutionId { get; set; } = string.Empty;

    [JsonPropertyName("succeeded")]
    public bool Succeeded { get; set; }

    [JsonPropertyName("log")]
    public string? Log { get; set; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; set; }

    [JsonPropertyName("outputs")]
    public Dictionary<string, object?>? Outputs { get; set; }
}

public class StageResultMessage
{
    [JsonPropertyName("pipeline_execution_id")]
    public string PipelineExecutionId { get; set; } = string.Empty;

    [JsonPropertyName("pipeline_id")]
    public string PipelineId { get; set; } = string.Empty;

    [JsonPropertyName("stage_execution_id")]
    public string StageExecutionId { get; set; } = string.Empty;

    [JsonPropertyName("succeeded")]
    public bool Succeeded { get; set; }

    [JsonPropertyName("log")]
    public string? Log { get; set; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; set; }

    [JsonPropertyName("step_results")]
    public List<StepResult> StepResults { get; set; } = [];
}
