import type { Node } from "@xyflow/react";
import type { StageKind } from "@/gen/model/stageKind";

/**
 * Helper to determine if a handle is an Exec Flow handle
 */
export function isExecHandle(handleId?: string | null): boolean {
  if (!handleId) return false;
  const idLower = handleId.toLowerCase();
  return (
    idLower === "exec_in" ||
    idLower === "exec_out" ||
    idLower === "exec" ||
    idLower.startsWith("exec_") ||
    idLower.endsWith("_exec") ||
    idLower === "loop_body" ||
    idLower === "completed" ||
    idLower === "true" ||
    idLower === "false" ||
    idLower === "then" ||
    idLower === "else" ||
    idLower === "start" ||
    idLower === "beginexecute" ||
    idLower === "done" ||
    idLower === "next" ||
    idLower === "branch"
  );
}

/**
 * Helper to determine if an edge represents Exec Flow
 */
export function isExecEdge(
  sourcePin?: string | null,
  targetPin?: string | null,
  kind?: any
): boolean {
  return (
    kind === 1 ||
    kind === "Exec" ||
    isExecHandle(sourcePin) ||
    isExecHandle(targetPin)
  );
}

/**
 * Helper to map arbitrary kind strings/numbers to enum StageKind
 */
export function mapKindToStageKind(kind: any): StageKind {
  const k = String(kind || "").toLowerCase();
  if (k === "server" || k === "2") return 2 as StageKind;
  if (k === "macro" || k === "3") return 3 as StageKind;
  return 1 as StageKind; // Worker
}

/**
 * Helper to get normalized StageKind name ("Worker" | "Server" | "Macro")
 */
export function getStageKindName(kind: any): "Worker" | "Server" | "Macro" {
  const k = String(kind ?? "").toLowerCase();
  if (k === "server" || k === "2") return "Server";
  if (k === "macro" || k === "3") return "Macro";
  return "Worker";
}

export const STAGE_PADDING_LEFT = 20;
export const STAGE_PADDING_TOP = 56; // 48px header + 8px gap
export const STAGE_PADDING_RIGHT = 40;
export const STAGE_PADDING_BOTTOM = 40;

/**
 * Expands parent stage boundary to the Right and Bottom only when a child node
 * extends beyond the current stage dimensions.
 * Left and Top edges remain anchored so the stage never jumps or shifts sibling nodes.
 */
export function expandStageBoundsIfNeeded(
  nodes: Node[],
  parentStageId: string,
  draggedNode: Node
): { updatedNodes: Node[]; didExpand: boolean } {
  const stageNode = nodes.find((n) => n.id === parentStageId);
  if (!stageNode) return { updatedNodes: nodes, didExpand: false };

  const currentW =
    (stageNode.width as number) ||
    (stageNode.style?.width as number) ||
    (stageNode.measured?.width as number) ||
    520;
  const currentH =
    (stageNode.height as number) ||
    (stageNode.style?.height as number) ||
    (stageNode.measured?.height as number) ||
    380;

  const nodeW = draggedNode.measured?.width || (draggedNode.width as number) || 320;
  const nodeH = draggedNode.measured?.height || (draggedNode.height as number) || 160;

  const childX = Math.max(STAGE_PADDING_LEFT, draggedNode.position.x);
  const childY = Math.max(STAGE_PADDING_TOP, draggedNode.position.y);

  const requiredRight = Math.round(childX + nodeW + STAGE_PADDING_RIGHT);
  const requiredBottom = Math.round(childY + nodeH + STAGE_PADDING_BOTTOM);

  const newW = Math.max(currentW, requiredRight);
  const newH = Math.max(currentH, requiredBottom);
  const didExpand = newW > currentW || newH > currentH;

  if (!didExpand) {
    return { updatedNodes: nodes, didExpand: false };
  }

  const updatedNodes = nodes.map((n) => {
    if (n.id !== parentStageId) return n;
    return {
      ...n,
      width: newW,
      height: newH,
      style: {
        ...n.style,
        width: newW,
        height: newH,
      },
    };
  });

  return { updatedNodes, didExpand: true };
}

/**
 * Real-time fast expansion while actively dragging a node (Right and Bottom only).
 */
export const expandStageLiveWhileDragging = expandStageBoundsIfNeeded;
