import { useState } from "react";
import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "@/components/form-controls/BaseFormField";
import type { BaseFormControlProps, OmitFormProps } from "@/components/form-controls/type";
import { Button } from "@/components/ui/button";
import { FileCode2, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTauriRuntime, openNativeFileOrFolderDialog } from "@/lib/platform/filePickerStrategy";
import { usePipelineWorkspaceOptional } from "../context/PipelineWorkspaceContext";
import { extractConstantsMap, resolveConstants } from "../utils/resolveConstants";
import { ConstantHintInput } from "./ConstantHintInput";

export interface FormPinPathInputProps<T extends FieldValues>
  extends BaseFormControlProps<T>,
    OmitFormProps<React.ComponentPropsWithoutRef<"input">> {
  mode?: "folder" | "file";
  defaultFolder?: string;
  extensions?: string[];
}

export function FormPinPathInput<T extends FieldValues>({
  placeholder = "e.g. /workspace/models or D:\\Assets...",
  className,
  disabled,
  mode = "folder",
  defaultFolder,
  extensions,
  ...rest
}: FormPinPathInputProps<T>) {
  const isDesktop = isTauriRuntime();
  const [isDragging, setIsDragging] = useState(false);
  const workspace = usePipelineWorkspaceOptional();
  const constantsMap = workspace ? extractConstantsMap(workspace.paletteItems) : {};

  return (
    <BaseFormField
      {...rest}
      render={(field) => {
        const handleBrowse = async () => {
          if (!isDesktop) return;
          try {
            const rawDefault = defaultFolder || (typeof field.value === "string" && field.value ? field.value : undefined);
            const resolvedDefault = rawDefault ? resolveConstants(rawDefault, constantsMap) : undefined;
            const selected = await openNativeFileOrFolderDialog({
              mode: mode === "file" ? "file" : "folder",
              title: mode === "file" ? "Select File Path" : "Select Folder Path",
              defaultPath: resolvedDefault,
              extensions: mode === "file" && extensions?.length ? extensions : undefined,
            });
            if (selected) {
              field.onChange(selected);
            }
          } catch (err) {
            console.warn("Failed to open native picker:", err);
          }
        };

        const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
          if (disabled) return;
          const file = e.dataTransfer?.files?.[0] as (File & { path?: string }) | undefined;
          if (file?.path) {
            field.onChange(file.path);
            return;
          }
          const text = e.dataTransfer?.getData("text/plain")?.trim();
          if (text) {
            field.onChange(text);
          }
        };

        const Icon = mode === "file" ? FileCode2 : Folder;

        return (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "relative flex items-center gap-1.5 w-full rounded-md transition-colors",
              isDragging && "ring-1 ring-primary bg-primary/5"
            )}
          >
            <div className="relative flex-1 flex items-center min-w-0">
              <Icon className="absolute left-2.5 z-10 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <ConstantHintInput
                id={field.field_id}
                name={field.input_name}
                autoComplete={field.autoComplete}
                type="text"
                placeholder={placeholder}
                disabled={disabled}
                value={field.value ?? ""}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                className={cn("w-full pl-8 font-mono text-xs", className)}
              />
            </div>
            {isDesktop && (
              <span title={`Browse ${mode === "file" ? "file" : "folder"} path${defaultFolder ? ` (${defaultFolder})` : ""}`}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isDisabled={disabled}
                  onPress={handleBrowse}
                  className="h-8 px-2 text-xs shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </span>
            )}
          </div>
        );
      }}
    />
  );
}
