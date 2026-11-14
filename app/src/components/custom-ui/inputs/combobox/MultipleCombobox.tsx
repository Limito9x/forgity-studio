import {
    Combobox,
    ComboboxChips,
    ComboboxChipsInput,
    useComboboxAnchor
} from '@/components/ui/combobox'
import { cn } from '@/lib/utils';
import { BaseComboboxContent } from './BaseComboboxContent';
import { useComboboxContext } from './ComboboxContext';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';

import type { BaseMultipleComboboxProps } from './BaseCombobox';

export type MultipleComboboxProps<T> = Omit<BaseMultipleComboboxProps<T>, 'items' | 'emptyText' | 'renderOption' | 'getItemValue' | 'multiple'>;

export function MultipleCombobox<T>({
    value,
    onValueChange,
    placeholder = "Select option...",
    className
}: MultipleComboboxProps<T>) {
    const anchor = useComboboxAnchor();
    const { items, onSearch, id } = useComboboxContext<T>();

    const handleSelectionChange = (key: any) => {
        if (!key) return;
        if (onValueChange) {
            const currentSelected = Array.isArray(value) ? value : (value ? [value] : []);
            if (!currentSelected.includes(key)) {
                onValueChange([...currentSelected, key]);
            }
        }
    }

    const removeSelectedItem = (keyToRemove: any) => {
        if (onValueChange && Array.isArray(value)) {
            onValueChange(value.filter(v => v !== keyToRemove));
        }
    }

    const selectedItems = Array.isArray(value) ? items.filter(item => value.includes(item.value)) : [];

    return (
        <Combobox
            aria-label="Combobox"
            menuTrigger="focus"
            items={items}
            selectedKey={null}
            onSelectionChange={handleSelectionChange}
            onInputChange={onSearch}
            id={id}
        >
            <div ref={anchor} className={cn("w-full", className)}>
                <ComboboxChips>
                    {selectedItems.map((selectedItem) => (
                        <div 
                            key={String(selectedItem.value)} 
                            className="flex h-[calc(var(--spacing)*4.75)] w-fit items-center justify-center gap-1 rounded-[calc(var(--radius-sm)-2px)] bg-muted-foreground/10 pl-1.5 pr-0 text-xs/relaxed font-medium whitespace-nowrap text-foreground"
                        >
                            {selectedItem.label}
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                className="-ml-1 opacity-50 hover:opacity-100"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    removeSelectedItem(selectedItem.value);
                                }}
                            >
                                <XIcon className="pointer-events-none size-3.5" />
                            </Button>
                        </div>
                    ))}
                    <ComboboxChipsInput placeholder={placeholder} />
                </ComboboxChips>
            </div>

            <BaseComboboxContent anchor={anchor} />
        </Combobox>
    )
}

