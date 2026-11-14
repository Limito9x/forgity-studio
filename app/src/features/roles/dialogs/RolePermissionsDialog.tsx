import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

import { useRolePermissions } from "../hooks/useRolePermissions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchIcon, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import type { DialogProps } from "@/lib/dialog-registry";

export function RolePermissionsDialog({ open, onOpenChange, data }: DialogProps<{ id: string }>) {
    const { t } = useTranslation("role");
    const id = data?.id ?? "";
    const { allPermissions, rolePermissions, updatePermissions, isLoading, isUpdating } = useRolePermissions(id);

    const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState("");

    // Initialize selected permissions when data is loaded
    useEffect(() => {
        if (rolePermissions) {
            setSelectedPermissions(new Set(rolePermissions));
        }
    }, [rolePermissions]);

    // Local Search filtering
    const filteredPermissions = useMemo(() => {
        if (!allPermissions) return {};
        if (!searchTerm) return allPermissions;

        const lowerSearch = searchTerm.toLowerCase();
        const filtered: Record<string, Record<string, readonly string[]>> = {};

        Object.entries(allPermissions).forEach(([moduleName, features]) => {
            let moduleMatches = moduleName.toLowerCase().includes(lowerSearch);
            
            const filteredFeatures: Record<string, string[]> = {};
            let hasMatchingFeature = false;

            Object.entries(features).forEach(([featureName, perms]) => {
                let featureMatches = featureName.toLowerCase().includes(lowerSearch);
                
                const matchingPerms = perms.filter(p => p.toLowerCase().includes(lowerSearch));
                
                if (moduleMatches || featureMatches || matchingPerms.length > 0) {
                    filteredFeatures[featureName] = moduleMatches || featureMatches ? [...perms] : matchingPerms;
                    hasMatchingFeature = true;
                }
            });

            if (moduleMatches || hasMatchingFeature) {
                filtered[moduleName] = filteredFeatures;
            }
        });

        return filtered;
    }, [allPermissions, searchTerm]);

    const handleSave = async () => {
        try {
            await updatePermissions({
                id,
                data: {
                    permissions: Array.from(selectedPermissions)
                }
            });
            toast.success(t("messages.permissionsUpdated", { defaultValue: "Permissions updated successfully" }));
            onOpenChange(false);
        } catch (error) {
            toast.error(t("messages.updateFailed", { defaultValue: "Failed to update permissions" }));
        }
    };

    const footer = (
        <div className="flex justify-end gap-2 w-full pt-4 border-t mt-4">
            <Button variant="outline" onPress={() => onOpenChange(false)} isDisabled={isUpdating}>
                {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button onPress={handleSave} isPending={isUpdating}>
                {t("actions.save", { defaultValue: "Save Changes" })}
            </Button>
        </div>
    );

    if (isLoading) {
        return (
            <BaseDialog
                open={open}
                onOpenChange={onOpenChange}
                title={t("dialogs.permissions.title", { defaultValue: "Role Permissions" })}
                size="2xl"
            >
                <div className="p-8 text-center">{t("messages.loading", { defaultValue: "Loading..." })}</div>
            </BaseDialog>
        );
    }

    return (
        <BaseDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("dialogs.permissions.title", { defaultValue: "Role Permissions" })}
            size="2xl"
            footer={footer}
        >
            <div className="flex flex-col gap-4 h-[70vh]">
                <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t("dialogs.permissions.search", { defaultValue: "Search module, feature, or permission..." })}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <ScrollArea className="flex-1 -mx-2 px-2">
                    <div className="space-y-4 pb-4">
                        {Object.entries(filteredPermissions).map(([moduleName, features]) => (
                            <ModuleNode 
                                key={moduleName} 
                                moduleName={moduleName} 
                                features={features}
                                selectedPermissions={selectedPermissions}
                                setSelectedPermissions={setSelectedPermissions}
                            />
                        ))}
                        {Object.keys(filteredPermissions).length === 0 && (
                            <div className="text-center text-muted-foreground py-8">
                                {t("dialogs.permissions.noResults", { defaultValue: "No permissions found." })}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </BaseDialog>
    );
}

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// -----------------------------------------------------------------------------
// Tree Nodes
// -----------------------------------------------------------------------------

function ModuleNode({ 
    moduleName, 
    features, 
    selectedPermissions, 
    setSelectedPermissions 
}: { 
    moduleName: string;
    features: Record<string, readonly string[]>;
    selectedPermissions: Set<string>;
    setSelectedPermissions: (updateFn: (prev: Set<string>) => Set<string>) => void;
}) {
    const allPermsInModule = useMemo(() => {
        return Object.values(features).flat();
    }, [features]);

    const checkedCount = allPermsInModule.filter(p => selectedPermissions.has(p)).length;
    const isAllChecked = checkedCount === allPermsInModule.length && allPermsInModule.length > 0;
    const isIndeterminate = checkedCount > 0 && checkedCount < allPermsInModule.length;

    const toggleModule = (checked: boolean) => {
        setSelectedPermissions(prev => {
            const next = new Set(prev);
            allPermsInModule.forEach(p => checked ? next.add(p) : next.delete(p));
            return next;
        });
    };

    return (
        <Collapsible defaultExpanded className="border rounded-md mb-2 bg-card">
            <div className="flex items-center p-2 hover:bg-muted/50 transition-colors gap-2">
                <CollapsibleTrigger className="p-1 rounded-sm hover:bg-muted flex items-center justify-center [&[aria-expanded=true]_.chevron]:rotate-90 [&[data-expanded=true]_.chevron]:rotate-90">
                    <ChevronRight className="h-4 w-4 chevron transition-transform duration-200" />
                </CollapsibleTrigger>
                
                <div 
                    className="flex flex-1 items-center gap-2 cursor-pointer select-none"
                    onClick={() => toggleModule(!isAllChecked)}
                >
                    <Checkbox 
                        isSelected={isAllChecked} 
                        isIndeterminate={isIndeterminate} 
                        className="pointer-events-none"
                    />
                    <span className="font-semibold text-sm flex-1">{moduleName}</span>
                    <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full mr-2">
                        {checkedCount} / {allPermsInModule.length}
                    </span>
                </div>
            </div>
            
            <CollapsibleContent>
                <div className="pl-9 pr-3 pb-3 space-y-3 border-t pt-3">
                    {Object.entries(features).map(([featureName, perms]) => (
                        <FeatureNode 
                            key={featureName}
                            featureName={featureName}
                            perms={perms}
                            selectedPermissions={selectedPermissions}
                            setSelectedPermissions={setSelectedPermissions}
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function FeatureNode({ 
    featureName, 
    perms, 
    selectedPermissions, 
    setSelectedPermissions 
}: { 
    featureName: string;
    perms: readonly string[];
    selectedPermissions: Set<string>;
    setSelectedPermissions: (updateFn: (prev: Set<string>) => Set<string>) => void;
}) {
    const checkedCount = perms.filter(p => selectedPermissions.has(p)).length;
    const isAllChecked = checkedCount === perms.length && perms.length > 0;
    const isIndeterminate = checkedCount > 0 && checkedCount < perms.length;

    const toggleFeature = (checked: boolean) => {
        setSelectedPermissions(prev => {
            const next = new Set(prev);
            perms.forEach(p => checked ? next.add(p) : next.delete(p));
            return next;
        });
    };

    return (
        <Collapsible defaultExpanded className="space-y-2">
            <div className="flex items-center gap-2 group w-fit">
                <CollapsibleTrigger className="p-0.5 rounded-sm hover:bg-muted flex items-center justify-center [&[aria-expanded=true]_.chevron]:rotate-90 [&[data-expanded=true]_.chevron]:rotate-90">
                    <ChevronRight className="h-3.5 w-3.5 chevron transition-transform duration-200 text-muted-foreground" />
                </CollapsibleTrigger>
                <div 
                    className="flex items-center gap-2 cursor-pointer select-none"
                    onClick={() => toggleFeature(!isAllChecked)}
                >
                    <Checkbox 
                        isSelected={isAllChecked} 
                        isIndeterminate={isIndeterminate} 
                        className="pointer-events-none"
                    />
                    <span className="font-medium text-sm text-foreground/90">{featureName}</span>
                </div>
            </div>
            <CollapsibleContent>
                <div className="pl-7 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {perms.map(p => (
                        <PermissionNode 
                            key={p} 
                            permission={p} 
                            selectedPermissions={selectedPermissions} 
                            setSelectedPermissions={setSelectedPermissions} 
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function PermissionNode({ 
    permission, 
    selectedPermissions, 
    setSelectedPermissions 
}: { 
    permission: string;
    selectedPermissions: Set<string>;
    setSelectedPermissions: (updateFn: (prev: Set<string>) => Set<string>) => void;
}) {
    const isSelected = selectedPermissions.has(permission);
    const shortName = permission.split('.').pop() || permission;

    const togglePermission = () => {
        setSelectedPermissions(prev => {
            const next = new Set(prev);
            if (!isSelected) next.add(permission);
            else next.delete(permission);
            return next;
        });
    };

    return (
        <div 
            className="flex items-center gap-2 cursor-pointer group w-fit"
            onClick={togglePermission}
        >
            <Checkbox 
                isSelected={isSelected} 
                className="pointer-events-none"
            />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors truncate select-none">
                {shortName}
            </span>
        </div>
    );
}
