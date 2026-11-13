import type { NodePaletteItemDto, PinDefinition } from "@/gen/model";
import { PinKind, PinPrimitiveType } from "@/gen/model";
import type { WorkspaceConstantItem } from "../types/workspaceConfig";
import type { ResolvedConstant } from "../hooks/workspace/useLocalConstantsQuery";

/**
 * Generates pure Data Constant nodes for the Canvas Palette.
 * Pure nodes have 0 Exec inputs/outputs, providing only resolved constant values to downstream tools.
 */
export function generateConstantPaletteItems(
  constants: WorkspaceConstantItem[],
  resolvedMap: Record<string, ResolvedConstant> = {}
): NodePaletteItemDto[] {
  return constants.map((item) => {
    const resolved = resolvedMap[item.key];
    const isUnreal = item.scope === "Unreal";
    const isArray = item.dataType === "Array";

    let primitiveType: PinPrimitiveType = PinPrimitiveType.String;
    if (item.dataType === "Number") primitiveType = PinPrimitiveType.Number;
    if (item.dataType === "Boolean") primitiveType = PinPrimitiveType.Boolean;

    const outputs: PinDefinition[] = [];

    if (isUnreal && (item.unrealPath || resolved?.resolvedUnrealPath)) {
      // Scope Unreal provides dual output pins: Physical Disk Path & In-Engine Virtual Path
      outputs.push(
        {
          id: "disk_path",
          label: "Disk Path",
          kind: PinKind.Data,
          primitiveType: PinPrimitiveType.String,
          cardinality: isArray ? ("Array" as any) : ("Single" as any),
          isRequired: false,
          defaultValue: resolved?.resolvedValue ?? item.value,
          description: "Physical Windows path for DCC / OS tools (Blender, Python)",
        },
        {
          id: "virtual_path",
          label: "Virtual Path",
          kind: PinKind.Data,
          primitiveType: PinPrimitiveType.String,
          cardinality: isArray ? ("Array" as any) : ("Single" as any),
          isRequired: false,
          defaultValue: resolved?.resolvedUnrealPath ?? item.unrealPath,
          description: "In-Engine virtual path (/Game/...) for Unreal Engine tools",
        }
      );
    } else {
      outputs.push({
        id: "value",
        label: "Value",
        kind: PinKind.Data,
        primitiveType,
        cardinality: isArray ? ("Array" as any) : ("Single" as any),
        isRequired: false,
        defaultValue: resolved?.resolvedValue ?? item.value,
        description: item.description || `Constant value of ${item.key}`,
      });
    }

    return {
      key: `local:constant:${item.key}`,
      name: item.key,
      label: `Constant: ${item.key}`,
      category: "Constants",
      source: "Custom" as any,
      description: item.description || `Local Machine Constant: ${item.key} (${item.scope} - ${item.dataType})`,
      executor: "server",
      inputs: [], // Pure node: 0 Exec, 0 Data inputs
      outputs,
      isStateless: true,
      hasDynamicPins: false,
      capabilities: {
        isLocalDraft: true,
        isConstantNode: true,
        viewVariant: "Constant",
        constantKey: item.key,
        scope: item.scope,
        dataType: item.dataType,
        resolvedValue: resolved?.resolvedValue ?? item.value,
        resolvedUnrealPath: resolved?.resolvedUnrealPath ?? item.unrealPath,
      } as any,
    };
  });
}
