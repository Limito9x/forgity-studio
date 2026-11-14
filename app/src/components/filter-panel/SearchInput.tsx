import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    onClear: () => void;
    placeholder?: string;
    className?: string;
}

export function SearchInput({
    value,
    onChange,
    onClear,
    placeholder = "Search by name...",
    className,
}: SearchInputProps) {
    const [localValue, setLocalValue] = useState(value);

    // Đồng bộ state cục bộ khi value từ URL/parent thay đổi
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Debounce việc gọi onChange (đẩy lên parent/URL)
    useEffect(() => {
        const handler = setTimeout(() => {
            if (localValue !== value) {
                onChange(localValue);
            }
        }, 300);

        return () => clearTimeout(handler);
    }, [localValue, onChange, value]);

    const handleClear = () => {
        setLocalValue("");
        onClear();
    };

    return (
        <div className={cn("relative inline-block min-w-[200px]", className)}>
            {/* Invisible dummy to auto-size container width based on placeholder text */}
            <div className="invisible pl-10 pr-8 select-none whitespace-pre text-sm font-normal h-10 flex items-center pointer-events-none">
                {placeholder}
            </div>

            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
            <Input
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                placeholder={placeholder}
                className="absolute inset-0 w-full h-full pl-9 pr-8"
            />
            {localValue && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
                    aria-label="Clear search"
                >
                    <XIcon className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}