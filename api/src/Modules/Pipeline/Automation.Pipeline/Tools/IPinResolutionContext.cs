using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.StructRegistry;

namespace Automation.Pipeline.Tools;

public interface IPinResolutionContext
{
    IEntityStructRegistry? StructRegistry { get; }
    Guid? ProjectId { get; }
    IReadOnlyList<PipelineVariableDecl>? Variables { get; }
}

public sealed class PinResolutionContext(
    IEntityStructRegistry? structRegistry,
    Guid? projectId = null,
    IReadOnlyList<PipelineVariableDecl>? variables = null
) : IPinResolutionContext
{
    public IEntityStructRegistry? StructRegistry => structRegistry;
    public Guid? ProjectId => projectId;
    public IReadOnlyList<PipelineVariableDecl>? Variables => variables;
}
