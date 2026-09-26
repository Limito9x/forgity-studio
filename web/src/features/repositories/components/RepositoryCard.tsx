import type { RepositoryDto } from "../hooks/useRepositories";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  FolderGit2,
  Cpu,
  FileText,
  MoreVertical,
  Edit3,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";

interface RepositoryCardProps {
  repository: RepositoryDto;
}

export function RepositoryCard({ repository }: RepositoryCardProps) {
  const openDialog = useDialogStore((state) => state.openDialog);
  const runnerCount = (repository as any).runnerCount ?? (repository as any).agentCount ?? 0;
  const resourceCount = repository.resourceCount ?? 0;

  return (
    <Card className="group relative border bg-card hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-primary/40 group-hover:bg-primary transition-colors" />

      <CardHeader className="pl-6 pr-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <FolderGit2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold tracking-tight truncate group-hover:text-primary transition-colors">
                {repository.name}
              </CardTitle>
              {repository.description ? (
                <CardDescription className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {repository.description}
                </CardDescription>
              ) : (
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Created {new Date(repository.createdAt).toLocaleDateString()}
                </CardDescription>
              )}
            </div>
          </div>

          <MenuTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
            >
              <MoreVertical className="size-4" />
            </Button>
            <Popover className="min-w-[140px] rounded-md border bg-popover p-1 shadow-md text-popover-foreground z-50">
              <Menu className="outline-none">
                <MenuItem
                  onAction={() =>
                    openDialog("update-repository", {
                      id: repository.id,
                      name: repository.name,
                      description: repository.description || undefined,
                    })
                  }
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground outline-none"
                >
                  <Edit3 className="size-3.5" />
                  <span>Edit</span>
                </MenuItem>
                <MenuItem
                  onAction={() =>
                    openDialog("delete-repository", {
                      id: repository.id,
                      name: repository.name,
                      projectId: repository.projectId,
                    })
                  }
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm cursor-pointer text-destructive hover:bg-destructive/10 outline-none"
                >
                  <Trash2 className="size-3.5" />
                  <span>Delete</span>
                </MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
        </div>
      </CardHeader>

      <CardContent className="px-6 py-3">
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Cpu className="size-4 text-primary/70 shrink-0" />
            <span>
              <strong className="text-foreground font-medium">{runnerCount}</strong> Runners
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="size-4 text-primary/70 shrink-0" />
            <span>
              <strong className="text-foreground font-medium">{resourceCount}</strong> Resources
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="px-6 pb-4 pt-2">
        <Link
          to="/projects/$projectId/repositories/$repositoryId"
          params={{ projectId: repository.projectId, repositoryId: repository.id }}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-full justify-between group-hover:border-primary/50 cursor-pointer"
          )}
        >
          <span>Open Repository</span>
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
        </Link>
      </CardFooter>
    </Card>
  );
}
