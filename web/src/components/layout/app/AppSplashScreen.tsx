import { Workflow, Loader2 } from "lucide-react";

interface AppSplashScreenProps {
  message?: string;
}

export function AppSplashScreen({ message = "Initializing workspace..." }: AppSplashScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background text-foreground select-none">
      <div className="relative flex flex-col items-center">
        {/* Glow backdrop effect */}
        <div className="absolute -inset-4 rounded-3xl bg-primary/5 blur-xl pointer-events-none" />

        {/* Brand Icon Box */}
        <div className="relative flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-card/80 shadow-md shadow-primary/5 backdrop-blur-sm">
          <Workflow className="size-7 text-primary animate-pulse" />
        </div>

        {/* App Title & Status */}
        <div className="mt-5 flex flex-col items-center gap-1.5 text-center">
          <span className="text-base font-semibold tracking-tight text-foreground">
            Automation Studio
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <Loader2 className="size-3 animate-spin text-primary/70" />
            <span>{message}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
