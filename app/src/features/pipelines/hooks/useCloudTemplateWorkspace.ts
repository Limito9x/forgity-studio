import { useMemo } from "react";
import {
  PipelineNodeKind,
  type NodePaletteItemDto,
  type StructDefinitionDto,
} from "../types/pipelineGraphTypes";
import type { IPipelineStorageAdapter } from "../adapters/pipelineStorageAdapter";
import { CloudPipelineStorageAdapter } from "../adapters/CloudPipelineStorageAdapter";
import type {
  PipelineWorkspaceCapabilities,
  PipelineWorkspaceContract,
} from "../types/pipelineWorkspaceContract";
import { useTemplateGraph } from "./useTemplateGraph";

interface UseCloudTemplateWorkspaceOptions {
  versionId: string | null | undefined;
  projectId: string;
  paletteNodesJson?: unknown;
  capabilities: PipelineWorkspaceCapabilities;
  storage?: IPipelineStorageAdapter;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodePaletteItem(value: unknown): value is NodePaletteItemDto {
  if (!isRecord(value)) return false;
  return (
    typeof value.refId === "string" &&
    typeof value.name === "string" &&
    Object.values(PipelineNodeKind).some((kind) => kind === value.kind)
  );
}

function parsePaletteNodes(value: unknown): NodePaletteItemDto[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error("Template palette contract must be an array.");
  }

  const items: NodePaletteItemDto[] = [];
  for (const [index, item] of value.entries()) {
    if (!isNodePaletteItem(item)) {
      throw new Error(`Template palette contract item ${index} is invalid.`);
    }
    items.push(item);
  }
  return items;
}

function parseStructCatalogue(value: unknown): StructDefinitionDto[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error("Template struct contract must be an array.");
  }

  const items: StructDefinitionDto[] = [];
  for (const [index, item] of value.entries()) {
    if (
      !isRecord(item) ||
      typeof item.refId !== "string" ||
      typeof item.name !== "string"
    ) {
      throw new Error(`Template struct contract item ${index} is invalid.`);
    }
    items.push(item as StructDefinitionDto);
  }
  return items;
}

export function useCloudTemplateWorkspace({
  versionId,
  projectId,
  paletteNodesJson,
  capabilities,
  storage: providedStorage,
}: UseCloudTemplateWorkspaceOptions) {
  const graphQuery = useTemplateGraph(versionId);
  const storage = useMemo(
    () => providedStorage ?? new CloudPipelineStorageAdapter({ projectId }),
    [providedStorage, projectId]
  );

  const normalizedContracts = useMemo(() => {
    try {
      const contracts = isRecord(graphQuery.versionDetail?.contractsJson)
        ? graphQuery.versionDetail.contractsJson
        : {};
      return {
        paletteItems: parsePaletteNodes(paletteNodesJson),
        structCatalogue: parseStructCatalogue(contracts.structs),
        error: null as Error | null,
      };
    } catch (error) {
      return {
        paletteItems: [] as NodePaletteItemDto[],
        structCatalogue: [] as StructDefinitionDto[],
        error:
          error instanceof Error
            ? error
            : new Error("Failed to load the template workspace contract."),
      };
    }
  }, [graphQuery.versionDetail?.contractsJson, paletteNodesJson]);

  const workspace = useMemo<PipelineWorkspaceContract | null>(() => {
    if (!graphQuery.graph || normalizedContracts.error) return null;
    return {
      source: "cloud",
      projectId,
      storage,
      paletteItems: normalizedContracts.paletteItems,
      structCatalogue: normalizedContracts.structCatalogue,
      isLoadingPalette: false,
      capabilities,
    };
  }, [
    graphQuery.graph,
    normalizedContracts,
    projectId,
    storage,
    capabilities,
  ]);

  return {
    ...graphQuery,
    workspace,
    isError: graphQuery.isError || normalizedContracts.error !== null,
    error: graphQuery.error ?? normalizedContracts.error,
  };
}
