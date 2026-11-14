import { BaseCombobox, type OptionItem, type BaseComboboxProps } from './BaseCombobox'
import { useState, useRef, useCallback } from 'react'
import { useDebounce } from '@/hooks/use-debounce'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type ApiComboboxProps<TValue = unknown> = DistributiveOmit<
    BaseComboboxProps<TValue>,
    'items' | 'onSearch'
> & {
    useOptions: (search: string) => { data?: OptionItem<TValue>[]; isLoading: boolean }
    loadingText?: string
}

/**
 * Custom Hook: Quản lý trạng thái tìm kiếm cho Combobox
 */
function useComboboxSearch(delay: number = 300) {
    const [search, setSearch] = useState('')
    const debouncedSearch = useDebounce(search, delay)
    
    const isSelectingRef = useRef(false)

    const handleSearch = useCallback((value: string) => {
        if (!isSelectingRef.current) {
            setSearch(value)
        }
    }, [])

    const handleSelect = useCallback(() => {
        isSelectingRef.current = true
        setSearch('')                 
        
        setTimeout(() => {
            isSelectingRef.current = false
        }, delay + 50) 
    }, [delay])

    const query = isSelectingRef.current ? '' : debouncedSearch;

    return {
        query,
        handleSearch,
        handleSelect
    }
}

/**
 * ApiCombobox
 * Component trung gian xử lý logic gọi API tự động, debounce, và chống giật (jitter prevention).
 * Độc lập hoàn toàn với Form.
 */
export function ApiCombobox<TValue = unknown>({
    useOptions,
    loadingText = 'Loading...',
    emptyText = 'No results found.',
    onValueChange,
    ...rest
}: ApiComboboxProps<TValue>) {
    
    // 1. Tách biệt hoàn toàn logic quản lý ô tìm kiếm và chống nhiễu (debounce)
    const { query, handleSearch, handleSelect } = useComboboxSearch(300);

    // 2. Tự động fetch data dựa trên query "sạch" đã được xử lý
    const { data, isLoading } = useOptions(query);

    // 3. Chống giật (Jitter) UI: Lưu lại data cũ trong lúc đợi API trả về data mới
    const prevOptionsRef = useRef<OptionItem<TValue>[]>([])
    if (data !== undefined) {
        prevOptionsRef.current = data
    }
    const options = data ?? prevOptionsRef.current

    return (
        <BaseCombobox
            {...rest}
            items={options}
            onValueChange={(value: any) => {
                handleSelect();
                (onValueChange as any)?.(value);
            }}
            onSearch={handleSearch}
            emptyText={isLoading ? loadingText : emptyText}
        />
    )
}
