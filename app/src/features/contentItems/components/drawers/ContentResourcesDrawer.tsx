import { Sheet, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ContentResourcesTab } from "../ContentResourcesTab";
import { Layers } from "lucide-react";

interface ContentResourcesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  contentId: string | null;
  contentName: string;
  projectId: string;
}

export function ContentResourcesDrawer({
  isOpen,
  onClose,
  contentId,
  contentName,
  projectId,
}: ContentResourcesDrawerProps) {
  if (!contentId) return null;

  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      side="right"
      className="sm:max-w-lg w-full flex flex-col h-full overflow-hidden"
    >
      <SheetHeader className="p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Layers className="size-4" />
          </div>
          <div className="min-w-0">
            <SheetTitle className="text-sm font-semibold truncate">
              {contentName || "Content Resources"}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Manage workspace files and versions attached to this content.
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-4">
        <ContentResourcesTab
          contentId={contentId}
          contentName={contentName}
          projectId={projectId}
        />
      </div>
    </Sheet>
  );
}
