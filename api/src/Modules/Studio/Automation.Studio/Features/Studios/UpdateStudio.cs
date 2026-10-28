using Microsoft.EntityFrameworkCore;
using FluentValidation;
using Wolverine.Attributes;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;
using Automation.SharedKernel.Abstractions.Auth;
using Automation.SharedKernel.Errors;
using Mapster;

namespace Automation.Studio.Features.Studios;

public record UpdateStudioCommand(
    Guid Id,
    string Name,
    string? Description = null
);

public class UpdateStudioValidator : AbstractValidator<UpdateStudioCommand>
{
    public UpdateStudioValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty();

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Studio name is required")
            .MaximumLength(255).WithMessage("Studio name must not exceed 255 characters");
    }
}

public class UpdateStudioEndpoint(IMessageBus bus)
    : Endpoint<UpdateStudioCommand, StudioDto>
{
    public override void Configure()
    {
        Put("{id:guid}");
        Group<StudiosGroup>();
        Permissions(P.Studio.Update);
        Description(x => x.WithName("UpdateStudio"));
    }

    public override async Task HandleAsync(UpdateStudioCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<StudioDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(StudioDbContext))]
public class UpdateStudioHandler(StudioDbContext db, ICurrentUserProvider userProvider)
{
    public async Task<Result<StudioDto>> HandleAsync(
        UpdateStudioCommand command,
        CancellationToken ct)
    {
        if (!userProvider.UserId.HasValue)
        {
            return Result.Fail(new UnauthorizedError("User is not authenticated"));
        }

        var userId = userProvider.UserId.Value;
        var userIdStr = userId.ToString();

        var studio = await db.Studios.FirstOrDefaultAsync(s => s.Id == command.Id, ct);
        if (studio is null)
        {
            return Result.Fail(new NotFoundError("Studio not found"));
        }

        var isOwnerOrMember = studio.CreatedBy == userIdStr ||
            await db.Projects.AnyAsync(
                p => p.StudioId == studio.Id && (p.OwnerId == userId || db.ProjectMembers.Any(pm => pm.ProjectId == p.Id && pm.UserId == userId)),
                ct);

        if (!isOwnerOrMember)
        {
            return Result.Fail(new ForbiddenError("You do not have permission to update this studio"));
        }

        studio.Name = command.Name.Trim();
        studio.Description = string.IsNullOrWhiteSpace(command.Description) ? null : command.Description.Trim();

        await db.SaveChangesAsync(ct);

        return Result.Ok(studio.Adapt<StudioDto>());
    }
}
