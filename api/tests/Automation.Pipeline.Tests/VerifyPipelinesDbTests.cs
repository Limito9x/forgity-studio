using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Automation.Files.Contracts;
using Automation.Pipeline.BuildTime.Features.Authoring;
using Automation.Pipeline.BuildTime.Graph;
using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Contracts.StructRegistry;
using Automation.Pipeline.Contracts.Tools;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;
using Xunit.Abstractions;

namespace Automation.Pipeline.Tests;

public class VerifyPipelinesDbTests(ITestOutputHelper output)
{
    private const string ConnStr = "Host=localhost;Port=5433;Database=Forgity;Username=postgres;Password=Lee652452456;Timeout=5;";

    [Fact(Skip = "Manual live DB integration verification")]
    public async Task VerifyPipelinesGraphDataFromDb()
    {
        var options = new DbContextOptionsBuilder<PipelineDbContext>()
            .UseNpgsql(ConnStr)
            .Options;

        await using var db = new PipelineDbContext(options);
        var handler = new GetPipelinesHandler(db);
        var res = await handler.HandleAsync(new GetPipelinesQuery(null, false), CancellationToken.None);

        Assert.True(res.IsSuccess);
        var pipelines = res.Value;
        Assert.NotEmpty(pipelines);

        output.WriteLine($"Total pipelines: {pipelines.Count}");
        foreach (var p in pipelines)
        {
            output.WriteLine($"Pipeline: {p.Name} | NodeCount: {p.NodeCount} | EdgeCount: {p.EdgeCount}");
            Assert.True(p.NodeCount > 0, $"Pipeline {p.Name} should have nodes > 0");

            // Also test loading single pipeline entity directly
            var entity = await db.Pipelines.AsNoTracking().FirstOrDefaultAsync(x => x.Id == p.Id);
            Assert.NotNull(entity);
            Assert.Equal(p.NodeCount, entity.Nodes.Count);
            Assert.Equal(p.EdgeCount, entity.Edges.Count);

            // Test first node position and edge source
            var firstNode = entity.Nodes.First();
            output.WriteLine($"   First Node: {firstNode.RefId} pos=({firstNode.Position.X}, {firstNode.Position.Y})");
            var firstEdge = entity.Edges.First();
            output.WriteLine($"   First Edge: from {firstEdge.SourcePipelineNodeId}:{firstEdge.SourcePin} to {firstEdge.TargetPipelineNodeId}:{firstEdge.TargetPin}");
            Assert.NotEqual(Guid.Empty, firstEdge.SourcePipelineNodeId);
            Assert.NotEqual(Guid.Empty, firstEdge.TargetPipelineNodeId);
        }
    }
}
