import { useRepositories, type RepositoryDto } from "../hooks/useRepositories";
import { RepositoryCard } from "../components/RepositoryCard";
import { Button } from "@/components/ui/button";
import { Plus, FolderGit2, Loader2 } from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";

interface RepositoryListPageProps {
  projectId: string;
}

export function RepositoryListPage({ projectId }: RepositoryListPageProps) {
  const { data, isLoading, isError, error } = useRepositories(projectId);
  const repositories = (data as unknown as RepositoryDto[]) || [];
  const openDialog = useDialogStore((state) => state.openDialog);

  return (
    <div className="p-6 mx-auto space-y-6 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage file repositories, assets (Daz, Blender, Unreal, FBX), and runner mounts for this project.
          </p>
        </div>
        <Button
          onPress={() => openDialog("create-repository", { projectId })}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Plus className="size-4" />
          <span>New Repository</span>
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" />
          <span>Loading repositories...</span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          Failed to load repositories: {(error as any)?.message || "Unknown error"}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && repositories.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed text-center bg-card">
          <div className="p-3 rounded-full bg-primary/10 text-primary mb-3">
            <FolderGit2 className="size-8" />
          </div>
          <h3 className="text-base font-semibold">No repositories yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
            Create your first repository to organize assets and mount them onto your compute runners.
          </p>
          <Button
            size="sm"
            onPress={() => openDialog("create-repository", { projectId })}
            className="cursor-pointer"
          >
            <Plus className="size-4 mr-1.5" />
            <span>Create Repository</span>
          </Button>
        </div>
      )}

      {/* Repository Card Grid */}
      {!isLoading && !isError && repositories.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {repositories.map((repository) => (
            <RepositoryCard key={repository.id} repository={repository} />
          ))}
        </div>
      )}
    </div>
  );
}
