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
import { getPipelineParameterPinId } from "../../../adapters/pipelineParameterPins";
import type { StructDefinitionDto } from "@/features/pipelines/types/pipelineGraphTypes";
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
  controlMode: "auto" | "path";
  pathKind: "file" | "folder";
  defaultFolder: string;
  accept: string;
}

function parseContextMeta(raw?: Record<string, any> | string | null): Partial<ParameterFormData> {
  if (!raw) return {};
  try {
    const obj = typeof raw === "object" ? (raw as Record<string, any>) : JSON.parse(String(raw));
    if (String(obj?.type || "").toLowerCase() === "path") {
      return {
        controlMode: "path",
        pathKind: obj.pathKind === "file" ? "file" : "folder",
        defaultFolder: obj.defaultFolder || "",
        accept: obj.accept || "",
      };
    }
  } catch {
    // ignore invalid json
  }
  return {};
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
  const initialMeta = parseContextMeta(editingParam?.contextData);
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
      controlMode: initialMeta.controlMode ?? "auto",
      pathKind: initialMeta.pathKind ?? "folder",
      defaultFolder: initialMeta.defaultFolder ?? "",
      accept: initialMeta.accept ?? "",
    },
  });

  const watchedType = form.watch("type");
  const watchedCardinality = form.watch("cardinality");
  const watchedStructType = form.watch("structType");
  const watchedControlMode = form.watch("controlMode");
  const watchedPathKind = form.watch("pathKind");
  const watchedDefaultFolder = form.watch("defaultFolder");
  const watchedAccept = form.watch("accept");

  useEffect(() => {
    if (editingParam) {
      const meta = parseContextMeta(editingParam.contextData);
      form.reset({
        key: editingParam.key,
        label: editingParam.label ?? editingParam.key,
        type: normalizeType(editingParam.type),
        cardinality: normalizeCardinality(editingParam.cardinality),
        structType: editingParam.structType ?? "Resource",
        defaultValue: editingParam.defaultValue ?? "",
        description: editingParam.description ?? "",
        isRequired: Boolean(editingParam.isRequired),
        controlMode: meta.controlMode ?? "auto",
        pathKind: meta.pathKind ?? "folder",
        defaultFolder: meta.defaultFolder ?? "",
        accept: meta.accept ?? "",
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
        controlMode: "auto",
        pathKind: "folder",
        defaultFolder: "",
        accept: "",
      });
    }
  }, [editingParam, form]);

  const activeContextData = useMemo<Record<string, any> | null>(() => {
    if (watchedType !== "String" || watchedControlMode !== "path") {
      return null;
    }
    return {
      type: "path",
      pathKind: watchedPathKind,
      multiple: watchedCardinality === "Array",
      defaultFolder: watchedDefaultFolder || undefined,
      accept: watchedPathKind === "file" ? watchedAccept || undefined : undefined,
    };
  }, [watchedType, watchedCardinality, watchedControlMode, watchedPathKind, watchedDefaultFolder, watchedAccept]);

  const defaultValFieldDef = useMemo(() => {
    if (activeTab === "outputs") return null;

    return pipelineInputToFieldDefinition({
      key: "defaultValue",
      label: `Default Value (${watchedType}${watchedCardinality === "Array" ? "[]" : ""})`,
      type: watchedType,
      cardinality: watchedCardinality,
      structType: isEntityRef(watchedType) ? watchedStructType : null,
      defaultValue: form.getValues("defaultValue"),
      ...(activeContextData ? { contextData: activeContextData } : {}),
    } as any);
  }, [activeTab, watchedType, watchedCardinality, watchedStructType, activeContextData, form]);

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
      };

      const newParam: PipelineParameterDto = {
        id: crypto.randomUUID(),
        name: trimmedKey,
        key: trimmedKey,
        label: data.label.trim() || trimmedKey,
        kind: kindMap[activeTab],
        type: data.type as any,
        cardinality: data.cardinality as any,
        structType: isEntityRef(data.type) ? data.structType : null,
        defaultValue: finalDefVal,
        description: data.description.trim() || undefined,
        isRequired: data.isRequired,
        order: existingKeys.length + 1,
        contextData: activeContextData,
      };

      onSaveCreate(newParam);
      toast.success(`Added ${activeTab.slice(0, -1)} '${trimmedKey}'`);
    } else if (mode === "edit" && editingParam) {
      const parameterKey = getPipelineParameterPinId(editingParam);
      onSaveEdit(parameterKey, {
        label: data.label.trim() || parameterKey,
        type: data.type as any,
        cardinality: data.cardinality as any,
        structType: isEntityRef(data.type) ? data.structType : null,
        defaultValue: finalDefVal,
        description: data.description.trim() || undefined,
        isRequired: data.isRequired,
        contextData: activeContextData,
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

      {watchedType === "String" && activeTab !== "outputs" && (
        <div className="space-y-2 p-2.5 rounded-lg border bg-muted/20">
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground block">
              UI Control Mode
            </label>
            <Controller
              name="controlMode"
              control={form.control}
              render={({ field }) => (
                <Select
                  selectedKey={field.value}
                  onSelectionChange={(k) => k && field.onChange(String(k))}
                  className="w-full"
                >
                  <SelectTrigger className="h-7 text-xs w-full bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem id="auto">Auto (Standard Text)</SelectItem>
                    <SelectItem id="path">Local Path Picker (File / Folder)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {watchedControlMode === "path" && (
            <div className="space-y-2 pt-1.5 border-t border-border/50">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground block">
                  Path Target
                </label>
                <Controller
                  name="pathKind"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      selectedKey={field.value}
                      onSelectionChange={(k) => k && field.onChange(String(k))}
                      className="w-full"
                    >
                      <SelectTrigger className="h-7 text-xs w-full bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem id="folder">Folder</SelectItem>
                        <SelectItem id="file">File</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <FormRenderer
                registry={pipelineRegistry}
                control={form.control as any}
                fields={[
                  {
                    name: "defaultFolder",
                    label: "Default Folder",
                    type: "pin:pathInput",
                    properties: {
                      mode: "folder",
                      placeholder: "e.g. D:/Assets/Daz or ${DAZ_ROOT}",
                    },
                  },
                ]}
              />

              {watchedPathKind === "file" && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground block">
                    Allowed Extensions
                  </label>
                  <Input
                    {...form.register("accept")}
                    placeholder="e.g. .duf, .fbx"
                    className="h-7 text-xs font-mono bg-background"
                  />
                </div>
              )}
            </div>
          )}
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
