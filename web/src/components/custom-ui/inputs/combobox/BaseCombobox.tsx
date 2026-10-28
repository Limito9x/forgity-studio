import type { ReactNode } from 'react';
import { ComboboxProvider, type OptionItem } from './ComboboxContext';
import { SingleCombobox } from './SingleCombobox';
import { MultipleCombobox } from './MultipleCombobox';

// Re-export OptionItem for backward compatibility
export type { OptionItem };

interface SharedComboboxProps<T> {
    items: OptionItem<T>[];
    getItemValue?: (item: OptionItem<T>) => string;
    placeholder?: string;
    emptyText?: string;
    className?: string;
    renderOption?: (item: OptionItem<T>) => ReactNode;
    onSearch?: (searchTerm: string) => void;
    disabled?: boolean;
    isLoading?: boolean;
    id?: string;
    allowCustom?: boolean;
}

export interface BaseSingleComboboxProps<T> extends SharedComboboxProps<T> {
    multiple?: false;
    value?: T | null;
    onValueChange?: (value: T | null) => void;
}

export interface BaseMultipleComboboxProps<T> extends SharedComboboxProps<T> {
    multiple: true;
    value?: T[];
    onValueChange?: (value: T[]) => void;
}

export type BaseComboboxProps<T> = BaseSingleComboboxProps<T> | BaseMultipleComboboxProps<T>;

export function BaseCombobox<T>(props: BaseComboboxProps<T>) {
    // Context props có thể destructure bình thường vì chúng dùng chung (SharedComboboxProps)
    const {
        items,
        getItemValue,
        emptyText = "No results found.",
        renderOption,
        placeholder = "Select option...",
        onSearch,
        className,
        id,
        disabled,
        isLoading,
        allowCustom
    } = props;

    return (
        <ComboboxProvider value={{
            items, getItemValue, emptyText,
            renderOption, placeholder, onSearch, className, id,
            disabled, isLoading, allowCustom
        }}>
            {/* Sử dụng props.multiple để TypeScript tự động narrow (thu hẹp) type của value và onValueChange */}
            {props.multiple ? (
                <MultipleCombobox<T>
                    value={props.value}
                    onValueChange={props.onValueChange}
                />
            ) : (
                <SingleCombobox<T>
                    value={props.value}
                    onValueChange={props.onValueChange}
                />
            )}
        </ComboboxProvider>
    )
}
