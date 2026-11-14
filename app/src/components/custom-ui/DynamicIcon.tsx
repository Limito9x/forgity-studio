import React from "react";
import * as LucideIcons from "lucide-react";
import { FileText, type LucideProps } from "lucide-react";

export interface DynamicIconProps extends Omit<LucideProps, "name"> {
  name?: string | null;
  fallback?: React.ComponentType<LucideProps>;
}

export function DynamicIcon({
  name,
  fallback: FallbackIcon = FileText,
  ...props
}: DynamicIconProps) {
  if (!name) {
    return <FallbackIcon {...props} />;
  }

  const IconComponent = (LucideIcons as any)[name];

  if (IconComponent && (typeof IconComponent === "object" || typeof IconComponent === "function")) {
    const Component = IconComponent as React.ComponentType<LucideProps>;
    return <Component {...props} />;
  }

  return <FallbackIcon {...props} />;
}
