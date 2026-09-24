using Automation.Platform.Contracts;
using Automation.Runner.Contracts;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Repository.Shared.Dtos;
using Automation.Repository.Shared.Helpers;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Repository.Features.RepositoryRunners;

public record CompareRepositoryResourcesCommand(Guid RepositoryId, Guid RunnerId);

public class CompareRepositoryResourcesValidator : AbstractValidator<CompareRepositoryResourcesCommand>
{
    public CompareRepositoryResourcesValidator()
    {
        RuleFor(x => x.RepositoryId).NotEmpty();
        RuleFor(x => x.RunnerId).NotEmpty();
    }
}

public class CompareRepositoryResourcesEndpoint(IMessageBus bus)
    : Endpoint<CompareRepositoryResourcesCommand, DiffResult>
{
    public override void Configure()
    {
        Post("compare");
        Group<RepositoryRunnersGroup>();
        Permissions(P.RepositoryRunner.Update);
        Description(x => x.WithName("CompareRepositoryResources"));
    }

    public override async Task HandleAsync(CompareRepositoryResourcesCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<DiffResult>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class CompareRepositoryResourcesHandler(
    RepositoryDbContext dbContext,
    IRunnerApi runnerApi,
    IPlatformApi platformApi
)
{
    public async Task<Result<DiffResult>> HandleAsync(
        CompareRepositoryResourcesCommand command,
        CancellationToken ct
    )
    {
        var repositoryRunner = await dbContext.RepositoryRunners.FirstOrDefaultAsync(
            x => x.RunnerId == command.RunnerId && x.RepositoryId == command.RepositoryId,
            ct
        );

        if (repositoryRunner == null)
        {
            return Result.Fail("RepositoryRunner not found");
        }

        var platformResult = await platformApi.GetExtensionMapAsync(
            platformIds: null,
            ct: ct
        );

        var platformExtensionMap = platformResult.Value ?? new Dictionary<string, Guid>();

        // Tìm các file có trong thư mục của runner tại repo này
        var scanResult = await runnerApi.SendScanCommandAsync(
            command.RunnerId,
            repositoryRunner.RootPath,
            platformExtensionMap.Keys,
            ct
        );

        var files = scanResult.Value?.Items ?? [];

        var fileDictionary = files.ToDictionary(x => x.RelativePath, y => y);

        // Lấy các tài nguyên đã có trong repository runner (dữ liệu DB)
        var resourceDictionary = await dbContext
            .ResourceItems.Include(r => r.Versions)
                .ThenInclude(v => v.Locations)
            .Where(r => r.RepositoryId == command.RepositoryId)
            .ToDictionaryAsync(r => r.RelativePath, y => y, ct);

        var allRelativePaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        allRelativePaths.UnionWith(fileDictionary.Keys);
        allRelativePaths.UnionWith(resourceDictionary.Keys);

        var added = new List<ResourceDiffItem>();
        var modified = new List<ResourceDiffItem>();
        var deleted = new List<ResourceDiffItem>();
        var missing = new List<ResourceDiffItem>();

        foreach (var relativePath in allRelativePaths)
        {
            var hasLocal = fileDictionary.TryGetValue(relativePath, out var localFile);
            var hasDb = resourceDictionary.TryGetValue(relativePath, out var dbResource);

            var ext = ResourcePathHelper.GetExtension(relativePath);
            var platformExtensionId = platformExtensionMap.TryGetValue(ext, out var pId)
                ? pId
                : Guid.Empty;

            if (hasLocal && !hasDb)
            {
                added.Add(
                    new ResourceDiffItem(
                        relativePath,
                        Path.GetFileName(relativePath),
                        localFile!.Hash,
                        localFile.SizeBytes,
                        platformExtensionId,
                        null
                    )
                );
            }
            else if (!hasLocal && hasDb)
            {
                var latestVersion = dbResource!.LatestVersion;
                var latestLocation = latestVersion?.Locations.FirstOrDefault(l =>
                    l.RepositoryRunnerId == repositoryRunner.Id
                );

                if (latestLocation != null)
                {
                    deleted.Add(
                        new ResourceDiffItem(
                            relativePath,
                            dbResource.DisplayName,
                            null,
                            null,
                            dbResource.PlatformExtensionId,
                            latestVersion?.Adapt<ResourceVersionDto>()
                        )
                    );
                }
                else
                {
                    missing.Add(
                        new ResourceDiffItem(
                            relativePath,
                            dbResource.DisplayName,
                            null,
                            null,
                            dbResource.PlatformExtensionId,
                            latestVersion?.Adapt<ResourceVersionDto>()
                        )
                    );
                }
            }
            else if (hasLocal && hasDb)
            {
                var latestVersion = dbResource!.LatestVersion;

                if (latestVersion != null && latestVersion.FileHash != localFile!.Hash)
                {
                    modified.Add(
                        new ResourceDiffItem(
                            relativePath,
                            dbResource.DisplayName,
                            localFile.Hash,
                            localFile.SizeBytes,
                            dbResource.PlatformExtensionId,
                            latestVersion.Adapt<ResourceVersionDto>()
                        )
                    );
                }
            }
        }

        return Result.Ok(new DiffResult(repositoryRunner.Id, added, modified, deleted, missing));
    }
}
