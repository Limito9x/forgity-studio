import { useEffect, useState } from "react";
import { KeyRound, FolderOpen, Save, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useGetConstantProfiles,
  useUpsertConstantProfile,
} from "@/gen/endpoints/constant-profiles/constant-profiles";
import { useUpdateLibraryConstantProfile } from "@/gen/endpoints/templates/templates";
import type { ConstantFieldSchema } from "../../adapters/templateGraphAdapter";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";

interface ConstantProfileEditorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  libraryItemId: string;
  currentProfileId?: string | null;
  constantFields: ConstantFieldSchema[];
  onSaved?: () => void;
}

export function ConstantProfileEditorDrawer({
  open,
  onOpenChange,
  libraryItemId,
  currentProfileId,
  constantFields,
  onSaved,
}: ConstantProfileEditorDrawerProps) {
  const { data: profiles = [], refetch: refetchProfiles } = useGetConstantProfiles();
  const upsertProfile = useUpsertConstantProfile();
  const bindProfile = useUpdateLibraryConstantProfile();

  const [selectedProfileId, setSelectedProfileId] = useState<string>(currentProfileId || "__new__");
  const [profileName, setProfileName] = useState("My Workstation");
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!open) return;
    const initialId = currentProfileId || profiles[0]?.id || "__new__";
    setSelectedProfileId(initialId);
  }, [open, currentProfileId, profiles]);

  useEffect(() => {
    if (selectedProfileId === "__new__") {
      setProfileName("New Profile");
      setValues({});
      return;
    }
    const found = profiles.find((p) => p.id === selectedProfileId);
    if (found) {
      setProfileName(found.name);
      setValues(((found.valuesJson as Record<string, any>) || {}) as Record<string, any>);
    }
  }, [selectedProfileId, profiles]);

  const handleBrowsePath = async (key: string, isDirectory: boolean) => {
    if (!isTauriRuntime()) return;
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const picked = await openDialog({ directory: isDirectory, multiple: false });
      if (typeof picked === "string") {
        setValues((prev) => ({ ...prev, [key]: picked }));
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to open file picker");
    }
  };

  const handleSaveAndBind = async () => {
    if (!profileName.trim()) {
      toast.error("Profile name is required.");
      return;
    }
    try {
      const saved = await upsertProfile.mutateAsync({
        data: {
          id: selectedProfileId === "__new__" ? null : selectedProfileId,
          runnerId: null,
          name: profileName.trim(),
          valuesJson: values as any,
        },
      });
      await bindProfile.mutateAsync({
        libraryItemId,
        data: { constantProfileId: saved.id },
      });
      await refetchProfiles();
      toast.success(`Saved & bound Constant Profile "${saved.name}".`);
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save constant profile.");
    }
  };

  const isBusy = upsertProfile.isPending || bindProfile.isPending;

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          Configure Constant Profile
        </DialogTitle>
        <DialogDescription>
          Bind environment-specific values for the constants declared by this template.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Select Profile</Label>
            <Select
              selectedKey={selectedProfileId}
              onSelectionChange={(k) => setSelectedProfileId(String(k))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem id="__new__">
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Create New Profile
                  </span>
                </SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} id={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Profile Name</Label>
            <Input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="My Workstation"
            />
          </div>
        </div>

        <div className="space-y-3 border-t pt-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Template Constants ({constantFields.length})
          </div>

          {constantFields.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              This template does not require any external constants.
            </div>
          ) : (
            constantFields.map((field) => {
              const lowerType = field.dataType.toLowerCase();
              const isBool = lowerType === "boolean" || lowerType === "bool";
              const isNumber = lowerType === "number" || lowerType === "int" || lowerType === "float";
              const isPath =
                lowerType.includes("path") ||
                lowerType.includes("file") ||
                lowerType.includes("dir") ||
                field.key.toLowerCase().includes("path");

              return (
                <div key={field.key} className="space-y-1.5 rounded-lg border border-border/60 p-3 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">{field.label}</Label>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {field.dataType}
                      </Badge>
                      {field.isRequired && (
                        <Badge variant="secondary" className="text-[10px]">
                          Required
                        </Badge>
                      )}
                    </div>
                  </div>
                  {field.description && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  )}

                  {isBool ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        checked={Boolean(values[field.key])}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [field.key]: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-border"
                      />
                      <span className="text-xs text-muted-foreground">Enabled</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        type={isNumber ? "number" : "text"}
                        value={values[field.key] ?? ""}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [field.key]: isNumber ? Number(e.target.value) : e.target.value,
                          }))
                        }
                        placeholder={`Enter ${field.key}...`}
                      />
                      {isPath && isTauriRuntime() && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Browse path"
                          onPress={() =>
                            handleBrowsePath(
                              field.key,
                              lowerType.includes("dir") || lowerType.includes("folder")
                            )
                          }
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onPress={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onPress={handleSaveAndBind} isDisabled={isBusy}>
          {isBusy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Save & Bind Profile
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
