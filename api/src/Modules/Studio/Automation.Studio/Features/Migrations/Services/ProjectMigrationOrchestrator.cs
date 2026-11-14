using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Automation.SharedKernel.Abstractions;
using Automation.Studio.Domain.Entities;
using Automation.Studio.Features.Migrations.Domain;
using Automation.Studio.Features.Migrations.Dtos;
using Automation.Studio.Infrastructure.Persistence;
using FluentResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Studio.Features.Migrations.Services;

public class ProjectMigrationOrchestrator(
    StudioDbContext db,
    IEnumerable<IProjectMigrationProvider> providers,
    ICurrentUserProvider currentUserProvider,
    ILogger<ProjectMigrationOrchestrator> logger
)
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public async Task<Result<(byte[] PackageBytes, string FileName)>> ExportPackageAsync(
        Guid projectId,
        List<string>? requestedDomains,
        CancellationToken ct = default
    )
    {
        var project = await db.Projects
            .Include(p => p.Studio)
            .FirstOrDefaultAsync(p => p.Id == projectId, ct);

        if (project == null)
        {
            return Result.Fail<(byte[], string)>("Project not found.");
        }

        var selectedDomainKeys = (requestedDomains == null || requestedDomains.Count == 0)
            ? providers.OrderBy(p => p.SortOrder).Select(p => p.DomainKey).ToList()
            : requestedDomains.Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        using var memoryStream = new MemoryStream();
        var domainDataMap = new Dictionary<string, object?>();

        using (var zip = new ZipArchive(memoryStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var provider in providers.OrderBy(p => p.SortOrder))
            {
                if (selectedDomainKeys.Contains(provider.DomainKey, StringComparer.OrdinalIgnoreCase))
                {
                    try
                    {
                        var domainPayload = await provider.ExportDomainAsync(projectId, zip, ct);
                        if (domainPayload != null)
                        {
                            domainDataMap[provider.DomainKey] = domainPayload;
                        }
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Failed to export domain {Domain} for project {ProjectId}", provider.DomainKey, projectId);
                    }
                }
            }

            // Write manifest.json
            var manifest = new
            {
                PackageFormatVersion = "1.0",
                Generator = "Forgity Studio v2026.11",
                ExportedAt = DateTimeOffset.UtcNow,
                SourceStudio = project.Studio?.Name ?? "Studio",
                SourceProjectName = project.Name,
                SourceProjectSlug = project.Slug,
                Domains = domainDataMap.Keys.ToList(),
                DomainPayloads = domainDataMap
            };

            var manifestEntry = zip.CreateEntry("manifest.json", CompressionLevel.Optimal);
            using var entryStream = manifestEntry.Open();
            await JsonSerializer.SerializeAsync(entryStream, manifest, JsonOpts, ct);
        }

        memoryStream.Position = 0;
        var packageBytes = memoryStream.ToArray();
        var checksum = ComputeSha256(packageBytes);
        var fileName = $"{project.Slug}-export-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.forgity.pkg";

        // Audit Log
        var userId = currentUserProvider.UserId ?? Guid.Empty;
        var log = new ProjectMigrationLog(
            projectId: projectId,
            studioId: project.StudioId,
            userId: userId,
            userDisplayName: userId != Guid.Empty ? userId.ToString() : "System",
            type: ProjectMigrationType.Export,
            status: ProjectMigrationStatus.Success,
            packageFileName: fileName,
            packageSizeBytes: packageBytes.Length,
            packageChecksumSha256: checksum,
            selectedDomains: domainDataMap.Keys.ToList()
        );

        db.ProjectMigrationLogs.Add(log);
        await db.SaveChangesAsync(ct);

        return Result.Ok((packageBytes, fileName));
    }

    public async Task<Result<ImportProjectPackageResultDto>> ImportPackageAsync(
        Guid projectId,
        Stream packageStream,
        string fileName,
        ConflictResolutionStrategy strategy,
        CancellationToken ct = default
    )
    {
        var project = await db.Projects
            .Include(p => p.Studio)
            .FirstOrDefaultAsync(p => p.Id == projectId, ct);

        if (project == null)
        {
            return Result.Fail<ImportProjectPackageResultDto>("Project not found.");
        }

        // Buffer stream to compute checksum and allow repeated seeks
        using var memoryStream = new MemoryStream();
        await packageStream.CopyToAsync(memoryStream, ct);
        var packageBytes = memoryStream.ToArray();
        memoryStream.Position = 0;

        var checksum = ComputeSha256(packageBytes);
        var userId = currentUserProvider.UserId ?? Guid.Empty;

        JsonDocument? manifestDoc = null;
        ZipArchive? zip = null;
        var isZip = false;

        try
        {
            // Try open as ZIP
            try
            {
                zip = new ZipArchive(memoryStream, ZipArchiveMode.Read, leaveOpen: true);
                var manifestEntry = zip.GetEntry("manifest.json");
                if (manifestEntry != null)
                {
                    isZip = true;
                    using var s = manifestEntry.Open();
                    manifestDoc = await JsonDocument.ParseAsync(s, cancellationToken: ct);
                }
            }
            catch
            {
                // Not a zip, fallback to JSON
                zip?.Dispose();
                zip = null;
            }

            if (manifestDoc == null)
            {
                memoryStream.Position = 0;
                manifestDoc = await JsonDocument.ParseAsync(memoryStream, cancellationToken: ct);
            }

            var root = manifestDoc.RootElement;
            JsonElement payloadsElement;

            if (root.TryGetProperty("domainPayloads", out var dp) || root.TryGetProperty("DomainPayloads", out dp))
            {
                payloadsElement = dp;
            }
            else if (root.TryGetProperty("domains", out var d) || root.TryGetProperty("Domains", out d))
            {
                payloadsElement = d;
            }
            else
            {
                // Fallback: If this is a legacy PipelinePackageDto JSON
                payloadsElement = root;
            }

            var domainSummaries = new Dictionary<string, DomainMigrationResultSummaryDto>();
            var allWarnings = new List<string>();
            var totalItems = 0;
            var createdItems = 0;
            var updatedItems = 0;
            var skippedItems = 0;

            foreach (var provider in providers.OrderBy(p => p.SortOrder))
            {
                JsonElement domainData = default;
                var found = false;

                if (payloadsElement.ValueKind == JsonValueKind.Object)
                {
                    if (payloadsElement.TryGetProperty(provider.DomainKey, out var val) ||
                        payloadsElement.TryGetProperty(Capitalize(provider.DomainKey), out val))
                    {
                        domainData = val;
                        found = true;
                    }
                }
                else if (provider.DomainKey == "pipelines" && root.TryGetProperty("pipelines", out var plVal))
                {
                    // Direct legacy pipeline bundle
                    domainData = root;
                    found = true;
                }

                if (found)
                {
                    try
                    {
                        var summary = await provider.ImportDomainAsync(projectId, domainData, zip, strategy, ct);
                        domainSummaries[provider.DomainKey] = new DomainMigrationResultSummaryDto(
                            summary.Total,
                            summary.Created,
                            summary.Updated,
                            summary.Skipped,
                            summary.Warnings
                        );

                        totalItems += summary.Total;
                        createdItems += summary.Created;
                        updatedItems += summary.Updated;
                        skippedItems += summary.Skipped;
                        allWarnings.AddRange(summary.Warnings);
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Error importing domain {Domain} into project {ProjectId}", provider.DomainKey, projectId);
                        allWarnings.Add($"[{provider.DisplayLabel}] Failed: {ex.Message}");
                    }
                }
            }

            var status = allWarnings.Count > 0 && createdItems == 0 && updatedItems == 0
                ? ProjectMigrationStatus.Failed
                : allWarnings.Count > 0
                ? ProjectMigrationStatus.PartialSuccess
                : ProjectMigrationStatus.Success;

            var summariesDoc = JsonDocument.Parse(JsonSerializer.Serialize(domainSummaries, JsonOpts));

            var log = new ProjectMigrationLog(
                projectId: projectId,
                studioId: project.StudioId,
                userId: userId,
                userDisplayName: userId != Guid.Empty ? userId.ToString() : "System",
                type: ProjectMigrationType.Import,
                status: status,
                packageFileName: fileName,
                packageSizeBytes: packageBytes.Length,
                packageChecksumSha256: checksum,
                selectedDomains: domainSummaries.Keys.ToList(),
                domainSummaries: summariesDoc,
                errorMessage: allWarnings.Count > 0 ? string.Join("; ", allWarnings) : null
            );

            db.ProjectMigrationLogs.Add(log);
            await db.SaveChangesAsync(ct);

            return Result.Ok(new ImportProjectPackageResultDto(
                MigrationLogId: log.Id,
                Status: status.ToString(),
                TotalItems: totalItems,
                CreatedItems: createdItems,
                UpdatedItems: updatedItems,
                SkippedItems: skippedItems,
                DomainSummaries: domainSummaries,
                Warnings: allWarnings
            ));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Fatal error importing package {FileName} into project {ProjectId}", fileName, projectId);

            var failLog = new ProjectMigrationLog(
                projectId: projectId,
                studioId: project.StudioId,
                userId: userId,
                userDisplayName: userId != Guid.Empty ? userId.ToString() : "System",
                type: ProjectMigrationType.Import,
                status: ProjectMigrationStatus.Failed,
                packageFileName: fileName,
                packageSizeBytes: packageBytes.Length,
                packageChecksumSha256: checksum,
                selectedDomains: [],
                errorMessage: ex.Message
            );

            db.ProjectMigrationLogs.Add(failLog);
            await db.SaveChangesAsync(ct);

            return Result.Fail<ImportProjectPackageResultDto>($"Failed to parse or import package: {ex.Message}");
        }
        finally
        {
            zip?.Dispose();
            manifestDoc?.Dispose();
        }
    }

    private static string ComputeSha256(byte[] bytes)
    {
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexStringLower(hash);
    }

    private static string Capitalize(string s) =>
        string.IsNullOrEmpty(s) ? s : char.ToUpperInvariant(s[0]) + s[1..];
}
