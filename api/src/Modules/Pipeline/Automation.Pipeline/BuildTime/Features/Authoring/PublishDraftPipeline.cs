using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;
using Automation.Pipeline.BuildTime.Features.Authoring.Dtos;
using Automation.Pipeline.BuildTime.Features.CustomNodes;
using Automation.Pipeline.BuildTime.Services;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.BuildTime.Features.Authoring;

public record PublishLocalScriptItem(
    string Key,
    string Name,
    string? Label,
    string? Executor,
    string Content,
    string? SourceOrigin
);

public class PublishDraftPipelineRequest
{
    public Guid ProjectId { get; set; }
    public Guid? PipelineId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<SavePipelineNodeItem> Nodes { get; set; } = [];
    public List<SavePipelineEdgeItem> Edges { get; set; } = [];
    public List<PipelineParameter>? Parameters { get; set; }
    public List<PublishLocalScriptItem>? LocalScripts { get; set; }
}

public record PublishDraftPipelineResponseDto(
    Guid PipelineId,
    string Name,
    int VersionNumber,
    int PublishedScriptCount,
    string Message
);

public class PublishDraftPipelineEndpoint(IMessageBus bus)
    : Endpoint<PublishDraftPipelineRequest, PublishDraftPipelineResponseDto>
{
    public override void Configure()
    {
        Post("publish-draft");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Create, P.Pipeline.Update);
        Description(d => d.Produces<PublishDraftPipelineResponseDto>(200).Produces(400));
    }

    public override async Task HandleAsync(PublishDraftPipelineRequest req, CancellationToken ct)
    {
        var cmd = new PublishDraftPipelineCommand(
            req.ProjectId,
            req.PipelineId,
            req.Name,
            req.Description,
            req.Nodes,
            req.Edges,
            req.Parameters,
            req.LocalScripts
        );
        var result = await bus.InvokeAsync<Result<PublishDraftPipelineResponseDto>>(cmd, ct);
        await this.SendResultAsync(result, ct);
    }
}

public record PublishDraftPipelineCommand(
    Guid ProjectId,
    Guid? PipelineId,
    string Name,
    string? Description,
    List<SavePipelineNodeItem> Nodes,
    List<SavePipelineEdgeItem> Edges,
    List<PipelineParameter>? Parameters,
    List<PublishLocalScriptItem>? LocalScripts
);

[Transactional(typeof(PipelineDbContext))]
public class PublishDraftPipelineHandler(
    PipelineDbContext db,
    IScriptSchemaAnalyzer analyzer,
    ITransientPipelineGraphFactory transientGraphFactory,
    ILogger<PublishDraftPipelineHandler> logger
)
{
    public async Task<Result<PublishDraftPipelineResponseDto>> HandleAsync(
        PublishDraftPipelineCommand command,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(command.Name))
        {
            return Result.Fail<PublishDraftPipelineResponseDto>("Pipeline name cannot be empty.");
        }

        int publishedScriptCount = 0;
        var keyMapping = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        // 1. Process Local Scripts -> Upsert to NodeDefinitions
        if (command.LocalScripts != null && command.LocalScripts.Count > 0)
        {
            foreach (var script in command.LocalScripts)
            {
                if (string.IsNullOrWhiteSpace(script.Content)) continue;

                // Hash content
                var bytes = System.Text.Encoding.UTF8.GetBytes(script.Content);
                var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

                var fileName = script.Name.EndsWith(".py", StringComparison.OrdinalIgnoreCase)
                    ? script.Name
                    : $"{script.Name}.py";

                // Analyze schema
                var schemaResult = await analyzer.AnalyzeAsync(script.Content, fileName, ct);
                var inputs = schemaResult.Inputs;
                var outputs = schemaResult.Outputs;

                // Check existing NodeDefinition
                var cleanKey = script.Key.StartsWith("local:", StringComparison.OrdinalIgnoreCase)
                    ? script.Key[6..]
                    : script.Key;

                var existingNode = await db.NodeDefinitions
                    .FirstOrDefaultAsync(n => n.ProjectId == command.ProjectId && n.Key == cleanKey, ct);

                if (existingNode == null)
                {
                    var newNode = new NodeDefinition(
                        command.ProjectId,
                        script.Name,
                        cleanKey,
                        script.Label ?? script.Name,
                        script.Executor ?? "python",
                        inputs,
                        outputs
                    )
                    {
                        ContentHash = hash,
                        SourceRepositoryPath = script.SourceOrigin,
                        Status = NodeLifecycleStatus.Published,
                        SemanticVersion = "1.0.0"
                    };
                    db.NodeDefinitions.Add(newNode);
                }
                else
                {
                    existingNode.Update(
                        script.Name,
                        script.Label ?? script.Name,
                        script.Executor ?? existingNode.Executor,
                        inputs,
                        outputs
                    );
                    existingNode.ContentHash = hash;
                    existingNode.Status = NodeLifecycleStatus.Published;
                    existingNode.SemanticVersion = BumpMinor(existingNode.SemanticVersion);
                    existingNode.SourceRepositoryPath = script.SourceOrigin;
                }

                keyMapping[script.Key] = cleanKey;
                publishedScriptCount++;
            }

            await db.SaveChangesAsync(ct);
        }

        // 2. Normalize Nodes references: replace local:* keys with clean studio keys
        var normalizedNodesInput = new List<SavePipelineNodeItem>();
        foreach (var item in command.Nodes)
        {
            var refId = item.RefId;
            if (keyMapping.TryGetValue(refId, out var mappedKey))
            {
                refId = mappedKey;
            }
            else if (refId.StartsWith("local:", StringComparison.OrdinalIgnoreCase))
            {
                refId = refId[6..];
            }

            normalizedNodesInput.Add(item with { RefId = refId });
        }

        // 3. Create or Update Pipeline Entity
        Domain.Entities.Pipeline pipeline;
        if (command.PipelineId.HasValue)
        {
            pipeline = await db.Pipelines.FirstOrDefaultAsync(p => p.Id == command.PipelineId.Value, ct)
                ?? throw new InvalidOperationException($"Pipeline {command.PipelineId.Value} not found.");

            pipeline.Name = command.Name;
        }
        else
        {
            pipeline = new Domain.Entities.Pipeline(
                command.ProjectId,
                command.Name,
                PipelineTriggerType.Manual
            );
            db.Pipelines.Add(pipeline);
        }

        // Build domain Pipeline via factory
        var builtPipeline = transientGraphFactory.BuildFromDraftSnapshot(
            pipeline,
            normalizedNodesInput,
            command.Edges,
            command.Parameters ?? []
        );

        pipeline.GraphData = builtPipeline.GraphData;

        // Calculate graph hash
        var graphJson = JsonSerializer.Serialize(pipeline.GraphData);
        var graphHash = Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(graphJson))).ToLowerInvariant();
        pipeline.GraphHash = graphHash;

        await db.SaveChangesAsync(ct);

        // 4. Create immutable PipelineSnapshot
        var maxVer = await db.PipelineSnapshots
            .Where(s => s.PipelineId == pipeline.Id)
            .MaxAsync(s => (int?)s.VersionNumber, ct) ?? 0;

        var nextVer = maxVer + 1;
        var snapshot = new PipelineSnapshot(
            pipeline.Id,
            nextVer,
            pipeline.GraphData,
            graphHash,
            "PublishedFromDraft",
            $"Published version {nextVer} from local workspace"
        );
        db.PipelineSnapshots.Add(snapshot);
        pipeline.ActiveSnapshotId = snapshot.Id;

        await db.SaveChangesAsync(ct);

        return Result.Ok(new PublishDraftPipelineResponseDto(
            pipeline.Id,
            pipeline.Name,
            nextVer,
            publishedScriptCount,
            $"Pipeline '{pipeline.Name}' published successfully with version {nextVer}."
        ));
    }

    private static string BumpMinor(string version)
    {
        if (Version.TryParse(version, out var parsed))
        {
            return $"{parsed.Major}.{parsed.Minor + 1}.0";
        }
        return "1.1.0";
    }
}
