import { useMemo } from "react";
import type { PinDefinition } from "@/gen/model";
import {
  STATIC_PIN_CATALOGUE,
  normalizePinType,
  type NormalizedPinType,
} from "../../hooks/usePinCatalogue";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Sliders, X, ListFilter, AlignLeft, Tags, LayoutTemplate } from "lucide-react";
import { TagsInput } from "@/components/custom-ui/inputs/tags-input/TagsInput";

interface PinConfigInspectorProps {
  selectedPin: {
    pin: PinDefinition;
    direction: "in" | "out";
    index: number;
  } | null;
  onUpdatePin: (updated: PinDefinition) => void;
  onClose: () => void;
}

export function PinConfigInspector({
  selectedPin,
  onUpdatePin,
  onClose,
}: PinConfigInspectorProps) {
  if (!selectedPin) {
    return (
      <Card className="h-full border-dashed bg-muted/10 flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
        <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <Sliders className="size-6 text-primary" />
        </div>
        <CardTitle className="text-sm font-semibold mb-1">Pin Inspector</CardTitle>
        <p className="text-xs text-muted-foreground max-w-[220px]">
          Select an Input or Output Pin from the list to configure its schema properties, types, and defaults.
        </p>
      </Card>
    );
  }

  const { pin, direction } = selectedPin;
  const isInput = direction === "in";

  const normType: NormalizedPinType = normalizePinType(pin.primitiveType);

  const parsedMetadata = useMemo<Record<string, any>>(() => {
    if (!pin.metadata) return {};
    try {
      return typeof pin.metadata === "object"
        ? (pin.metadata as Record<string, any>)
        : JSON.parse(String(pin.metadata));
    } catch {
      return {};
    }
  }, [pin.metadata]);

  const pinOptions: string[] = useMemo(() => {
    return Array.isArray(parsedMetadata.options) ? parsedMetadata.options : [];
  }, [parsedMetadata]);

  const currentCardinality = (() => {
    const c = String(pin.cardinality ?? "").toLowerCase();
    if (c === "array" || c === "1") return "Array";
    if (c === "map" || c === "2") return "Map";
    return "Single";
  })();

  const isCollection =
    currentCardinality === "Array" ||
    String(pin.primitiveType ?? "").includes("[]");

  const controlType = useMemo<"auto" | "select" | "textarea" | "tagsInput">(() => {
    const t = String(parsedMetadata.type || "").toLowerCase();
    if (t === "textarea" || parsedMetadata.multiline) {
      return "textarea";
    }
    if (t === "tagsinput" || t === "tags") {
      return "tagsInput";
    }
    if (t === "select" || t === "combobox" || Array.isArray(parsedMetadata.options)) {
      return isCollection ? "tagsInput" : "select";
    }
    return "auto";
  }, [parsedMetadata, isCollection]);

  const updateMetadata = (updates: Record<string, any> | null) => {
    if (!updates || Object.keys(updates).length === 0) {
      onUpdatePin({ ...pin, metadata: undefined });
      return;
    }
    onUpdatePin({ ...pin, metadata: JSON.stringify(updates) });
  };

  const handleControlTypeChange = (newType: string) => {
    if (newType === "auto") {
      const nextMeta = { ...parsedMetadata };
      delete nextMeta.type;
      delete nextMeta.options;
      delete nextMeta.rows;
      delete nextMeta.allowCustom;
      delete nextMeta.multiline;
      updateMetadata(Object.keys(nextMeta).length > 0 ? nextMeta : null);
      return;
    }

    if (newType === "select") {
      updateMetadata({
        ...parsedMetadata,
        type: isCollection ? "tagsInput" : "select",
        options: pinOptions.length > 0 ? pinOptions : ["default_option"],
        allowCustom: parsedMetadata.allowCustom ?? true,
      });
      return;
    }

    if (newType === "textarea") {
      const nextMeta = { ...parsedMetadata };
      delete nextMeta.options;
      updateMetadata({
        ...nextMeta,
        type: "textarea",
        rows: parsedMetadata.rows || 4,
      });
      return;
    }

    if (newType === "tagsInput") {
      updateMetadata({
        ...parsedMetadata,
        type: "tagsInput",
        options: pinOptions,
        allowCustom: parsedMetadata.allowCustom ?? true,
      });
    }
  };

  const handleOptionsChange = (newOptions: string[]) => {
    updateMetadata({
      ...parsedMetadata,
      type: isCollection ? "tagsInput" : (parsedMetadata.type || "select"),
      options: newOptions,
    });
  };

  const handleToggleAllowCustom = (checked: boolean) => {
    updateMetadata({
      ...parsedMetadata,
      allowCustom: checked,
    });
  };

  const handleRowsChange = (newRows: number) => {
    updateMetadata({
      ...parsedMetadata,
      type: "textarea",
      rows: newRows,
    });
  };

  return (
    <Card className="h-full flex flex-col shadow-xs border bg-card">
      <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Sliders className="size-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-1.5">
              <span>Configure {isInput ? "Input" : "Output"} Pin</span>
            </CardTitle>
            <p className="text-[11px] font-mono text-muted-foreground">
              {pin.id || "unnamed"}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onPress={onClose}
        >
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Pin Identifier */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">
            Pin Identifier / Argument Name <span className="text-destructive">*</span>
          </Label>
          <Input
            className="font-mono text-xs"
            placeholder="e.g. target_objects"
            value={pin.id || ""}
            onChange={(e) => onUpdatePin({ ...pin, id: e.target.value })}
          />
          <p className="text-[10px] text-muted-foreground">
            Must match Python argument or dictionary return key.
          </p>
        </div>

        {/* Display Label */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Display Label</Label>
          <Input
            className="text-xs"
            placeholder="e.g. Target 3D Objects"
            value={pin.label || ""}
            onChange={(e) => onUpdatePin({ ...pin, label: e.target.value })}
          />
        </div>

        {/* Data Type (Catalogue SSOT) */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Data Type</Label>
          <Select
            selectedKey={normType}
            onSelectionChange={(key) =>
              onUpdatePin({ ...pin, primitiveType: String(key) as any })
            }
          >
            <SelectTrigger className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(STATIC_PIN_CATALOGUE).map((item) => (
                <SelectItem key={item.code} id={item.code} textValue={item.label}>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: item.handleColor }}
                    />
                    <span className="font-medium text-xs">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      ({item.code})
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Struct Type for EntityRef */}
        {normType === "EntityRef" && (
          <div className="space-y-1.5 animate-in fade-in duration-150">
            <Label className="text-xs font-semibold">Struct Type</Label>
            <Select
              selectedKey={pin.structType || "Resource"}
              onSelectionChange={(key) =>
                onUpdatePin({ ...pin, structType: String(key) })
              }
            >
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem id="Resource">Resource</SelectItem>
                <SelectItem id="Workstation">Workstation</SelectItem>
                <SelectItem id="Repository">Repository</SelectItem>
                <SelectItem id="Runner">Runner</SelectItem>
                <SelectItem id="ContentItem">ContentItem</SelectItem>
                <SelectItem id="ContentType">ContentType</SelectItem>
                <SelectItem id="Tag">Tag</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Cardinality (Single vs Array) */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Cardinality</Label>
          <Select
            selectedKey={currentCardinality}
            onSelectionChange={(key) =>
              onUpdatePin({ ...pin, cardinality: String(key) as any })
            }
          >
            <SelectTrigger className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id="Single">Single Value</SelectItem>
              <SelectItem id="Array">Array / List of Values</SelectItem>
              <SelectItem id="Map">Key-Value Map</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* UI Control & Preset Mode Section (Form Registry Integration) */}
        {isInput && (
          <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
            <div className="flex items-center gap-1.5">
              <LayoutTemplate className="size-3.5 text-primary" />
              <Label className="text-xs font-semibold text-primary">
                UI Control & Preset Mode
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Form Control Type</Label>
              <Select
                selectedKey={controlType}
                onSelectionChange={(key) => handleControlTypeChange(String(key))}
              >
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem id="auto">Auto / Default (Based on Data Type)</SelectItem>
                  <SelectItem id="select">
                    <div className="flex items-center gap-1.5">
                      <ListFilter className="size-3 text-primary" />
                      <span>Preset Options {isCollection ? "(Multi-Select Chips)" : "(Dropdown / Combobox)"}</span>
                    </div>
                  </SelectItem>
                  <SelectItem id="textarea">
                    <div className="flex items-center gap-1.5">
                      <AlignLeft className="size-3 text-primary" />
                      <span>Multiline Text (Textarea)</span>
                    </div>
                  </SelectItem>
                  <SelectItem id="tagsInput">
                    <div className="flex items-center gap-1.5">
                      <Tags className="size-3 text-primary" />
                      <span>Tags Input (String List)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sub-config for Preset Dropdown or TagsInput */}
            {(controlType === "select" || controlType === "tagsInput") && (
              <div className="space-y-2.5 pt-2 border-t border-primary/10 animate-in fade-in duration-150">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium text-foreground">
                    Preset Options List
                  </Label>
                  <TagsInput
                    value={pinOptions}
                    onChange={handleOptionsChange}
                    placeholder="Type option and press Enter..."
                    className="text-xs bg-background"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {isCollection
                      ? "Presets that users can quickly toggle on/off as multi-select chips."
                      : "Options available in dropdown/combobox for this pin."}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="space-y-0.5">
                    <Label className="text-[11px] font-medium">Allow Custom Values</Label>
                    <p className="text-[10px] text-muted-foreground">
                      {isCollection
                        ? "Allow typing free-text tags beyond presets"
                        : "Allow free-text input beyond presets"}
                    </p>
                  </div>
                  <Switch
                    isSelected={parsedMetadata.allowCustom ?? true}
                    onChange={handleToggleAllowCustom}
                  />
                </div>
              </div>
            )}

            {/* Sub-config for Multiline Textarea */}
            {controlType === "textarea" && (
              <div className="space-y-1.5 pt-2 border-t border-primary/10 animate-in fade-in duration-150">
                <Label className="text-[11px] font-medium text-foreground">
                  Visible Rows (Height)
                </Label>
                <Input
                  type="number"
                  min={2}
                  max={20}
                  className="h-8 text-xs bg-background"
                  value={parsedMetadata.rows || 4}
                  onChange={(e) => handleRowsChange(Number(e.target.value) || 4)}
                />
              </div>
            )}
          </div>
        )}

        {/* Input specific fields */}
        {isInput && (
          <>
            {/* Is Required */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">Required Pin</Label>
                <p className="text-[11px] text-muted-foreground">
                  Pipeline cannot run if this input pin is unresolved.
                </p>
              </div>
              <Switch
                isSelected={pin.isRequired ?? true}
                onChange={(checked: boolean) =>
                  onUpdatePin({ ...pin, isRequired: checked })
                }
              />
            </div>

            {/* Default Value */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Default Fallback Value</Label>
              {controlType === "select" && pinOptions.length > 0 && !isCollection ? (
                <Select
                  selectedKey={String(pin.defaultValue || pinOptions[0] || "")}
                  onSelectionChange={(key) =>
                    onUpdatePin({
                      ...pin,
                      defaultValue: String(key),
                    })
                  }
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pinOptions.map((opt) => (
                      <SelectItem key={opt} id={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="font-mono text-xs"
                  placeholder="Optional (e.g. 4096 or 'default_val')"
                  value={
                    pin.defaultValue !== null && pin.defaultValue !== undefined
                      ? String(pin.defaultValue)
                      : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdatePin({
                      ...pin,
                      defaultValue: val === "" ? null : val,
                    });
                  }}
                />
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
