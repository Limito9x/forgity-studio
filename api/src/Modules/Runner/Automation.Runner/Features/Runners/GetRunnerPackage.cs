using System.IO.Compression;
using FastEndpoints;
using Microsoft.AspNetCore.Http;

namespace Automation.Runner.Features.Runners;

public class GetRunnerPackageEndpoint : EndpointWithoutRequest
{
    private static readonly HashSet<string> ExcludedDirs = new(StringComparer.OrdinalIgnoreCase)
    {
        ".venv", "venv", "__pycache__", ".pytest_cache", "cache", "temp", "logs", ".git", "pipelines", "tests"
    };

    public override void Configure()
    {
        Get("bootstrap/package.zip");
        Group<RunnersGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var prebuiltZipCandidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "assets", "forgity-runner.zip"),
            Path.Combine(Directory.GetCurrentDirectory(), "assets", "forgity-runner.zip")
        };
        var prebuiltZip = prebuiltZipCandidates.FirstOrDefault(File.Exists);
        if (prebuiltZip is not null)
        {
            HttpContext.Response.ContentType = "application/zip";
            HttpContext.Response.Headers.Append("Content-Disposition", "attachment; filename=\"forgity-runner.zip\"");
            await using var fileStream = File.OpenRead(prebuiltZip);
            await fileStream.CopyToAsync(HttpContext.Response.Body, ct);
            return;
        }

        // Check for compiled native Rust runner executable
        var runnerExe = ResolveRunnerExecutable();
        if (runnerExe is not null)
        {
            var ms = new MemoryStream();
            using (var archive = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            {
                archive.CreateEntryFromFile(runnerExe, Path.GetFileName(runnerExe), CompressionLevel.Optimal);
            }
            ms.Position = 0;
            HttpContext.Response.StatusCode = StatusCodes.Status200OK;
            HttpContext.Response.ContentType = "application/zip";
            HttpContext.Response.Headers.Append("Content-Disposition", "attachment; filename=\"forgity-runner.zip\"");
            HttpContext.Response.ContentLength = ms.Length;
            await ms.CopyToAsync(HttpContext.Response.Body, ct);
            return;
        }

        var workersDir = ResolveWorkersDirectory();
        if (workersDir is null)
        {
            HttpContext.Response.StatusCode = StatusCodes.Status404NotFound;
            await HttpContext.Response.WriteAsync("Workers directory not found.", ct);
            return;
        }

        var memoryStream = new MemoryStream();
        using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var dirInfo = new DirectoryInfo(workersDir);
            foreach (var file in dirInfo.EnumerateFiles("*", SearchOption.AllDirectories))
            {
                // Check if file is inside an excluded directory
                var relativePath = Path.GetRelativePath(workersDir, file.FullName);
                var pathParts = relativePath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                if (pathParts.Any(part => ExcludedDirs.Contains(part)))
                {
                    continue;
                }

                // Skip local agent config or temp files
                if (file.Name.Equals("agent_config.json", StringComparison.OrdinalIgnoreCase) ||
                    file.Name.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase) ||
                    file.Name.EndsWith(".pid", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var entryName = relativePath.Replace('\\', '/');
                archive.CreateEntryFromFile(file.FullName, entryName, CompressionLevel.Fastest);
            }
        }

        memoryStream.Position = 0;
        HttpContext.Response.StatusCode = StatusCodes.Status200OK;
        HttpContext.Response.ContentType = "application/zip";
        HttpContext.Response.Headers.Append("Content-Disposition", "attachment; filename=\"automation-runner.zip\"");
        HttpContext.Response.ContentLength = memoryStream.Length;
        await memoryStream.CopyToAsync(HttpContext.Response.Body, ct);
    }

    private static string? ResolveRunnerExecutable()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "runner", "target", "release", "forgity-runner.exe"),
            Path.Combine(Directory.GetCurrentDirectory(), "runner", "target", "release", "forgity-runner.exe"),
            Path.Combine(AppContext.BaseDirectory, "assets", "forgity-runner.exe"),
            Path.Combine(Directory.GetCurrentDirectory(), "assets", "forgity-runner.exe")
        };
        var found = candidates.FirstOrDefault(File.Exists);
        if (found != null) return found;

        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (dir != null)
        {
            var target = Path.Combine(dir.FullName, "runner", "target", "release", "forgity-runner.exe");
            if (File.Exists(target)) return target;
            dir = dir.Parent;
        }

        return null;
    }

    private static string? ResolveWorkersDirectory()
    {
        var direct = Path.Combine(AppContext.BaseDirectory, "workers");
        if (Directory.Exists(direct)) return direct;

        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            var target = Path.Combine(dir.FullName, "workers");
            if (Directory.Exists(target)) return target;
            dir = dir.Parent;
        }

        dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (dir != null)
        {
            var target = Path.Combine(dir.FullName, "workers");
            if (Directory.Exists(target)) return target;
            dir = dir.Parent;
        }

        return null;
    }
}
