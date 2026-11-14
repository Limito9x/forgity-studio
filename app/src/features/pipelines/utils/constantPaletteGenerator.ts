import type { NodePaletteItemDto, PinDefinition } from "@/gen/model";
import { PinKind, PinPrimitiveType } from "@/gen/model";
import type { WorkspaceConstantItem } from "../types/workspaceConfig";
import type { ResolvedConstant } from "../hooks/workspace/useLocalConstantsQuery";

/**
 * Extracts unique `{var_name}` or `${var_name}` placeholders from constant template values,
 * excluding keys that already belong to workspace Constants (which are expanded automatically).
 */
export function extractTemplateVars(
  values: unknown[],
  knownConstantKeys: ReadonlySet<string> = new Set()
): string[] {
  const vars = new Set<string>();
  const regex = /\$?\{([a-zA-Z_][a-zA-Z0-9_-]*)\}/g;
  for (const val of values) {
    if (typeof val !== "string") continue;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(val)) !== null) {
      const name = match[1];
      if (!knownConstantKeys.has(name)) {
        vars.add(name);
      }
    }
  }
  return Array.from(vars);
}

/**
 * Generates pure Data Constant nodes for the Canvas Palette.
 * Pure nodes have 0 Exec inputs/outputs, providing only resolved constant values to downstream tools.
 */
export function generateConstantPaletteItems(
  constants: WorkspaceConstantItem[],
  resolvedMap: Record<string, ResolvedConstant> = {}
): NodePaletteItemDto[] {
  const knownConstantKeys = new Set(constants.map((c) => c.key));
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

    const templateVars = extractTemplateVars(
      [
        resolved?.resolvedValue ?? item.value,
        resolved?.resolvedUnrealPath ?? item.unrealPath,
      ],
      knownConstantKeys
    );

    const inputs: PinDefinition[] = templateVars.map((varName) => ({
      id: varName,
      label: varName
        .split(/[_-]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      kind: PinKind.Data,
      primitiveType: PinPrimitiveType.String,
      cardinality: "Single" as any,
      isRequired: true,
      description: `Template variable '{${varName}}' for ${item.key}`,
    }));

    return {
      key: `local:constant:${item.key}`,
      name: item.key,
      label: `Constant: ${item.key}`,
      category: "Constants",
      source: "Custom" as any,
      description: item.description || `Local Machine Constant: ${item.key} (${item.scope} - ${item.dataType})`,
      executor: "pure",
      inputs, // Pure node: 0 Exec, dynamic Data inputs if template vars exist
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
