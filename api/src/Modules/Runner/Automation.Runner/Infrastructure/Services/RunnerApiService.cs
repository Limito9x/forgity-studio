using Automation.Agent.Grpc;
using Automation.Runner.Contracts;
using Automation.Runner.Features.Connections;
using Automation.Runner.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Automation.Runner.Infrastructure.Services;

public class RunnerApiService(
    RunnerDbContext db,
    IRunnerConnectionRegistry registry,
    ICommandTracker commandTracker
) : IRunnerApi, IAgentApi
{
    public async Task<Result<RunnerDto>> GetRunnerByIdAsync(
        Guid runnerId,
        CancellationToken ct = default
    )
    {
        var runner = await db
            .Runners.AsNoTracking()
            .Where(a => a.Id == runnerId)
            .ProjectToType<RunnerDto>()
            .FirstOrDefaultAsync(ct);

        if (runner is null)
            return Result.Fail($"Runner with ID '{runnerId}' was not found.");

        return Result.Ok(runner);
    }

    public async Task<Result<IReadOnlyList<RunnerDto>>> GetRunnersByIdsAsync(
        IEnumerable<Guid> runnerIds,
        CancellationToken ct = default
    )
    {
        var ids = runnerIds.Distinct().ToList();
        if (ids.Count == 0)
            return Result.Ok<IReadOnlyList<RunnerDto>>([]);

        var runners = await db
            .Runners.AsNoTracking()
            .Where(a => ids.Contains(a.Id))
            .ProjectToType<RunnerDto>()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<RunnerDto>>(runners);
    }

    public async Task<Result<IReadOnlyDictionary<Guid, RunnerDto>>> GetRunnersMapByIdsAsync(
        IEnumerable<Guid> runnerIds,
        CancellationToken ct = default
    )
    {
        var result = await GetRunnersByIdsAsync(runnerIds, ct);
        if (result.IsFailed)
            return result.ToResult();

        var map = result.Value.ToDictionary(a => a.Id);
        return Result.Ok<IReadOnlyDictionary<Guid, RunnerDto>>(map);
    }

    public async Task<Result<RunnerScanResultDto>> SendScanCommandAsync(
        Guid runnerId,
        string directoryPath,
        IEnumerable<string>? extensions = null,
        CancellationToken ct = default
    )
    {
        if (!registry.TryGet(runnerId, out var connection) || connection is null)
        {
            return Result.Fail<RunnerScanResultDto>(
                $"Runner với ID '{runnerId}' chưa kết nối gRPC ngầm."
            );
        }

        var commandId = Guid.NewGuid().ToString();
        var scanCommand = new ScanCommand
        {
            CommandId = commandId,
            DirectoryPath = string.IsNullOrWhiteSpace(directoryPath) ? "." : directoryPath,
        };

        if (extensions is not null)
        {
            scanCommand.Extensions.AddRange(extensions);
        }

        var task = commandTracker.RegisterCommandAsync(commandId, ct);

        try
        {
            await connection.ResponseStream.WriteAsync(
                new ServerMessage { ScanCommand = scanCommand },
                ct
            );

            var response = await task;

            if (!response.Success)
            {
                return Result.Fail<RunnerScanResultDto>($"Lỗi từ Runner: {response.ErrorMessage}");
            }

            var items = response
                .ScanResult?.Items.Select(x => new RunnerScanItemDto(
                    x.RelativePath,
                    x.Hash,
                    x.SizeBytes
                ))
                .ToList();

            return Result.Ok(new RunnerScanResultDto(commandId, true, null, items));
        }
        catch (OperationCanceledException)
        {
            return Result.Fail<RunnerScanResultDto>("Quá thời gian chờ phản hồi từ Runner.");
        }
        catch (Exception ex)
        {
            return Result.Fail<RunnerScanResultDto>($"Lỗi khi gửi lệnh scan: {ex.Message}");
        }
    }

    public async Task<Result<RunnerBrowseResultDto>> SendBrowseCommandAsync(
        Guid runnerId,
        string directoryPath,
        CancellationToken ct = default
    )
    {
        if (!registry.TryGet(runnerId, out var connection) || connection is null)
        {
            return Result.Fail<RunnerBrowseResultDto>(
                $"Runner với ID '{runnerId}' chưa kết nối gRPC ngầm."
            );
        }

        var commandId = Guid.NewGuid().ToString();
        var browseCommand = new BrowseCommand
        {
            CommandId = commandId,
            DirectoryPath = directoryPath ?? string.Empty,
        };

        var task = commandTracker.RegisterCommandAsync(commandId, ct);

        try
        {
            await connection.ResponseStream.WriteAsync(
                new ServerMessage { BrowseCommand = browseCommand },
                ct
            );

            var response = await task;

            if (!response.Success)
            {
                return Result.Fail<RunnerBrowseResultDto>($"Lỗi từ Runner: {response.ErrorMessage}");
            }

            var browseResult = response.BrowseResult;
            var currentPath = browseResult?.CurrentPath ?? string.Empty;
            var parentPath = browseResult?.ParentPath ?? string.Empty;
            var canNavigateUp = browseResult?.CanNavigateUp ?? false;

            var items = browseResult
                ?.Items.Select(x => new RunnerBrowseItemDto(
                    x.Name,
                    x.Path,
                    x.IsDirectory,
                    x.SizeBytes
                ))
                .ToList();

            return Result.Ok(
                new RunnerBrowseResultDto(
                    commandId,
                    true,
                    null,
                    currentPath,
                    parentPath,
                    canNavigateUp,
                    items
                )
            );
        }
        catch (OperationCanceledException)
        {
            return Result.Fail<RunnerBrowseResultDto>("Quá thời gian chờ phản hồi từ Runner.");
        }
        catch (Exception ex)
        {
            return Result.Fail<RunnerBrowseResultDto>($"Lỗi khi gửi lệnh browse: {ex.Message}");
        }
    }

    public async Task<Result<IReadOnlyList<ExecutorCandidateDto>>> SendScanExecutorsCommandAsync(
        Guid runnerId,
        string? executorKey = null,
        CancellationToken ct = default
    )
    {
        if (!registry.TryGet(runnerId, out var connection) || connection is null)
        {
            return Result.Fail<IReadOnlyList<ExecutorCandidateDto>>(
                $"Runner với ID '{runnerId}' chưa kết nối gRPC ngầm."
            );
        }

        var commandId = Guid.NewGuid().ToString();
        var scanCommand = new ScanExecutorsCommand
        {
            CommandId = commandId,
            ExecutorKey = executorKey ?? string.Empty,
        };

        var task = commandTracker.RegisterCommandAsync(commandId, ct);

        try
        {
            await connection.ResponseStream.WriteAsync(
                new ServerMessage { ScanExecutorsCommand = scanCommand },
                ct
            );

            var response = await task;

            if (!response.Success)
            {
                return Result.Fail<IReadOnlyList<ExecutorCandidateDto>>(
                    $"Lỗi từ Runner: {response.ErrorMessage}"
                );
            }

            var candidates =
                response
                    .ScanExecutorsResult?.Items.Select(x => new ExecutorCandidateDto(
                        x.ExecutorKey,
                        x.ExecutablePath,
                        x.Version
                    ))
                    .ToList()
                ?? [];

            return Result.Ok<IReadOnlyList<ExecutorCandidateDto>>(candidates);
        }
        catch (OperationCanceledException)
        {
            return Result.Fail<IReadOnlyList<ExecutorCandidateDto>>(
                "Quá thời gian chờ phản hồi từ Runner."
            );
        }
        catch (Exception ex)
        {
            return Result.Fail<IReadOnlyList<ExecutorCandidateDto>>(
                $"Lỗi khi gửi lệnh quét executor: {ex.Message}"
            );
        }
    }

    public async Task<Result<bool>> SendScanHardwareCommandAsync(
        Guid runnerId,
        CancellationToken ct = default
    )
    {
        if (!registry.TryGet(runnerId, out var connection) || connection is null)
        {
            return Result.Fail<bool>(
                $"Runner with ID '{runnerId}' is not connected via gRPC stream."
            );
        }

        var commandId = Guid.NewGuid().ToString();
        var scanCommand = new ScanHardwareCommand
        {
            CommandId = commandId,
        };

        var task = commandTracker.RegisterCommandAsync(commandId, ct);

        try
        {
            await connection.ResponseStream.WriteAsync(
                new ServerMessage { ScanHardwareCommand = scanCommand },
                ct
            );

            var response = await task;

            if (!response.Success)
            {
                return Result.Fail<bool>(
                    $"Error from Runner: {response.ErrorMessage}"
                );
            }

            var hwResult = response.ScanHardwareResult;
            if (hwResult is not null)
            {
                var runner = await db.Runners.FirstOrDefaultAsync(x => x.Id == runnerId, ct);
                if (runner is not null)
                {
                    runner.OsPlatform = hwResult.OsPlatform;
                    runner.CpuModel = hwResult.CpuModel;
                    runner.TotalRamBytes = hwResult.TotalRamBytes;
                    runner.PrimaryGpuName = hwResult.PrimaryGpuName;
                    runner.PrimaryGpuVramBytes = hwResult.PrimaryGpuVramBytes;
                    runner.LastHardwareScannedAt = DateTimeOffset.UtcNow;

                    if (!string.IsNullOrWhiteSpace(hwResult.HardwareDetailsJson))
                    {
                        try
                        {
                            runner.HardwareDetails = System.Text.Json.JsonSerializer.Deserialize<Automation.Runner.Domain.Entities.RunnerHardwareProfile>(
                                hwResult.HardwareDetailsJson,
                                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                            );
                        }
                        catch
                        {
                            // Ignore malformed extra hardware json
                        }
                    }

                    await db.SaveChangesAsync(ct);
                }
            }

            return Result.Ok(true);
        }
        catch (OperationCanceledException)
        {
            return Result.Fail<bool>("Timed out waiting for hardware scan response from Runner.");
        }
        catch (Exception ex)
        {
            return Result.Fail<bool>($"Failed to send hardware scan command: {ex.Message}");
        }
    }

    public async Task<Result<IReadOnlyList<RunnerExecutorConfigDto>>> GetExecutorConfigsAsync(
        Guid runnerId,
        CancellationToken ct = default
    )
    {

        var configs = await db
            .RunnerExecutorConfigs.AsNoTracking()
            .Where(x => x.RunnerId == runnerId)
            .ProjectToType<RunnerExecutorConfigDto>()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<RunnerExecutorConfigDto>>(configs);
    }

    public async Task<Result<IReadOnlyList<Guid>>> GetRunnerIdsByExecutorKeyAsync(
        string executorKey,
        CancellationToken ct = default
    )
    {
        var normalizedKey = executorKey.Trim().ToLowerInvariant();
        var runnerIds = await db
            .RunnerExecutorConfigs.AsNoTracking()
            .Where(x => x.ExecutorKey == normalizedKey)
            .Select(x => x.RunnerId)
            .Distinct()
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<Guid>>(runnerIds);
    }

    public async Task<Result<List<RunnerDto>>> GetAvailableRunnersByUserId(
        Guid userId,
        CancellationToken ct = default
    )
    {
        var runners = await db
            .Runners.AsNoTracking()
            .Where(a => a.CreatedBy == userId.ToString())
            .ProjectToType<RunnerDto>()
            .ToListAsync(ct);

        var available = runners.Where(a => registry.Contain(a.Id)).ToList();

        return Result.Ok(available);
    }

    public async Task<Result<List<RunnerInfo>>> GetRunnerInfoByIds(
        IReadOnlyList<Guid> runnerIds,
        CancellationToken ct = default
    )
    {
        var runners = await db
            .Runners.AsNoTracking()
            .Include(x => x.ExecutorConfigs)
            .Where(x => runnerIds.Contains(x.Id))
            .ToListAsync(ct);

        var result = new List<RunnerInfo>();
        foreach (var runner in runners)
        {
            var executorConfigs = runner
                .ExecutorConfigs.Select(x => new RunnerExecutorConfigInfo(
                    x.ExecutorKey,
                    x.ExecutablePath,
                    x.Version
                ))
                .ToList();
            result.Add(
                new RunnerInfo(runner.Id, runner.Name, registry.Contain(runner.Id), executorConfigs)
            );
        }

        return Result.Ok(result);
    }

    public async Task<Result<IReadOnlyList<RunnerDto>>> GetRunnersByStudioIdAsync(
        Guid studioId,
        CancellationToken ct = default
    )
    {
        var runnerIds = await db.RunnerStudios
            .AsNoTracking()
            .Where(rs => rs.StudioId == studioId && rs.IsApproved)
            .Select(rs => rs.RunnerId)
            .ToListAsync(ct);

        if (runnerIds.Count == 0)
            return Result.Ok<IReadOnlyList<RunnerDto>>([]);

        return await GetRunnersByIdsAsync(runnerIds, ct);
    }
}

// Backward-compatibility alias
public class AgentApiService(
    RunnerDbContext db,
    IRunnerConnectionRegistry registry,
    ICommandTracker commandTracker
) : RunnerApiService(db, registry, commandTracker)
{
}
