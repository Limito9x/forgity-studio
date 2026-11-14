import { useState } from "react";
import { useFieldArray, type Control, type FieldValues } from "react-hook-form";
import type { FieldDefinition } from "@/lib/field-registry";
import { FormRenderer } from "@/components/dynamic-form/FormRenderer";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Boxes, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

export interface FormStructArrayProps<T extends FieldValues = any> {
    control: Control<T>;
    name: string;
    label?: string;
    description?: string;
    structName?: string;
    childFields: FieldDefinition<any>[];
    context?: Record<string, any>;
    isRequired?: boolean;
}

export function FormStructArray<T extends FieldValues>({
    control,
    name,
    label,
    description,
    structName,
    childFields,
    context,
    isRequired,
}: FormStructArrayProps<T>) {
    const { fields, append, remove } = useFieldArray({
        control,
        name: name as any,
    });

    const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

    const toggleCollapse = (id: string) => {
        setCollapsedMap((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const handleAddItem = () => {
        // Khởi tạo item mới với default values cho child fields nếu có
        const newItem: Record<string, any> = {};
        childFields.forEach((cf) => {
            if (cf.defaultValue !== undefined) {
                newItem[cf.name as string] = cf.defaultValue;
            }
        });
        append(newItem as any);
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
                                {fields.length} {fields.length === 1 ? "item" : "items"}
                            </Badge>
                            {structName && (
                                <Badge variant="outline" className="text-xs font-mono font-normal">
                                    {structName}[]
                                </Badge>
                            )}
                        </div>
                        {description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                        )}
                    </div>
                </div>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs font-medium"
                    onClick={handleAddItem}
                >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add {structName || "Item"}</span>
                </Button>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
                {fields.length === 0 ? (
                    <div className="text-center py-6 px-4 border border-dashed rounded-lg text-muted-foreground text-xs space-y-2">
                        <p>No items in this list yet.</p>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={handleAddItem}
                        >
                            <Plus className="w-3 h-3" />
                            Add First Item
                        </Button>
                    </div>
                ) : (
                    fields.map((item, index) => {
                        const isCollapsed = !!collapsedMap[item.id];
                        return (
                            <div
                                key={item.id}
                                className="border border-border/60 rounded-md bg-background/80 overflow-hidden shadow-2xs"
                            >
                                <div className="py-2 px-3 flex items-center justify-between border-b bg-muted/15">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => toggleCollapse(item.id)}
                                        >
                                            {isCollapsed ? (
                                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                            )}
                                        </Button>
                                        <span className="font-medium text-xs text-muted-foreground">
                                            #{index + 1}
                                        </span>
                                        {structName && (
                                            <span className="text-xs font-mono text-foreground/80">
                                                {structName}
                                            </span>
                                        )}
                                    </div>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive transition-colors"
                                        onClick={() => remove(index)}
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
                                                namePrefix={`${name}.${index}`}
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
