import { useState } from "react";
import type { ContentAnchorNodeDto } from "@/gen/model";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Unlink,
  Layers,
  Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ContentAnchorTreeOutlinerProps {
  nodes: ContentAnchorNodeDto[];
  onUnlink?: (resourceId: string, resourceName: string) => void;
  isUnlinking?: boolean;
}

interface TreeNodeItemProps {
  node: ContentAnchorNodeDto;
  depth?: number;
  onUnlink?: (resourceId: string, resourceName: string) => void;
  isUnlinking?: boolean;
}

function TreeNodeItem({
  node,
  depth = 0,
  onUnlink,
  isUnlinking,
}: TreeNodeItemProps) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isLeaf = node.isLeaf;

  // Branch / Folder Node
  if (!isLeaf && hasChildren) {
    return (
      <div className="select-none text-xs">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors group",
            depth > 0 && "ml-4"
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              className="size-4 p-0 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(!isOpen);
              }}
            >
              {isOpen ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
            {isOpen ? (
              <FolderOpen className="size-4 text-primary/80 shrink-0" />
            ) : (
              <Folder className="size-4 text-primary/80 shrink-0" />
            )}
            <span className="font-semibold text-foreground truncate">
              {node.name}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-medium">
              {node.children.length}
            </span>
          </div>
        </div>

        {isOpen && (
          <div className="border-l border-border/50 ml-4 pl-1 space-y-0.5 mt-0.5">
            {node.children.map((child, idx) => (
              <TreeNodeItem
                key={`${child.fullPath}-${idx}`}
                node={child}
                depth={depth + 1}
                onUnlink={onUnlink}
                isUnlinking={isUnlinking}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Leaf / Resource Node
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors group text-xs",
        depth > 0 ? "ml-4" : ""
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="size-4 flex items-center justify-center shrink-0 text-muted-foreground">
          <Box className="size-3.5 text-emerald-500" />
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium text-foreground font-mono text-[11px] truncate">
            {node.name}
          </span>
          {node.targetName && (
            <>
              <span className="text-muted-foreground/60 text-[10px]">→</span>
              <span className="text-muted-foreground truncate max-w-[200px]" title={node.targetName}>
                {node.targetName}
              </span>
            </>
          )}
        </div>
      </div>

      {node.targetId && onUnlink && (
        <Button
          size="sm"
          variant="ghost"
          isDisabled={isUnlinking}
          onClick={(e) => {
            e.stopPropagation();
            onUnlink(node.targetId!, node.targetName || node.name);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity size-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
          aria-label="Unlink resource"
        >
          <Unlink className="size-3" />
        </Button>
      )}
    </div>
  );
}

export function ContentAnchorTreeOutliner({
  nodes,
  onUnlink,
  isUnlinking,
}: ContentAnchorTreeOutlinerProps) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground space-y-2 border border-dashed rounded-xl bg-card/40">
        <Layers className="size-8 text-muted-foreground/60" />
        <p className="text-xs font-semibold text-foreground">No anchor hierarchy defined</p>
        <p className="text-[11px] max-w-xs">
          Resources linked by convention will automatically form folders and slots in this outliner.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card/60 p-2.5 space-y-1">
      {nodes.map((rootNode, idx) => (
        <TreeNodeItem
          key={`${rootNode.fullPath}-${idx}`}
          node={rootNode}
          depth={0}
          onUnlink={onUnlink}
          isUnlinking={isUnlinking}
        />
      ))}
    </div>
  );
}
