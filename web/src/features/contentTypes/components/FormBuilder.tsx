import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { BuilderBlock } from "@/components/dynamic-form/BuilderBlock";

export function FormBuilder({ builderContext }: { builderContext?: Record<string, any> }) {
    const { t } = useTranslation("contentTypes");
    const { control } = useFormContext();
    const { fields, append, remove } = useFieldArray({
        control,
        name: "fieldsConfig",
    });

    return (
        <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold">
                        {t("fields.schemaBuilder", { defaultValue: "Fields Configuration" })}
                    </CardTitle>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-normal">
                        {fields.length} {fields.length === 1 ? "field" : "fields"}
                    </span>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                {fields.length === 0 && (
                    <div className="text-center py-6 px-4 border border-dashed rounded-lg text-muted-foreground text-sm">
                        {t("messages.noFields", { defaultValue: "No fields configured yet. Click 'Add Field' below to start." })}
                    </div>
                )}
                {fields.map((field, index) => (
                    <BuilderBlock
                        key={field.id}
                        control={control}
                        index={index}
                        onRemove={() => remove(index)}
                        namePrefix="fieldsConfig"
                        builderContext={builderContext}
                    />
                ))}

                <Button
                    type="button"
                    variant="outline"
                    className="w-full border-dashed py-3 h-auto hover:border-primary/50 hover:bg-accent/50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                    onClick={() => append({ name: "", label: "", type: "text", properties: { required: false } })}
                >
                    <Plus className="w-4 h-4" />
                    {t("actions.addField", { defaultValue: "Add Field" })}
                </Button>
            </CardContent>
        </Card>
    );
}
