using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Engine.StructRegistry.Definitions;

public class WorkspaceStructDefinition(IRepositoryApi repositoryApi) : RepositoryStructDefinition(repositoryApi)
{
    public override string StructType => "Workspace";
    public override string Label => "Workspace";

    public override IReadOnlyList<PinDefinition> OutputPins =>
    [
        new()
        {
            Id = "WorkspaceId",
            Label = "Workspace ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "WorkspaceName",
            Label = "Workspace Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        }
    ];
}
