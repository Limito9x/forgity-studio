import type { NodePaletteItemDto, PinDefinition, StructDefinitionDto } from "@/gen/model";
import type { LocalStructDefinition, ScannedPipelineYamlItemRust } from "../types/workspaceConfig";

/**
 * Generates pure Dataflow companion nodes (Make <Struct> and Break <Struct>)
 * from a list of LocalStructDefinition schemas.
 * 
 * Rules:
 * - NO Exec pins (isPure = true, executes in-memory in microseconds)
 * - Make <Struct>: Inputs = struct.fields, Output = 1 Struct pin
 * - Break <Struct>: Input = 1 Struct pin, Outputs = struct.fields
 * - Executor = "pure" (can be placed on canvas root or inside any DCC stage)
 */
export function generateLocalStructPaletteItems(
  structs: LocalStructDefinition[]
): NodePaletteItemDto[] {
  const items: NodePaletteItemDto[] = [];

  for (const s of structs) {
    if (!s.slug || !s.fields || s.fields.length === 0) continue;

    const structDisplayName = s.displayName || s.slug;
    const structSlug = s.slug;

    // Convert fields to PinDefinitions
    const fieldPins: PinDefinition[] = s.fields.map((f) => ({
      id: f.name,
      label: f.label || f.name,
      kind: "Data" as any,
      primitiveType: (f.type === "Struct" ? "EntityRef" : f.type) as any,
      cardinality: (f.cardinality || "Single") as any,
      structType: f.structType || (f.type === "Struct" ? f.structType : undefined),
      defaultValue: f.defaultValue,
      isRequired: false,
    }));

    // 1. Make <Struct> Node
    const structOutputPin: PinDefinition = {
      id: "struct_out",
      label: structDisplayName,
      kind: "Data" as any,
      primitiveType: "EntityRef" as any,
      cardinality: "Single" as any,
      structType: structSlug,
      isRequired: false,
    };

    items.push({
      key: `local:struct:make:${structSlug}`,
      label: `Make ${structDisplayName}`,
      category: "Local Structs",
      source: "Tool",
      executor: "pure",
      inputs: fieldPins,
      outputs: [structOutputPin],
      id: `local:struct:make:${structSlug}`,
      description: `Packs individual fields into a ${structDisplayName} composite struct (Pure In-Memory, 0ms).`,
      hasDynamicPins: false,
      isVisibleInPalette: true,
    });

    // 2. Break <Struct> Node
    const structInputPin: PinDefinition = {
      id: "struct_in",
      label: structDisplayName,
      kind: "Data" as any,
      primitiveType: "EntityRef" as any,
      cardinality: "Single" as any,
      structType: structSlug,
      isRequired: true,
    };

    items.push({
      key: `local:struct:break:${structSlug}`,
      label: `Break ${structDisplayName}`,
      category: "Local Structs",
      source: "Tool",
      executor: "pure",
      inputs: [structInputPin],
      outputs: fieldPins,
      id: `local:struct:break:${structSlug}`,
      description: `Unpacks a ${structDisplayName} composite struct into its individual output fields (Pure In-Memory, 0ms).`,
      hasDynamicPins: false,
      isVisibleInPalette: true,
    });
  }

  return items;
}

/**
 * Generates Sub-Pipeline component tool palette items from scanned component pipes.
 */
export function generateComponentPipePaletteItems(
  componentPipes: ScannedPipelineYamlItemRust[]
): NodePaletteItemDto[] {
  return componentPipes.map((p) => {
    const pipeName = p.fileName.replace(/\.(component|pipeline)\.(yaml|yml)$/i, "");
    return {
      key: `component:${pipeName}`,
      label: pipeName,
      category: "Component Pipes",
      source: "Custom" as any,
      executor: p.executor || "blender",
      inputs: [
        {
          id: "exec_in",
          label: "Exec",
          kind: "Exec" as any,
          isRequired: false,
        },
      ],
      outputs: [
        {
          id: "exec_out",
          label: "Exec",
          kind: "Exec" as any,
          isRequired: false,
        },
      ],
      id: `component:${pipeName}`,
      description: `Component Pipe: ${p.fullPath}`,
      isVisibleInPalette: true,
    };
  });
}

/**
 * Converts LocalStructDefinitions into StructDefinitionDto catalog
 * to allow strict connection checking (wire compatibility) and type inference on Canvas.
 */
export function localStructsToCatalogue(
  structs: LocalStructDefinition[]
): StructDefinitionDto[] {
  return structs.map((s) => ({
    structType: s.slug,
    label: s.displayName || s.slug,
    outputPins: s.fields.map((f) => ({
      id: f.name,
      label: f.label || f.name,
      kind: "Data" as any,
      primitiveType: (f.type === "Struct" ? "EntityRef" : f.type) as any,
      cardinality: (f.cardinality || "Single") as any,
      structType: f.structType,
      defaultValue: f.defaultValue,
    })),
  }));
}
