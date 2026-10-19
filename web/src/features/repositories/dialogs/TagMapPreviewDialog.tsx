import { useState, useMemo } from "react";
import { Dialog, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Copy,
  Check,
  Search,
  Layers,
  Tag,
  SlidersHorizontal,
  FileCode,
  ArrowRight,
  Eye,
  Code2,
  X,
} from "lucide-react";
import {
  simulateBuildTagMap,
  type TagMapPreviewOptions,
} from "../utils/simulateTagMap";
import type { TagLinkDetailDto } from "@/features/tags/types";
import { cn } from "@/lib/utils";

interface TagMapPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceId: string;
  versionId?: string;
  versionNo?: number;
  repositoryId?: string;
  resourceName: string;
  relativePath?: string;
  filePath?: string;
  metadata: any;
  tagsByPath?: Record<string, TagLinkDetailDto[]>;
  resourceTags?: { tagPath: string; tagName?: string }[];
}

export function TagMapPreviewDialog({
  open,
  onOpenChange,
  resourceId,
  versionId,
  repositoryId,
  versionNo = 1,
  resourceName,
  relativePath,
  filePath,
  metadata,
  tagsByPath = {},
  resourceTags = [],
}: TagMapPreviewDialogProps) {
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");
  const [keyMode, setKeyMode] = useState<"Both" | "LeafOnly" | "FullPathOnly">("Both");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "tag_map" | "path_map" | "objects" | "all_tags">("all");
  const [searchFilter, setSearchFilter] = useState("");

  const previewResult = useMemo(() => {
    if (!metadata) {
      return {
        objects_map: {},
        all_tags: [],
        summary: { totalAssets: 0, mappedPathsCount: 0, uniqueTagsCount: 0 },
      };
    }

    const options: TagMapPreviewOptions = {
      keyMode,
    };

    return simulateBuildTagMap({
      resourceId,
      versionId: versionId || resourceId,
      repositoryId,
      resourceName,
      relativePath,
      filePath,
      metadata,
      tagsByPath,
      resourceTags,
      options,
    });
  }, [resourceId, versionId, repositoryId, resourceName, relativePath, filePath, metadata, tagsByPath, resourceTags, keyMode]);

  const assetName: string =
    resourceName || (relativePath ? relativePath.split("/").pop() : "") || resourceId || "Resource";
  const assetObj = previewResult.objects_map[assetName] || {};
  const pathMap: Record<string, any> = assetObj.path_map || {};

  // Flattened mapping entries for Visual View
  const visualEntries = useMemo(() => {
    const list: { path: string; value?: any; tags: string[] }[] = [];

    for (const [path, info] of Object.entries(pathMap)) {
      let resolvedValue: any = undefined;
      const tagSet = new Set<string>();

      if (info && typeof info === "object") {
        if ("value" in info) {
          resolvedValue = (info as any).value;
        }

        const rawTags = (info as any).tags;
        if (Array.isArray(rawTags)) {
          for (const t of rawTags) {
            if (t && typeof t === "object") {
              if (keyMode === "LeafOnly") {
                if (t.name) tagSet.add(t.name);
                else if (t.path) tagSet.add(t.path.split(".").pop() || t.path);
              } else if (keyMode === "FullPathOnly") {
                if (t.path) tagSet.add(t.path);
                else if (t.name) tagSet.add(t.name);
              } else {
                // Both: ưu tiên hiển thị tên tag ngắn gọn
                if (t.name) tagSet.add(t.name);
                if (t.path && t.path !== t.name) tagSet.add(t.path);
              }
            } else if (typeof t === "string") {
              tagSet.add(t);
            }
          }
        } else if (typeof rawTags === "string") {
          tagSet.add(rawTags);
        }
      } else if (typeof info === "string") {
        tagSet.add(info);
      }

      list.push({
        path,
        value: resolvedValue,
        tags: Array.from(tagSet),
      });
    }

    if (!searchFilter.trim()) return list;

    const q = searchFilter.toLowerCase().trim();
    return list.filter(
      (entry) =>
        entry.path.toLowerCase().includes(q) ||
        (entry.value && String(entry.value).toLowerCase().includes(q)) ||
        entry.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [pathMap, keyMode, searchFilter]);

  const displayedData = useMemo(() => {
    switch (activeTab) {
      case "tag_map":
        return assetObj.tag_map || {};
      case "path_map":
        return assetObj.path_map || {};
      case "objects":
        return previewResult.objects_map;
      case "all_tags":
        return previewResult.all_tags;
      case "all":
      default:
        return {
          ObjectsMap: previewResult.objects_map,
          TagMap: assetObj.tag_map || {},
          PathMap: assetObj.path_map || {},
          AllTags: previewResult.all_tags,
        };
    }
  }, [previewResult, activeTab, assetObj]);

  const jsonString = useMemo(() => {
    if (!searchFilter.trim()) {
      return JSON.stringify(displayedData, null, 2);
    }

    const q = searchFilter.toLowerCase();
    if (typeof displayedData === "object" && displayedData !== null) {
      const filtered: Record<string, any> = {};
      for (const [k, v] of Object.entries(displayedData)) {
        if (
          k.toLowerCase().includes(q) ||
          JSON.stringify(v).toLowerCase().includes(q)
        ) {
          filtered[k] = v;
        }
      }
      return JSON.stringify(filtered, null, 2);
    }

    return JSON.stringify(displayedData, null, 2);
  }, [displayedData, searchFilter]);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      className="p-0 overflow-hidden sm:max-w-4xl"
    >
      <div className="flex flex-col h-[75vh] max-h-[750px]">
        {/* Header bar */}
        <div className="p-4 border-b bg-muted/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm font-semibold text-foreground">
                  BuildTagMap Output Preview
                </DialogTitle>
                <Badge variant="outline" className="font-mono text-[10px] font-bold">
                  v{versionNo}
                </Badge>
              </div>
              <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
                Simulated output of the <span className="font-mono text-foreground font-semibold">BuildTagMapFromResource</span> node.
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-xs gap-1 font-normal py-1">
              <Layers className="size-3 text-primary" />
              <span>{previewResult.summary.mappedPathsCount} Mapped Slots</span>
            </Badge>
            <Badge variant="secondary" className="text-xs gap-1 font-normal py-1">
              <Tag className="size-3 text-amber-500" />
              <span>{previewResult.summary.uniqueTagsCount} Tags</span>
            </Badge>
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-3 border-b bg-card flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            {/* View Mode Toggle: Visual vs Raw JSON */}
            <div className="flex items-center p-0.5 rounded-lg bg-muted border text-xs">
              <button
                type="button"
                onClick={() => setViewMode("visual")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all cursor-pointer",
                  viewMode === "visual"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Eye className="size-3.5 text-primary" />
                <span>Visual Mapping</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("json")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-all cursor-pointer",
                  viewMode === "json"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Code2 className="size-3.5 text-amber-500" />
                <span>Raw JSON</span>
              </button>
            </div>

            {/* Sub-tabs for Raw JSON mode */}
            {viewMode === "json" && (
              <div className="flex items-center p-0.5 rounded-lg bg-muted/60 border text-[11px]">
                {[
                  { id: "all", label: "Full" },
                  { id: "tag_map", label: "TagMap" },
                  { id: "path_map", label: "PathMap" },
                  { id: "objects", label: "Objects" },
                  { id: "all_tags", label: "Tags" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "px-2 py-0.5 rounded font-medium transition-all cursor-pointer",
                      activeTab === tab.id
                        ? "bg-background text-foreground font-semibold shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-3.5" />
              <span>KeyMode:</span>
              <div className="flex items-center p-0.5 rounded bg-muted border text-[11px]">
                {(["Both", "LeafOnly", "FullPathOnly"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setKeyMode(mode)}
                    className={cn(
                      "px-2 py-0.5 rounded cursor-pointer transition-colors",
                      keyMode === mode
                        ? "bg-background text-foreground font-semibold shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-7 text-xs gap-1.5 cursor-pointer ml-1"
            >
              {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              <span>{copied ? "Copied" : "Copy JSON"}</span>
            </Button>
          </div>
        </div>

        {/* Filter search bar */}
        <div className="px-3 py-2 border-b bg-muted/10 flex items-center gap-2 shrink-0">
          <Search className="size-3.5 text-muted-foreground shrink-0" />
          <Input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter by slot path, material name, or tag..."
            className="h-7 text-xs bg-background/50 border-border/60"
          />
          {searchFilter && (
            <button
              type="button"
              onClick={() => setSearchFilter("")}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-1"
            >
              Clear
            </button>
          )}
        </div>

        {/* Main Content: Visual View vs JSON Viewer */}
        <div className="flex-1 overflow-auto p-4 bg-muted/15 select-text">
          {previewResult.summary.mappedPathsCount === 0 && previewResult.summary.uniqueTagsCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
              <FileCode className="size-10 text-muted-foreground/30 mb-2" />
              <p className="font-semibold text-foreground text-sm">No Tags Assigned to this Resource</p>
              <p className="text-xs max-w-sm mt-1">
                Assign gameplay tags to slots or materials in the Resource Metadata Table to view the generated mapping here.
              </p>
            </div>
          ) : viewMode === "visual" ? (
            <div className="space-y-2 max-w-4xl mx-auto">
              {visualEntries.length === 0 ? (
                <div className="text-center py-12 text-xs text-muted-foreground">
                  No slots match your search query.
                </div>
              ) : (
                visualEntries.map((entry) => (
                  <div
                    key={entry.path}
                    className="p-3 rounded-xl border border-border/70 bg-card shadow-2xs hover:border-primary/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Layers className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-foreground block truncate">
                          {entry.path}
                        </span>
                        {entry.value !== undefined && (
                          <span
                            className="font-mono text-[11px] text-muted-foreground/80 block truncate mt-0.5"
                            title={String(entry.value)}
                          >
                            ↳ <span className="text-foreground/90 font-medium">{String(entry.value)}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0 sm:justify-end">
                      <ArrowRight className="size-3 text-muted-foreground hidden sm:block shrink-0" />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {entry.tags.length > 0 ? (
                          entry.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-xs font-mono bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 px-2 py-0.5 gap-1"
                            >
                              <Tag className="size-2.5" />
                              <span>{tag}</span>
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">No tag</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <pre className="text-foreground leading-relaxed font-mono text-xs whitespace-pre-wrap break-all">
              {jsonString}
            </pre>
          )}
        </div>

        {/* Footer Notes */}
        <div className="p-2.5 border-t bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
          <span className="truncate max-w-md">
            Target: <span className="font-mono text-foreground">{resourceName}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-6 text-xs">
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
