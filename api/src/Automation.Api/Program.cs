using Automation.Api;
using FastEndpoints;
using Automation.Runner.Infrastructure.Auth;
using Automation.SharedKernel.Extensions.Modules;
using Automation.SharedKernel.Extensions.Auth;
using Automation.SharedKernel.Extensions.Caching;
using Automation.SharedKernel.Extensions.Logging;
using Automation.SharedKernel.Extensions.Jobs;
using Automation.SharedKernel.Extensions.Observability;
using FastEndpoints.OpenApi;
using Scalar.AspNetCore;
using Automation.SharedKernel.Extensions.ExceptionHandling;

using Automation.Runner.Extensions;
using Automation.Pipeline.Extensions;

using Microsoft.AspNetCore.Server.Kestrel.Core;

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.ConfigureKestrel(options =>
{
    // Port 5189: REST API, Scalar, HTTP Web App
    options.ListenAnyIP(5189, listenOptions =>
    {
        listenOptions.Protocols = HttpProtocols.Http1;
    });

    // Port 50051: gRPC Unencrypted (h2c HTTP/2)
    options.ListenAnyIP(50051, listenOptions =>
    {
        listenOptions.Protocols = HttpProtocols.Http2;
    });
});

builder.AddCustomSerilog();
builder.AddOpenTelemetryServices();

builder.Services.AddFastEndpoints(ModuleRegistry.AllEndpoints)
    .OpenApiDocument(o =>
    {
        o.AutoTagPathSegmentIndex = 0;
        o.ShortSchemaNames = true;
    });

builder.Services.AddCurrentUserProvider();

builder.AddModules(ModuleRegistry.All);

builder.Services.AddJobServices(builder.Configuration);

builder.Services.AddOpenApi();

builder.Services.AddRedisCache(builder.Configuration);

builder.Services.AddRateLimitingServices(builder.Configuration);

builder.Services.AddGlobalExceptionHandling();

builder.Services.AddAuthentication();
builder.Services.AddAuthorization();
builder.Services.AddSignalR();

// Graceful shutdown timeout on Ctrl+C
builder.Services.Configure<HostOptions>(options =>
{
    options.ShutdownTimeout = TimeSpan.FromSeconds(5);
});

var app = builder.Build();

app.Lifetime.ApplicationStopping.Register(() =>
{
    Npgsql.NpgsqlConnection.ClearAllPools();
});

app.UseGlobalExceptionHandling();

app.UseCustomSerilogRequestLogging();

app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();
app.UseRunnerAuthentication();

app.UseJobMiddleware();

app.UseFastEndpoints(c =>
{
    c.Endpoints.RoutePrefix = "api";
    c.Security.PermissionsClaimType = "Permission";
});

app.MapHub<Automation.Notifications.Features.Notifications.NotificationHub>("/hubs/notifications");
app.MapHub<Automation.Pipeline.Hubs.PipelineExecutionHub>("/hubs/pipeline-executions");
app.MapRunnerGrpcServices();
app.MapPipelineGrpcServices();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options
            .WithTitle("Template API Reference")
            .WithTheme(ScalarTheme.DeepSpace)
            .WithDefaultHttpClient(ScalarTarget.CSharp, ScalarClient.HttpClient);
    });
}

await app.RunAsync();
