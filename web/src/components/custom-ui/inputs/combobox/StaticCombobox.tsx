import { BaseCombobox, type OptionItem, type BaseComboboxProps } from './BaseCombobox'
import { useState } from 'react'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type StaticComboboxProps<TValue = unknown> = DistributiveOmit<
    BaseComboboxProps<TValue>,
    'items' | 'onSearch'
> & {
    options: (OptionItem<TValue> | string)[]
    isLoading?: boolean
    loadingText?: string
    allowCustom?: boolean
}

/**
 * StaticCombobox
 * Component xử lý filter phía client cho dữ liệu tĩnh.
 * Độc lập hoàn toàn với Form.
 */
export function StaticCombobox<TValue = unknown>({
    options,
    isLoading = false,
    loadingText = 'Loading...',
    emptyText = 'No results found.',
    onValueChange,
    allowCustom,
    ...rest
}: StaticComboboxProps<TValue>) {
    const [search, setSearch] = useState('');

    const normalizedOptions: OptionItem<TValue>[] = (options || []).map(opt =>
        typeof opt === "string" ? { label: opt, value: opt as unknown as TValue } : opt
    );

    const filteredOptions = normalizedOptions.filter(item => 
        item.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <BaseCombobox
            {...rest as any}
            items={filteredOptions}
            onValueChange={onValueChange as any}
            onSearch={setSearch}
            emptyText={isLoading ? loadingText : emptyText}
            allowCustom={allowCustom}
        />
    )
}
