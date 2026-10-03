using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
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

    [Fact(Skip = "Scratch DB debug tool")]
    public async Task InspectExecutionFromDb()
    {
        await using var conn = new NpgsqlConnection(ConnStr);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT pid, state, wait_event_type, wait_event, query FROM pg_stat_activity WHERE datname = 'Automation' AND pid <> pg_backend_pid();", conn);
        await using var r = await cmd.ExecuteReaderAsync();
        output.WriteLine("=== PG STAT ACTIVITY ===");
        while (await r.ReadAsync())
        {
            output.WriteLine($"PID {r.GetInt32(0)} | State: {(r.IsDBNull(1) ? "null" : r.GetString(1))} | WaitType: {(r.IsDBNull(2) ? "null" : r.GetString(2))} | WaitEvent: {(r.IsDBNull(3) ? "null" : r.GetString(3))} | Query: {(r.IsDBNull(4) ? "null" : r.GetString(4))}");
        }
    }
}

