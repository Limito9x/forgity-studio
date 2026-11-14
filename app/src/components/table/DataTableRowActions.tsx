import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import React from "react";

export interface ActionItem {
    label: string;
    icon?: React.ElementType;
    onClick: () => void;
    destructive?: boolean;
    disabled?: boolean;
    separatorBefore?: boolean;
}

export interface DataTableRowActionsProps {
    actions: ActionItem[];
    /**
     * Whether to wrap all actions into a compact "..." dropdown menu.
     * - `true`: Always compact into a single "..." button (ideal for tables with many columns).
     * - `false`: Expand actions as direct inline buttons (ideal for spacious tables with few columns).
     * - Defaults to `true` to maintain 100% backward compatibility.
     */
    compact?: boolean;
    /**
     * Maximum number of inline buttons to show before putting the rest into an overflow "..." menu.
     * Only applies when `compact` is `false`. Defaults to 3.
     */
    maxInlineActions?: number;
    className?: string;
}

export function DataTableRowActions({
    actions,
    compact = true,
    maxInlineActions = 3,
    className,
}: DataTableRowActionsProps) {
    if (!actions || actions.length === 0) return null;

    // 1. Compact Mode (Always Dropdown)
    if (compact) {
        return (
            <DropdownMenuTrigger>
                <Button
                    variant="ghost"
                    className={cn("flex h-8 w-8 p-0 data-[state=open]:bg-muted cursor-pointer", className)}
                >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                </Button>
                <DropdownMenu placement="bottom end" className="w-[160px]">
                    {actions.map((action, index) => (
                        <React.Fragment key={index}>
                            {action.separatorBefore && <DropdownMenuSeparator />}
                            <DropdownMenuItem
                                onAction={action.onClick}
                                isDisabled={action.disabled}
                                variant={action.destructive ? "destructive" : "default"}
                            >
                                {action.icon && <action.icon className="mr-2 h-4 w-4" />}
                                {action.label}
                            </DropdownMenuItem>
                        </React.Fragment>
                    ))}
                </DropdownMenu>
            </DropdownMenuTrigger>
        );
    }

    // 2. Expanded / Inline Mode (with overflow dropdown if exceeding maxInlineActions)
    const inlineActions = actions.slice(0, maxInlineActions);
    const overflowActions = actions.slice(maxInlineActions);

    return (
        <div className={cn("flex items-center gap-1", className)}>
            {inlineActions.map((action, index) => {
                const Icon = action.icon;
                const buttonElement = (
                    <Button
                        key={index}
                        variant="ghost"
                        size="sm"
                        isDisabled={action.disabled}
                        onPress={action.onClick}
                        className={cn(
                            "h-7 w-7 p-0 cursor-pointer rounded-md transition-colors",
                            action.destructive
                                ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        aria-label={action.label}
                    >
                        {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="text-xs">{action.label}</span>}
                    </Button>
                );

                return (
                    <TooltipTrigger key={index} delay={300}>
                        {buttonElement}
                        <Tooltip placement="top">{action.label}</Tooltip>
                    </TooltipTrigger>
                );
            })}

            {/* Overflow Dropdown for remaining actions */}
            {overflowActions.length > 0 && (
                <DropdownMenuTrigger>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 data-[state=open]:bg-muted text-muted-foreground hover:text-foreground cursor-pointer rounded-md"
                        aria-label="More actions"
                    >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                    <DropdownMenu placement="bottom end" className="w-[160px]">
                        {overflowActions.map((action, index) => (
                            <React.Fragment key={index}>
                                {action.separatorBefore && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                    onAction={action.onClick}
                                    isDisabled={action.disabled}
                                    variant={action.destructive ? "destructive" : "default"}
                                >
                                    {action.icon && <action.icon className="mr-2 h-4 w-4" />}
                                    {action.label}
                                </DropdownMenuItem>
                            </React.Fragment>
                        ))}
                    </DropdownMenu>
                </DropdownMenuTrigger>
            )}
        </div>
    );
}
