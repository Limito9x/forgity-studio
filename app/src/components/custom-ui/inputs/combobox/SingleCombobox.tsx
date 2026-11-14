import { Combobox, ComboboxInput, useComboboxAnchor } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { BaseComboboxContent } from './BaseComboboxContent';
import { useComboboxContext } from './ComboboxContext';

import type { BaseSingleComboboxProps } from './BaseCombobox';
import type { Key } from 'react';

export type SingleComboboxProps<T> = Omit<BaseSingleComboboxProps<T>, 'items' | 'emptyText' | 'renderOption' | 'getItemValue' | 'multiple'>;

export function SingleCombobox<T>({
    value,
    onValueChange,
    placeholder = "Select option...",
    className,
}: SingleComboboxProps<T>) {
    const anchor = useComboboxAnchor();
    const { items, onSearch, id, getItemValue, isLoading, disabled, allowCustom } = useComboboxContext<T>();

    const selectedKey = (() => {
        if (value == null) {
            return null;
        }

        const matchedItem = items.find((item) => item.value === value);
        if (matchedItem) {
            return getItemValue ? getItemValue(matchedItem) : String(matchedItem.value);
        }

        if (typeof value === 'string' || typeof value === 'number') {
            return String(value);
        }

        return null;
    })();

    const handleSelectionChange = (key: Key | null) => {
        if (!onValueChange) {
            return;
        }

        if (key == null) {
            onValueChange(null);
            return;
        }

        const selectedItem = items.find((item) => {
            if (getItemValue) {
                return getItemValue(item) === key;
            }

            return item.value === key;
        });

        if (selectedItem) {
            onValueChange(selectedItem.value);
        } else if (allowCustom) {
            onValueChange(String(key) as unknown as T);
        } else {
            onValueChange(null);
        }
    };

    const handleInputChange = (text: string) => {
        onSearch?.(text);
        if (allowCustom && onValueChange) {
            onValueChange((text || null) as unknown as T);
        }
    };

    return (
        <Combobox
            aria-label="Combobox"
            menuTrigger="focus"
            items={items}
            value={selectedKey}
            allowsCustomValue={allowCustom}
            onInputChange={handleInputChange}
            onChange={handleSelectionChange}
            id={id}
            isDisabled={disabled || isLoading}
        >
            <div ref={anchor} className={cn("w-full", className)}>
                <ComboboxInput placeholder={placeholder} showTrigger showClear isLoading={isLoading} disabled={disabled} />
            </div>

            <BaseComboboxContent anchor={anchor} />
        </Combobox>
    );
}
