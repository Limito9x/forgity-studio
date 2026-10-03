using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Automation.Pipeline.Engine.EntityStore;

/// <summary>
/// Quản lý Identity Map và In-Memory Entity Cache cho mỗi phiên thực thi Pipeline.
/// Triệt tiêu hoàn toàn I/O ẩn trong các Pure Node (BreakStruct).
/// </summary>
public interface IExecutionEntityStore
{
    /// <summary>
    /// Đọc thuộc tính Entity đã được nạp sẵn trong bộ nhớ (Zero I/O, Pure 100%).
    /// </summary>
    Dictionary<string, object?>? GetProperties(string entityType, Guid id);

    /// <summary>
    /// Ghi / Cập nhật Entity khi có Node can thiệp (Mutation).
    /// </summary>
    void SetProperties(string entityType, Guid id, Dictionary<string, object?> properties);

    /// <summary>
    /// Nạp trước hàng loạt Resource Entities chỉ với 1 câu SQL batch duy nhất.
    /// </summary>
    Task PrefetchResourcesAsync(IEnumerable<Guid> resourceIds, CancellationToken ct = default);
}
