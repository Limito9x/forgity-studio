using System.Collections.Concurrent;
using Automation.DynamicForms.Contracts;
using Automation.Pipeline.Contracts.StructRegistry.Definitions;
namespace Automation.Pipeline.Contracts.StructRegistry;

public interface IEntityStructRegistry
{
    IEntityStructDefinition? Get(string structType);
    IEntityStructDefinition? Get(string structType, Guid? projectId);
    IReadOnlyList<IEntityStructDefinition> GetAll();
    IReadOnlyList<IEntityStructDefinition> GetAll(Guid? projectId);
    void Register(IEntityStructDefinition structDefinition);
}

public class EntityStructRegistry : IEntityStructRegistry
{
    private readonly Dictionary<string, IEntityStructDefinition> _registry;
    private readonly ConcurrentDictionary<(string StructType, Guid ProjectId), IEntityStructDefinition> _dynamicCache = new();
    private readonly ConcurrentDictionary<Guid, bool> _loadedProjects = new();
    private readonly ISchemaApi? _schemaApi;

    public EntityStructRegistry(
        IEnumerable<IEntityStructDefinition> structDefinitions,
        ISchemaApi? schemaApi = null
    )
    {
        _registry = structDefinitions.ToDictionary(x => x.StructType, StringComparer.OrdinalIgnoreCase);
        _schemaApi = schemaApi;
    }

    public void Register(IEntityStructDefinition structDefinition)
    {
        _registry[structDefinition.StructType] = structDefinition;
    }

    public IEntityStructDefinition? Get(string structType) => Get(structType, null);

    public IEntityStructDefinition? Get(string structType, Guid? projectId)
    {
        if (string.IsNullOrWhiteSpace(structType)) return null;

        // 1. Check static registry first
        if (_registry.TryGetValue(structType, out var def))
        {
            return def;
        }

        // 2. Check dynamic registry if projectId is available
        if (projectId.HasValue)
        {
            var key = (structType.Trim().ToLowerInvariant(), projectId.Value);
            if (_dynamicCache.TryGetValue(key, out var cached))
            {
                return cached;
            }

            // Load from ISchemaApi if not loaded yet
            EnsureProjectStructsLoaded(projectId.Value);

            if (_dynamicCache.TryGetValue(key, out var loaded))
            {
                return loaded;
            }
        }

        return null;
    }

    public IReadOnlyList<IEntityStructDefinition> GetAll() => GetAll(null);

    public IReadOnlyList<IEntityStructDefinition> GetAll(Guid? projectId)
    {
        var list = new List<IEntityStructDefinition>(_registry.Values);

        if (projectId.HasValue)
        {
            EnsureProjectStructsLoaded(projectId.Value);
            var projectDynamics = _dynamicCache
                .Where(kvp => kvp.Key.ProjectId == projectId.Value)
                .Select(kvp => kvp.Value)
                .DistinctBy(d => d.StructType);

            list.AddRange(projectDynamics);
        }

        return list;
    }

    private void EnsureProjectStructsLoaded(Guid projectId)
    {
        if (_schemaApi == null || _loadedProjects.ContainsKey(projectId))
        {
            return;
        }

        try
        {
            var result = _schemaApi.GetSchemasByOwnerAsync("ProjectStruct", projectId.ToString())
                .GetAwaiter()
                .GetResult();

            if (result.IsSuccess && result.Value != null)
            {
                foreach (var schema in result.Value)
                {
                    if (schema.ActiveVersion?.Fields != null)
                    {
                        var dynamicDef = new DynamicEntityStructDefinition(
                            schema.Name,
                            schema.Name,
                            schema.SchemaDefinitionId,
                            schema.ActiveVersion.Fields
                        );

                        // Cache by name and by GUID id
                        _dynamicCache[(schema.Name.Trim().ToLowerInvariant(), projectId)] = dynamicDef;
                        _dynamicCache[(schema.SchemaDefinitionId.ToString().ToLowerInvariant(), projectId)] = dynamicDef;
                    }
                }
            }

            _loadedProjects[projectId] = true;
        }
        catch
        {
            // Do not break execution if schema loading fails
        }
    }
}
