import { useState } from "react";
import { useWatch, useFormContext, type Control, type FieldValues } from "react-hook-form";
import type { FieldDefinition } from "@/lib/field-registry";
import { FormRenderer } from "@/components/dynamic-form/FormRenderer";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Boxes, Plus, Trash2, ChevronDown, ChevronRight, Key } from "lucide-react";

export interface FormStructMapProps<T extends FieldValues = any> {
    control: Control<T>;
    name: string;
    label?: string;
    description?: string;
    structName?: string;
    childFields: FieldDefinition<any>[];
    context?: Record<string, any>;
    isRequired?: boolean;
}

export function FormStructMap<T extends FieldValues>({
    control,
    name,
    label,
    description,
    structName,
    childFields,
    context,
    isRequired,
}: FormStructMapProps<T>) {
    const { setValue, unregister } = useFormContext();
    const mapValue = (useWatch({ control: control as any, name: name as any }) || {}) as Record<string, any>;

    const [newKey, setNewKey] = useState("");
    const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

    const entries = Object.keys(mapValue);

    const toggleCollapse = (key: string) => {
        setCollapsedMap((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleAddKey = () => {
        const trimmedKey = newKey.trim();
        if (!trimmedKey) return;
        if (mapValue[trimmedKey] !== undefined) return;

        const initialVal: Record<string, any> = {};
        childFields.forEach((cf) => {
            if (cf.defaultValue !== undefined) {
                initialVal[cf.name as string] = cf.defaultValue;
            }
        });

        setValue(`${name}.${trimmedKey}`, initialVal, { shouldValidate: true, shouldDirty: true });
        setNewKey("");
    };

    const handleRemoveKey = (key: string) => {
        unregister(`${name}.${key}`);
        const updated = { ...mapValue };
        delete updated[key];
        setValue(name, updated, { shouldValidate: true, shouldDirty: true });
    };

    return (
        <Card className="border border-border/80 shadow-xs bg-card/60">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b bg-muted/20">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                        <Boxes className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">
                                {label || name}
                            </span>
                            {isRequired && (
                                <span className="text-destructive font-bold text-xs">*</span>
                            )}
                            <Badge variant="secondary" className="text-xs font-normal">
                                {entries.length} {entries.length === 1 ? "entry" : "entries"}
                            </Badge>
                            {structName && (
                                <Badge variant="outline" className="text-xs font-mono font-normal">
                                    Map&lt;string, {structName}&gt;
                                </Badge>
                            )}
                        </div>
                        {description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Key className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Enter entry key (e.g. head, slot_1)..."
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddKey();
                                }
                            }}
                            className="h-8 pl-8 text-xs font-mono"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        isDisabled={!newKey.trim() || mapValue[newKey.trim()] !== undefined}
                        onClick={handleAddKey}
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Key
                    </Button>
                </div>

                {entries.length === 0 ? (
                    <div className="text-center py-6 px-4 border border-dashed rounded-lg text-muted-foreground text-xs">
                        No map entries yet. Enter a key above to add a new entry.
                    </div>
                ) : (
                    entries.map((key) => {
                        const isCollapsed = !!collapsedMap[key];
                        return (
                            <div
                                key={key}
                                className="border border-border/60 rounded-md bg-background/80 overflow-hidden shadow-2xs"
                            >
                                <div className="py-2 px-3 flex items-center justify-between border-b bg-muted/15">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => toggleCollapse(key)}
                                        >
                                            {isCollapsed ? (
                                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                            )}
                                        </Button>
                                        <Badge variant="outline" className="font-mono text-xs bg-muted/40">
                                            {key}
                                        </Badge>
                                        {structName && (
                                            <span className="text-xs font-mono text-muted-foreground">
                                                : {structName}
                                            </span>
                                        )}
                                    </div>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive transition-colors"
                                        onClick={() => handleRemoveKey(key)}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>

                                {!isCollapsed && (
                                    <div className="p-3">
                                        {childFields.length === 0 ? (
                                            <p className="text-xs text-muted-foreground italic">
                                                No fields configured for this struct.
                                            </p>
                                        ) : (
                                            <FormRenderer
                                                control={control as any}
                                                fields={childFields}
                                                context={context}
                                                namePrefix={`${name}.${key}`}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </CardContent>
        </Card>
    );
}
