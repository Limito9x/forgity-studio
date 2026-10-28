import { createContext, useContext, type ReactNode } from 'react';

export interface OptionItem<T> {
    value: T;
    label: string;
    disabled?: boolean;
}

export interface ComboboxContextType<T> {
    items: OptionItem<T>[];
    getItemValue?: (item: OptionItem<T>) => string;
    emptyText: string;
    renderOption?: (item: OptionItem<T>) => ReactNode;
    placeholder?: string;
    onSearch?: (searchTerm: string) => void;
    className?: string;
    id?: string;
    isLoading?: boolean;
    disabled?: boolean;
    allowCustom?: boolean;
}

export const ComboboxContext = createContext<ComboboxContextType<any> | undefined>(undefined);

export function ComboboxProvider<T>({
    value,
    children
}: {
    value: ComboboxContextType<T>;
    children: ReactNode
}) {
    return (
        <ComboboxContext.Provider value={value}>
            {children}
        </ComboboxContext.Provider>
    );
}

export function useComboboxContext<T>() {
    const context = useContext(ComboboxContext);
    if (!context) {
        throw new Error("useComboboxContext must be used within a ComboboxProvider");
    }
    return context as ComboboxContextType<T>;
}
