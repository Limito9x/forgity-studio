import { useState, useEffect, useId } from "react";
import { BaseFormField } from "./BaseFormField";
import { registerField } from "@/lib/field-registry";
import { z } from "zod";
import type { BaseFormControlProps, OmitFormProps } from "./type";
import type { FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

interface KeyValueRow {
    id: string;
    key: string;
    value: string;
}

export interface FormKeyValueProps<T extends FieldValues>
    extends BaseFormControlProps<T>,
    OmitFormProps<React.HTMLAttributes<HTMLDivElement>> {
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    isDisabled?: boolean;
}

function KeyValueInputContent({
    value,
    onChange,
    isDisabled,
    keyPlaceholder,
    valuePlaceholder,
}: {
    value?: Record<string, string> | null;
    onChange: (val: Record<string, string>) => void;
    isDisabled?: boolean;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    suggestions?: string[];
}) {
    const datalistId = useId();

    const recordToRows = (rec?: Record<string, string> | null): KeyValueRow[] => {
        if (!rec || typeof rec !== "object") return [];
        return Object.entries(rec).map(([k, v], idx) => ({
            id: `${idx}_${k}`,
            key: k,
            value: String(v ?? ""),
        }));
    };

    const [rows, setRows] = useState<KeyValueRow[]>(() => recordToRows(value));

    useEffect(() => {
        const currentObj: Record<string, string> = {};
        for (const r of rows) {
            if (r.key.trim()) {
                currentObj[r.key.trim()] = r.value;
            }
        }

        const externalObj = value && typeof value === "object" ? value : {};
        const isDiff = JSON.stringify(currentObj) !== JSON.stringify(externalObj);

        if (isDiff) {
            setRows(recordToRows(value));
        }
    }, [value]);

    const emitChange = (newRows: KeyValueRow[]) => {
        setRows(newRows);
        const result: Record<string, string> = {};
        for (const r of newRows) {
            const trimmedKey = r.key.trim();
            if (trimmedKey) {
                result[trimmedKey] = r.value;
            }
        }
        onChange(result);
    };

    const handleAddRow = () => {
        const newRow: KeyValueRow = {
            id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            key: "",
            value: "",
        };
        emitChange([...rows, newRow]);
    };

    const handleRemoveRow = (id: string) => {
        const newRows = rows.filter((r) => r.id !== id);
        emitChange(newRows);
    };

    const handleKeyChange = (id: string, newKey: string) => {
        const newRows = rows.map((r) => (r.id === id ? { ...r, key: newKey } : r));
        emitChange(newRows);
    };

    const handleValueChange = (id: string, newVal: string) => {
        const newRows = rows.map((r) => (r.id === id ? { ...r, value: newVal } : r));
        emitChange(newRows);
    };

    return (
        <div className="space-y-2.5">
            {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-4 border border-dashed rounded-lg border-border/70 bg-card/30 text-center">
                    <p className="text-xs text-muted-foreground mb-2">
                        No entries yet. Click Add to create a new row.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddRow}
                        isDisabled={isDisabled}
                        className="h-8 gap-1.5 text-xs"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Row
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_1.2fr_auto] gap-2 px-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        <span>Tag / Key</span>
                        <span>Parameter Name</span>
                        <span className="w-8" />
                    </div>

                    <div className="space-y-1.5">
                        {rows.map((row) => (
                            <div key={row.id} className="grid grid-cols-[1fr_1.2fr_auto] gap-2 items-center">
                                <Input
                                    type="text"
                                    list={datalistId}
                                    value={row.key}
                                    placeholder={keyPlaceholder ?? ""}
                                    disabled={isDisabled}
                                    onChange={(e) => handleKeyChange(row.id, e.target.value)}
                                    className="h-8 text-xs font-mono"
                                />
                                <Input
                                    type="text"
                                    value={row.value}
                                    placeholder={valuePlaceholder ?? ""}
                                    disabled={isDisabled}
                                    onChange={(e) => handleValueChange(row.id, e.target.value)}
                                    className="h-8 text-xs font-mono"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    isDisabled={isDisabled}
                                    onClick={() => handleRemoveRow(row.id)}
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        ))}
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddRow}
                        isDisabled={isDisabled}
                        className="h-7 gap-1 text-xs mt-1"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add Row
                    </Button>
                </div>
            )}
        </div>
    );
}

export function FormKeyValue<T extends FieldValues>({
    isDisabled,
    keyPlaceholder,
    valuePlaceholder,
    ...rest
}: FormKeyValueProps<T>) {
    return (
        <BaseFormField
            {...rest}
            render={({ value, onChange }) => (
                <KeyValueInputContent
                    value={value}
                    onChange={onChange}
                    isDisabled={isDisabled}
                    keyPlaceholder={keyPlaceholder}
                    valuePlaceholder={valuePlaceholder}
                />
            )}
        />
    );
}

export interface FormKeyValueProperties {
    required?: boolean;
    requiredMsg?: string;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    suggestions?: string[];
}

declare module "@/lib/field-registry" {
    interface GlobalFieldRegistry {
        "key-value": {
            properties: FormKeyValueProperties;
            defaultValue: Record<string, string>;
        };
    }
}

registerField({
    type: "key-value",
    component: FormKeyValue,
    buildSchema: (p: FormKeyValueProperties, field?: any) => {
        const reqMsg = p.requiredMsg || `${field?.label || field?.name || "This field"} is required`;
        let s = z.record(z.string(), z.string(), { message: reqMsg });
        if (p.required) {
            s = s.refine((val) => val && Object.keys(val).length > 0, { message: reqMsg });
        }
        if (!p.required) return s.optional().nullable();
        return s;
    },
    builderFields: [],
});
