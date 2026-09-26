import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText } from "lucide-react";

interface ResourceDetailPageProps {
  projectId: string;
  workspaceId?: string;
  resourceId: string;
}

export function ResourceDetailPage({ projectId, workspaceId, resourceId }: ResourceDetailPageProps) {
  const navigate = useNavigate();

  return (
    <div className="p-6 lg:p-8 space-y-6 w-full max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="size-9 rounded-xl cursor-pointer"
          onClick={() => {
            if (workspaceId) {
              navigate({
                to: "/projects/$projectId/repositories/$repositoryId",
                params: { projectId, repositoryId: workspaceId },
              });
            } else {
              navigate({
                to: "/projects/$projectId/repositories",
                params: { projectId },
              });
            }
          }}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <FileText className="size-6 text-primary" />
            Resource Detail
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">ID: {resourceId}</p>
        </div>
      </div>

      <Card className="rounded-2xl border-border/60 bg-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Resource Overview</CardTitle>
          <CardDescription className="text-xs">
            Detailed metadata and synchronized versions for this resource
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border bg-muted/20 space-y-1">
              <span className="text-muted-foreground font-medium">Repository Scope</span>
              <p className="font-mono text-foreground font-semibold">{workspaceId || "Not specified"}</p>
            </div>
            <div className="p-4 rounded-xl border bg-muted/20 space-y-1">
              <span className="text-muted-foreground font-medium">Status</span>
              <div>
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                  Synchronized
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
