import { useState, useCallback } from "react";
import type { Node } from "@xyflow/react";
import type { ScopeContainerNodeData } from "../ScopeContainerNode";

interface UseCanvasContextMenuArgs {
  nodes: Node[];
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
}

export function useCanvasContextMenu({
  nodes,
  screenToFlowPosition,
}: UseCanvasContextMenuArgs) {
  const [palettePosition, setPalettePosition] = useState<{ x: number; y: number } | null>(null);
  const [flowCoordinates, setFlowCoordinates] = useState<{ x: number; y: number }>({ x: 100, y: 100 });
  const [targetStage, setTargetStage] = useState<ScopeContainerNodeData | null>(null);

  // Pane Context Menu (Right Click on Canvas) -> Opens Palette
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const coords = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setFlowCoordinates(coords);
      setPalettePosition({ x: event.clientX, y: event.clientY });

      // Hit-test: detect if click landed inside an existing Stage container
      const clickedStageNode = nodes.find((n) => {
        if (n.type !== "scopeContainer") return false;
        const w = (n.style?.width as number) || 520;
        const h = (n.style?.height as number) || 380;
        return (
          coords.x >= n.position.x &&
          coords.x <= n.position.x + w &&
          coords.y >= n.position.y &&
          coords.y <= n.position.y + h
        );
      });

      setTargetStage(clickedStageNode ? (clickedStageNode.data as ScopeContainerNodeData) : null);
    },
    [screenToFlowPosition, nodes]
  );

  // Node Context Menu -> Right clicking a Stage scope opens palette scoped to that stage
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type === "scopeContainer") {
        event.preventDefault();
        event.stopPropagation();
        const coords = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        setFlowCoordinates(coords);
        setPalettePosition({ x: event.clientX, y: event.clientY });
        setTargetStage(node.data as ScopeContainerNodeData);
      }
    },
    [screenToFlowPosition]
  );

  const closePalette = useCallback(() => {
    setPalettePosition(null);
    setTargetStage(null);
  }, []);

  return {
    palettePosition,
    setPalettePosition,
    flowCoordinates,
    targetStage,
    setTargetStage,
    onPaneContextMenu,
    onNodeContextMenu,
    closePalette,
  };
}
