import { useRunners } from "./hooks/useRunners";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cpu, RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";

export function RunnerPage() {
  const { data: runners = [], isLoading, isError, error, refetch } = useRunners();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-primary" />
            <span>Runner Management</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage physical compute nodes, render machines, and pipeline execution workers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onPress={() => refetch()} className="cursor-pointer">
            <RefreshCw className="w-4 h-4 mr-2" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" />
          <span>Loading runners...</span>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          Failed to load runners: {(error as any)?.message || "Unknown error"}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && runners.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-lg bg-card space-y-4">
          <div className="p-4 bg-primary/10 rounded-full text-primary">
            <Cpu className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">No Runners Connected</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Start a Python pipeline worker daemon on your machine to automatically register as a Runner.
            </p>
          </div>
        </div>
      )}

      {/* Runners Grid */}
      {!isLoading && !isError && runners.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {runners.map((runner) => {
            const isOnline = (runner as any).isOnline ?? true;
            return (
              <Card key={runner.id} className="border hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Cpu className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">
                          {(runner as any).name || (runner as any).hostname || runner.id.slice(0, 8)}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {(runner as any).platform || (runner as any).os || "Windows / Linux"}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant={isOnline ? "default" : "secondary"}
                      className={isOnline ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : ""}
                    >
                      {isOnline ? (
                        <CheckCircle2 className="size-3 mr-1" />
                      ) : (
                        <XCircle className="size-3 mr-1" />
                      )}
                      <span>{isOnline ? "Online" : "Offline"}</span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1.5 pt-0">
                  <div className="flex justify-between py-1 border-t border-border/40">
                    <span>IP / Host:</span>
                    <span className="font-mono text-foreground">{(runner as any).ipAddress || "Localhost"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t border-border/40">
                    <span>Registered:</span>
                    <span className="text-foreground">{new Date(runner.createdAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
