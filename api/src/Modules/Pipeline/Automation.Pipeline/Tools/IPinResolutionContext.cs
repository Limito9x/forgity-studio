using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.StructRegistry;

namespace Automation.Pipeline.Tools;

public interface IPinResolutionContext
{
    IEntityStructRegistry? StructRegistry { get; }
    Guid? ProjectId { get; }
    IReadOnlyList<PipelineParameter>? Parameters { get; }
    IReadOnlyList<PipelineVariableDecl>? Variables { get; }
}

public sealed class PinResolutionContext : IPinResolutionContext
{
    public IEntityStructRegistry? StructRegistry { get; }
    public Guid? ProjectId { get; }
    public IReadOnlyList<PipelineParameter>? Parameters { get; }

    public IReadOnlyList<PipelineVariableDecl>? Variables =>
        Parameters?.Where(p => p.Kind == PipelineParameterKind.Variable)
            .Select(p => new PipelineVariableDecl
            {
                Name = p.Key,
                Type = p.Type,
                Cardinality = p.Cardinality,
                Description = p.Description,
                StructType = p.StructType
            }).ToList();

    public PinResolutionContext(
        IEntityStructRegistry? structRegistry,
        Guid? projectId = null,
        IReadOnlyList<PipelineParameter>? parameters = null
    )
    {
        StructRegistry = structRegistry;
        ProjectId = projectId;
        Parameters = parameters;
    }
}
