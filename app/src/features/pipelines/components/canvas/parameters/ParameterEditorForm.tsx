import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { FormRenderer } from "@/components/dynamic-form/FormRenderer";
import { pipelineRegistry } from "../../../form-scope/pipelineRegistry";
import { pipelineInputToFieldDefinition } from "../../../form-scope/pinToFieldDefinition";
import type { PipelineParameterDto, PipelineParameterKind } from "../../../hooks/usePipelineGraph";
import type { StructDefinitionDto } from "@/gen/model";
import {
  TYPE_OPTIONS,
  CARDINALITY_OPTIONS,
  isEntityRef,
  normalizeType,
  normalizeCardinality,
  type ParameterTab,
} from "./types";
import { toast } from "sonner";

interface ParameterFormData {
  key: string;
  label: string;
  type: string;
  cardinality: string;
  structType: string;
  defaultValue: any;
  description: string;
  isRequired: boolean;
}

interface ParameterEditorFormProps {
  mode: "create" | "edit";
  activeTab: ParameterTab;
  editingParam?: PipelineParameterDto | null;
  existingKeys: string[];
  structCatalogue: StructDefinitionDto[];
  onSaveCreate: (param: PipelineParameterDto) => void;
  onSaveEdit: (key: string, patch: Partial<PipelineParameterDto>) => void;
  onCancel: () => void;
}

export function ParameterEditorForm({
  mode,
  activeTab,
  editingParam,
  existingKeys,
  structCatalogue,
  onSaveCreate,
  onSaveEdit,
  onCancel,
}: ParameterEditorFormProps) {
  const form = useForm<ParameterFormData>({
    defaultValues: {
      key: editingParam?.key ?? "",
      label: editingParam?.label ?? editingParam?.key ?? "",
      type: editingParam ? normalizeType(editingParam.type) : "String",
      cardinality: editingParam ? normalizeCardinality(editingParam.cardinality) : "Single",
      structType: editingParam?.structType ?? "Resource",
      defaultValue: editingParam?.defaultValue ?? "",
      description: editingParam?.description ?? "",
      isRequired: Boolean(editingParam?.isRequired),
    },
  });

  const watchedType = form.watch("type");
  const watchedCardinality = form.watch("cardinality");
  const watchedStructType = form.watch("structType");

  useEffect(() => {
    if (editingParam) {
      form.reset({
        key: editingParam.key,
        label: editingParam.label ?? editingParam.key,
        type: normalizeType(editingParam.type),
        cardinality: normalizeCardinality(editingParam.cardinality),
        structType: editingParam.structType ?? "Resource",
        defaultValue: editingParam.defaultValue ?? "",
        description: editingParam.description ?? "",
        isRequired: Boolean(editingParam.isRequired),
      });
    } else {
      form.reset({
        key: "",
        label: "",
        type: "String",
        cardinality: "Single",
        structType: "Resource",
        defaultValue: "",
        description: "",
        isRequired: false,
      });
    }
  }, [editingParam, form]);

  const defaultValFieldDef = useMemo(() => {
    if (activeTab === "outputs") return null;

    return pipelineInputToFieldDefinition({
      key: "defaultValue",
      label: `Default Value (${watchedType}${watchedCardinality === "Array" ? "[]" : ""})`,
      type: watchedType,
      cardinality: watchedCardinality,
      structType: isEntityRef(watchedType) ? watchedStructType : null,
      defaultValue: form.getValues("defaultValue"),
    });
  }, [activeTab, watchedType, watchedCardinality, watchedStructType, form]);

  const onSubmit = form.handleSubmit((data) => {
    const trimmedKey = data.key.trim();
    if (!trimmedKey) {
      toast.error("Parameter key is required.");
      return;
    }

    let finalDefVal: string | null = null;
    if (typeof data.defaultValue === "string") {
      finalDefVal = data.defaultValue.trim() || null;
    } else if (data.defaultValue !== null && data.defaultValue !== undefined) {
      finalDefVal = JSON.stringify(data.defaultValue);
    }

    if (mode === "create") {
      if (existingKeys.some((k) => k.toLowerCase() === trimmedKey.toLowerCase())) {
        toast.error(`Parameter with key '${trimmedKey}' already exists.`);
        return;
      }

      const kindMap: Record<ParameterTab, PipelineParameterKind> = {
        inputs: "Input",
        outputs: "Output",
        variables: "Variable",
      };

      const newParam: PipelineParameterDto = {
        id: crypto.randomUUID(),
        key: trimmedKey,
        label: data.label.trim() || trimmedKey,
        kind: kindMap[activeTab],
        type: data.type as any,
        cardinality: data.cardinality as any,
        structType: isEntityRef(data.type) ? data.structType : null,
        defaultValue: finalDefVal,
        description: data.description.trim() || null,
        isRequired: data.isRequired,
        order: existingKeys.length + 1,
        contextData: null,
      };

      onSaveCreate(newParam);
      toast.success(`Added ${activeTab.slice(0, -1)} '${trimmedKey}'`);
    } else if (mode === "edit" && editingParam) {
      onSaveEdit(editingParam.key, {
        label: data.label.trim() || editingParam.key,
        type: data.type as any,
        cardinality: data.cardinality as any,
        structType: isEntityRef(data.type) ? data.structType : null,
        defaultValue: finalDefVal,
        description: data.description.trim() || null,
        isRequired: data.isRequired,
      });
      toast.success(`Updated ${activeTab.slice(0, -1)} '${editingParam.key}'`);
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      className="p-3 border rounded-xl bg-card space-y-3 shadow-md animate-in fade-in"
    >
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-xs font-semibold text-foreground">
          {mode === "create" ? `New ${activeTab.slice(0, -1)}` : `Edit '${editingParam?.key}'`}
        </span>
      </div>

      {mode === "create" && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground block">
            Parameter Key
          </label>
          <Input
            {...form.register("key")}
            placeholder="Unique identifier (e.g. MyVar)"
            className="h-7 text-xs font-mono"
            autoFocus
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground block">Display Label</label>
        <Input
          {...form.register("label")}
          placeholder="Display label (defaults to key)"
          className="h-7 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground block">Type</label>
          <Controller
            name="type"
            control={form.control}
            render={({ field }) => (
              <Select
                selectedKey={field.value}
                onSelectionChange={(key) => key && field.onChange(String(key))}
                className="w-full"
              >
                <SelectTrigger className="h-7 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} id={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground block">Cardinality</label>
          <Controller
            name="cardinality"
            control={form.control}
            render={({ field }) => (
              <Select
                selectedKey={field.value}
                onSelectionChange={(key) => key && field.onChange(String(key))}
                className="w-full"
              >
                <SelectTrigger className="h-7 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARDINALITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} id={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {isEntityRef(watchedType) && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground block">
            Struct Schema
          </label>
          <Controller
            name="structType"
            control={form.control}
            render={({ field }) => (
              <Select
                selectedKey={field.value}
                onSelectionChange={(key) => key && field.onChange(String(key))}
                className="w-full"
              >
                <SelectTrigger className="h-7 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {structCatalogue.map((s) => (
                    <SelectItem key={s.structType} id={s.structType}>
                      {s.label || s.structType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      )}

      {/* Default Value Field rendered via Dynamic Form Registry */}
      {defaultValFieldDef && (
        <div className="space-y-1 pt-1">
          <FormRenderer
            registry={pipelineRegistry}
            control={form.control as any}
            fields={[defaultValFieldDef]}
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground block">Description</label>
        <Input
          {...form.register("description")}
          placeholder="Short description"
          className="h-7 text-xs"
        />
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <Controller
          name="isRequired"
          control={form.control}
          render={({ field }) => (
            <Checkbox
              isSelected={field.value}
              onChange={field.onChange}
              className="h-3.5 w-3.5"
            />
          )}
        />
        <span className="text-[10px] font-medium text-muted-foreground select-none">
          Required parameter
        </span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-xs"
          onPress={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="flex-1 h-7 text-xs bg-primary text-primary-foreground font-semibold"
        >
          {mode === "create" ? "Add Parameter" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
