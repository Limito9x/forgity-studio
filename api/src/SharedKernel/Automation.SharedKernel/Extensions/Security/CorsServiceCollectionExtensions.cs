using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.SharedKernel.Extensions.Security;

public static class CorsServiceCollectionExtensions
{
    public const string PolicyName = "ForgityCorsPolicy";

    /// <summary>
    /// Đăng ký cấu hình CORS động đọc từ AppConfig:ClientUrl hoặc Cors:AllowedOrigins.
    /// </summary>
    public static IServiceCollection AddCustomCors(this IServiceCollection services, IConfiguration configuration)
    {
        var rawOrigins = configuration["Cors:AllowedOrigins"] 
                         ?? configuration["AppConfig:ClientUrl"] 
                         ?? "http://localhost:5173;http://localhost:3000;http://localhost";

        var allowedOrigins = rawOrigins
            .Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct()
            .ToArray();

        services.AddCors(options =>
        {
            options.AddPolicy(PolicyName, policy =>
            {
                policy.SetIsOriginAllowed(origin =>
                {
                    if (string.IsNullOrWhiteSpace(origin)) return false;
                    if (allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)) return true;
                    if (Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                    {
                        var host = uri.Host;
                        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                            host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
                            host.EndsWith(".pages.dev", StringComparison.OrdinalIgnoreCase) ||
                            host.Equals("pages.dev", StringComparison.OrdinalIgnoreCase))
                        {
                            return true;
                        }
                    }
                    return false;
                })
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
            });
        });

        return services;
    }

    /// <summary>
    /// Kích hoạt middleware CORS với policy ForgityCorsPolicy.
    /// </summary>
    public static IApplicationBuilder UseCustomCors(this IApplicationBuilder app)
    {
        return app.UseCors(PolicyName);
    }
}
