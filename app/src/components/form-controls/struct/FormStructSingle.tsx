import { useState } from "react";
import type { Control, FieldValues } from "react-hook-form";
import type { FieldDefinition } from "@/lib/field-registry";
import { FormRenderer } from "@/components/dynamic-form/FormRenderer";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Boxes, ChevronDown, ChevronRight } from "lucide-react";

export interface FormStructSingleProps<T extends FieldValues = any> {
    control: Control<T>;
    name: string;
    label?: string;
    description?: string;
    structName?: string;
    childFields: FieldDefinition<any>[];
    context?: Record<string, any>;
    isRequired?: boolean;
}

export function FormStructSingle<T extends FieldValues>({
    control,
    name,
    label,
    description,
    structName,
    childFields,
    context,
    isRequired,
}: FormStructSingleProps<T>) {
    const [isExpanded, setIsExpanded] = useState(true);

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
                            {structName && (
                                <Badge variant="outline" className="text-xs font-mono font-normal">
                                    {structName}
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
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setIsExpanded((prev) => !prev)}
                >
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                </Button>
            </CardHeader>

            {isExpanded && (
                <CardContent className="p-4">
                    {childFields.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                            No fields configured for this struct.
                        </p>
                    ) : (
                        <FormRenderer
                            control={control as any}
                            fields={childFields}
                            context={context}
                            namePrefix={name}
                        />
                    )}
                </CardContent>
            )}
        </Card>
    );
}
