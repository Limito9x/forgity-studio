using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines;

public record GetPinCatalogueQuery;

public class GetPinCatalogueEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<IReadOnlyList<PinTypeMetadataDto>>
{
    public override void Configure()
    {
        Get("pins/catalogue");
        Group<PipelinesGroup>();
        Description(x => x.WithName("GetPinCatalogue"));
        Permissions(P.Pipeline.GetAll);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<PinTypeMetadataDto>>>(
            new GetPinCatalogueQuery(),
            ct
        );

        await this.SendResultAsync(result, ct);
    }
}

public class GetPinCatalogueHandler
{
    private static readonly IReadOnlyList<PinTypeMetadataDto> Catalogue =
    [
        new("String", "Text", "Primitive", "#0ea5e9", "text"),
        new("Number", "Number", "Primitive", "#8b5cf6", "number"),
        new("Boolean", "Boolean", "Primitive", "#f59e0b", "boolean"),
        new("Path", "File Path", "Primitive", "#f97316", "text"),
        new("EntityRef", "Entity Reference", "Entity", "#10b981", "entity-select",
            ["resource", "workspace", "tag", "tagGroup", "agent", "contentType", "variable"]),
        new("Asset", "File Upload", "Asset", "#ec4899", "file-upload"),
    ];

    [NonTransactional]
    public Task<Result<IReadOnlyList<PinTypeMetadataDto>>> Handle(
        GetPinCatalogueQuery query,
        CancellationToken ct
    )
    {
        return Task.FromResult(Result.Ok(Catalogue));
    }
}

public record PinTypeMetadataDto(
    string Code,
    string Name,
    string Category,
    string Color,
    string DefaultControl,
    IReadOnlyList<string>? SupportedEntityTargets = null
);
