using Microsoft.EntityFrameworkCore;
using Automation.Platform.Domain.Entities;
using Automation.Platform.Infrastructure.Persistence;
using Automation.Platform.Shared.Dtos;

namespace Automation.Platform.Features.PlatformExtensions;

public record CreateExtensionsCommand(List<string> Extensions);

public class CreateExtensionsValidator : Validator<CreateExtensionsCommand>
{
    public CreateExtensionsValidator()
    {
        RuleFor(x => x.Extensions).NotEmpty();
        RuleForEach(x => x.Extensions)
            .NotEmpty()
            .MaximumLength(50)
            .Must(x => x.StartsWith('.')).WithMessage("Extension must start with a dot (e.g. '.blend', '.fbx').");
    }
}

public class CreateExtensionsEndpoint(IMessageBus bus) : Endpoint<CreateExtensionsCommand, IReadOnlyList<PlatformExtensionDto>>
{
    public override void Configure()
    {
        Post("/batch");
        Group<PlatformExtensionsGroup>();
        Permissions(P.PlatformExtension.Create);
    }

    public override async Task HandleAsync(CreateExtensionsCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<PlatformExtensionDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class CreateExtensionsHandler(PlatformDbContext db)
{
    public async Task<Result<IReadOnlyList<PlatformExtensionDto>>> HandleAsync(CreateExtensionsCommand command, CancellationToken ct)
    {
        var resultEntities = await EnsureExtensionsExistAsync(db, command.Extensions, ct);
        return Result.Ok<IReadOnlyList<PlatformExtensionDto>>(resultEntities.Adapt<List<PlatformExtensionDto>>());
    }

    public static async Task<List<PlatformExtension>> EnsureExtensionsExistAsync(PlatformDbContext db, IEnumerable<string> extensions, CancellationToken ct)
    {
        var formatted = extensions
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().TrimStart('.').ToLowerInvariant())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();

        if (formatted.Count == 0)
            return [];

        var formattedWithDots = formatted.Select(x => "." + x).ToList();

        var existingEntities = await db.PlatformExtensions
            .Where(x => formatted.Contains(x.Extension) || formattedWithDots.Contains(x.Extension))
            .ToListAsync(ct);

        var existingCleanNames = existingEntities
            .Select(x => x.Extension.Trim().TrimStart('.').ToLowerInvariant())
            .ToHashSet();

        var newEntities = new List<PlatformExtension>();

        foreach (var ext in formatted)
        {
            if (!existingCleanNames.Contains(ext))
            {
                var newEntity = new PlatformExtension(ext);
                db.PlatformExtensions.Add(newEntity);
                newEntities.Add(newEntity);
            }
        }

        if (newEntities.Count > 0)
        {
            await db.SaveChangesAsync(ct);
            existingEntities.AddRange(newEntities);
        }

        return existingEntities;
    }
}
