using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Files.Domain.Entities;
using Automation.Files.Infrastructure;
using Automation.Files.Infrastructure.Persistence;
using Automation.Files.Infrastructure.Storage;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Nodes;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;
using Wolverine;
using Xunit;

namespace Automation.Pipeline.Tests;

public sealed class CustomScriptPublishTests : IDisposable
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly SqliteConnection _filesConnection = new("Data Source=:memory:");
    private readonly ScriptDb _pipeline;
    private readonly FilesDbContext _files;
    private readonly AssetApiService _assets;
    private readonly Guid _project = Guid.NewGuid();
    private readonly IMessageBus _bus = Substitute.For<IMessageBus>();
    private readonly RejectDefinitionSave _reject = new();
    private readonly RejectLinkSave _rejectLink = new();
    private const string Hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private readonly Dictionary<Guid, string> _hashes = [];

    public CustomScriptPublishTests()
    {
        _connection.Open();
        _connection.CreateCollation("case_insensitive", (a, b) => string.Compare(a, b, StringComparison.OrdinalIgnoreCase));
        _pipeline = new ScriptDb(new DbContextOptionsBuilder<PipelineDbContext>().UseSqlite(_connection).AddInterceptors(_reject).Options);
        _pipeline.Database.EnsureCreated();
        _filesConnection.Open();
        _files = new(new DbContextOptionsBuilder<FilesDbContext>().UseSqlite(_filesConnection).AddInterceptors(_rejectLink).Options);
        _files.Database.EnsureCreated();
        var storage = Substitute.For<IObjectStorageService>();
        storage.GetPublicUrl(Arg.Any<string>()).Returns("https://storage.example/script.py");
        _assets = new(_files, storage, new AssetRegistry([
            new RegisteredAssetSlot("NodeDefinition", "CustomScript", new AssetCategoryOptions
            { AllowMultiple = false, MaxCount = 1, MaxSizeBytes = 1024, AllowedContentTypes = [] })]));
    }

    private async Task<Guid> Asset(bool confirmed = true)
    {
        var hash = new string((char)('a' + _hashes.Count), 64);
        var asset = new Asset(Guid.NewGuid().ToString(), 10, "text/x-python", ".py", hash);
        _hashes[asset.Id] = hash;
        if (confirmed) asset.MarkAsConfirmed();
        _files.Assets.Add(asset);
        await _files.SaveChangesAsync();
        return asset.Id;
    }
    private BatchUpsertItem Item(string key, Guid? asset, string name = "Script", string? hash = null) =>
        new(key, name, name, "python", hash ?? (asset is { } id ? _hashes[id] : null), key + ".py", asset, [], []);
    private Task<FluentResults.Result<BatchUpsertCustomNodesResponseDto>> Publish(params BatchUpsertItem[] items) =>
        new BatchUpsertCustomNodesHandler(_pipeline, _assets, _bus, NullLogger<BatchUpsertCustomNodesHandler>.Instance)
            .HandleAsync(new(_project, items.ToList()), CancellationToken.None);

    [Fact]
    public async Task PublishAndReplace_OneCurrentLinkWithStableDefinitionAndFullPinMetadata()
    {
        var first = await Publish(Item("script", await Asset()));
        var id = Assert.Single(first.Value.Results).Id;
        var old = await _files.AssetLinks.AsNoTracking().SingleAsync();
        var replacement = Item("script", await Asset(), "Renamed") with
        { Inputs = [new() { Id = "exec_in", Kind = PinKind.Exec },
            new() { Id = "input", EntityTarget = "resource", AllowedExtensions = ".fbx", DefaultValue = 42 }] };
        var result = await Publish(replacement);
        Assert.Empty(result.Value.Errors);
        Assert.Equal(id, result.Value.Results.Single().Id);
        var link = await _files.AssetLinks.AsNoTracking().SingleAsync();
        Assert.NotEqual(old.Id, link.Id);
        Assert.Equal(replacement.AssetId, link.AssetId);
        var queried = await new GetCustomNodeByIdHandler(_pipeline, _assets).HandleAsync(new(id), CancellationToken.None);
        Assert.Equal("script.py", queried.Value.OriginalFileName);
        Assert.Equal(replacement.ContentHash, queried.Value.ContentHash);
        Assert.Equal(PinKind.Exec, queried.Value.Inputs[0].Kind);
        Assert.Equal("resource", queried.Value.Inputs[1].EntityTarget);
        Assert.Equal(".fbx", queried.Value.Inputs[1].AllowedExtensions);
        Assert.Equal("42", JsonSerializer.Serialize(queried.Value.Inputs[1].DefaultValue));
    }

    [Fact]
    public async Task Analysis_MatchesProjectAndKeyWithoutCreatingAnAssetOrLink()
    {
        _pipeline.NodeDefinitions.AddRange(
            new NodeDefinition { ProjectId = _project, Key = "other", Name = "script" },
            new NodeDefinition { ProjectId = Guid.NewGuid(), Key = "script", Name = "script" });
        await _pipeline.SaveChangesAsync();
        var result = await new AnalyzeCustomNodesBatchHandler(_pipeline)
            .HandleAsync(new(_project, [new("script.py", "def main():\n    pass\n")]), CancellationToken.None);
        Assert.True(result.IsSuccess);
        Assert.False(Assert.Single(result.Value.Nodes).IsOverride);
        Assert.Null(result.Value.Nodes[0].ExistingNodeId);
        Assert.Empty(await _files.Assets.ToListAsync());
        Assert.Empty(await _files.AssetLinks.ToListAsync());
    }

    [Fact]
    public async Task Analysis_DuplicateKeysRejectPreview()
    {
        var result = await new AnalyzeCustomNodesBatchHandler(_pipeline)
            .HandleAsync(new(_project, [new("script.py", ""), new("SCRIPT.py", "")]), CancellationToken.None);
        Assert.True(result.IsFailed);
        Assert.Empty(await _pipeline.NodeDefinitions.ToListAsync());
    }

    [Fact]
    public async Task Publish_DuplicateKeysPreserveExistingDefinitionAndLink()
    {
        var asset = await Asset();
        await Publish(Item("script", asset));
        var old = await _files.AssetLinks.AsNoTracking().SingleAsync();
        var result = await Publish(Item("script", asset, "First"), Item("SCRIPT", asset, "Second"));
        Assert.Empty(result.Value.Results);
        Assert.Equal(2, result.Value.Errors.Count);
        Assert.Equal(old.Id, (await _files.AssetLinks.AsNoTracking().SingleAsync()).Id);
        Assert.Equal("Script", (await _pipeline.NodeDefinitions.AsNoTracking().SingleAsync()).Name);
    }

    [Fact]
    public async Task DefinitionSaveFails_DoesNotReplaceLinkAndPublishesOtherRow()
    {
        await Publish(Item("existing", await Asset(), "Original"));
        var old = await _files.AssetLinks.AsNoTracking().SingleAsync();
        var nodeId = (await _pipeline.NodeDefinitions.SingleAsync()).Id;
        _reject.Enabled = true;
        var result = await Publish(Item("existing", await Asset(), "Reject"), Item("new", await Asset()));
        Assert.Single(result.Value.Errors);
        Assert.Equal("existing", result.Value.Errors[0].Key);
        Assert.Equal("new", Assert.Single(result.Value.Results).Key);
        var restored = await _files.AssetLinks.AsNoTracking().SingleAsync(x => x.OwnerEntityId == nodeId.ToString());
        Assert.Equal(old.Id, restored.Id);
        Assert.Equal(old.AssetId, restored.AssetId);
        Assert.Equal("Original", (await _pipeline.NodeDefinitions.AsNoTracking().SingleAsync(x => x.Id == nodeId)).Name);
    }

    [Theory]
    [InlineData(false, Hash)]
    [InlineData(true, "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")]
    public async Task InvalidReplacement_PreservesCurrentScript(bool confirmed, string hash)
    {
        await Publish(Item("script", await Asset()));
        var old = await _files.AssetLinks.AsNoTracking().SingleAsync();
        var result = await Publish(Item("script", await Asset(confirmed), "Changed", hash));
        Assert.Empty(result.Value.Results);
        Assert.Single(result.Value.Errors);
        Assert.Equal(old.Id, (await _files.AssetLinks.AsNoTracking().SingleAsync()).Id);
        Assert.Equal("Changed", (await _pipeline.NodeDefinitions.AsNoTracking().SingleAsync()).Name);
    }

    [Fact]
    public async Task MetadataOnlyUpdate_PreservesScriptLinkAndFilename()
    {
        var published = await Publish(Item("script", await Asset()));
        var id = published.Value.Results.Single().Id;
        var old = await _files.AssetLinks.AsNoTracking().SingleAsync();
        var update = await new UpdateCustomNodeHandler(_pipeline, _assets, _bus)
            .HandleAsync(new(id, "Renamed", "Label", "python", null, null, [], []), CancellationToken.None);
        Assert.True(update.IsSuccess);
        Assert.Equal("script.py", update.Value.OriginalFileName);
        Assert.Equal(old.Id, (await _files.AssetLinks.AsNoTracking().SingleAsync()).Id);
    }

    [Fact]
    public async Task WolverineBatch_DefinitionFailureDoesNotStopNextFile()
    {
        var rejectedAsset = await Asset();
        var validAsset = await Asset();
        _reject.Enabled = true;
        using var host = await Host.CreateDefaultBuilder()
            .ConfigureLogging(logging => logging.ClearProviders().AddConsole().SetMinimumLevel(LogLevel.Error))
            .ConfigureServices(services =>
            {
                services.AddSingleton<IAssetApi>(_assets);
                services.AddScoped<PipelineDbContext>(_ => new ScriptDb(new DbContextOptionsBuilder<PipelineDbContext>()
                    .UseSqlite(_connection).AddInterceptors(_reject).Options));
            })
            .UseWolverine(options =>
            {
                options.ServiceLocationPolicy = JasperFx.CodeGeneration.Model.ServiceLocationPolicy.AllowedButWarn;
                options.Discovery.DisableConventionalDiscovery();
                options.Discovery.IncludeType<BatchUpsertCustomNodesHandler>();
            }).StartAsync();
        var bus = host.Services.GetRequiredService<IMessageBus>();
        var result = await bus.InvokeAsync<FluentResults.Result<BatchUpsertCustomNodesResponseDto>>(
            new BatchUpsertCustomNodesCommand(_project, [Item("failed", rejectedAsset, "Reject"), Item("valid", validAsset)]));
        Assert.Equal("failed.py", Assert.Single(result.Value.Errors).FileName);
        Assert.Equal("valid", Assert.Single(result.Value.Results).Key);
        Assert.Single(await _pipeline.NodeDefinitions.AsNoTracking().ToListAsync());
        Assert.Single(await _files.AssetLinks.AsNoTracking().ToListAsync());
        await host.StopAsync();
    }

    [Fact]
    public async Task FilesKeepsItsOwnConnection_WhenPublishing()
    {
        var published = await Publish(Item("script", await Asset()));
        Assert.Single(published.Value.Results);
        Assert.Same(_filesConnection, _files.Database.GetDbConnection());
        Assert.Same(_connection, _pipeline.Database.GetDbConnection());
        Assert.NotSame(_pipeline.Database.GetDbConnection(), _files.Database.GetDbConnection());
        Assert.Single(await _files.AssetLinks.AsNoTracking().ToListAsync());
        Assert.Single(await _pipeline.NodeDefinitions.AsNoTracking().ToListAsync());
        Assert.Equal(System.Data.ConnectionState.Open, _connection.State);
    }

    [Fact]
    public async Task ReconciliationPublicationFails_ReportsFileAndContinuesBatch()
    {
        await Publish(Item("script", await Asset()));
        var replacement = await Asset();
        _bus.PublishAsync(Arg.Any<Automation.Pipeline.Features.Nodes.Events.NodeDefinitionPinsChangedEvent>())
            .Returns(_ => throw new InvalidOperationException("Outbox failed."));
        var result = await Publish(Item("script", replacement, "Changed"), Item("new", await Asset()));
        Assert.Equal("script.py", Assert.Single(result.Value.Errors).FileName);
        Assert.Equal("new", Assert.Single(result.Value.Results).Key);
        Assert.Equal(replacement, (await _files.AssetLinks.AsNoTracking().SingleAsync(x => x.OriginalName == "script.py")).AssetId);
    }

    [Fact]
    public async Task LinkSaveFails_ReportsFilePreservesOldLinkAndCanRetry()
    {
        var first = await Publish(Item("script", await Asset()));
        var nodeId = first.Value.Results.Single().Id;
        var old = await _files.AssetLinks.AsNoTracking().SingleAsync();
        var replacement = await Asset();
        _rejectLink.Enabled = true;
        var item = Item("script", replacement, "Changed") with { OriginalFileName = "reject.py" };
        var failed = await Publish(item, Item("new", await Asset()));
        Assert.Equal("reject.py", Assert.Single(failed.Value.Errors).FileName);
        Assert.Equal("new", Assert.Single(failed.Value.Results).Key);
        Assert.Equal(old.Id, (await _files.AssetLinks.AsNoTracking().SingleAsync(x => x.OwnerEntityId == nodeId.ToString())).Id);
        _rejectLink.Enabled = false;
        var retried = await Publish(item);
        Assert.Empty(retried.Value.Errors);
        Assert.Equal(nodeId, Assert.Single(retried.Value.Results).Id);
        Assert.Equal(replacement, (await _files.AssetLinks.AsNoTracking().SingleAsync(x => x.OwnerEntityId == nodeId.ToString())).AssetId);
    }

    public void Dispose() { _files.Dispose(); _pipeline.Dispose(); _filesConnection.Dispose(); _connection.Dispose(); }

    private sealed class RejectLinkSave : SaveChangesInterceptor
    {
        public bool Enabled { get; set; }
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Enabled && eventData.Context!.ChangeTracker.Entries<AssetLink>().Any(x => x.Entity.OriginalName == "reject.py"))
                throw new DbUpdateException("Simulated link save failure.");
            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }

    private sealed class RejectDefinitionSave : SaveChangesInterceptor
    {
        public bool Enabled { get; set; }
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Enabled && eventData.Context!.ChangeTracker.Entries<NodeDefinition>().Any(x => x.Entity.Name == "Reject"))
                throw new DbUpdateException("Simulated definition save failure.");
            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }
    public sealed class ScriptDb(DbContextOptions<PipelineDbContext> options) : PipelineDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);
            foreach (var type in builder.Model.GetEntityTypes())
                foreach (var property in type.GetProperties().Where(x => x.ClrType == typeof(JsonDocument)))
                    property.SetValueConverter(new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<JsonDocument?, string?>(
                        x => x != null ? x.RootElement.GetRawText() : null,
                        x => x != null ? JsonDocument.Parse(x, default) : null));
        }
    }
}
