namespace Automation.Pipeline.Engine.Models;

public enum StageBindingSource
{
    HeaderSelect,
    DataWire,
    AutoMatch
}

/// <summary>
/// Đại diện cho ràng buộc giữa Stage (Container Node) với Worker Executor và Runner máy trạm.
/// Hỗ trợ cơ chế Plug over Select (Dây cắm vào pin "runner" ưu tiên hơn dropdown tĩnh trên header).
/// </summary>
public sealed record StageWorkerBinding
{
    public Guid StageId { get; init; }
    public string StageName { get; init; } = string.Empty;
    public string StageKind { get; init; } = "Worker"; // "Worker" | "Server" | "Macro"
    public string Executor { get; init; } = "dotNet"; // "dotNet" | "blender" | "unreal" | "python"
    public bool IsWorkerStage => !Executor.Equals("dotNet", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Runner ID được cấu hình cứng từ dropdown trên Header của ScopeContainerNode
    /// </summary>
    public Guid? ConfiguredRunnerId { get; init; }

    /// <summary>
    /// Node nguồn cắm dây vào chân pin "runner" của Stage Container (nếu có)
    /// </summary>
    public Guid? BoundSourceNodeId { get; init; }

    /// <summary>
    /// Chân pin nguồn của node nguồn cắm vào chân pin "runner" của Stage Container
    /// </summary>
    public string? BoundSourcePin { get; init; }

    /// <summary>
    /// Runner ID thực tế được quyết định khi Build Map (ưu tiên DataWire > HeaderSelect > AutoMatch)
    /// </summary>
    public Guid? EffectiveRunnerId { get; init; }

    /// <summary>
    /// Nguồn gốc quyết định Runner ID (DataWire, HeaderSelect, AutoMatch)
    /// </summary>
    public StageBindingSource BindingSource { get; init; } = StageBindingSource.HeaderSelect;

    /// <summary>
    /// Tên Queue RabbitMQ mà Stage này sẽ gửi Task tới: "stage_tasks.{effectiveRunnerId}"
    /// </summary>
    public string TargetQueueName { get; init; } = string.Empty;

    /// <summary>
    /// Trạng thái hợp lệ của Stage binding sau khi kiểm tra Pre-flight Validation
    /// </summary>
    public bool IsValid { get; init; } = true;
    public string? ValidationError { get; init; }
}
