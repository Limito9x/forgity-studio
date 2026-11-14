import { useMemo } from "react";
import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "@/components/form-controls/BaseFormField";
import type { BaseFormControlProps } from "@/components/form-controls/type";
import { useRunners } from "@/features/runners/hooks/useRunners";
import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import { registerField, type ExtractConfig } from "@/lib/field-registry";
import { z } from "zod";

export interface FormPinRunnerSelectProps<T extends FieldValues>
  extends BaseFormControlProps<T> {
  placeholder?: string;
  disabled?: boolean;
  multiple?: boolean;
  filterOnline?: boolean;
}

export function FormPinRunnerSelect<T extends FieldValues>({
  placeholder,
  disabled = false,
  multiple = false,
  filterOnline = false,
  ...rest
}: FormPinRunnerSelectProps<T>) {
  const { data: runnersData = [], isLoading } = useRunners();

  const options = useMemo(() => {
    const list = Array.isArray(runnersData) ? runnersData : [];
    return list
      .filter((r: any) => !filterOnline || r.isActive || r.isOnline || r.status === "Active")
      .map((r: any) => {
        const isOnline = r.isActive || r.isOnline || r.status === "Active" || r.status === 1;
        const statusText = isOnline ? "Online" : "Offline";
        const name = r.name || r.machineKey || "Runner";
        const extra = r.machineKey && r.machineKey !== name ? ` (${r.machineKey})` : "";
        return {
          label: `${name}${extra} - ${statusText}`,
          value: r.id,
        };
      });
  }, [runnersData, filterOnline]);

  return (
    <BaseFormField
      {...rest}
      render={(field) => (
        <BaseCombobox
          items={options}
          value={field.value ? String(field.value) : undefined}
          onValueChange={(val) => field.onChange(val || null)}
          placeholder={placeholder || "Select runner..."}
          disabled={disabled || isLoading}
          emptyText={isLoading ? "Loading runners..." : "No runners found."}
        />
      )}
    />
  );
}

// Module Augmentation for GlobalFieldRegistry
declare module "@/lib/field-registry" {
  interface GlobalFieldRegistry {
    "pin:runnerSelect": ExtractConfig<FormPinRunnerSelectProps<any>>;
    runner: ExtractConfig<FormPinRunnerSelectProps<any>>;
  }
}

registerField({
  type: "pin:runnerSelect",
  component: FormPinRunnerSelect,
  buildSchema: (props: any, field?: any) => {
    const isReq = props?.required === true;
    const msg = `${field?.label || field?.name || "Runner"} is required`;
    return isReq
      ? z.string({ message: msg }).min(1, msg)
      : z.string().optional().nullable();
  },
});

registerField({
  type: "runner",
  component: FormPinRunnerSelect,
  buildSchema: (props: any, field?: any) => {
    const isReq = props?.required === true;
    const msg = `${field?.label || field?.name || "Runner"} is required`;
    return isReq
      ? z.string({ message: msg }).min(1, msg)
      : z.string().optional().nullable();
  },
});
