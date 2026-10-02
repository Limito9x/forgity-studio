import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "@/components/form-controls/BaseFormField";
import type { BaseFormControlProps } from "@/components/form-controls/type";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { usePipelineFormScope } from "../form-scope/PipelineFormScope";
import { formatPinTypeLabel } from "../components/canvas/CustomPipelineNode";

export interface FormPinVariableSelectProps<T extends FieldValues>
  extends BaseFormControlProps<T> {
  placeholder?: string;
}

export function FormPinVariableSelect<T extends FieldValues>({
  placeholder = "-- Select Variable --",
  ...rest
}: FormPinVariableSelectProps<T>) {
  const { variables = [] } = usePipelineFormScope();

  return (
    <BaseFormField
      {...rest}
      render={(field) => {
        const selectedKey = field.value || "none";

        return (
          <div className="space-y-1.5">
            <Select
              selectedKey={selectedKey}
              onSelectionChange={(key) => {
                field.onChange(key === "none" ? "" : String(key));
              }}
              className="w-full"
            >
              <SelectTrigger className="h-8 w-full text-xs font-mono border-cyan-500/40 bg-cyan-500/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem id="none">{placeholder}</SelectItem>
                {variables.map((v) => (
                  <SelectItem key={v.key} id={v.key}>
                    {v.label || v.key} ({formatPinTypeLabel(v.type, v.cardinality)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {variables.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">
                No variables declared yet. Declare variables in the Variables panel.
              </p>
            )}
          </div>
        );
      }}
    />
  );
}

