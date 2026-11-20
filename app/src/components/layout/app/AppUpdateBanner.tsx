import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";

interface AvailableUpdate {
  version: string;
  body?: string;
  downloadAndInstall: (onEvent?: (ev: any) => void) => Promise<void>;
}

export function AppUpdateBanner() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [progressText, setProgressText] = useState<string>("");

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;

    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const found = await check();
        if (!cancelled && found?.available) {
          setUpdate(found as unknown as AvailableUpdate);
        }
      } catch {
        // Silent in dev or when offline / pubkey not configured
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!update || dismissed) return null;

  const handleInstall = async () => {
    setIsInstalling(true);
    setProgressText("Downloading...");
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event: any) => {
        if (event.event === "Started" && event.data?.contentLength) {
          total = event.data.contentLength;
        } else if (event.event === "Progress" && event.data?.chunkLength) {
          downloaded += event.data.chunkLength;
          if (total > 0) {
            const pct = Math.min(100, Math.round((downloaded / total) * 100));
            setProgressText(`Downloading ${pct}%`);
          }
        } else if (event.event === "Finished") {
          setProgressText("Installing...");
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      setIsInstalling(false);
      setProgressText("");
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-primary/40 bg-card/95 backdrop-blur px-4 py-2.5 shadow-lg text-xs">
      <Download className="h-4 w-4 text-primary shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold text-foreground">
          Forgity Studio v{update.version} is available
        </p>
        {progressText && (
          <p className="text-[11px] text-muted-foreground">{progressText}</p>
        )}
      </div>
      <Button
        size="sm"
        className="h-7 text-xs gap-1.5"
        onPress={handleInstall}
        isDisabled={isInstalling}
      >
        {isInstalling && <RefreshCw className="h-3 w-3 animate-spin" />}
        <span>{isInstalling ? "Updating..." : "Update & Restart"}</span>
      </Button>
      {!isInstalling && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          aria-label="Dismiss update notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
