using Wolverine.Attributes;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.Parsers;

namespace Automation.Pipeline.Features.Nodes;

public record ParseScriptCommand(
    string? ScriptContent,
    string? FileName = null
);

public class ParseScriptEndpoint(IMessageBus bus)
    : Endpoint<ParseScriptCommand, ParseScriptResponseDto>
{
    public override void Configure()
    {
        Post("parse-script");
        Group<NodesGroup>();
        Description(x => x.WithName("ParseScriptSchema"));
        Permissions(P.Pipeline.GetAll);
    }

    public override async Task HandleAsync(ParseScriptCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ParseScriptResponseDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ParseScriptHandler
{
    public Task<Result<ParseScriptResponseDto>> HandleAsync(
        ParseScriptCommand command,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(command.ScriptContent))
        {
            return Task.FromResult(Result.Fail<ParseScriptResponseDto>("Script content is empty."));
        }

        var parsed = PythonScriptSchemaParser.Parse(command.ScriptContent, command.FileName);

        return Task.FromResult(Result.Ok(new ParseScriptResponseDto(
            parsed.SuggestedName,
            parsed.SuggestedLabel,
            parsed.Executor,
            parsed.Description,
            parsed.Inputs,
            parsed.Outputs
        )));
    }
}

public record ParseScriptResponseDto(
    string SuggestedName,
    string SuggestedLabel,
    string Executor,
    string? Description,
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs
);
