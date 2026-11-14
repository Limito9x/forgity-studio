import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "@/components/form-controls/BaseFormField";
import type { BaseFormControlProps } from "@/components/form-controls/type";
import { EntityPinSelect } from "../components/canvas/EntityPinSelect";
import { usePipelineFormScope } from "../form-scope/PipelineFormScope";

export interface FormPinEntitySelectProps<T extends FieldValues>
  extends BaseFormControlProps<T> {
  entityTarget?: string;
  entityType?: string;
  placeholder?: string;
  disabled?: boolean;
  multiple?: boolean;
}

export function FormPinEntitySelect<T extends FieldValues>({
  entityTarget,
  entityType,
  placeholder,
  disabled,
  multiple = false,
  ...rest
}: FormPinEntitySelectProps<T>) {
  const { projectId = "" } = usePipelineFormScope();

  return (
    <BaseFormField
      {...rest}
      render={(field) => (
        <EntityPinSelect
          target={entityTarget}
          entityType={entityType || entityTarget}
          projectId={projectId}
          value={field.value}
          onChange={field.onChange}
          placeholder={placeholder || `Select ${entityType || entityTarget || "Entity"}...`}
          disabled={disabled}
          multiple={multiple}
        />
      )}
    />
  );
}
