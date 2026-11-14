import '@tanstack/react-table';

declare module '@tanstack/react-table' {
    interface ColumnMeta<TData, TValue> {
        label?: string;
        icon?: React.ElementType;
        isRowHeader?: boolean;
        headerClassName?: string;
        className?: string;
    }
}
