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
                policy.WithOrigins(allowedOrigins)
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
