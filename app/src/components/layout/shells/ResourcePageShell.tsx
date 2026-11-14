import React from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon, RefreshCw } from "lucide-react";
import { FilterPanel } from "@/components/filter-panel/FilterPanel";
import type { BaseSearchParams, useResourceQuery } from "@/lib/useResourceQuery";
import type { ResolvedFilterConfig } from "@/components/filter-panel/filter-types";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface ResourcePageShellProps {
    title: string;
    description?: string;
    icon?: React.ComponentType<{ className?: string }> | React.ReactNode;

    /** Action for the Add button */
    onAdd?: () => void;
    /** Text for the Add button. Default is "Add" */
    addLabel?: string;

    /** Extra action buttons rendered in header (e.g. Export, Import) */
    actions?: React.ReactNode;

    /** Action for the Refresh button */
    onRefresh?: () => void;
    isRefreshing?: boolean;

    /** Query state from useResourceQuery hook */
    resource: ReturnType<typeof useResourceQuery<BaseSearchParams>>;

    /** Filter panel config. If not provided, filter panel is hidden. */
    filterConfig?: ResolvedFilterConfig;
    searchPlaceholder?: string;
    hideAdvancedFilters?: boolean;
    renderViewOptions?: React.ReactNode;

    children: React.ReactNode;
}

export function ResourcePageShell({
    title,
    description,
    icon: IconProp,
    onAdd,
    addLabel,
    actions,
    onRefresh,
    isRefreshing,
    resource,
    filterConfig,
    searchPlaceholder,
    hideAdvancedFilters = false,
    renderViewOptions,
    children,
}: ResourcePageShellProps) {
    const { t } = useTranslation("common");
    const resolvedAddLabel = addLabel ?? t("create");

    const renderIcon = () => {
        if (!IconProp) return null;
        if (typeof IconProp === "function") {
            const IconComp = IconProp as React.ComponentType<{ className?: string }>;
            return <IconComp className="h-6 w-6 text-primary shrink-0" />;
        }
        return IconProp;
    };

    return (
        <div className="page-container space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2.5">
                        {renderIcon()}
                        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                    </div>
                    {description ? (
                        <p className="text-sm text-muted-foreground">{description}</p>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    {actions}
                    {onRefresh && (
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={onRefresh}
                            isDisabled={isRefreshing}
                        >
                            <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
                            {t("refresh", { defaultValue: "Refresh" })}
                        </Button>
                    )}
                    {onAdd && (
                        <Button onClick={onAdd}>
                            <PlusIcon className="mr-2 h-4 w-4" /> {resolvedAddLabel}
                        </Button>
                    )}
                </div>
            </div>

            {filterConfig && (
                <div className="flex items-start sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <FilterPanel
                            keyword={resource.search.globalKeyword ?? ""}
                            onKeywordChange={resource.onSearchChange}
                            config={filterConfig}
                            filters={resource.search.filters}
                            onFiltersApply={resource.onFiltersApply}
                            searchPlaceholder={searchPlaceholder}
                            hideAdvanced={hideAdvancedFilters}
                        />
                    </div>
                    {renderViewOptions && (
                        <div className="flex-shrink-0">
                            {renderViewOptions}
                        </div>
                    )}
                </div>
            )}

            {children}
        </div>
    );
}
