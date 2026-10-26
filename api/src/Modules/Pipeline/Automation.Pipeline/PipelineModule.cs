using Automation.Pipeline.BuildTime.Features.Authoring.Dtos;
using Automation.Pipeline.BuildTime.Graph;
using Automation.Pipeline.BuildTime.Services;
using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Extensions;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Infrastructure.Redis;
using Automation.Pipeline.Runtime.DataResolver;
using Automation.Pipeline.Runtime.DataResolver.Resolvers;
using Automation.Pipeline.Runtime.Orchestrator;
using Automation.Pipeline.Runtime.Orchestrator.Dispatchers;
using Automation.Pipeline.Runtime.Orchestrator.Enrichers;
using Automation.Pipeline.Runtime.Planner;
using Automation.Pipeline.Runtime.State;
using Automation.Pipeline.Runtime.State.EntityStore;
using Automation.Pipeline.Runtime.State.Messages;
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
        services.AddSingleton<IExecutionMemoryStore, RedisExecutionMemoryStore>();
        services.AddScoped<IExecutionEntityStore, ExecutionEntityStore>();
        services.AddScoped<IExecPlanner, ExecPlanner>();
        services.AddScoped<IPipelineGraphProvider, PipelineGraphProvider>();
        services.AddScoped<PureNodeResolver>();
        services.AddScoped<AssetResolver>();
        services.AddScoped<IPinValueResolver, PinValueResolver>();
        services.AddScoped<DotNetSegmentDispatcher>();
        services.AddScoped<RunnerSegmentDispatcher>();
        services.AddSingleton<IExecutorEnvironmentEnricher, UnrealEnvironmentEnricher>();
        services.AddScoped<SubPipelineDispatcher>();
        services.AddScoped<IPipelineOrchestrator, PipelineOrchestrator>();
        services.AddScoped<IPipelineExecutionEngine, PipelineExecutionEngine>();
        services.AddScoped<INodeContractResolver, PipelineNodeContractResolver>();
        services.AddScoped<IPipelineContractValidator, PipelineContractValidator>();
        services.AddScoped<ITransientPipelineGraphFactory, TransientPipelineGraphFactory>();
        services.AddScoped<IPipelineGraphDtoBuilder, PipelineGraphDtoBuilder>();
        services.AddSingleton<NativePythonScriptAnalyzer>();
        services.AddSingleton<IScriptSchemaAnalyzer, HybridScriptSchemaAnalyzer>();
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
        options.PublishMessage<TriggerPipelineExecutionMessage>()
               .ToLocalQueue("pipeline-executions");

        options.LocalQueue("pipeline-executions")
               .MaximumParallelMessages(4)
               .UseDurableInbox();

        // 5. Route stage timeout watchdog checks to dedicated local queue
        options.PublishMessage<StageTimeoutCheckMessage>()
               .ToLocalQueue("pipeline-timeouts");

        options.LocalQueue("pipeline-timeouts")
               .UseDurableInbox();
    }

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() 
        => new Constants.PipelinePermissions().GetPermissions();

    public List<Type> Endpoints => [.. DiscoveredTypes.All];
}
