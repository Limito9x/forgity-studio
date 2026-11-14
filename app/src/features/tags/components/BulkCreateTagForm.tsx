import { useEffect, useMemo } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { bulkCreateTagSchema, type BulkCreateTagInput } from "../schemas/bulkCreateTagSchema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, Copy, Dices, Plus, Trash2 } from "lucide-react";
import { Form } from "@/components/form";

export const PRESET_COLORS = [
    "#3b82f6",
    "#10b981",
    "#8b5cf6",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
    "#ec4899",
    "#64748b",
] as const;

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function randomDistinctColor(used: string[]): string {
    const usedSet = new Set(used.map((c) => c.toLowerCase()));
    let h = Math.random() * 360;
    for (let i = 0; i < 24; i++) {
        h = (h + 137.508) % 360;
        const s = 72 + Math.random() * 18;
        const ll = 52 + Math.random() * 8;
        const hex = hslToHex(h, s, ll);
        if (!usedSet.has(hex.toLowerCase())) return hex;
    }
    return hslToHex(h, 78, 55);
}

interface BulkCreateTagFormProps {
    projectId: string;
    parentPath?: string;
    formId?: string;
    onSubmit: (values: BulkCreateTagInput) => void;
}

export function BulkCreateTagForm({ projectId: _projectId, parentPath, formId = "bulk-create-tag-form", onSubmit }: BulkCreateTagFormProps) {
    void _projectId;
    const form = useForm<BulkCreateTagInput>({
        resolver: zodResolver(bulkCreateTagSchema),
        defaultValues: {
            rows: [{ name: "", color: PRESET_COLORS[0] }],
        },
    });

    const { fields, append, remove, update } = useFieldArray({
        control: form.control,
        name: "rows",
    });

    const watchedRows = form.watch("rows");
    const usedColors = useMemo(() => (watchedRows ?? []).map((r) => (r.color as string) ?? "").filter(Boolean), [watchedRows]);

    useEffect(() => {
        if (fields.length === 0) append({ name: "", color: randomDistinctColor(usedColors) });
    }, [fields.length, append, usedColors]);

    const normalizeBulkName = (raw: string) =>
        raw
            .trim()
            .replace(/[\/\\]+/g, ".")
            .replace(/\.+/g, ".")
            .replace(/^\.+|\.+$/g, "")
            .split(".")
            .map((seg) => seg.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, ""))
            .filter(Boolean)
            .join(".");

    const handlePasteNames = (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
        const text = e.clipboardData.getData("text");
        if (!text.includes("\n")) return;
        e.preventDefault();
        const lines = text
            .split(/\r?\n/)
            .map((s) => normalizeBulkName(s))
            .filter(Boolean)
            .slice(0, 50 - fields.length + 1);
        if (lines.length === 0) return;
        const first = lines[0];
        const currentColor = (form.getValues(`rows.${index}.color`) as string) ?? PRESET_COLORS[0];
        update(index, { name: first, color: currentColor });
        const baseUsed = [...usedColors];
        for (let i = 1; i < lines.length; i++) {
            const distinct = randomDistinctColor(baseUsed);
            baseUsed.push(distinct);
            append({ name: lines[i], color: distinct });
        }
    };

    const addRow = () => {
        if (fields.length >= 50) return;
        const distinct = randomDistinctColor(usedColors);
        append({ name: "", color: distinct });
    };

    const duplicateRow = (index: number) => {
        const row = form.getValues(`rows.${index}`);
        const color = (row.color as string) ?? randomDistinctColor(usedColors);
        const insertAt = index + 1;
        const current = form.getValues("rows");
        const next = [...current.slice(0, insertAt), { name: row.name, color }, ...current.slice(insertAt)];
        if (next.length > 50) return;
        form.setValue("rows", next as BulkCreateTagInput["rows"]);
    };

    return (
        <Form form={form} formId={formId} onSubmit={onSubmit}>
            <div className="space-y-3">
                {parentPath ? (
                    <p className="text-xs text-muted-foreground font-mono break-all">{parentPath}.<span className="text-foreground">—</span></p>
                ) : null}

                <div className="rounded-lg border border-border/70 overflow-hidden">
                    <div className="max-h-[48vh] overflow-auto">
                        <div className="divide-y divide-border/60">
                            {fields.map((field, index) => {
                                const rawVal = form.watch(`rows.${index}.name`) || "—";
                                const fullPath = rawVal === "—" ? "—" : parentPath ? `${parentPath}.${rawVal}` : rawVal;
                                const selectedColor = (form.watch(`rows.${index}.color`) as string) ?? PRESET_COLORS[0];
                                return (
                                    <div key={field.id} className="flex items-start gap-2 p-2.5 bg-card">
                                        <span className="text-[11px] font-mono text-muted-foreground w-5 pt-2 text-right shrink-0">{index + 1}</span>

                                        <div className="flex-1 min-w-0 space-y-1">
                                            <Controller
                                                control={form.control}
                                                name={`rows.${index}.name`}
                                                render={({ field: f, fieldState }) => (
                                                    <div>
                                                        <Input
                                                            {...f}
                                                            placeholder="Textures.Skin_Normal or Skin_Normal"
                                                            className={cn("h-8 text-xs font-mono", fieldState.error && "border-destructive")}
                                                            onPaste={(e) => handlePasteNames(e, index)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter" && index === fields.length - 1) {
                                                                    e.preventDefault();
                                                                    addRow();
                                                                }
                                                            }}
                                                            onBlur={(e) => {
                                                                const normalized = normalizeBulkName(e.target.value);
                                                                if (normalized !== e.target.value) f.onChange(normalized);
                                                                f.onBlur();
                                                            }}
                                                        />
                                                        {fieldState.error ? (
                                                            <p className="text-[11px] text-destructive mt-1">{fieldState.error.message}</p>
                                                        ) : (
                                                            <p className="text-[11px] text-muted-foreground font-mono break-all line-clamp-2 mt-1">{fullPath}</p>
                                                        )}
                                                    </div>
                                                )}
                                            />
                                        </div>

                                        <PopoverTrigger>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8 rounded-full p-0 shrink-0 mt-0.5 border-2 shadow-xs"
                                                style={{ backgroundColor: selectedColor }}
                                                aria-label={`Color ${selectedColor}`}
                                            >
                                                <span className="sr-only">{selectedColor}</span>
                                            </Button>
                                            <Popover placement="bottom" className="w-64 p-3 gap-3">
                                                <div className="grid grid-cols-4 gap-2">
                                                    {PRESET_COLORS.map((c) => {
                                                        const active = selectedColor.toLowerCase() === c.toLowerCase();
                                                        return (
                                                            <button
                                                                key={c}
                                                                type="button"
                                                                onClick={() => form.setValue(`rows.${index}.color`, c, { shouldDirty: true })}
                                                                className={cn(
                                                                    "h-9 rounded-lg flex items-center justify-center transition-all shadow-xs cursor-pointer border",
                                                                    active ? "ring-2 ring-foreground ring-offset-1" : "hover:scale-105 border-transparent"
                                                                )}
                                                                style={{ backgroundColor: c }}
                                                                aria-label={`Preset ${c}`}
                                                            >
                                                                {active && <Check className="w-4 h-4 text-white drop-shadow" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full gap-1.5 h-8 text-xs"
                                                    onClick={() => {
                                                        const distinct = randomDistinctColor(usedColors.filter((c) => c.toLowerCase() !== selectedColor.toLowerCase()));
                                                        form.setValue(`rows.${index}.color`, distinct, { shouldDirty: true });
                                                    }}
                                                >
                                                    <Dices className="w-3.5 h-3.5" /> Random distinct
                                                </Button>
                                            </Popover>
                                        </PopoverTrigger>

                                        <div className="flex items-center gap-1 shrink-0 pt-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => duplicateRow(index)}
                                                aria-label="Duplicate row"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                onClick={() => remove(index)}
                                                isDisabled={fields.length === 1}
                                                aria-label="Remove row"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-2 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{fields.length}/50 rows</span>
                        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addRow}>
                            <Plus className="w-3.5 h-3.5" /> Add row
                        </Button>
                    </div>
                </div>

            </div>
        </Form>
    );
}
