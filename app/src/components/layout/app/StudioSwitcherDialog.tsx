import { Check, Building2, Plus } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  setCurrentStudio,
  useCurrentStudio,
} from "@/features/studios/hooks/useCurrentStudio";
import { useAuthStore } from "@/stores/authStore";

interface StudioSwitcherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudioSwitcherDialog({
  open,
  onOpenChange,
}: StudioSwitcherDialogProps) {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { studio: activeStudio, studios } = useCurrentStudio({
    enabled: Boolean(accessToken) && open,
  });

  const handleSelect = (studio: { id: string; slug: string; name: string }) => {
    setCurrentStudio(studio);
    onOpenChange(false);
    navigate({
      to: "/studio/$studioSlug" as any,
      params: { studioSlug: studio.slug } as any,
    });
  };

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Switch Studio
        </DialogTitle>
        <DialogDescription>
          Select a Studio workspace to switch to.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
        {studios.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No studios available.
          </div>
        ) : (
          studios.map((s) => {
            const isSelected = activeStudio?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
                  isSelected
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border/60 hover:bg-muted/60 text-foreground"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted font-semibold text-xs">
                    {s.name?.slice(0, 2).toUpperCase() || "ST"}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      @{s.slug}
                    </div>
                  </div>
                </div>
                {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            );
          })
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            onOpenChange(false);
            navigate({ to: "/onboarding" as any });
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Studio
        </Button>
      </div>
    </Dialog>
  );
}
