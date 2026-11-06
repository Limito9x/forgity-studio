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

/**
 * Real-time fast expansion while actively dragging a node.
 * Expands stage width and height without changing stage position, ensuring zero cursor jitter.
 */
export function expandStageLiveWhileDragging(
  nodes: Node[],
  parentStageId: string,
  draggedNode: Node
): { updatedNodes: Node[]; didExpand: boolean } {
  const stageNode = nodes.find((n) => n.id === parentStageId);
  if (!stageNode) return { updatedNodes: nodes, didExpand: false };

  const currentW = (stageNode.style?.width as number) || 520;
  const currentH = (stageNode.style?.height as number) || 380;

  const nodeW = draggedNode.measured?.width || (draggedNode.width as number) || 320;
  const nodeH = draggedNode.measured?.height || (draggedNode.height as number) || 160;

  const childX = draggedNode.position.x;
  const childY = draggedNode.position.y;

  let newW = currentW;
  let newH = currentH;
  let didExpand = false;

  // Expanding Right: when node right edge is within 50px of boundary or beyond
  const requiredRight = childX + nodeW + 60;
  if (requiredRight > currentW) {
    newW = Math.max(currentW, requiredRight);
    didExpand = true;
  }

  // Expanding Bottom: when node bottom edge is within 50px of boundary or beyond
  const requiredBottom = childY + nodeH + 60;
  if (requiredBottom > currentH) {
    newH = Math.max(currentH, requiredBottom);
    didExpand = true;
  }

  if (!didExpand) {
    return { updatedNodes: nodes, didExpand: false };
  }

  const updatedNodes = nodes.map((n) => {
    if (n.id !== parentStageId) return n;
    return {
      ...n,
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
 * Helper to auto-expand parent stage boundary in all 4 directions
 * (Right, Bottom, Left, Top) when a child node touches or nears the edges.
 */
export function expandStageBoundsIfNeeded(
  nodes: Node[],
  parentStageId: string,
  draggedNode: Node
): { updatedNodes: Node[]; didExpand: boolean } {
  const stageNode = nodes.find((n) => n.id === parentStageId);
  if (!stageNode) return { updatedNodes: nodes, didExpand: false };

  const currentW = (stageNode.style?.width as number) || 520;
  const currentH = (stageNode.style?.height as number) || 380;

  // CustomPipelineNode has min-width: 300px, max-width: 380px
  const nodeW = draggedNode.measured?.width || (draggedNode.width as number) || 320;
  const nodeH = draggedNode.measured?.height || (draggedNode.height as number) || 160;

  const childX = draggedNode.position.x;
  const childY = draggedNode.position.y;

  let expandRight = 0;
  let expandBottom = 0;
  let expandLeft = 0;
  let expandTop = 0;

  // 1. Right Edge: node right edge is within 50px of stage boundary or exceeded
  const rightDistance = currentW - (childX + nodeW);
  if (rightDistance < 50) {
    expandRight = Math.max(180, 50 - rightDistance + 100);
  }

  // 2. Bottom Edge: node bottom edge is within 50px of stage boundary or exceeded
  const bottomDistance = currentH - (childY + nodeH);
  if (bottomDistance < 50) {
    expandBottom = Math.max(140, 50 - bottomDistance + 80);
  }

  // 3. Left Edge: node is dragged near left boundary (<= 40px)
  if (childX < 40) {
    expandLeft = Math.max(180, 40 - childX + 120);
  }

  // 4. Top Edge: Stage header occupies ~48px, so if childY <= 65px
  if (childY < 65) {
    expandTop = Math.max(120, 65 - childY + 70);
  }

  if (expandRight === 0 && expandBottom === 0 && expandLeft === 0 && expandTop === 0) {
    return { updatedNodes: nodes, didExpand: false };
  }

  const newW = currentW + expandRight + expandLeft;
  const newH = currentH + expandBottom + expandTop;
  const newStageX = stageNode.position.x - expandLeft;
  const newStageY = stageNode.position.y - expandTop;

  const updatedNodes = nodes.map((n) => {
    // Update the parent stage bounding box & position
    if (n.id === parentStageId) {
      return {
        ...n,
        position: {
          x: newStageX,
          y: newStageY,
        },
        style: {
          ...n.style,
          width: newW,
          height: newH,
        },
      };
    }

    // When expanding Left or Top, all existing child nodes of this stage
    // must shift their local position by (expandLeft, expandTop) so their global coordinates remain unchanged
    if (n.parentId === parentStageId && (expandLeft > 0 || expandTop > 0)) {
      return {
        ...n,
        position: {
          x: n.position.x + expandLeft,
          y: n.position.y + expandTop,
        },
      };
    }

    return n;
  });

  return { updatedNodes, didExpand: true };
}
