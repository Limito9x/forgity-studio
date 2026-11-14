import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "@/components/form-controls/BaseFormField";
import type { BaseFormControlProps, OmitFormProps } from "@/components/form-controls/type";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTauriRuntime, openNativeFileOrFolderDialog } from "@/lib/platform/filePickerStrategy";

export interface FormPinPathInputProps<T extends FieldValues>
  extends BaseFormControlProps<T>,
    OmitFormProps<React.ComponentPropsWithoutRef<"input">> {
  mode?: "folder" | "file";
}

export function FormPinPathInput<T extends FieldValues>({
  placeholder = "e.g. /workspace/models or D:\\Assets...",
  className,
  disabled,
  mode = "folder",
  ...rest
}: FormPinPathInputProps<T>) {
  const isDesktop = isTauriRuntime();

  return (
    <BaseFormField
      {...rest}
      render={(field) => {
        const handleBrowse = async () => {
          if (!isDesktop) return;
          try {
            const selected = await openNativeFileOrFolderDialog({
              mode: mode === "file" ? "file" : "folder",
              title: mode === "file" ? "Select File Path" : "Select Folder Path",
            });
            if (selected) {
              field.onChange(selected);
            }
          } catch (err) {
            console.warn("Failed to open native picker:", err);
          }
        };

        return (
          <div className="relative flex items-center gap-1.5 w-full">
            <div className="relative flex-1 flex items-center min-w-0">
              <Folder className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                {...field}
                id={field.field_id}
                name={field.input_name}
                autoComplete={field.autoComplete}
                type="text"
                placeholder={placeholder}
                disabled={disabled}
                value={field.value ?? ""}
                className={cn("w-full pl-8 font-mono text-xs", className)}
              />
            </div>
            {isDesktop && (
              <span title={`Browse ${mode === "file" ? "file" : "folder"} path on disk`}>
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
