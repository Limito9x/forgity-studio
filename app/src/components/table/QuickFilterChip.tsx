import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// ─── Shared option type ───────────────────────────────────────────────────────
export interface FilterOption {
    value: string;
    label: string;
    /** Optional badge color class (e.g. "bg-emerald-500") cho static options */
    badgeColor?: string;
}

// ─── QuickFilterSelect ────────────────────────────────────────────────────────
// Dùng cho options nhỏ, static (không cần search) — ví dụ: status, role
interface QuickFilterSelectProps {
    label: string;
    value: string | undefined;
    options: FilterOption[];
    onChange: (value: string | undefined) => void;
    className?: string;
}

/**
 * QuickFilterSelect
 *
 * Chip-style filter dùng Select component — phù hợp cho options nhỏ, static.
 * Static options được badge màu để phân biệt trực quan (theo design note).
 */
export function QuickFilterSelect({
    label,
    value,
    options,
    onChange,
    className,
}: QuickFilterSelectProps) {
    const selected = options.find((o) => o.value === value);

    return (
        <Select
            selectedKey={value || null}
            onSelectionChange={(val: any) => onChange(val === "__all__" ? undefined : val)}
        >
            <SelectTrigger
                className={cn(
                    "h-8 gap-1.5 rounded-full border-dashed px-3 text-sm font-medium transition-colors",
                    value
                        ? "border-primary/60 bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
                    className
                )}
            >
                {/* Badge màu cho selected option */}
                {selected?.badgeColor && (
                    <span
                        className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            selected.badgeColor
                        )}
                    />
                )}
                <SelectValue>
                    {({ selectedText }) => selectedText || label}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                {/* Option "All" để clear filter */}
                <SelectItem id="__all__" className="text-muted-foreground italic">
                    All {label}
                </SelectItem>
                {options.map((opt) => (
                    <SelectItem key={opt.value} id={opt.value}>
                        <div className="flex items-center gap-2">
                            {opt.badgeColor && (
                                <span
                                    className={cn(
                                        "h-2 w-2 rounded-full",
                                        opt.badgeColor
                                    )}
                                />
                            )}
                            {opt.label}
                        </div>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
