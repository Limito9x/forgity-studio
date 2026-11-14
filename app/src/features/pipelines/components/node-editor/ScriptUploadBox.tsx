import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Wand2, Loader2, FileCode, CheckCircle2, Code, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScriptUploadBoxProps {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  scriptContent: string;
  onChangeScriptContent: (code: string) => void;
  isDetecting: boolean;
  onAutoDetect: () => void;
}

export function ScriptUploadBox({
  selectedFile,
  onFileSelect,
  scriptContent,
  onChangeScriptContent,
  isDetecting,
  onAutoDetect,
}: ScriptUploadBoxProps) {
  const [tab, setTab] = useState<"file" | "code">("file");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <Card className="border shadow-xs bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-bold flex items-center gap-1.5">
              <FileCode className="size-4 text-primary" />
              Python Script Definition
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Upload a `.py` script containing `def main(...)`. The parser will extract Input & Output Pins.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 shrink-0"
            isDisabled={isDetecting || (!selectedFile && !scriptContent.trim())}
            onPress={onAutoDetect}
          >
            {isDetecting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wand2 className="size-3.5 text-primary" />
            )}
            Auto-Detect Schema
          </Button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/30 border w-fit">
          <button
            type="button"
            onClick={() => setTab("file")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer",
              tab === "file"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileUp className="size-3.5" />
            Upload File (.py)
          </button>
          <button
            type="button"
            onClick={() => setTab("code")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer",
              tab === "code"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Code className="size-3.5" />
            Direct Code
          </button>
        </div>

        {tab === "file" ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-5 hover:bg-muted/40 transition cursor-pointer relative bg-muted/10">
            <input
              type="file"
              accept=".py,text/plain,text/x-python"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={handleInputChange}
            />
            {selectedFile ? (
              <div className="flex items-center gap-2 text-primary font-medium text-xs">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>{selectedFile.name}</span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            ) : (
              <div className="text-center space-y-1">
                <Upload className="size-6 text-muted-foreground mx-auto" />
                <p className="text-xs font-semibold">Drop or choose your `.py` automation script</p>
                <p className="text-[11px] text-muted-foreground">
                  Accepts Blender bpy or pure Python pipeline scripts
                </p>
              </div>
            )}
          </div>
        ) : (
          <textarea
            className="w-full h-32 font-mono text-xs p-3 rounded-md border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="def main(input_file: str, resolution: int = 4096):&#10;    return {'output_dir': '/tmp/output'}"
            value={scriptContent}
            onChange={(e) => onChangeScriptContent(e.target.value)}
          />
        )}
      </CardContent>
    </Card>
  );
}
