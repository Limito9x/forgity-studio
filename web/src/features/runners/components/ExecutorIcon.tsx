import { useState } from "react";
import { getSoftwareMetadata } from "../constants/dccEngines";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExecutorIconProps {
  executor: string;
  className?: string;
  fallback?: React.ReactNode;
}

export function ExecutorIcon({
  executor,
  className = "size-3.5",
  fallback,
}: ExecutorIconProps) {
  const meta = getSoftwareMetadata(executor || "");
  const [hasError, setHasError] = useState(false);

  if (meta.iconUrl && !hasError) {
    return (
      <img
        src={meta.iconUrl}
        alt={meta.name}
        className={cn("object-contain shrink-0", className)}
        onError={() => setHasError(true)}
      />
    );
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return <Cpu className={cn("shrink-0 text-muted-foreground", className)} />;
}
