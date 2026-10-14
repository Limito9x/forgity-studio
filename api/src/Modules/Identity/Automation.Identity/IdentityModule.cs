using Automation.Identity.Domain;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Automation.SharedKernel.Abstractions.Modules;
using Automation.SharedKernel.Extensions.Modules;
using Automation.Identity.Infrastructure.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using Automation.Identity.Extensions;

namespace Automation.Identity;

public sealed class IdentityModule : IModule, IPermissionModule
{
    public string Name => "Identity";
    public string SchemaName => "identity";

    public void ConfigureServices(IServiceCollection services, IConfiguration config)
    {
        services.AddModuleDbContext<IdentityDbContext>(config, SchemaName);

        services.AddIdentityAssetSlots();
        services.AddIdentitySystemSettings();
        services.AddHostedService<Infrastructure.IdentityInitializer>();
        services.AddScoped<Jobs.IdentityJobs>();
        services.AddTransient<Jobs.TickerQJobs>();

        var jwtSettings = config.GetSection("Jwt").Get<JwtSettings>() 
                          ?? new JwtSettings();
        services.AddSingleton(jwtSettings);
        
        services.AddScoped<ITokenService, TokenService>();
        services.AddScoped<IPermissionService, PermissionService>();
        services.AddTransient<Microsoft.AspNetCore.Authentication.IClaimsTransformation, PermissionClaimsTransformation>();

        services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        })
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = jwtSettings.Issuer,
                ValidAudience = jwtSettings.Audience,
                IssuerSigningKey = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(jwtSettings.Secret))
            };
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    var accessToken = context.Request.Query["access_token"];
                    var path = context.HttpContext.Request.Path;
                    if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                    {
                        context.Token = accessToken;
                    }
                    return Task.CompletedTask;
                }
            };
        });

        services.AddIdentityCore<User>(options =>
        {
            options.User.RequireUniqueEmail = true;
        })
        .AddRoles<Role>()
        .AddEntityFrameworkStores<IdentityDbContext>()
        .AddDefaultTokenProviders();
    }

    public void ConfigureWolverine(WolverineOptions options)
    {
        options.CodeGeneration.AlwaysUseServiceLocationFor<UserManager<User>>();
        options.CodeGeneration.AlwaysUseServiceLocationFor<RoleManager<Role>>();
    }

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() 
        => new Constants.IdentityPermissions().GetPermissions();

    public List<Type> Endpoints => [..DiscoveredTypes.All];
}



