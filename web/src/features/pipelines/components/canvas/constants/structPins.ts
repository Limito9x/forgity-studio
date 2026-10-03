import type { PinDefinition } from "@/gen/model";

export const BUILTIN_STRUCT_PINS: Record<string, PinDefinition[]> = {
  Resource: [
    {
      id: "ResourceId",
      label: "Resource ID",
      kind: "Data" as any,
      primitiveType: "EntityRef" as any,
      cardinality: "Single" as any,
    },
    {
      id: "ResourceVersionId",
      label: "Resource Version ID",
      kind: "Data" as any,
      primitiveType: "EntityRef" as any,
      cardinality: "Single" as any,
    },
    {
      id: "FileName",
      label: "File Name",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
    {
      id: "BaseName",
      label: "Base Name",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
    {
      id: "Extension",
      label: "Extension",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
    {
      id: "RelativePath",
      label: "Relative Path",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
    {
      id: "DirectoryPath",
      label: "Directory Path",
      kind: "Data" as any,
      primitiveType: "Path" as any,
      cardinality: "Single" as any,
    },
    {
      id: "FullPath",
      label: "Full Path",
      kind: "Data" as any,
      primitiveType: "Path" as any,
      cardinality: "Single" as any,
    },
    {
      id: "FileHash",
      label: "File Hash",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
    {
      id: "ContentId",
      label: "Content ID",
      kind: "Data" as any,
      primitiveType: "EntityRef" as any,
      cardinality: "Single" as any,
    },
    {
      id: "ContentName",
      label: "Content Name",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
    {
      id: "ContentType",
      label: "Content Type",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
    {
      id: "Metadata",
      label: "Metadata JSON",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
  ],
  Repository: [
    {
      id: "RepositoryId",
      label: "Repository ID",
      kind: "Data" as any,
      primitiveType: "EntityRef" as any,
      cardinality: "Single" as any,
    },
    {
      id: "RepositoryName",
      label: "Repository Name",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
    {
      id: "RootPath",
      label: "Root Path",
      kind: "Data" as any,
      primitiveType: "Path" as any,
      cardinality: "Single" as any,
    },
  ],
  Workspace: [
    {
      id: "WorkspaceId",
      label: "Workspace ID",
      kind: "Data" as any,
      primitiveType: "EntityRef" as any,
      cardinality: "Single" as any,
    },
    {
      id: "WorkspaceName",
      label: "Workspace Name",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
    {
      id: "RootPath",
      label: "Root Path",
      kind: "Data" as any,
      primitiveType: "Path" as any,
      cardinality: "Single" as any,
    },
  ],
  Inspection: [
    {
      id: "ResourceVersionId",
      label: "Resource Version ID",
      kind: "Data" as any,
      primitiveType: "EntityRef" as any,
      cardinality: "Single" as any,
    },
    {
      id: "MainObjects",
      label: "Main Objects",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Array" as any,
    },
    {
      id: "SkeletonBones",
      label: "Skeleton Bones",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Array" as any,
    },
    {
      id: "Metadata",
      label: "Metadata JSON",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
  ],
  TaggedAsset: [
    {
      id: "ResourceId",
      label: "Resource ID",
      kind: "Data" as any,
      primitiveType: "EntityRef" as any,
      cardinality: "Single" as any,
    },
    {
      id: "VersionId",
      label: "Version ID",
      kind: "Data" as any,
      primitiveType: "EntityRef" as any,
      cardinality: "Single" as any,
    },
    {
      id: "AssetName",
      label: "Asset Name",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Single" as any,
    },
    {
      id: "RelativePath",
      label: "Relative Path",
      kind: "Data" as any,
      primitiveType: "Path" as any,
      cardinality: "Single" as any,
    },
    {
      id: "FilePath",
      label: "File Path",
      kind: "Data" as any,
      primitiveType: "Path" as any,
      cardinality: "Single" as any,
    },
    {
      id: "ResourceTags",
      label: "Resource Tags",
      kind: "Data" as any,
      primitiveType: "String" as any,
      cardinality: "Array" as any,
    },
  ],
};

/**
 * Returns pins for a given struct name.
 * If not recognized, returns an empty array or fallback.
 */
export function getStructPins(structType: string): PinDefinition[] {
  const normalizedKey = Object.keys(BUILTIN_STRUCT_PINS).find(
    (k) => k.toLowerCase() === (structType || "").toLowerCase()
  );
  if (normalizedKey && BUILTIN_STRUCT_PINS[normalizedKey]) {
    return BUILTIN_STRUCT_PINS[normalizedKey];
  }
  return [];
}

/**
 * Standard automatic pins provided by Start node when pipeline is in event trigger mode.
 */
export const EVENT_TRIGGER_START_PINS: PinDefinition[] = [
  {
    id: "Resources",
    label: "Resources",
    kind: "Data" as any,
    primitiveType: "EntityRef" as any,
    cardinality: "Array" as any,
    metadata: "Resource",
  },
  {
    id: "Repository",
    label: "Repository",
    kind: "Data" as any,
    primitiveType: "EntityRef" as any,
    cardinality: "Single" as any,
    metadata: "Repository",
  },
  {
    id: "Runner",
    label: "Runner",
    kind: "Data" as any,
    primitiveType: "EntityRef" as any,
    cardinality: "Single" as any,
    metadata: "Runner",
  },
];

export function getStartNodeEventTriggerPins(): PinDefinition[] {
  return EVENT_TRIGGER_START_PINS.map((p) => ({ ...p }));
}
