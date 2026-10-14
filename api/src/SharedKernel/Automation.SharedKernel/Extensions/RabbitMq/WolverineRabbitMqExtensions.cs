using Microsoft.Extensions.Configuration;
using Wolverine;
using Wolverine.RabbitMQ;

namespace Automation.SharedKernel.Extensions.RabbitMq;

public static class WolverineRabbitMqExtensions
{
    public static WolverineOptions UseSharedRabbitMq(this WolverineOptions options, IConfiguration configuration)
    {
        var enabledStr = configuration["RabbitMQ:Enabled"];
        if (bool.TryParse(enabledStr, out var isEnabled) && !isEnabled)
        {
            return options;
        }

        var host = configuration["RabbitMQ:Host"] ?? "localhost";
        var portStr = configuration["RabbitMQ:Port"];
        var port = int.TryParse(portStr, out var p) ? p : 5672;
        var user = configuration["RabbitMQ:Username"] ?? "guest";
        var pass = configuration["RabbitMQ:Password"] ?? "guest";
        var virtualHost = configuration["RabbitMQ:VirtualHost"] ?? "/";

        var mgmtPortStr = configuration["RabbitMQ:ManagementPort"];
        var mgmtPort = int.TryParse(mgmtPortStr, out var mp) ? mp : 15672;
        var mgmtScheme = configuration["RabbitMQ:ManagementScheme"] ?? "http";
        var mgmtUrl = configuration["RabbitMQ:ManagementUrl"] ?? $"{mgmtScheme}://{host}:{mgmtPort}";

        // Support full CloudAMQP / AMQP URL connection string if provided
        var urlStr = configuration["RabbitMQ:Url"]
            ?? configuration["CLOUDAMQP_URL"]
            ?? Environment.GetEnvironmentVariable("CLOUDAMQP_URL")
            ?? Environment.GetEnvironmentVariable("RABBITMQ_URL");

        if (!string.IsNullOrWhiteSpace(urlStr) && Uri.TryCreate(urlStr, UriKind.Absolute, out var uri))
        {
            host = uri.Host;
            var isSsl = uri.Scheme.Equals("amqps", StringComparison.OrdinalIgnoreCase);
            port = uri.Port > 0 ? uri.Port : (isSsl ? 5671 : 5672);

            if (!string.IsNullOrEmpty(uri.UserInfo))
            {
                var parts = uri.UserInfo.Split(':', 2);
                user = Uri.UnescapeDataString(parts[0]);
                if (parts.Length > 1) pass = Uri.UnescapeDataString(parts[1]);
            }

            var path = uri.AbsolutePath.TrimStart('/');
            if (!string.IsNullOrWhiteSpace(path))
            {
                virtualHost = Uri.UnescapeDataString(path);
            }

            mgmtUrl = configuration["RabbitMQ:ManagementUrl"] ?? $"https://{host}";
        }

        SharedRabbitMqConfigHolder.Current = new(host, port, user, pass, virtualHost, mgmtUrl);

        options.UseRabbitMq(transport =>
        {
            transport.HostName = host;
            transport.Port = port;
            transport.UserName = user;
            transport.Password = pass;
            transport.VirtualHost = virtualHost;
            transport.RequestedConnectionTimeout = TimeSpan.FromSeconds(3);
        })
        .AutoProvision();

        return options;
    }
}

public record SharedRabbitMqConfig(
    string Host,
    int Port,
    string Username,
    string Password,
    string VirtualHost,
    string ManagementUrl = "http://localhost:15672"
);

public static class SharedRabbitMqConfigHolder
{
    private static SharedRabbitMqConfig? _current;
    public static SharedRabbitMqConfig Current
    {
        get => _current ?? new SharedRabbitMqConfig(
            Environment.GetEnvironmentVariable("RABBITMQ_HOST") ?? "localhost",
            int.TryParse(Environment.GetEnvironmentVariable("RABBITMQ_PORT"), out var p) ? p : 5672,
            Environment.GetEnvironmentVariable("RABBITMQ_USER") ?? "guest",
            Environment.GetEnvironmentVariable("RABBITMQ_PASSWORD") ?? "guest",
            Environment.GetEnvironmentVariable("RABBITMQ_VHOST") ?? "/",
            Environment.GetEnvironmentVariable("RABBITMQ_MGMT_URL") ?? "http://localhost:15672"
        );
        set => _current = value;
    }
}
