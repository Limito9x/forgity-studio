import { cn } from "@/lib/utils";
import React from "react";

export interface FormActionsProps extends React.ComponentProps<"div"> {}

export function FormActions({ className, children, ...props }: FormActionsProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-end gap-2 pt-4 mt-2",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
