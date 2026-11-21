import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "@/components/form-controls/BaseFormField";
import type { BaseFormControlProps, OmitFormProps } from "@/components/form-controls/type";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ConstantHintInput } from "./ConstantHintInput";

export interface FormPinTextInputProps<T extends FieldValues>
  extends BaseFormControlProps<T>,
    OmitFormProps<React.ComponentPropsWithoutRef<"input">> {
  type?: React.HTMLInputTypeAttribute;
}

/**
 * Pipeline-scoped text input that automatically provides `${...}` constant autocomplete
 * when inside a PipelineWorkspaceContext, while preserving standard Input behavior for non-text types.
 */
export function FormPinTextInput<T extends FieldValues>({
  type = "text",
  placeholder,
  className,
  disabled,
  ...rest
}: FormPinTextInputProps<T>) {
  return (
    <BaseFormField
      {...rest}
      render={(field) =>
        type === "text" ? (
          <ConstantHintInput
            id={field.field_id}
            name={field.input_name}
            autoComplete={field.autoComplete}
            type={type}
            placeholder={placeholder}
            disabled={disabled}
            value={field.value ?? ""}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            className={cn("w-full", className)}
          />
        ) : (
          <Input
            {...field}
            id={field.field_id}
            name={field.input_name}
            autoComplete={field.autoComplete}
            type={type}
            placeholder={placeholder}
            disabled={disabled}
            value={field.value ?? ""}
            className={cn("w-full", className)}
          />
        )
      }
    />
  );
}
