import { cn } from "@/lib/utils";
import React from "react";
import { Separator } from "@/components/ui/separator";

export interface FormSectionProps extends Omit<React.ComponentProps<"div">, "title"> {
    title?: React.ReactNode;
    description?: React.ReactNode;
    hideSeparator?: boolean;
}

export function FormSection({
    title,
    description,
    hideSeparator = false,
    className,
    children,
    ...props
}: FormSectionProps) {
    return (
        <div className={cn("flex flex-col gap-4", className)} {...props}>
            {(title || description) && (
                <div className="flex flex-col gap-1">
                    {title && <h3 className="text-lg font-medium leading-none tracking-tight">{title}</h3>}
                    {description && <p className="text-sm text-muted-foreground">{description}</p>}
                </div>
            )}
            {!hideSeparator && (title || description) && <Separator />}
            <div className="flex flex-col gap-4">
                {children}
            </div>
        </div>
    );
}
