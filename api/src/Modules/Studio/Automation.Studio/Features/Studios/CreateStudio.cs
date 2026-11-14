using Microsoft.EntityFrameworkCore;
using FluentValidation;
using Wolverine.Attributes;
using Automation.Studio.Domain.Entities;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;

namespace Automation.Studio.Features.Studios;

public record CreateStudioCommand(
    string Name,
    string? Slug = null,
    string? Description = null
);

public class CreateStudioValidator : AbstractValidator<CreateStudioCommand>
{
    public CreateStudioValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Studio name is required")
            .MaximumLength(255).WithMessage("Studio name must not exceed 255 characters");

        RuleFor(x => x.Slug)
            .MaximumLength(100).WithMessage("Slug must not exceed 100 characters")
            .When(x => !string.IsNullOrEmpty(x.Slug));
    }
}

public class CreateStudioEndpoint(IMessageBus bus)
    : Endpoint<CreateStudioCommand, StudioDto>
{
    public override void Configure()
    {
        Post("/");
        Group<StudiosGroup>();
        Permissions(P.Studio.Create);
        Description(x => x.WithName("CreateStudio"));
    }

    public override async Task HandleAsync(CreateStudioCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<StudioDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(StudioDbContext))]
public class CreateStudioHandler(StudioDbContext db)
{
    public async Task<Result<StudioDto>> HandleAsync(
        CreateStudioCommand command,
        CancellationToken ct)
    {
        string slug;

        if (!string.IsNullOrWhiteSpace(command.Slug))
        {
            slug = Slugify(command.Slug);
            var exists = await db.Studios.AnyAsync(x => x.Slug == slug, ct);
            if (exists)
            {
                return Result.Fail(new ConflictError($"Studio with slug '{slug}' already exists."));
            }
        }
        else
        {
            var baseSlug = Slugify(command.Name);
            if (string.IsNullOrWhiteSpace(baseSlug))
            {
                baseSlug = "studio";
            }

            slug = baseSlug;
            var counter = 1;
            while (await db.Studios.AnyAsync(x => x.Slug == slug, ct))
            {
                slug = $"{baseSlug}-{counter++}";
            }
        }

        var studio = command.Adapt<StudioEntity>();
        studio.Slug = slug;

        db.Studios.Add(studio);
        await db.SaveChangesAsync(ct);

        return Result.Ok(studio.Adapt<StudioDto>());
    }

    private static string Slugify(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;

        var normalized = text.Trim().ToLowerInvariant();
        var chars = new System.Text.StringBuilder();
        var prevHyphen = false;

        foreach (var c in normalized)
        {
            if (char.IsLetterOrDigit(c))
            {
                chars.Append(c);
                prevHyphen = false;
            }
            else if (!prevHyphen && (c == ' ' || c == '-' || c == '_'))
            {
                chars.Append('-');
                prevHyphen = true;
            }
        }

        return chars.ToString().Trim('-');
    }
}
