import { useState, useCallback } from "react";

interface UseCanvasContextMenuArgs {
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
}

export function useCanvasContextMenu({
  screenToFlowPosition,
}: UseCanvasContextMenuArgs) {
  const [palettePosition, setPalettePosition] = useState<{ x: number; y: number } | null>(null);
  const [flowCoordinates, setFlowCoordinates] = useState<{ x: number; y: number }>({ x: 100, y: 100 });

  // Right Click on Flat Canvas opens Action/Script Palette directly
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const coords = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setFlowCoordinates(coords);
      setPalettePosition({ x: event.clientX, y: event.clientY });
    },
    [screenToFlowPosition]
  );

  const closePalette = useCallback(() => {
    setPalettePosition(null);
  }, []);

  return {
    palettePosition,
    setPalettePosition,
    flowCoordinates,
    onPaneContextMenu,
    closePalette,
  };
}
