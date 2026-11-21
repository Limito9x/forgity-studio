import { useNavigate } from "@tanstack/react-router";
import { Library, Play, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetMyLibrary } from "@/gen/endpoints/templates/templates";

export function MyLibraryPage() {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useGetMyLibrary();

  return (
    <div className="page-container space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            My Library
          </h1>
          <p className="text-sm text-muted-foreground">
            Templates added to your library with assigned execution quotas.
          </p>
        </div>

        <Button
          variant="outline"
          onPress={() => navigate({ to: "/templates" as any })}
        >
          Browse Catalog
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Your library is empty. Browse the Templates Catalog and click &quot;Add to My Library&quot; to get started.
          </p>
          <Button onPress={() => navigate({ to: "/templates" as any })}>
            Browse Templates
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const isExhausted = item.maxRuns != null && (item.remainingRuns ?? 0) <= 0;
            return (
              <Card key={item.id} className="flex flex-col justify-between border-border/70">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-1">{item.title}</CardTitle>
                    <Badge variant="secondary">{item.category}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                    {item.description || "No description provided."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                    <span className="text-muted-foreground">Quota</span>
                    <span className={isExhausted ? "font-semibold text-destructive" : "font-medium"}>
                      {item.maxRuns != null
                        ? `${item.remainingRuns ?? 0} / ${item.maxRuns} runs left`
                        : "Unlimited"}
                    </span>
                  </div>
                </CardContent>

                <CardFooter className="border-t pt-3">
                  <Button
                    className="w-full"
                    size="sm"
                    onPress={() =>
                      navigate({
                        to: "/templates/library/$libraryItemId" as any,
                        params: { libraryItemId: item.id } as any,
                      })
                    }
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Open Workbench
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
