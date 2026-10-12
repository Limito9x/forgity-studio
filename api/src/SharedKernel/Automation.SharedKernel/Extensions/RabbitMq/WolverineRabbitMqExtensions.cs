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

        SharedRabbitMqConfigHolder.Current = new(host, port, user, pass, virtualHost);

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
    string VirtualHost
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
            Environment.GetEnvironmentVariable("RABBITMQ_VHOST") ?? "/"
        );
        set => _current = value;
    }
}
