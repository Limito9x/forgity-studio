import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Cpu, Tag, Sparkles } from "lucide-react";

interface NodeMetaFormProps {
  name: string;
  onChangeName: (val: string) => void;
  label: string;
  onChangeLabel: (val: string) => void;
  executor: "blender" | "python" | "unreal";
  onChangeExecutor: (val: "blender" | "python" | "unreal") => void;
}

export function NodeMetaForm({
  name,
  onChangeName,
  label,
  onChangeLabel,
  executor,
  onChangeExecutor,
}: NodeMetaFormProps) {
  return (
    <Card className="border shadow-xs bg-card">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Tag className="size-3.5 text-primary" />
              Node Identifier / Key <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g. GenerateUVMaps"
              value={name}
              onChange={(e) => onChangeName(e.target.value)}
              className="h-9 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">Unique identifier within project.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              Display Title
            </Label>
            <Input
              placeholder="e.g. Generate UV Maps"
              value={label}
              onChange={(e) => onChangeLabel(e.target.value)}
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">Readable title displayed on canvas.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Cpu className="size-3.5 text-primary" />
              Runtime Environment
            </Label>
            <Select
              selectedKey={executor}
              onSelectionChange={(key) => onChangeExecutor(String(key) as "blender" | "python" | "unreal")}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem id="blender">Blender Worker (bpy)</SelectItem>
                <SelectItem id="unreal">Unreal Engine Worker (unreal)</SelectItem>
                <SelectItem id="python">Native Python 3 Worker</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Execution target on Runner side.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
