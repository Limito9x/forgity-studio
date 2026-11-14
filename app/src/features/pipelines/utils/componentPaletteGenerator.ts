import { load } from "js-yaml";
import type { NodePaletteItemDto, PinDefinition } from "@/gen/model";
import type { ScannedPipelineYamlItemRust } from "../types/workspaceConfig";
import type { PipelineDslDocument } from "./pipelineDslConverter";

/**
 * Quét toàn bộ danh sách Component Pipes (các file *.component.yaml hoặc kind: "component")
 * và chuyển đổi thành danh sách NodePaletteItemDto để kéo thả lên Master Pipeline.
 * 
 * Rules:
 * - Inputs: Lấy từ parameters của node Start hoặc top-level inputs
 * - Outputs: Lấy từ chân của node Return (hoặc ComponentOutput)
 * - Executor: Lấy từ header executor của Component Pipe (blender, unreal, daz, python)
 * - Source: "ComponentPipe"
 */
export function generateComponentPipePaletteItems(
  componentPipes: ScannedPipelineYamlItemRust[]
): NodePaletteItemDto[] {
  const items: NodePaletteItemDto[] = [];

  for (const pipe of componentPipes) {
    if (!pipe.content) continue;

    try {
      const parsed = load(pipe.content) as PipelineDslDocument & {
        kind?: string;
        executor?: string;
        inputs?: Record<string, any>;
        outputs?: Record<string, any>;
      };

      if (!parsed || typeof parsed !== "object") continue;

      const slug = pipe.fileName.replace(/\.(component|pipeline)\.(yaml|yml)$/, "");
      const componentName = parsed.name || slug;
      const executor = parsed.executor || pipe.executor || "python";

      // 1. Phân giải Inputs từ node "start"
      const inputPins: PinDefinition[] = [];
      const startNode = parsed.nodes?.find(
        (n) => n.id?.toLowerCase() === "start" || n.tool?.toLowerCase() === "start"
      );

      if (startNode?.inputs) {
        for (const [key, val] of Object.entries(startNode.inputs)) {
          const pinType = typeof val === "number" ? "Number" : typeof val === "boolean" ? "Boolean" : "String";
          inputPins.push({
            id: key,
            label: key,
            kind: "Data" as any,
            primitiveType: pinType as any,
            cardinality: "Single" as any,
            isRequired: false,
          });
        }
      }

      // 2. Phân giải Outputs từ node "return"
      const outputPins: PinDefinition[] = [];
      const returnNode = parsed.nodes?.find(
        (n) => n.id?.toLowerCase() === "return" || n.tool?.toLowerCase() === "return"
      );

      if (returnNode?.inputs) {
        // Trong Return node, các inputs của nó chính là outputs của toàn bộ Component!
        for (const [key, val] of Object.entries(returnNode.inputs)) {
          const pinType = typeof val === "number" ? "Number" : typeof val === "boolean" ? "Boolean" : "String";
          outputPins.push({
            id: key,
            label: key,
            kind: "Data" as any,
            primitiveType: pinType as any,
            cardinality: "Single" as any,
            isRequired: false,
          });
        }
      }

      items.push({
        key: `local:component:${slug}`,
        label: componentName,
        category: "Component Pipes",
        source: "SubPipeline" as any,
        executor,
        inputs: inputPins,
        outputs: outputPins,
        id: `local:component:${slug}`,
        description: parsed.description || `Single-DCC Component Pipe (${executor.toUpperCase()}) executed via local worker.`,
        hasDynamicPins: false,
        isVisibleInPalette: true,
      });
    } catch (e) {
      console.warn(`[componentPaletteGenerator] Failed to parse component pipe: ${pipe.fileName}`, e);
    }
  }

  return items;
}

