using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Automation.Pipeline.BuildTime.Features.Authoring;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Xunit;
using Xunit.Abstractions;

namespace Automation.Pipeline.Tests;

public class VerifyPipelinesDbTests(ITestOutputHelper output)
{
    private const string ConnStr = "Host=localhost;Port=5433;Database=Forgity;Username=postgres;Password=Lee652452456;Timeout=5;";

    [Fact(Skip = "Live DB integration test")]
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
        }
    }
}
