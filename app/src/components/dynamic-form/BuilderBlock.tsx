import { useMemo } from 'react'
import { useWatch, type Control } from 'react-hook-form'
import { getFieldRegistration, getFieldRegistry } from '@/lib/field-registry'
import { FormInput } from '@/components/form-controls/FormInput'
import { FormSelect } from '@/components/form-controls/FormSelect'
import { FormTextarea } from '@/components/form-controls/FormTextarea'
import { FormSwitch } from '@/components/form-controls/FormSwitch'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Trash2, GripVertical, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function normalizeTypeName(type: string): string {
    return type
        .replace(/([A-Z])/g, ' $1')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim()
}

interface BuilderBlockProps {
    control: Control<any>
    index: number
    onRemove: () => void
    availableTypes?: { label: string; value: string }[]
    namePrefix?: string,
    builderContext?: Record<string, any>
}

export function BuilderBlock({
    control,
    index,
    onRemove,
    availableTypes,
    namePrefix = "fields",
    builderContext
}: BuilderBlockProps) {
    const currentField = useWatch({ control, name: `${namePrefix}.${index}` });
    const type = currentField?.type;
    const registration = getFieldRegistration(type || "text");

    const resolvedAvailableTypes = useMemo(() => {
        if (availableTypes) return availableTypes;
        return Array.from(getFieldRegistry().entries())
            .filter(([_, reg]) => reg.isAvailable !== false)
            .map(([k]) => ({ label: normalizeTypeName(k), value: k }));
    }, [availableTypes]);

    const builderFields = useMemo(() => {
        const fields = registration?.builderFields || [];
        return [...fields].sort((a, b) => (b.isRequired ? 1 : 0) - (a.isRequired ? 1 : 0));
    }, [registration]);

    const requiredSpecs = useMemo(() => builderFields.filter(s => s.isRequired), [builderFields]);
    const totalRequired = requiredSpecs.length;

    const satisfiedRequired = useMemo(() => {
        return requiredSpecs.filter(s => {
            const val = currentField?.properties?.[s.name] ?? currentField?.config?.[s.name] ?? currentField?.rules?.[s.name];
            if (Array.isArray(val)) return val.length > 0;
            return val !== undefined && val !== null && val !== "";
        }).length;
    }, [requiredSpecs, currentField]);

    // Tách riêng required ra khỏi Advanced để hiện chung ở base info nếu muốn,
    // nhưng theo kế hoạch mới thì để chung Advanced Config là ok.

    return (
        <div className="border border-border/50 dark:border-blue-900/30 rounded-xl bg-card p-4 shadow-sm relative group transition-all hover:border-blue-300 dark:hover:border-blue-700/50">
            {/* Header Hành Động */}
            <div className="absolute right-2 top-2 flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-md p-1 shadow-sm border">
                <button type="button" onClick={onRemove} className="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors" title="Delete field">
                    <Trash2 className="w-4 h-4" />
                </button>
                <div className="p-1.5 cursor-grab text-muted-foreground hover:bg-accent rounded-md transition-colors" title="Drag to reorder">
                    <GripVertical className="w-4 h-4" />
                </div>
            </div>

            <div className="flex flex-col gap-4">
                {/* Dòng 1: Label và Type */}
                <div className="flex items-start gap-4 pr-16">
                    <div className="flex-1">
                        <FormInput
                            control={control}
                            name={`${namePrefix}.${index}.label`}
                            label="Label"
                            placeholder="Label..."
                        />
                    </div>

                    <div className="w-[220px] shrink-0">
                        <FormSelect
                            control={control}
                            name={`${namePrefix}.${index}.type`}
                            label="Field Type"
                            options={resolvedAvailableTypes}
                        />
                    </div>
                </div>

                {/* Dòng 2: Description & Default Value */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormTextarea
                        control={control}
                        name={`${namePrefix}.${index}.description`}
                        label="Description (Optional)"
                        placeholder="Describe what this field is for..."
                        className="min-h-[40px] resize-none"
                    />
                    <div className="flex flex-col gap-4">

                        <FormSwitch
                            control={control}
                            name={`${namePrefix}.${index}.properties.required`}
                            label="Required field?"
                        />
                    </div>
                </div>

                {/* Advanced Config Collapsible */}
                {builderFields.length > 0 && (
                    <Collapsible
                        key={type}
                        className="group/collapsible border rounded-lg bg-muted/20"
                        defaultExpanded={totalRequired > 0 && satisfiedRequired < totalRequired}
                    >
                        <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg">
                            <span className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                <span>Advanced Configuration</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                                    {builderFields.length} settings
                                </span>
                                {totalRequired > 0 && (
                                    <span className={cn(
                                        "text-xs px-2 py-0.5 rounded-full border",
                                        satisfiedRequired === totalRequired
                                            ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                                            : "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800"
                                    )}>
                                        {satisfiedRequired}/{totalRequired} required
                                    </span>
                                )}
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[expanded]/collapsible:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-4 pb-4 pt-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {builderFields.map((spec) => {
                                    const fieldPath = `${namePrefix}.${index}.properties.${spec.name}`;
                                    const fieldReg = getFieldRegistration(spec.fieldType);
                                    if (!fieldReg) return <div key={spec.name} className="text-red-500 text-sm">Error: Unknown fieldType "{spec.fieldType}"</div>;

                                    const resolvedFieldConfig = spec.resolverFieldConfig ?
                                        spec.resolverFieldConfig(builderContext) : (spec.fieldConfig || {});

                                    const Component = fieldReg.component;
                                    return (
                                        <div key={spec.name} className="col-span-1">
                                            <Component
                                                control={control}
                                                name={fieldPath}
                                                label={spec.label || normalizeTypeName(spec.name)}
                                                description={spec.description}
                                                isRequired={spec.isRequired}
                                                {...(spec.fieldConfig || {})}
                                                {...resolvedFieldConfig}
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                )}
            </div>
        </div>
    )
}
