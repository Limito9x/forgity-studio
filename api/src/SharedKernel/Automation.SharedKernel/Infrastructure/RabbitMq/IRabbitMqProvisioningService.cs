using FluentResults;

namespace Automation.SharedKernel.Infrastructure.RabbitMq;

public interface IRabbitMqProvisioningService
{
    Task<Result> ProvisionRunnerUserAsync(
        string username,
        string password,
        string virtualHost,
        Guid runnerId,
        CancellationToken ct = default);

    Task<Result> RevokeRunnerUserAsync(
        string username,
        CancellationToken ct = default);
}
