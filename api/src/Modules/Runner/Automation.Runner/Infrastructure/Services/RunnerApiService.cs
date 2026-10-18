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
            .Include(x => x.ExecutorConfigs)
            .Where(a => a.Id == runnerId)
            .FirstOrDefaultAsync(ct);

        if (runner is null)
            return Result.Fail($"Runner with ID '{runnerId}' was not found.");

        return Result.Ok(runner.Adapt<RunnerDto>());
    }

    public async Task<Result<IReadOnlyList<RunnerDto>>> GetRunnersByIdsAsync(
        IEnumerable<Guid> runnerIds,
        CancellationToken ct = default
    )
    {
        var ids = runnerIds.Distinct().ToList();
        if (ids.Count == 0)
            return Result.Ok<IReadOnlyList<RunnerDto>>([]);

        var entities = await db
            .Runners.AsNoTracking()
            .Include(x => x.ExecutorConfigs)
            .Where(a => ids.Contains(a.Id))
            .ToListAsync(ct);

        return Result.Ok<IReadOnlyList<RunnerDto>>(entities.Adapt<IReadOnlyList<RunnerDto>>());
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

            var systemPlaces = browseResult?.SystemPlaces
                ?.Select(p => new RunnerSystemPlaceDto(p.Name, p.Path))
                .ToList() ?? [];

            var pinnedFolders = browseResult?.PinnedFolders?.ToList() ?? [];

            var drives = browseResult?.Drives
                ?.Select(d => new RunnerDriveInfoDto(d.Mount, d.Label, d.TotalBytes, d.FreeBytes))
                .ToList() ?? [];

            return Result.Ok(
                new RunnerBrowseResultDto(
                    commandId,
                    true,
                    null,
                    currentPath,
                    parentPath,
                    canNavigateUp,
                    items,
                    systemPlaces,
                    pinnedFolders,
                    drives
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
                            runner.HardwareDetails = System.Text.Json.JsonSerializer.Deserialize<Automation.Runner.Contracts.RunnerHardwareProfile>(
                                hwResult.HardwareDetailsJson,
                                new System.Text.Json.JsonSerializerOptions
                                {
                                    PropertyNameCaseInsensitive = true,
                                    PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower
                                }
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

    public async Task<Result<RunnerUploadResultDto>> SendUploadCommandAsync(
        Guid runnerId,
        IEnumerable<RunnerUploadItemDto> items,
        CancellationToken ct = default
    )
    {
        if (!registry.TryGet(runnerId, out var connection) || connection is null)
        {
            return Result.Fail<RunnerUploadResultDto>(
                $"Runner với ID '{runnerId}' chưa kết nối gRPC ngầm."
            );
        }

        var itemList = items.ToList();
        var commandId = Guid.NewGuid().ToString();
        var uploadCommand = new UploadFilesCommand
        {
            CommandId = commandId,
        };

        foreach (var item in itemList)
        {
            uploadCommand.Items.Add(new UploadFileItem
            {
                FilePath = item.FilePath ?? string.Empty,
                PresignedUrl = item.PresignedUrl ?? string.Empty,
                ContentType = string.IsNullOrWhiteSpace(item.ContentType) ? "application/octet-stream" : item.ContentType,
                AssetId = item.AssetId.ToString(),
                ResourceVersionId = item.ResourceVersionId.ToString(),
            });
        }

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromMinutes(2));

        var task = commandTracker.RegisterCommandAsync(commandId, cts.Token);

        try
        {
            await connection.ResponseStream.WriteAsync(
                new ServerMessage { UploadFilesCommand = uploadCommand },
                cts.Token
            );

            var response = await task;

            if (!response.Success)
            {
                return Result.Fail<RunnerUploadResultDto>(
                    $"Lỗi tải lên từ Runner: {response.ErrorMessage}"
                );
            }

            var uploadResult = response.UploadFilesResult;
            var totalBytesUploaded = uploadResult?.TotalBytesUploaded ?? 0;
            var itemResults = uploadResult?.Items
                .Select(x => new RunnerUploadItemResultDto(
                    Guid.TryParse(x.AssetId, out var aid) ? aid : Guid.Empty,
                    Guid.TryParse(x.ResourceVersionId, out var vid) ? vid : Guid.Empty,
                    x.Success,
                    x.BytesUploaded,
                    x.ErrorMessage
                ))
                .ToList() ?? [];

            return Result.Ok(
                new RunnerUploadResultDto(
                    commandId,
                    true,
                    null,
                    totalBytesUploaded,
                    itemResults
                )
            );
        }
        catch (OperationCanceledException)
        {
            return Result.Fail<RunnerUploadResultDto>("Quá thời gian chờ phản hồi upload từ Runner (Timeout 120s). Vui lòng kiểm tra tiến trình Daemon.");
        }
        catch (Exception ex)
        {
            return Result.Fail<RunnerUploadResultDto>($"Lỗi khi gửi lệnh upload: {ex.Message}");
        }
    }

    public async Task<Result<RunnerUpdateResultDto>> SendUpdateRunnerCommandAsync(
        Guid runnerId,
        string downloadUrl,
        string targetVersion,
        string expectedSha256,
        CancellationToken ct = default
    )
    {
        if (!registry.TryGet(runnerId, out var connection) || connection is null)
        {
            return Result.Fail<RunnerUpdateResultDto>(
                $"Runner với ID '{runnerId}' chưa kết nối gRPC ngầm."
            );
        }

        var commandId = Guid.NewGuid().ToString();
        var updateCommand = new UpdateRunnerCommand
        {
            CommandId = commandId,
            DownloadUrl = downloadUrl,
            TargetVersion = targetVersion,
            ExpectedSha256 = expectedSha256,
        };

        var task = commandTracker.RegisterCommandAsync(commandId, ct);

        try
        {
            await connection.ResponseStream.WriteAsync(
                new ServerMessage { UpdateRunnerCommand = updateCommand },
                ct
            );

            var response = await task;

            if (!response.Success)
            {
                return Result.Fail<RunnerUpdateResultDto>(
                    $"Lỗi từ Runner khi cập nhật: {response.ErrorMessage}"
                );
            }

            var res = response.UpdateRunnerResult;
            var currentVersion = res?.CurrentVersion ?? string.Empty;
            var updatedVersion = res?.UpdatedVersion ?? targetVersion;
            var restartScheduled = res?.RestartScheduled ?? false;

            if (!string.IsNullOrWhiteSpace(updatedVersion))
            {
                var runner = await db.Runners.FirstOrDefaultAsync(x => x.Id == runnerId, ct);
                if (runner != null)
                {
                    runner.AppVersion = updatedVersion;
                    runner.LastSeenAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                }
            }

            return Result.Ok(new RunnerUpdateResultDto(currentVersion, updatedVersion, restartScheduled));
        }
        catch (OperationCanceledException)
        {
            return Result.Fail<RunnerUpdateResultDto>("Quá thời gian chờ phản hồi cập nhật từ Runner.");
        }
        catch (Exception ex)
        {
            return Result.Fail<RunnerUpdateResultDto>($"Lỗi khi gửi lệnh cập nhật: {ex.Message}");
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
        var entities = await db
            .Runners.AsNoTracking()
            .Include(x => x.ExecutorConfigs)
            .Where(a => a.CreatedBy == userId.ToString())
            .ToListAsync(ct);

        var runners = entities.Adapt<List<RunnerDto>>();
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

    public async Task<Result<RunnerExecutorConfigDto?>> GetExecutorConfigAsync(
        Guid runnerId,
        string executorKey,
        CancellationToken ct = default
    )
    {
        var config = await db.RunnerExecutorConfigs
            .AsNoTracking()
            .Where(x => x.RunnerId == runnerId && x.ExecutorKey.ToLower() == executorKey.ToLower())
            .Select(x => new RunnerExecutorConfigDto(
                x.Id,
                x.RunnerId,
                x.ExecutorKey,
                x.ExecutablePath,
                x.Version,
                x.IsEnabled,
                x.Settings,
                x.CreatedAt
            ))
            .FirstOrDefaultAsync(ct);

        return Result.Ok<RunnerExecutorConfigDto?>(config);
    }

    public async Task<Result<bool>> SendCancelExecutionCommandAsync(
        Guid runnerId,
        string pipelineExecutionId,
        string stageExecutionId,
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
        var cancelCommand = new CancelExecutionCommand
        {
            CommandId = commandId,
            PipelineExecutionId = pipelineExecutionId,
            StageExecutionId = stageExecutionId,
        };

        var task = commandTracker.RegisterCommandAsync(commandId, ct);

        try
        {
            await connection.ResponseStream.WriteAsync(
                new ServerMessage { CancelExecutionCommand = cancelCommand },
                ct
            );

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(5));

            var response = await task.WaitAsync(cts.Token);
            return Result.Ok(response.Success);
        }
        catch (Exception ex)
        {
            return Result.Fail<bool>($"Failed to send cancel command to runner: {ex.Message}");
        }
    }

    public async Task<Result<bool>> BroadcastCancelExecutionCommandAsync(
        string pipelineExecutionId,
        string stageExecutionId,
        CancellationToken ct = default
    )
    {
        var connections = registry.GetAll();
        if (connections.Count == 0)
        {
            return Result.Ok(false);
        }

        var anySent = false;
        foreach (var conn in connections)
        {
            try
            {
                var commandId = Guid.NewGuid().ToString();
                var cancelCommand = new CancelExecutionCommand
                {
                    CommandId = commandId,
                    PipelineExecutionId = pipelineExecutionId,
                    StageExecutionId = stageExecutionId,
                };

                await conn.ResponseStream.WriteAsync(
                    new ServerMessage { CancelExecutionCommand = cancelCommand },
                    ct
                );
                anySent = true;
            }
            catch
            {
                // Non-fatal broadcast failure
            }
        }

        return Result.Ok(anySent);
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
