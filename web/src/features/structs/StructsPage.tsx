import { useState, useMemo } from "react";
import { useGetProjectStructs } from "./hooks/useStructs";
import { useTranslation } from "react-i18next";
import { useDialogStore } from "@/stores/dialogStore";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Boxes, Plus, Search, Sliders, Trash2, Layers, AlertCircle, Loader2 } from "lucide-react";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import { useProjectNav } from "@/lib/navigation/useProjectNav";

interface StructsPageProps {
    projectId: string;
}

export function StructsPage({ projectId }: StructsPageProps) {
    const { t } = useTranslation("structs");
    const { studioSlug } = useCurrentStudio();
    const nav = useProjectNav({ studioSlug, projectId });
    const openDialog = useDialogStore((state) => state.openDialog);
    const [searchQuery, setSearchQuery] = useState("");

    const { data: structs, isLoading, error } = useGetProjectStructs(projectId, {
        search: searchQuery || undefined
    });

    const filteredStructs = useMemo(() => {
        if (!structs) return [];
        if (!searchQuery.trim()) return structs;
        const q = searchQuery.toLowerCase();
        return structs.filter(s => s.name?.toLowerCase().includes(q));
    }, [structs, searchQuery]);

    return (
        <div className="flex flex-col h-full gap-4 p-4 md:p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Boxes className="w-5 h-5" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {t("page.title", { defaultValue: "Project Structs" })}
                        </h1>
                    </div>
                    <p className="text-muted-foreground text-sm mt-1">
                        {t("page.description", {
                            defaultValue: "Define composite data structures and schemas reusable across Content CMS and Pipeline Scripting."
                        })}
                    </p>
                </div>

                <Button
                    onPress={() => openDialog("create-struct", { projectId })}
                    className="flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    {t("actions.create", { defaultValue: "Add Struct" })}
                </Button>
            </div>

            {/* Search & Stats Filter Toolbar */}
            <div className="flex items-center justify-between gap-4">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder={t("page.searchPlaceholder", { defaultValue: "Search structs by name..." })}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <div className="text-sm text-muted-foreground hidden sm:block">
                    {filteredStructs.length} {filteredStructs.length === 1 ? "struct" : "structs"} found
                </div>
            </div>

            {/* Content Area */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : error ? (
                <div className="flex items-center gap-3 p-4 border border-destructive/20 bg-destructive/10 rounded-lg text-destructive text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>Failed to load project structs. Please refresh or try again later.</span>
                </div>
            ) : filteredStructs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed rounded-xl bg-muted/20 text-center">
                    <div className="p-3 rounded-full bg-muted text-muted-foreground mb-3">
                        <Boxes className="w-8 h-8" />
                    </div>
                    <h3 className="text-base font-semibold">
                        {searchQuery ? "No matching structs found" : "No structs created yet"}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md mt-1 mb-4">
                        {searchQuery
                            ? "Try refining your search keyword."
                            : "Create your first struct to define reusable data contracts (e.g. 3D Coordinates, Material Bindings, Stats) for your project."}
                    </p>
                    {!searchQuery && (
                        <Button
                            onPress={() => openDialog("create-struct", { projectId })}
                            className="flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            {t("actions.createFirst", { defaultValue: "Create First Struct" })}
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredStructs.map((struct) => (
                        <Card
                            key={struct.id}
                            className="hover:border-primary/50 transition-all shadow-sm flex flex-col justify-between"
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-md bg-muted text-primary">
                                            <Boxes className="w-4 h-4" />
                                        </div>
                                        <CardTitle className="text-base font-semibold hover:text-primary transition-colors">
                                            <Link
                                                to={nav.urls.structBuilder(struct.id || "")}
                                            >
                                                {struct.name}
                                            </Link>
                                        </CardTitle>
                                    </div>
                                    <Badge variant="outline" className="text-xs font-mono">
                                        v{struct.activeVersion || 1}
                                    </Badge>
                                </div>
                                <CardDescription className="text-xs flex items-center gap-2 mt-1">
                                    <span>ID: {struct.id ? struct.id.slice(0, 8) : ""}...</span>
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="py-2 space-y-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Layers className="w-3.5 h-3.5" />
                                    <span>
                                        <strong>{struct.fieldCount}</strong> {struct.fieldCount === 1 ? "field" : "fields"} defined
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                    {struct.dependencySchemaIds && struct.dependencySchemaIds.length > 0 ? (
                                        <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                            {struct.dependencySchemaIds.length} {struct.dependencySchemaIds.length === 1 ? "dependency" : "dependencies"}
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="text-xs text-muted-foreground">
                                            Standalone (Primitive)
                                        </Badge>
                                    )}
                                </div>
                            </CardContent>

                            <CardFooter className="pt-3 border-t flex items-center justify-between gap-2">
                                <Link
                                    to={nav.urls.structBuilder(struct.id || "")}
                                    className="flex-1"
                                >
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full flex items-center justify-center gap-1.5 text-xs"
                                    >
                                        <Sliders className="w-3.5 h-3.5" />
                                        {t("actions.editSchema", { defaultValue: "Design Schema" })}
                                    </Button>
                                </Link>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive p-2"
                                    onPress={() =>
                                        openDialog("delete-struct", {
                                            projectId,
                                            structId: struct.id || "",
                                            structName: struct.name || ""
                                        })
                                    }
                                    aria-label="Delete Struct"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
