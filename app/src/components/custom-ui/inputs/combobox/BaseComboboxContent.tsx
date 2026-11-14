import {
    ComboboxContent,
    ComboboxEmpty,
    ComboboxItem,
    ComboboxList
} from '@/components/ui/combobox';
import { useComboboxContext, type OptionItem } from './ComboboxContext';

interface BaseComboboxContentProps {
    anchor: React.RefObject<any>;
}

export function BaseComboboxContent({ anchor }: BaseComboboxContentProps) {
    const { emptyText, renderOption } = useComboboxContext<any>();

    return (
        <ComboboxContent anchor={anchor} placement="bottom start">
            <ComboboxEmpty>{emptyText}</ComboboxEmpty>
            <ComboboxList>
                {(item: OptionItem<any>) => (
                    <ComboboxItem
                        key={String(item.value)}
                        id={String(item.value)}
                        isDisabled={item.disabled}
                        textValue={item.label}
                    >
                        {renderOption ? renderOption(item) : item.label}
                    </ComboboxItem>
                )}
            </ComboboxList>
        </ComboboxContent>
    );
}
