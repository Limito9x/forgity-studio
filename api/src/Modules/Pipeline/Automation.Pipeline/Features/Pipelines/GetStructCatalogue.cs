using Wolverine.Attributes;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.StructRegistry;

namespace Automation.Pipeline.Features.Pipelines;

public record GetStructCatalogueQuery(Guid? ProjectId = null);

public class GetStructCatalogueEndpoint(IMessageBus bus)
    : Endpoint<GetStructCatalogueQuery, IReadOnlyList<StructDefinitionDto>>
{
    public override void Configure()
    {
        Get("structs/catalogue");
        Group<PipelinesGroup>();
        Description(x => x.WithName("GetStructCatalogue"));
        Permissions(P.Pipeline.GetAll);
    }

    public override async Task HandleAsync(GetStructCatalogueQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<StructDefinitionDto>>>(
            req,
            ct
        );

        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetStructCatalogueHandler(IEntityStructRegistry structRegistry)
{
    public Task<Result<IReadOnlyList<StructDefinitionDto>>> HandleAsync(
        GetStructCatalogueQuery query,
        CancellationToken ct
    )
    {
        var allStructs = structRegistry.GetAll(query.ProjectId);
        var dtos = allStructs
            .Select(s => new StructDefinitionDto(s.StructType, s.Label, s.OutputPins))
            .ToList();

        return Task.FromResult(Result.Ok<IReadOnlyList<StructDefinitionDto>>(dtos));
    }
}

public record StructDefinitionDto(
    string StructType,
    string Label,
    IReadOnlyList<PinDefinition> OutputPins
);
