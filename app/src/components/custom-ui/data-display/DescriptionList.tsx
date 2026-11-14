import * as React from "react";
import { cn } from "@/lib/utils";

export interface DescriptionListProps extends React.HTMLAttributes<HTMLDListElement> {}

export function DescriptionList({ className, ...props }: DescriptionListProps) {
    return (
        <dl
            className={cn("grid grid-cols-1 gap-y-4 gap-x-6 sm:grid-cols-2", className)}
            {...props}
        />
    );
}

export interface DescriptionListItemProps extends React.HTMLAttributes<HTMLDivElement> {
    label: React.ReactNode;
    icon?: React.ReactNode;
    value?: React.ReactNode;
    colSpan?: number;
}

export function DescriptionListItem({
    label,
    icon,
    value,
    colSpan = 1,
    className,
    children,
    ...props
}: DescriptionListItemProps) {
    return (
        <div
            className={cn(colSpan === 2 && "sm:col-span-2", className)}
            {...props}
        >
            <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                {icon}
                {label}
            </dt>
            <dd className="text-sm font-medium">
                {value ?? children}
            </dd>
        </div>
    );
}
