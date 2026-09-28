using Microsoft.Extensions.DependencyInjection;
using Automation.SharedKernel.Infrastructure.Persistence;

namespace Automation.SharedKernel.Extensions.Auth;

public static class AuthServiceCollectionExtensions
{
    public static IServiceCollection AddCurrentUserProvider(this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
        services.AddSingleton<ICurrentUserProvider, CurrentUserProvider>();
        services.AddSingleton<ICurrentStudioProvider, CurrentStudioProvider>();
        return services;
    }
}



