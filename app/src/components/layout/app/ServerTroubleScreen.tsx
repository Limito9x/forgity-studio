import { useState, useEffect } from "react";
import { ServerCrash, RefreshCw, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import { useNavigate } from "@tanstack/react-router";
import { appConfig } from "@/config/appConfig";

interface ServerTroubleScreenProps {
  onRetry: () => void | Promise<unknown>;
}

export function ServerTroubleScreen({ onRetry }: ServerTroubleScreenProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const clearToken = useAuthStore((state) => state.clearToken);
  const clearProfile = useAuthStore((state) => state.clearProfile);
  const navigate = useNavigate();

  // Auto-retry countdown
  useEffect(() => {
    if (countdown <= 0) {
      handleRetry();
      setCountdown(10);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSignOut = () => {
    clearToken();
    clearProfile();
    navigate({ to: "/auth/login", replace: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-4 text-foreground select-none">
      <div className="relative flex max-w-md flex-col items-center text-center">
        {/* Glow backdrop effect */}
        <div className="absolute -inset-8 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        {/* Icon Box */}
        <div className="relative flex size-16 items-center justify-center rounded-2xl border border-amber-500/20 bg-card/90 shadow-lg shadow-amber-500/5 backdrop-blur-sm">
          <ServerCrash className="size-8 text-amber-500 animate-pulse" />
        </div>

        {/* System Notice Badge */}
        <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-500">
          <ShieldAlert className="size-3.5" />
          <span>System Service Notice</span>
        </div>

        {/* Title */}
        <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          We're Experiencing Technical Difficulties
        </h1>

        {/* Polite message asking for patience */}
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Our servers are having trouble responding right now. We sincerely apologize for the inconvenience and appreciate your patience while we work on it. Please try again in a moment.
        </p>

        {/* Auto-reconnect status */}
        <p className="mt-4 text-xs font-medium text-muted-foreground/80">
          Auto-checking connection in <span className="font-semibold text-amber-500">{countdown}s</span>...
        </p>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
          <Button
            variant="default"
            size="lg"
            onPress={handleRetry}
            isDisabled={isRetrying}
            className="w-full sm:w-auto min-w-36 gap-2 font-medium cursor-pointer"
          >
            <RefreshCw className={`size-4 ${isRetrying ? "animate-spin" : ""}`} />
            <span>{isRetrying ? "Reconnecting..." : "Try Again"}</span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            onPress={handleSignOut}
            className="w-full sm:w-auto gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <LogOut className="size-4" />
            <span>Sign Out</span>
          </Button>
        </div>

        {/* App Footer Brand */}
        <div className="mt-12 text-xs text-muted-foreground/50">
          {appConfig.name} • System Availability Guard
        </div>
      </div>
    </div>
  );
}
