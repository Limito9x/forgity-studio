import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ContentDropTargetCard } from "./ContentDropTargetCard";
import { useLookupContentItems } from "@/features/contentItems/hooks/useContentItems";
import { useContentTypes } from "@/features/contentTypes/hooks/useContentTypes";
import { useAssignResourcesContent } from "../../hooks/useRepositories";
import { Search, Unlink, Layers, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

interface AssignContentSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  repositoryId: string;
  selectedResourceIds: string[];
  onAssignSuccess?: () => void;
}

export function AssignContentSidePanel({
  isOpen,
  onClose,
  projectId,
  repositoryId,
  selectedResourceIds,
  onAssignSuccess,
}: AssignContentSidePanelProps) {
  const [keyword, setKeyword] = useState("");
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<string | null>(null);

  // Fetch content types for project filter pills
  const { data: contentTypesData } = useContentTypes({ page: 1, pageSize: 50 }, projectId);
  const contentTypes = useMemo(() => contentTypesData?.items ?? [], [contentTypesData]);

  // Lookup content items matching search & type filter
  const { data: contentItems, isLoading } = useLookupContentItems(
    projectId,
    {
      keyword: keyword.trim() || undefined,
      contentTypeId: selectedContentTypeId || undefined,
      limit: 40,
    },
    { enabled: isOpen }
  );

  const assignMutation = useAssignResourcesContent(repositoryId);

  const handleAssign = (contentId: string | null) => {
    if (selectedResourceIds.length === 0) {
      toast.warning("Please select at least one resource to assign.");
      return;
    }

    assignMutation.mutate(
      {
        data: {
          resourceIds: selectedResourceIds,
          contentId: contentId,
        },
      },
      {
        onSuccess: () => {
          if (contentId) {
            toast.success(`Assigned ${selectedResourceIds.length} resource(s) successfully.`);
          } else {
            toast.success(`Unlinked ${selectedResourceIds.length} resource(s).`);
          }
          onAssignSuccess?.();
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to assign content.");
        },
      }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[500px] border rounded-2xl bg-card shadow-sm overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200">
      {/* Header */}
      <div className="p-4 pb-3 border-b space-y-2.5 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Content Drop Targets</h3>
              <p className="text-[11px] text-muted-foreground">
                {selectedResourceIds.length > 0
                  ? `${selectedResourceIds.length} file(s) selected`
                  : "Drag table rows here"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="size-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search content..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-8 h-8 text-xs bg-background"
          />
        </div>

        {/* Content Type Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 no-scrollbar">
          <Button
            size="sm"
            variant={selectedContentTypeId === null ? "default" : "outline"}
            onClick={() => setSelectedContentTypeId(null)}
            className="h-5 px-2 rounded-full text-[10px] font-medium cursor-pointer"
          >
            All
          </Button>
          {contentTypes.map((type) => {
            const isSelected = selectedContentTypeId === type.id;
            return (
              <Button
                key={type.id}
                size="sm"
                variant={isSelected ? "default" : "outline"}
                onClick={() => setSelectedContentTypeId(isSelected ? null : (type.id ?? null))}
                className="h-5 px-2 rounded-full text-[10px] font-medium shrink-0 cursor-pointer"
              >
                {type.name || type.displayName}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Body / Content Dropzone Grid */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="text-xs">Loading contents...</p>
          </div>
        ) : contentItems && contentItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5">
            {contentItems.map((item) => (
              <ContentDropTargetCard
                key={item.id}
                contentItem={item}
                selectedCount={selectedResourceIds.length}
                onAssignClick={(id) => handleAssign(id)}
                isPending={assignMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
            <div className="size-9 rounded-full bg-muted flex items-center justify-center">
              <Layers className="size-4 text-muted-foreground" />
            </div>
            <p className="font-semibold text-xs text-foreground">No content items found</p>
            <p className="text-[11px] max-w-[200px]">
              {keyword
                ? `No content matched "${keyword}".`
                : "Create content items in your Project to assign resources."}
            </p>
          </div>
        )}
      </div>

      {/* Footer / Quick Unlink Action */}
      {selectedResourceIds.length > 0 && (
        <div className="p-3 border-t bg-muted/30 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Selected: <strong className="text-foreground">{selectedResourceIds.length}</strong>
          </span>
          <Button
            size="sm"
            variant="destructive"
            isDisabled={assignMutation.isPending}
            onClick={() => handleAssign(null)}
            className="h-7 text-xs gap-1.5 px-2.5 cursor-pointer"
          >
            <Unlink className="size-3" />
            Unlink Selected
          </Button>
        </div>
      )}
    </div>
  );
}
