namespace Automation.Files.Contracts;

/// <summary>Expected ownership of a link. Callers must authorize access to the owner.</summary>
public record AssetLinkOwner(string EntityType, string EntityId, string SlotKey);

/// <summary>A link PK together with its expected owner and slot.</summary>
public record AssetLinkReference(Guid AssetLinkId, AssetLinkOwner Owner);
