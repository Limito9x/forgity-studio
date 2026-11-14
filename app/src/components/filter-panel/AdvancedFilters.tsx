import { useState } from "react";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SlidersHorizontalIcon } from "lucide-react";
import type { FieldDefinition } from "@/lib/field-registry";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { FormRenderer } from "../dynamic-form/FormRenderer";
import { Form } from "@/components/form/Form";

interface AdvancedFiltersProps<T extends FieldValues> {
    form: UseFormReturn<T, any, any>;
    fields: FieldDefinition<T>[];
    title?: string;
    onChange?: (values: Record<string, unknown>) => void;
    onClear?: () => void;
    isActive?: boolean;
    className?: string;
}

export function AdvancedFilters<T extends FieldValues>({
    form,
    fields,
    title = "Advanced Filters",
    onChange,
    onClear,
    isActive,
    className,
}: AdvancedFiltersProps<T>) {
    const [open, setOpen] = useState(false);

    const handleApply = (data: T) => {
        onChange?.(data as Record<string, unknown>);
        setOpen(false);
    };

    const handleClear = () => {
        form.reset();
        onChange?.({});
        onClear?.();
        setOpen(false);
    };

    return (
        <PopoverTrigger isOpen={open} onOpenChange={setOpen}>
            <Button
                variant="outline"
                className={cn(
                    "flex items-center gap-2",
                    isActive && "border-primary text-primary",
                    className
                )}
            >
                <SlidersHorizontalIcon className="h-4 w-4" />
                <span>{title}</span>
            </Button>
            <Popover placement="bottom end" className="w-[400px] p-4">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium leading-none">{title}</h4>
                    {isActive && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1 text-muted-foreground hover:text-foreground"
                            onPress={handleClear}
                        >
                            Clear all
                        </Button>
                    )}
                </div>
                <Form form={form} onSubmit={handleApply}>
                    <FormRenderer control={form.control as any} fields={fields as any} />
                    <div className="flex justify-end mt-4">
                        <Button type="submit">
                            Apply Filters
                        </Button>
                    </div>
                </Form>
            </Popover>
        </PopoverTrigger>
    );
}

