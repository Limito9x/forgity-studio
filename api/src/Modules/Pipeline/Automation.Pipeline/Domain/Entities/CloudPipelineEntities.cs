using System.Text.Json;
using Automation.SharedKernel.Domain.Entities;

namespace Automation.Pipeline.Domain.Entities;

/// <summary>
/// Lightweight Cloud Pipeline representing a logical DAG group (Master or Component) in the Cloud Data Pool.
/// </summary>
public class CloudPipeline : AuditableEntity
{
    public Guid? ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string PipelineKind { get; set; } = "master"; // "master" | "component"
    public string? Description { get; set; }

    public List<PipelineVersion> Versions { get; set; } = [];

    public CloudPipeline() { }

    public CloudPipeline(Guid? projectId, string name, string slug = "", string pipelineKind = "master")
    {
        ProjectId = projectId;
        Name = name;
        Slug = slug;
        PipelineKind = pipelineKind;
    }

    public void UpdateName(string name)
    {
        Name = name;
    }
}

/// <summary>
/// Immutable Cloud Pipeline Version containing the DAG topology ("đường đi") and Contracts.
/// </summary>
public class PipelineVersion : AuditableEntity
{
    public Guid PipelineId { get; set; }
    public CloudPipeline Pipeline { get; set; } = null!;
    public int VersionNumber { get; set; }
    public string GraphHash { get; set; } = string.Empty;
    public string ContractsHash { get; set; } = string.Empty;
    public string PipelineKind { get; set; } = "master"; // "master" | "component"
    public string Slug { get; set; } = string.Empty;
    public JsonDocument DagBundleJson { get; set; } = JsonDocument.Parse("{}");
    public JsonDocument ContractsJson { get; set; } = JsonDocument.Parse("{}");

    public List<PipelineVersionScript> VersionScripts { get; set; } = [];
}

/// <summary>
/// Content-addressed global script in the Cloud Data Pool, unique by (Key, ScriptHash).
/// </summary>
public class PipelineScript : AuditableEntity
{
    public string Key { get; set; } = string.Empty;
    public string Executor { get; set; } = "python";
    public string ScriptHash { get; set; } = string.Empty;
    public string SourceCode { get; set; } = string.Empty;
    public JsonDocument RequirementsJson { get; set; } = JsonDocument.Parse("[]");

    public List<PipelineVersionScript> VersionScripts { get; set; } = [];
}

/// <summary>
/// Join table linking an immutable PipelineVersion to its content-addressed PipelineScripts.
/// </summary>
public class PipelineVersionScript
{
    public Guid PipelineVersionId { get; set; }
    public PipelineVersion PipelineVersion { get; set; } = null!;
    public Guid PipelineScriptId { get; set; }
    public PipelineScript PipelineScript { get; set; } = null!;
}

/// <summary>
/// Explicit View binding an immutable PipelineVersion to a Project.
/// </summary>
public class ProjectPipelineView : AuditableEntity
{
    public Guid ProjectId { get; set; }
    public Guid PipelineId { get; set; }
    public CloudPipeline Pipeline { get; set; } = null!;
    public Guid PinnedVersionId { get; set; }
    public PipelineVersion PinnedVersion { get; set; } = null!;
}

/// <summary>
/// Packaging container exposing an immutable suite of master pipelines, components, scripts, constants schema, and assets as a reusable Template Package with Quota policy.
/// </summary>
public class TemplatePackage : AuditableEntity
{
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Category { get; set; } = "General";
    public bool IsPublic { get; set; } = true;
    public string QuotaStrategy { get; set; } = "PerComponentRun";
    public int? DefaultQuotaLimit { get; set; }
    public int VersionNumber { get; set; } = 1;
    public Guid? SupersedesId { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public long TotalAssetBytes { get; set; }

    /// <summary>
    /// Optional default/entry Master Pipeline to display or run initially.
    /// </summary>
    public Guid? PrimaryMasterVersionId { get; set; }
    public PipelineVersion? PrimaryMasterVersion { get; set; }

    /// <summary>
    /// Manifest JSON containing masterVersionIds, componentVersionIds, scriptArtifactIds, constants schema, and assets metadata.
    /// </summary>
    public JsonDocument ContainerManifestJson { get; set; } = JsonDocument.Parse("{}");

    public List<TemplatePackageMember> Members { get; set; } = [];
}

/// <summary>
/// Relational link between a TemplatePackage and its member PipelineVersions.
/// </summary>
public class TemplatePackageMember
{
    public Guid TemplatePackageId { get; set; }
    public TemplatePackage TemplatePackage { get; set; } = null!;
    public Guid PipelineVersionId { get; set; }
    public PipelineVersion PipelineVersion { get; set; } = null!;
    public string Role { get; set; } = "master"; // "master" | "component"
    public int SortOrder { get; set; }
    public string QuotaMode { get; set; } = "PerItem"; // "None" | "PerRun" | "PerItem"
    public int QuotaCost { get; set; } = 1;
}

/// <summary>
/// User/Machine-owned library entry for a TemplatePackage with quota usage.
/// </summary>
public class TemplateLibraryItem : AuditableEntity
{
    public Guid TemplatePackageId { get; set; }
    public TemplatePackage TemplatePackage { get; set; } = null!;
    public Guid? OwnerUserId { get; set; }
    public string? OwnerEmail { get; set; }
    public string MachineKey { get; set; } = string.Empty;
    public int UsedRuns { get; set; }
    public int? MaxRuns { get; set; }
    public string PeriodKey { get; set; } = "lifetime";
    public DateTimeOffset AddedAt { get; set; }
    public DateTimeOffset? LastRunAt { get; set; }
    public bool IsRevoked { get; set; }
}
