using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Contracts.Tools;
namespace Automation.Pipeline.BuildTime.Graph;

public static class PipelineGraphAnalyzer
{
    /// <summary>
    /// Phân tích toàn bộ đồ thị của Pipeline để tìm tất cả các Node bị nhiễm tính Dynamic.
    /// Một Pure Node là Dynamic nếu:
    /// 1. Bản thân Tool của nó là Dynamic (tool.IsDynamic == true, ví dụ GetVariable).
    /// 2. HOẶC nó nhận dây dữ liệu từ một node Dynamic upstream (Forward Dependency Tainting).
    /// </summary>
    public static HashSet<Guid> AnalyzeVolatileNodes(Domain.Entities.Pipeline pipeline, IToolRegistry toolRegistry)
    {
        var volatileNodes = new HashSet<Guid>();
        if (pipeline.Nodes == null || pipeline.Nodes.Count == 0)
        {
            return volatileNodes;
        }

        // Bước 1: Tìm tất cả các node gốc có tính Dynamic tự thân
        foreach (var node in pipeline.Nodes)
        {
            var tool = toolRegistry.Get(node.RefId);
            if (tool?.IsVolatile == true)
            {
                volatileNodes.Add(node.Id);
            }
        }

        if (pipeline.Edges == null || pipeline.Edges.Count == 0 || volatileNodes.Count == 0)
        {
            return volatileNodes;
        }

        // Bước 2: Lan truyền xuôi theo dây dữ liệu (Forward Propagation)
        // Nếu node nguồn là Dynamic, thì bất kỳ Pure Node đích nào nhận dữ liệu cũng bị nhiễm Dynamic
        bool hasChanged = true;
        while (hasChanged)
        {
            hasChanged = false;
            foreach (var edge in pipeline.Edges)
            {
                if (volatileNodes.Contains(edge.SourcePipelineNodeId))
                {
                    var targetNode = pipeline.Nodes.FirstOrDefault(n => n.Id == edge.TargetPipelineNodeId);
                    if (targetNode != null && !volatileNodes.Contains(targetNode.Id))
                    {
                        var targetTool = toolRegistry.Get(targetNode.RefId);
                        // Chỉ cần targetTool là Pure Node, việc nhận dữ liệu từ dynamic node sẽ khiến nó không được memoize
                        if (targetTool?.IsPure == true)
                        {
                            volatileNodes.Add(targetNode.Id);
                            hasChanged = true;
                        }
                    }
                }
            }
        }

        return volatileNodes;
    }
}
