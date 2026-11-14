using Automation.SharedKernel.Abstractions.Security;
using Automation.SharedKernel.Infrastructure.Security;
using Microsoft.Extensions.DependencyInjection;

namespace Automation.SharedKernel.Extensions.Security;

public static class SecurityServiceCollectionExtensions
{
    /// <summary>
    /// Đăng ký dịch vụ mã hóa bảo vệ khóa bí mật ISecretProtector bằng AES-256-GCM.
    /// </summary>
    public static IServiceCollection AddSecretProtection(this IServiceCollection services)
    {
        services.AddSingleton<ISecretProtector, AesGcmSecretProtector>();
        return services;
    }
}
