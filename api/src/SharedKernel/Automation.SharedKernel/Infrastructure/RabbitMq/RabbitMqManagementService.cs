using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Automation.SharedKernel.Extensions.RabbitMq;
using FluentResults;
using Microsoft.Extensions.Logging;

namespace Automation.SharedKernel.Infrastructure.RabbitMq;

public class RabbitMqManagementService(
    HttpClient httpClient,
    ILogger<RabbitMqManagementService> logger
) : IRabbitMqProvisioningService
{
    public async Task<Result> ProvisionRunnerUserAsync(
        string username,
        string password,
        string virtualHost,
        Guid runnerId,
        CancellationToken ct = default
    )
    {
        var rmq = SharedRabbitMqConfigHolder.Current;
        var baseUrl = rmq.ManagementUrl.TrimEnd('/');

        try
        {
            var authHeader = new AuthenticationHeaderValue(
                "Basic",
                Convert.ToBase64String(Encoding.ASCII.GetBytes($"{rmq.Username}:{rmq.Password}"))
            );

            // 1. Create User: PUT /api/users/{username}
            var createUserUrl = $"{baseUrl}/api/users/{Uri.EscapeDataString(username)}";
            using var userRequest = new HttpRequestMessage(HttpMethod.Put, createUserUrl);
            userRequest.Headers.Authorization = authHeader;

            var userPayload = new { password, tags = "" };
            userRequest.Content = new StringContent(
                JsonSerializer.Serialize(userPayload),
                Encoding.UTF8,
                "application/json"
            );

            using var userResponse = await httpClient.SendAsync(userRequest, ct);
            if (!userResponse.IsSuccessStatusCode)
            {
                var error = await userResponse.Content.ReadAsStringAsync(ct);
                logger.LogError(
                    "RabbitMQ Management API failed to create user '{Username}'. StatusCode: {StatusCode}, Error: {Error}",
                    username, userResponse.StatusCode, error
                );
                return Result.Fail($"Failed to create RabbitMQ user '{username}': {userResponse.StatusCode}");
            }

            // 2. Set Permissions: PUT /api/permissions/{vhost}/{username}
            var vhost = string.IsNullOrWhiteSpace(virtualHost) ? "/" : virtualHost;
            var escapedVhost = Uri.EscapeDataString(vhost);
            var permUrl = $"{baseUrl}/api/permissions/{escapedVhost}/{Uri.EscapeDataString(username)}";

            using var permRequest = new HttpRequestMessage(HttpMethod.Put, permUrl);
            permRequest.Headers.Authorization = authHeader;

            var permPayload = new
            {
                configure = $"^(stage_tasks\\.{runnerId}|amq\\.gen.*)$",
                write = "^(stage_results|step_progress|amq\\.default|pipeline\\.events)$",
                read = $"^(stage_tasks\\.{runnerId}|amq\\.gen.*)$"
            };

            permRequest.Content = new StringContent(
                JsonSerializer.Serialize(permPayload),
                Encoding.UTF8,
                "application/json"
            );

            using var permResponse = await httpClient.SendAsync(permRequest, ct);
            if (!permResponse.IsSuccessStatusCode)
            {
                var error = await permResponse.Content.ReadAsStringAsync(ct);
                logger.LogError(
                    "RabbitMQ Management API failed to set permissions for user '{Username}'. StatusCode: {StatusCode}, Error: {Error}",
                    username, permResponse.StatusCode, error
                );
                return Result.Fail($"Failed to configure permissions for RabbitMQ user '{username}': {permResponse.StatusCode}");
            }

            logger.LogInformation(
                "Successfully provisioned RabbitMQ dynamic user '{Username}' for runner '{RunnerId}' with scoped permissions.",
                username, runnerId
            );

            return Result.Ok();
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "Exception occurred while provisioning dynamic RabbitMQ user '{Username}' on {ManagementUrl}: {Message}",
                username, baseUrl, ex.Message
            );
            return Result.Fail($"RabbitMQ Management API communication failed: {ex.Message}");
        }
    }

    public async Task<Result> RevokeRunnerUserAsync(string username, CancellationToken ct = default)
    {
        var rmq = SharedRabbitMqConfigHolder.Current;
        var baseUrl = rmq.ManagementUrl.TrimEnd('/');

        try
        {
            var authHeader = new AuthenticationHeaderValue(
                "Basic",
                Convert.ToBase64String(Encoding.ASCII.GetBytes($"{rmq.Username}:{rmq.Password}"))
            );

            var deleteUserUrl = $"{baseUrl}/api/users/{Uri.EscapeDataString(username)}";
            using var request = new HttpRequestMessage(HttpMethod.Delete, deleteUserUrl);
            request.Headers.Authorization = authHeader;

            using var response = await httpClient.SendAsync(request, ct);
            if (response.IsSuccessStatusCode || response.StatusCode == HttpStatusCode.NotFound)
            {
                logger.LogInformation("Successfully revoked/deleted RabbitMQ user '{Username}'.", username);
                return Result.Ok();
            }

            var error = await response.Content.ReadAsStringAsync(ct);
            logger.LogWarning(
                "Failed to delete RabbitMQ user '{Username}'. StatusCode: {StatusCode}, Error: {Error}",
                username, response.StatusCode, error
            );
            return Result.Fail($"Failed to revoke RabbitMQ user '{username}': {response.StatusCode}");
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "Exception occurred while deleting RabbitMQ user '{Username}' on {ManagementUrl}: {Message}",
                username, baseUrl, ex.Message
            );
            return Result.Fail($"RabbitMQ Management API delete failed: {ex.Message}");
        }
    }
}
