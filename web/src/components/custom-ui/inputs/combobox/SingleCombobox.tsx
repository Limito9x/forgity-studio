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
    const { items, onSearch, id, getItemValue, isLoading, disabled } = useComboboxContext<T>();

    const selectedKey = (() => {
        if (value == null) {
            return null;
        }

        const matchedItem = items.find((item) => item.value === value);
        if (matchedItem) {
            return getItemValue ? getItemValue(matchedItem) : String(matchedItem.value);
        }

        if (typeof value === 'string' || typeof value === 'number') {
            return value;
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

        onValueChange(selectedItem ? selectedItem.value : null);
    };

    return (
        <Combobox
            aria-label="Combobox"
            menuTrigger="focus"
            items={items}
            value={selectedKey}
            onInputChange={onSearch}
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
