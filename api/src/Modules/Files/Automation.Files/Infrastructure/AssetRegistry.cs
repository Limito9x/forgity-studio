using FluentResults;

namespace Automation.Files.Infrastructure;

public class AssetRegistry
{
    // Dictionary<EntityType, Dictionary<SlotKey, AssetCategoryOptions>>
    private readonly Dictionary<string, Dictionary<string, AssetCategoryOptions>> _categories = new(StringComparer.OrdinalIgnoreCase);

    public AssetRegistry(IEnumerable<RegisteredAssetSlot> registeredCategories)
    {
        foreach (var reg in registeredCategories)
        {
            if (!_categories.TryGetValue(reg.EntityType, out var entityCategories))
            {
                entityCategories = new Dictionary<string, AssetCategoryOptions>(StringComparer.OrdinalIgnoreCase);
                _categories[reg.EntityType] = entityCategories;
            }

            entityCategories[reg.SlotKey] = reg.Options;
        }
    }

    public Result<AssetCategoryOptions> GetSlotOptions(string entityType, string slotKey)
    {
        if (_categories.TryGetValue(entityType, out var entityCategories) &&
            entityCategories.TryGetValue(slotKey, out var options))
        {
            return Result.Ok(options);
        }

        var separator = slotKey.IndexOf('/');
        if (separator > 0 && separator < slotKey.Length - 1 &&
            _categories.TryGetValue(entityType, out entityCategories) &&
            entityCategories.TryGetValue(slotKey[..separator], out options) &&
            options.AllowSubSlots)
        {
            return Result.Ok(options);
        }

        return Result.Fail($"Asset slot '{slotKey}' in entity type '{entityType}' is not registered.");
    }
}



