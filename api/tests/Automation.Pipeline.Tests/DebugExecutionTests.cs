using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Automation.Content.Contracts;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Extensions;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Infrastructure.Redis;
using Automation.Pipeline.Tools;
using Automation.Repository.Contracts;
using Automation.Repository.Contracts.Extensions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using NSubstitute;
using Xunit;
using Xunit.Abstractions;

namespace Automation.Pipeline.Tests;

public class DebugExecutionTests(ITestOutputHelper output)
{
    private const string ConnStr = "Host=localhost;Port=5433;Database=Automation;Username=postgres;Password=Lee652452456;Timeout=5;";

    [Fact]
    public async Task DumpPipelineNodesAndEdges()
    {
        await using var conn = new NpgsqlConnection(ConnStr);
        await conn.OpenAsync();

        var pipelineId = "01a0fc7d-a26c-7255-bb83-10cc4d10adc3";
        
        await using var cmdNodes = new NpgsqlCommand(
            "SELECT \"Id\", \"RefId\", \"Kind\", \"ParentId\", \"Config\", \"Metadata\" FROM pipeline.\"PipelineNodes\" WHERE \"PipelineId\" = @pid;", conn);
        cmdNodes.Parameters.AddWithValue("pid", Guid.Parse(pipelineId));
        await using var rNodes = await cmdNodes.ExecuteReaderAsync();
        output.WriteLine("=== NODES ===");
        while (await rNodes.ReadAsync())
        {
            output.WriteLine($"Node {rNodes.GetGuid(0)} | RefId: {rNodes.GetString(1)} | Kind: {rNodes.GetString(2)} | Parent: {(rNodes.IsDBNull(3) ? "null" : rNodes.GetGuid(3).ToString())} | Config: {(rNodes.IsDBNull(4) ? "null" : rNodes.GetString(4))} | Meta: {(rNodes.IsDBNull(5) ? "null" : rNodes.GetString(5))}");
        }
        await rNodes.CloseAsync();

        await using var cmdEdges = new NpgsqlCommand(
            "SELECT \"SourcePipelineNodeId\", \"SourcePin\", \"TargetPipelineNodeId\", \"TargetPin\" FROM pipeline.\"PipelineEdges\" WHERE \"PipelineId\" = @pid;", conn);
        cmdEdges.Parameters.AddWithValue("pid", Guid.Parse(pipelineId));
        await using var rEdges = await cmdEdges.ExecuteReaderAsync();
        output.WriteLine("=== EDGES ===");
        while (await rEdges.ReadAsync())
        {
            output.WriteLine($"Edge: {rEdges.GetGuid(0)} [{rEdges.GetString(1)}] -> {rEdges.GetGuid(2)} [{rEdges.GetString(3)}]");
        }
    }

    [Fact]
    public async Task InspectExecutionFromDb()
    {
        await using var conn = new NpgsqlConnection(ConnStr);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT \"Id\", \"Status\", \"ExecutionState\", \"ErrorMessage\", \"CreatedAt\" FROM pipeline.\"PipelineExecutions\" ORDER BY \"CreatedAt\" DESC LIMIT 1;", conn);
        await using var r = await cmd.ExecuteReaderAsync();
        if (await r.ReadAsync())
        {
            output.WriteLine($"Execution ID: {r.GetGuid(0)} | Status: {r.GetString(1)} | CreatedAt: {r.GetDateTime(4)}");
            output.WriteLine($"ErrorMessage: {(r.IsDBNull(3) ? "null" : r.GetString(3))}");
            output.WriteLine("=== EXECUTION STATE JSON ===");
            output.WriteLine(r.IsDBNull(2) ? "null" : r.GetString(2));
        }
    }

    [Fact]
    public async Task TestResolveSetVariablePins()
    {
        var services = new ServiceCollection();
        services.AddLogging(b => b.AddConsole().SetMinimumLevel(LogLevel.Debug));
        services.AddDbContext<PipelineDbContext>(options =>
            options.UseNpgsql(ConnStr));

        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddPipelineTools();
        services.AddSingleton<IExecutionStateStore, RedisExecutionStateStore>();
        services.AddSingleton<Engine.DataResolver.IExecutionMemoryStore, RedisExecutionMemoryStore>();
        services.AddScoped<IRepositoryApi>(_ => Substitute.For<IRepositoryApi>());
        services.AddScoped<IContentApi>(_ => Substitute.For<IContentApi>());
        services.AddScoped<Engine.EntityStore.IExecutionEntityStore, Engine.EntityStore.ExecutionEntityStore>();
        services.AddScoped<Engine.ExecPlanner.IExecPlanner, Engine.ExecPlanner.ExecPlanner>();
        services.AddScoped<Engine.DataResolver.IPipelineGraphProvider, Engine.DataResolver.PipelineGraphProvider>();
        services.AddScoped<Engine.DataResolver.Resolvers.PureNodeResolver>();
        services.AddScoped<Engine.DataResolver.Resolvers.AssetResolver>();
        services.AddScoped<Engine.DataResolver.IPinValueResolver, Engine.DataResolver.PinValueResolver>();

        var sp = services.BuildServiceProvider();
        var db = sp.GetRequiredService<PipelineDbContext>();
        var pinResolver = sp.GetRequiredService<IPinValueResolver>();
        var toolRegistry = sp.GetRequiredService<IToolRegistry>();
        var graphProvider = sp.GetRequiredService<IPipelineGraphProvider>();

        var pipelineId = Guid.Parse("01a0fc7d-a26c-7255-bb83-10cc4d10adc3");
        var executionId = Guid.NewGuid();

        // Frozen graph
        var pipe = await db.Pipelines
            .Include(p => p.Nodes)
            .Include(p => p.Edges)
            .Include(p => p.Parameters)
            .FirstAsync(p => p.Id == pipelineId);

        var frozen = Engine.Models.FrozenExecutionGraph.Create(pipe, toolRegistry);
        graphProvider.RegisterFrozenGraph(executionId, frozen);

        var setVarNodeId = Guid.Parse("e30051b8-4586-4caa-8357-d2cf0d4a6584");
        var forEachNodeId = Guid.Parse("f123b12a-cc0e-424a-bc62-fef73a62ad33");

        var scope = new ScopeContext("root").BuildChildScope($"foreach_{forEachNodeId:N}", iterationIndex: 0);
        scope.SetValue("Item", "urn:resource:01a0fc28-f4da-7892-b2c8-27daa7a939a9");
        scope.SetValue("Value", "urn:resource:01a0fc28-f4da-7892-b2c8-27daa7a939a9");
        scope.SetValue("Index", 0);

        output.WriteLine("Resolving pins for SetVariable...");
        var resolved = await pinResolver.ResolveAllPinsAsync(executionId, setVarNodeId, scope: scope);
        output.WriteLine($"Resolved {resolved.Count} pins:");
        foreach (var (k, v) in resolved)
        {
            output.WriteLine($"  {k} = {v}");
        }
    }

    [Fact]
    public async Task PrintExecPlan()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<PipelineDbContext>(options => options.UseNpgsql(ConnStr));
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddScoped<IRepositoryApi>(_ => Substitute.For<IRepositoryApi>());
        services.AddScoped<IContentApi>(_ => Substitute.For<IContentApi>());
        services.AddScoped<Automation.Tag.Contracts.ITagApi>(_ => Substitute.For<Automation.Tag.Contracts.ITagApi>());
        services.AddScoped<Automation.Files.Contracts.IAssetApi>(_ => Substitute.For<Automation.Files.Contracts.IAssetApi>());
        services.AddPipelineTools();
        services.AddScoped<Engine.ExecPlanner.IExecPlanner, Engine.ExecPlanner.ExecPlanner>();

        var sp = services.BuildServiceProvider();
        var db = sp.GetRequiredService<PipelineDbContext>();
        var toolRegistry = sp.GetRequiredService<IToolRegistry>();
        var planner = sp.GetRequiredService<Engine.ExecPlanner.IExecPlanner>();

        var pipelineId = Guid.Parse("01a0fc7d-a26c-7255-bb83-10cc4d10adc3");
        var pipe = await db.Pipelines
            .Include(p => p.Nodes)
            .Include(p => p.Edges)
            .Include(p => p.Parameters)
            .FirstAsync(p => p.Id == pipelineId);

        var plan = planner.BuildExecPlan(pipe, Array.Empty<Automation.Pipeline.Domain.Entities.NodeDefinition>(), toolRegistry);
        output.WriteLine($"=== EXEC PLAN HAS {plan.Segments.Count} SEGMENTS ===");
        for (int i = 0; i < plan.Segments.Count; i++)
        {
            var seg = plan.Segments[i];
            output.WriteLine($"[Segment #{i}] Executor: {seg.Executor} | Stage: {seg.StageName} ({seg.StageId}) | IsFlowControl: {seg.IsFlowControl} | Runner: {seg.TargetRunnerId}");
            foreach (var st in seg.Steps)
            {
                output.WriteLine($"   Step: {st.Label} ({st.NodeId}) [RefId: {st.RefId}, Kind: {st.Kind}]");
            }
            if (seg.BodyPlan != null)
            {
                output.WriteLine($"   --> BODY PLAN ({seg.BodyPlan.Segments.Count} segments):");
                for (int j = 0; j < seg.BodyPlan.Segments.Count; j++)
                {
                    var bSeg = seg.BodyPlan.Segments[j];
                    output.WriteLine($"       [Body Seg #{j}] Executor: {bSeg.Executor} | Stage: {bSeg.StageName}");
                    foreach (var bSt in bSeg.Steps)
                    {
                        output.WriteLine($"          Body Step: {bSt.Label} ({bSt.NodeId})");
                    }
                }
            }
        }
    }
}


