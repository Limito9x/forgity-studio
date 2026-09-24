using Wolverine.Attributes;
using Automation.Tag.Contracts;
using Automation.Tag.Infrastructure.Persistence;
using Automation.Tag.Shared.Dtos;

namespace Automation.Tag.Features.Tags;

public record CreateTagCommand(
    Guid ProjectId,
    string Path,
    string? Color = null,
    string? Description = null
);

public class CreateTagValidator : Validator<CreateTagCommand>
{
    public CreateTagValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Path)
            .NotEmpty()
            .Matches(@"^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$")
            .WithMessage("Tag path must only contain alphanumeric characters and underscores separated by dots (e.g. Asset.Character.Hero).");
        RuleFor(x => x.Color).MaximumLength(50);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class CreateTagEndpoint(IMessageBus bus) : Endpoint<CreateTagCommand, TagItemDto>
{
    public override void Configure()
    {
        Post("");
        Group<TagsGroup>();
        Permissions(P.Tag.Create);
    }

    public override async Task HandleAsync(CreateTagCommand command, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<TagItemDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(TagDbContext))]
public class CreateTagHandler(ITagApi tagApi)
{
    public async Task<Result<TagItemDto>> HandleAsync(CreateTagCommand command, CancellationToken ct)
    {
        var result = await tagApi.EnsureTagAsync(
            command.ProjectId,
            command.Path,
            command.Color,
            command.Description,
            ct
        );

        if (result.IsFailed)
            return Result.Fail<TagItemDto>(result.Errors);

        var dto = result.Value;
        return Result.Ok(new TagItemDto(
            dto.Id,
            dto.ProjectId,
            dto.Path,
            dto.Name,
            dto.Color,
            dto.Description,
            null,
            dto.CreatedAt
        ));
    }
}
