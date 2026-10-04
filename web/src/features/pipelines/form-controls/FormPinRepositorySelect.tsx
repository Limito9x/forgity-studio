import { useMemo } from "react";
import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "@/components/form-controls/BaseFormField";
import type { BaseFormControlProps } from "@/components/form-controls/type";
import { useRepositories } from "@/features/repositories/hooks/useRepositories";
import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import { usePipelineFormScope } from "../form-scope/PipelineFormScope";
import { registerField, type ExtractConfig } from "@/lib/field-registry";
import { z } from "zod";

export interface FormPinRepositorySelectProps<T extends FieldValues>
  extends BaseFormControlProps<T> {
  placeholder?: string;
  disabled?: boolean;
  multiple?: boolean;
}

export function FormPinRepositorySelect<T extends FieldValues>({
  placeholder,
  disabled = false,
  multiple = false,
  ...rest
}: FormPinRepositorySelectProps<T>) {
  const { projectId = "" } = usePipelineFormScope();
  const { data: repositoriesData, isLoading } = useRepositories(projectId);

  const options = useMemo(() => {
    const list = Array.isArray(repositoriesData)
      ? repositoriesData
      : (repositoriesData as any)?.items || [];
    return list.map((r: any) => ({
      label: r.name || r.id,
      value: r.id,
    }));
  }, [repositoriesData]);

  return (
    <BaseFormField
      {...rest}
      render={(field) => (
        <BaseCombobox
          items={options}
          value={field.value ? String(field.value) : undefined}
          onValueChange={(val) => field.onChange(val || null)}
          placeholder={placeholder || "Select repository..."}
          disabled={disabled || isLoading}
          emptyText={isLoading ? "Loading repositories..." : "No repositories found."}
        />
      )}
    />
  );
}

// Module Augmentation for GlobalFieldRegistry
declare module "@/lib/field-registry" {
  interface GlobalFieldRegistry {
    "pin:repositorySelect": ExtractConfig<FormPinRepositorySelectProps<any>>;
    repository: ExtractConfig<FormPinRepositorySelectProps<any>>;
  }
}

// Auto-register to Global Registry
registerField({
  type: "pin:repositorySelect",
  component: FormPinRepositorySelect,
  buildSchema: (props: any, field?: any) => {
    const isReq = props?.required === true;
    const msg = `${field?.label || field?.name || "Repository"} is required`;
    const KNOWN_PLACEHOLDERS = ["repository", "workspace", "none", "resource"];
    return isReq
      ? z
          .string({ message: msg })
          .min(1, msg)
          .refine(
            (val) => Boolean(val) && !KNOWN_PLACEHOLDERS.includes(val.trim().toLowerCase()),
            { message: msg }
          )
      : z.string().optional().nullable();
  },
});
