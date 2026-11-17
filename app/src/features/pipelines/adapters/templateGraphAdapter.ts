import type { ExtendedPipelineGraphDto, PipelineParameterDto } from "../hooks/usePipelineGraph";

export interface ConstantFieldSchema {
  key: string;
  label: string;
  dataType: string;
  scope?: string;
  description?: string;
  isRequired?: boolean;
}

export function templateRootToPipelineGraphDto(
  id: string,
  name: string,
  rootPipelineJson: any,
  contractsJson: any
): ExtendedPipelineGraphDto {
  const rp = (rootPipelineJson && typeof rootPipelineJson === "object" ? rootPipelineJson : {}) as any;
  const contracts = (contractsJson && typeof contractsJson === "object" ? contractsJson : {}) as any;

  const rawNodes = Array.isArray(rp.nodes) ? rp.nodes : [];
  const rawEdges = Array.isArray(rp.edges) ? rp.edges : [];
  const rawParams = Array.isArray(rp.parameters)
    ? rp.parameters
    : Array.isArray(contracts.inputs)
      ? contracts.inputs.map((inp: any) => {
          const pinKey = String(inp.id || inp.key || inp.label || "");
          return {
            id: pinKey,
            key: pinKey,
            label: String(inp.label || inp.name || pinKey),
            kind: "Input",
            primitiveType: inp.primitiveType || "String",
            cardinality: inp.cardinality || "Single",
            defaultValue: inp.defaultValue ?? null,
          };
        })
      : [];

  return {
    id,
    projectId: "cloud-template",
    name: name || rp.name || "Template",
    triggerType: "Manual",
    nodes: rawNodes.map((n: any) => ({
      id: n.id,
      kind: n.kind || "Tool",
      refId: n.refId || n.id,
      label: n.label || n.refId || n.id,
      category: n.category || "Template",
      executor: n.executor || "python",
      position: n.position || { x: 0, y: 0 },
      inputs: Array.isArray(n.inputs) ? n.inputs : [],
      outputs: Array.isArray(n.outputs) ? n.outputs : [],
      configValues: n.configValues || {},
      metadata: n.metadata || {},
      fileAssets: n.fileAssets || {},
    })),
    edges: rawEdges.map((e: any, idx: number) => ({
      id: e.id || `edge_${idx}`,
      sourceNodeId: e.sourceNodeId || e.source,
      sourcePin: e.sourcePin || e.sourcePinId || e.sourceHandle || "out",
      targetNodeId: e.targetNodeId || e.target,
      targetPin: e.targetPin || e.targetPinId || e.targetHandle || "in",
      kind: e.kind || "Data",
    })),
    parameters: rawParams as PipelineParameterDto[],
  } as ExtendedPipelineGraphDto;
}

export function extractConstantFields(contractsJson: any): ConstantFieldSchema[] {
  const constants = contractsJson?.constants;
  if (Array.isArray(constants) && constants.length > 0) {
    return constants
      .map((c: any) => ({
        key: String(c.key || c.id || ""),
        label: String(c.label || c.key || c.id || ""),
        dataType: String(c.dataType || c.primitiveType || "String"),
        scope: c.scope ? String(c.scope) : undefined,
        description: c.description ? String(c.description) : undefined,
        isRequired: Boolean(c.isRequired ?? true),
      }))
      .filter((c) => Boolean(c.key));
  }

  // Fallback: extract from contractsJson.nodes palette items
  const nodes = contractsJson?.nodes;
  if (!Array.isArray(nodes)) return [];

  const seen = new Set<string>();
  const extracted: ConstantFieldSchema[] = [];
  for (const n of nodes) {
    const caps = n?.capabilities || {};
    const isConst =
      Boolean(caps.isConstantNode) ||
      String(n?.category || "").toLowerCase() === "constants" ||
      String(n?.key || "").startsWith("local:constant:");
    if (!isConst) continue;

    const key = String(caps.constantKey || n?.name || n?.key || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);

    extracted.push({
      key,
      label: String(n?.label || key).replace(/^Constant:\s*/i, ""),
      dataType: String(caps.dataType || "String"),
      scope: caps.scope ? String(caps.scope) : undefined,
      description: n?.description ? String(n.description) : undefined,
      isRequired: true,
    });
  }
  return extracted;
}
