import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles, Unlink, ChevronDown, Folder, Plus } from "lucide-react";
import type {
  ExtendedWorkspaceResourceDto,
  ResourceLinkedAnchorDto,
} from "../hooks/useRepositories";

interface LinkedContentsCellProps {
  resource: ExtendedWorkspaceResourceDto;
  onAssign: (resourceId: string) => void;
  onUnlink: (resourceId: string, contentItemId?: string) => void;
}

export function LinkedContentsCell({
  resource,
  onAssign,
  onUnlink,
}: LinkedContentsCellProps) {
  // Aggregate all links (prefer linkedAnchors array, fallback to legacy primary link)
  const links = useMemo<ResourceLinkedAnchorDto[]>(() => {
    if (resource.linkedAnchors && resource.linkedAnchors.length > 0) {
      return resource.linkedAnchors;
    }
    if (resource.contentName) {
      return [
        {
          contentItemId: resource.contentId || "",
          contentItemName: resource.contentName,
          contentTypeName: resource.contentTypeName,
          contentTypeColor: resource.contentTypeColor,
          contentTypeIcon: resource.contentTypeIcon,
          anchorPath: resource.anchorPath || "root",
        },
      ];
    }
    return [];
  }, [resource]);

  if (links.length === 0) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onAssign(resource.id)}
        className="h-6 px-2 text-xs text-muted-foreground hover:text-primary gap-1 cursor-pointer"
      >
        <Sparkles className="size-3" />
        Assign
      </Button>
    );
  }

  const firstLink = links[0];

  // 1 Single Link
  if (links.length === 1) {
    return (
      <div className="flex items-center justify-between gap-1.5 max-w-[240px] group/item">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0"
            style={{
              backgroundColor: firstLink.contentTypeColor
                ? `${firstLink.contentTypeColor}15`
                : undefined,
              color: firstLink.contentTypeColor || undefined,
              borderColor: firstLink.contentTypeColor
                ? `${firstLink.contentTypeColor}40`
                : undefined,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: firstLink.contentTypeColor || "#64748b" }}
            />
            <span className="truncate max-w-[100px]">{firstLink.contentItemName}</span>
          </span>

          {firstLink.anchorPath && firstLink.anchorPath !== "root" && (
            <span
              className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground font-mono shrink-0 truncate max-w-[110px]"
              title={firstLink.anchorPath}
            >
              {firstLink.anchorPath}
            </span>
          )}
        </div>

        <Button
          size="sm"
          variant="ghost"
          onPress={() => onUnlink(resource.id, firstLink.contentItemId)}
          className="size-5 p-0 opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-destructive shrink-0 cursor-pointer transition-opacity"
          aria-label="Unlink content"
        >
          <Unlink className="size-3" />
        </Button>
      </div>
    );
  }

  // Multiple Links: Primary Badge + Popover trigger
  return (
    <div className="flex items-center gap-1.5 max-w-[280px]">
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0"
        style={{
          backgroundColor: firstLink.contentTypeColor
            ? `${firstLink.contentTypeColor}15`
            : undefined,
          color: firstLink.contentTypeColor || undefined,
          borderColor: firstLink.contentTypeColor
            ? `${firstLink.contentTypeColor}40`
            : undefined,
        }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: firstLink.contentTypeColor || "#64748b" }}
        />
        <span className="truncate max-w-[85px]">{firstLink.contentItemName}</span>
      </span>

      <PopoverTrigger>
        <Button
          variant="outline"
          size="sm"
          className="h-5 px-1.5 text-[10px] font-mono gap-0.5 rounded-full bg-muted/60 hover:bg-muted text-foreground cursor-pointer"
        >
          +{links.length - 1} more
          <ChevronDown className="size-2.5 opacity-60" />
        </Button>
        <Popover placement="bottom start" className="w-80 p-3">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/50">
              <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                <Folder className="size-3.5 text-primary" />
                Linked Contents ({links.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAssign(resource.id)}
                className="h-5 px-1.5 text-[10px] text-primary gap-1 cursor-pointer"
              >
                <Plus className="size-2.5" /> Add Link
              </Button>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {links.map((lnk, idx) => (
                <div
                  key={`${lnk.contentItemId}-${idx}`}
                  className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/60 transition-colors group/sub"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="size-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: lnk.contentTypeColor || "#64748b" }}
                      />
                      <span className="font-medium truncate text-foreground">
                        {lnk.contentItemName}
                      </span>
                      {lnk.contentTypeName && (
                        <span className="text-[10px] text-muted-foreground">
                          ({lnk.contentTypeName})
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate pl-3">
                      {lnk.anchorPath}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => onUnlink(resource.id, lnk.contentItemId)}
                    className="size-5 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover/sub:opacity-100 transition-opacity cursor-pointer shrink-0"
                    aria-label={`Unlink from ${lnk.contentItemName}`}
                  >
                    <Unlink className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Popover>
      </PopoverTrigger>
    </div>
  );
}

