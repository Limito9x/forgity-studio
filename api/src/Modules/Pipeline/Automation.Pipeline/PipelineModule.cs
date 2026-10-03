using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Extensions;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Infrastructure.Redis;
using Automation.SharedKernel.Abstractions.Modules;
using Automation.SharedKernel.Extensions.Modules;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wolverine;
using Wolverine.RabbitMQ;

namespace Automation.Pipeline;

public sealed class PipelineModule : IModule, IPermissionModule
{
    public string Name => "Pipeline";
    public string SchemaName => "pipeline";

    public void ConfigureServices(IServiceCollection services, IConfiguration config)
    {
        services.AddModuleDbContext<PipelineDbContext>(config, SchemaName);
        services.AddPipelineTools();
        services.AddPipelineAssetSlots();

        services.AddSingleton<IExecutionStateStore, RedisExecutionStateStore>();
        services.AddSingleton<Engine.DataResolver.IExecutionMemoryStore, RedisExecutionMemoryStore>();
        services.AddScoped<Engine.ExecPlanner.IExecPlanner, Engine.ExecPlanner.ExecPlanner>();
        services.AddScoped<Engine.DataResolver.IPipelineGraphProvider, Engine.DataResolver.PipelineGraphProvider>();
        services.AddScoped<Engine.DataResolver.Resolvers.PureNodeResolver>();
        services.AddScoped<Engine.DataResolver.Resolvers.AssetResolver>();
        services.AddScoped<Engine.DataResolver.IPinValueResolver, Engine.DataResolver.PinValueResolver>();
        services.AddScoped<Engine.Orchestrator.Dispatchers.DotNetSegmentDispatcher>();
        services.AddScoped<Engine.Orchestrator.Dispatchers.RunnerSegmentDispatcher>();
        services.AddSingleton<Engine.Orchestrator.Enrichers.IExecutorEnvironmentEnricher, Engine.Orchestrator.Enrichers.UnrealEnvironmentEnricher>();
        services.AddScoped<Engine.Orchestrator.Dispatchers.ForEachDispatcher>();
        services.AddScoped<Engine.Orchestrator.Dispatchers.SubPipelineDispatcher>();
        services.AddScoped<Engine.Orchestrator.IPipelineOrchestrator, Engine.Orchestrator.PipelineOrchestrator>();
        services.AddScoped<IPipelineExecutionEngine, PipelineExecutionEngine>();
        services.AddScoped<Features.Pipelines.Services.IPipelineGraphDtoBuilder, Features.Pipelines.Services.PipelineGraphDtoBuilder>();
        services.AddHttpClient();
        services.AddPipelineGrpcServices();
    }

    public void ConfigureWolverine(WolverineOptions options)
    {
        // 1. Route StageTaskMessage out to RabbitMQ queue "stage_tasks"
        options.PublishMessage<StageTaskMessage>()
               .ToRabbitQueue("stage_tasks");

        // 2. Listen to "stage_results" from Agent worker
        options.ListenToRabbitQueue("stage_results")
               .DefaultIncomingMessage<StageResultMessage>();

        // 3. Listen to "step_progress" from Agent worker
        options.ListenToRabbitQueue("step_progress")
               .DefaultIncomingMessage<StepProgressMessage>();

        // 4. Route pipeline executions to dedicated durable local queue
        options.PublishMessage<Features.Pipelines.Dtos.TriggerPipelineExecutionMessage>()
               .ToLocalQueue("pipeline-executions");

        options.LocalQueue("pipeline-executions")
               .MaximumParallelMessages(4)
               .UseDurableInbox();
    }

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() 
        => new Constants.PipelinePermissions().GetPermissions();

    public List<Type> Endpoints => [.. DiscoveredTypes.All];
}
