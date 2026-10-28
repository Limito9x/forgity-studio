using FluentResults;
using Wolverine.Attributes;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Contracts.StructRegistry;
using Automation.Pipeline.Contracts.Tools;
namespace Automation.Pipeline.BuildTime.Features.Authoring;

public record ResolveToolPinsCommand(
    string ToolId,
    Dictionary<string, object?>? ConfigValues = null,
    Guid? ProjectId = null
);

public record ResolvedToolPinsDto(
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs
);

public class ResolveToolPinsEndpoint(IMessageBus bus)
    : Endpoint<ResolveToolPinsCommand, ResolvedToolPinsDto>
{
    public override void Configure()
    {
        Post("tools/resolve-pins");
        Group<PipelinesGroup>();
        Description(x => x.WithName("ResolveToolPins"));
        Permissions(P.Pipeline.GetAll);
    }

    public override async Task HandleAsync(ResolveToolPinsCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ResolvedToolPinsDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ResolveToolPinsHandler(
    IToolRegistry toolRegistry,
    IEntityStructRegistry structRegistry
)
{
    public Task<Result<ResolvedToolPinsDto>> HandleAsync(
        ResolveToolPinsCommand command,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(command.ToolId))
        {
            return Task.FromResult(Result.Fail<ResolvedToolPinsDto>("ToolId must not be empty."));
        }

        var tool = toolRegistry.GetByKey(command.ToolId);
        if (tool == null)
        {
            return Task.FromResult(Result.Fail<ResolvedToolPinsDto>(
                $"Tool '{command.ToolId}' was not found in Tool Registry."
            ));
        }

        var context = new PinResolutionContext(structRegistry, command.ProjectId);
        var (inputs, outputs) = FlowPinHelper.WithExecPinsResolved(tool, command.ConfigValues, context);

        var dto = new ResolvedToolPinsDto(inputs ?? [], outputs ?? []);
        return Task.FromResult(Result.Ok(dto));
    }
}
