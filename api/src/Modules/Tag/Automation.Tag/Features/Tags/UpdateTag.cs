using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Tag.Infrastructure.Persistence;
using Automation.Tag.Shared.Dtos;

namespace Automation.Tag.Features.Tags;

public record UpdateTagCommand(Guid Id, string? Name = null, string? Color = null, string? Description = null);

public class UpdateTagValidator : Validator<UpdateTagCommand>
{
    public UpdateTagValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).MaximumLength(100);
        RuleFor(x => x.Color).MaximumLength(50);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class UpdateTagEndpoint(IMessageBus bus) : Endpoint<UpdateTagCommand, TagItemDto>
{
    public override void Configure()
    {
        Put("{id:guid}");
        Group<TagsGroup>();
        Permissions(P.Tag.Update);
    }

    public override async Task HandleAsync(UpdateTagCommand command, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<TagItemDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(TagDbContext))]
public class UpdateTagHandler(TagDbContext db)
{
    public async Task<Result<TagItemDto>> HandleAsync(UpdateTagCommand command, CancellationToken ct)
    {
        var tag = await db.TagItems.FirstOrDefaultAsync(x => x.Id == command.Id, ct);
        if (tag is null)
            return Result.Fail<TagItemDto>("Tag not found.");

        if (!string.IsNullOrWhiteSpace(command.Name)) tag.Name = command.Name;
        if (command.Color != null) tag.Color = command.Color;
        if (command.Description != null) tag.Description = command.Description;

        await db.SaveChangesAsync(ct);

        return Result.Ok(new TagItemDto(
            tag.Id,
            tag.ProjectId,
            tag.Path,
            tag.Name,
            tag.Color,
            tag.Description,
            tag.ParentId,
            tag.CreatedAt
        ));
    }
}
