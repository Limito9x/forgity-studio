using System.Text.Json;
using Wolverine.Attributes;
using Automation.Tag.Contracts;
using Automation.Tag.Infrastructure.Persistence;
using Automation.Tag.Shared.Dtos;

namespace Automation.Tag.Features.TagLinks;

public record CreateTagLinkCommand(
    Guid ProjectId,
    string EntityType,
    Guid EntityId,
    string TagPath,
    string? TargetSubPath = null,
    JsonDocument? Metadata = null
);

public class CreateTagLinkValidator : Validator<CreateTagLinkCommand>
{
    public CreateTagLinkValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.EntityType).NotEmpty().MaximumLength(100);
        RuleFor(x => x.EntityId).NotEmpty();
        RuleFor(x => x.TagPath)
            .NotEmpty()
            .Matches(@"^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$")
            .WithMessage("Tag path must only contain alphanumeric characters and underscores separated by dots (e.g. Asset.Character.Hero).");
        RuleFor(x => x.TargetSubPath).MaximumLength(255);
    }
}

public class CreateTagLinkEndpoint(IMessageBus bus) : Endpoint<CreateTagLinkCommand, TagLinkDto>
{
    public override void Configure()
    {
        Post("");
        Group<TagLinksGroup>();
        Permissions(P.TagLink.Create);
    }

    public override async Task HandleAsync(CreateTagLinkCommand command, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<TagLinkDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(TagDbContext))]
public class CreateTagLinkHandler(ITagApi tagApi)
{
    public async Task<Result<TagLinkDto>> HandleAsync(
        CreateTagLinkCommand command,
        CancellationToken ct
    )
    {
        var result = await tagApi.AssignTagAsync(
            command.ProjectId,
            command.EntityType,
            command.EntityId,
            command.TagPath,
            command.TargetSubPath,
            command.Metadata?.RootElement.ToString(),
            ct
        );

        if (result.IsFailed)
            return Result.Fail<TagLinkDto>(result.Errors);

        var l = result.Value;
        return Result.Ok(new TagLinkDto(
            l.Id,
            l.ProjectId,
            l.TagId,
            l.TagPath,
            l.EntityType,
            l.EntityId,
            l.TargetSubPath,
            l.MetadataJson
        ));
    }
}
