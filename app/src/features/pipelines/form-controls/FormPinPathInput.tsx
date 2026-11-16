import { useState } from "react";
import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "@/components/form-controls/BaseFormField";
import type { BaseFormControlProps, OmitFormProps } from "@/components/form-controls/type";
import { Button } from "@/components/ui/button";
import { FileCode2, Folder, FolderOpen, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isTauriRuntime,
  openNativeFileOrFolderDialog,
  openNativeMultipleFilesOrFoldersDialog,
} from "@/lib/platform/filePickerStrategy";
import { usePipelineWorkspaceOptional } from "../context/PipelineWorkspaceContext";
import { extractConstantsMap, resolveConstants } from "../utils/resolveConstants";
import { ConstantHintInput } from "./ConstantHintInput";

export interface FormPinPathInputProps<T extends FieldValues>
  extends BaseFormControlProps<T>,
    OmitFormProps<React.ComponentPropsWithoutRef<"input">> {
  mode?: "folder" | "file";
  defaultFolder?: string;
  extensions?: string[];
  multiple?: boolean;
}

export function FormPinPathInput<T extends FieldValues>({
  placeholder = "e.g. /workspace/models or D:\\Assets...",
  className,
  disabled,
  mode = "folder",
  defaultFolder,
  extensions,
  multiple = false,
  ...rest
}: FormPinPathInputProps<T>) {
  const isDesktop = isTauriRuntime();
  const [isDragging, setIsDragging] = useState(false);
  const [draftEntry, setDraftEntry] = useState("");
  const workspace = usePipelineWorkspaceOptional();
  const constantsMap = workspace ? extractConstantsMap(workspace.paletteItems) : {};

  return (
    <BaseFormField
      {...rest}
      render={(field) => {
        const Icon = mode === "file" ? FileCode2 : Folder;

        if (multiple) {
          const rawVal: unknown = field.value;
          const currentPaths: string[] = Array.isArray(rawVal)
            ? rawVal.map(String).filter(Boolean)
            : typeof rawVal === "string" && rawVal.trim()
            ? [rawVal.trim()]
            : [];

          const appendPaths = (incoming: string[]) => {
            const next = [...currentPaths];
            for (const p of incoming) {
              const norm = p.trim();
              if (norm && !next.includes(norm)) {
                next.push(norm);
              }
            }
            field.onChange(next);
          };

          const removeAt = (idx: number) => {
            const next = currentPaths.filter((_, i) => i !== idx);
            field.onChange(next);
          };

          const handleMultiBrowse = async () => {
            if (!isDesktop) return;
            try {
              const rawDefault =
                defaultFolder || (currentPaths.length > 0 ? currentPaths[currentPaths.length - 1] : undefined);
              const resolvedDefault = rawDefault ? resolveConstants(rawDefault, constantsMap) : undefined;
              const picked = await openNativeMultipleFilesOrFoldersDialog({
                mode: mode === "file" ? "file" : "folder",
                title: mode === "file" ? "Select File Paths" : "Select Folder Paths",
                defaultPath: resolvedDefault,
                extensions: mode === "file" && extensions?.length ? extensions : undefined,
              });
              if (picked.length > 0) {
                appendPaths(picked);
              }
            } catch (err) {
              console.warn("Failed to open multi native picker:", err);
            }
          };

          const handleMultiDrop = (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            if (disabled) return;
            const files = Array.from(e.dataTransfer?.files || []) as Array<File & { path?: string }>;
            const droppedPaths = files.map((f) => f.path).filter((p): p is string => Boolean(p));
            if (droppedPaths.length > 0) {
              appendPaths(droppedPaths.map((p) => p.replace(/\\/g, "/")));
              return;
            }
            const text = e.dataTransfer?.getData("text/plain")?.trim();
            if (text) {
              appendPaths(
                text
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              );
            }
          };

          const handleAddDraft = () => {
            if (!draftEntry.trim()) return;
            appendPaths([draftEntry.trim()]);
            setDraftEntry("");
          };

          return (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!disabled) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleMultiDrop}
              className={cn(
                "space-y-1.5 w-full rounded-md transition-colors",
                isDragging && "ring-1 ring-primary bg-primary/5 p-1"
              )}
            >
              {currentPaths.length > 0 && (
                <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                  {currentPaths.map((p, idx) => (
                    <div
                      key={`${p}-${idx}`}
                      className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/60 bg-muted/30 text-[11px] font-mono"
                    >
                      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1" title={p}>
                        {p}
                      </span>
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => removeAt(idx)}
                          className="text-muted-foreground hover:text-destructive shrink-0 p-0.5"
                          title="Remove path"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="relative flex items-center gap-1.5 w-full">
                <div className="relative flex-1 flex items-center min-w-0">
                  <Icon className="absolute left-2.5 z-10 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <ConstantHintInput
                    id={field.field_id}
                    name={field.input_name}
                    type="text"
                    placeholder={placeholder}
                    disabled={disabled}
                    value={draftEntry}
                    onValueChange={setDraftEntry}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddDraft();
                      }
                    }}
                    className={cn("w-full pl-8 font-mono text-xs", className)}
                  />
                </div>
                <span title="Add path">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isDisabled={disabled || !draftEntry.trim()}
                    onPress={handleAddDraft}
                    className="h-8 px-2 text-xs shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </span>
                {isDesktop && (
                  <span title={`Browse multiple ${mode === "file" ? "files" : "folders"}`}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isDisabled={disabled}
                      onPress={handleMultiBrowse}
                      className="h-8 px-2 text-xs shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                )}
              </div>
            </div>
          );
        }

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
