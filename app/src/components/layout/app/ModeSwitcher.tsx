import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Cloud, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppModeStore, type AppMode } from "@/stores/appModeStore";

export function ModeSwitcher() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { lastLocalPath, lastCloudPath, recordPath, setMode } =
    useAppModeStore();

  useEffect(() => {
    recordPath(pathname);
  }, [pathname, recordPath]);

  const activeMode: AppMode = pathname.startsWith("/local") ? "local" : "cloud";

  const handleSwitch = (target: AppMode) => {
    if (target === activeMode) return;
    setMode(target);
    const destination =
      target === "local" ? lastLocalPath || "/local" : lastCloudPath || "/";
    navigate({ to: destination as any });
  };

  return (
    <div
      role="group"
      aria-label="Workspace mode"
      className="inline-flex h-8 items-center rounded-lg border border-border/70 bg-muted/50 p-0.5 shadow-2xs"
    >
      <button
        type="button"
        onClick={() => handleSwitch("local")}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all cursor-pointer",
          activeMode === "local"
            ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Switch to Local Mode (Offline Workspace & My Machine)"
      >
        <Laptop className="h-3.5 w-3.5" />
        <span>Local</span>
      </button>

      <button
        type="button"
        onClick={() => handleSwitch("cloud")}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all cursor-pointer",
          activeMode === "cloud"
            ? "bg-background text-sky-600 dark:text-sky-400 shadow-xs"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Switch to Cloud Studio"
      >
        <Cloud className="h-3.5 w-3.5" />
        <span>Cloud</span>
      </button>
    </div>
  );
}
