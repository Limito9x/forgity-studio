import { useState } from "react";
import { Boxes, Layers, Trash2, } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocalPaletteQuery } from "../../hooks/workspace";
import type { LocalStructDefinition, LocalStructField } from "../../types/workspaceConfig";

interface LocalStructsManagerPageProps {
  rootPath?: string | null;
}

export function LocalStructsManagerPage({ rootPath }: LocalStructsManagerPageProps) {
  const { localStructs, deleteLocalStruct } = useLocalPaletteQuery(rootPath ?? null);
  const [selectedStruct, setSelectedStruct] = useState<LocalStructDefinition | null>(
    localStructs.length > 0 ? localStructs[0] : null
  );

  const activeStruct = localStructs.find((s: LocalStructDefinition) => s.slug === selectedStruct?.slug) || localStructs[0] || null;

  const handleDelete = async (slug: string) => {
    try {
      await deleteLocalStruct(slug);
      toast.success(`Deleted struct '${slug}'`);
      if (selectedStruct?.slug === slug) {
        setSelectedStruct(null);
      }
    } catch (err: any) {
      toast.error("Failed to delete struct", { description: err?.message });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Top Header */}
      <div className="h-12 border-b border-border/80 px-4 flex items-center justify-between shrink-0 bg-card/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary shrink-0" />
            <div>
              <h1 className="text-sm font-semibold text-foreground">Local Data Structs</h1>
              <p className="text-[11px] text-muted-foreground">
                Auto-detected schemas from Python scripts
              </p>
            </div>
          </div>
        </div>

        <Badge variant="outline" className="text-xs font-mono">
          {localStructs.length} {localStructs.length === 1 ? "Struct" : "Structs"}
        </Badge>
      </div>

      {/* Main 2-Column Flat Layout */}
      <div className="flex-1 grid grid-cols-12 min-h-0 divide-x divide-border/60 overflow-hidden">
        {/* Left Column: Structs List */}
        <div className="col-span-4 flex flex-col h-full overflow-hidden bg-card/10">
          <div className="px-4 py-2 border-b border-border/60 bg-muted/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
            Available Structs ({localStructs.length})
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border/30">
            {localStructs.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <Boxes className="h-8 w-8 mx-auto mb-2 opacity-30 text-primary" />
                <p className="font-medium text-foreground">No Structs Detected</p>
                <p className="mt-1">Define @dataclass or TypedDict in scripts and click Sync.</p>
              </div>
            ) : (
              localStructs.map((st: LocalStructDefinition) => {
                const isSelected = activeStruct?.slug === st.slug;
                return (
                  <div
                    key={st.slug}
                    onClick={() => setSelectedStruct(st)}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer text-xs transition-colors ${isSelected
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted/30 text-foreground"
                      }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Layers className={`h-4 w-4 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{st.displayName || st.slug}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">{st.slug}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4">
                        {st.fields.length} {st.fields.length === 1 ? "field" : "fields"}
                      </Badge>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(st.slug);
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
                        aria-label="Delete Struct"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Struct Detail & Fields Inspector (Full-bleed flat) */}
        <div className="col-span-8 flex flex-col h-full overflow-hidden bg-background">
          {activeStruct ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Header Bar */}
              <div className="px-4 py-2 border-b border-border/80 bg-card/30 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span>{activeStruct.displayName || activeStruct.slug}</span>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {activeStruct.slug}
                    </Badge>
                  </h2>
                  {activeStruct.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{activeStruct.description}</p>
                  )}
                </div>

                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs py-0.5 px-2">
                  Pure Companion Nodes
                </Badge>
              </div>

              {/* Fields Table Header */}
              <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 border-b border-border/60 shrink-0">
                <div className="col-span-1">#</div>
                <div className="col-span-5">Field Name</div>
                <div className="col-span-3">Type</div>
                <div className="col-span-3 text-right">Default Value</div>
              </div>

              {/* Fields List */}
              <div className="flex-1 overflow-y-auto divide-y divide-border/30">
                {activeStruct.fields.map((f: LocalStructField, idx: number) => (
                  <div key={f.name} className="grid grid-cols-12 gap-3 items-center px-4 py-2.5 hover:bg-muted/15 transition-colors text-xs">
                    <div className="col-span-1 font-mono text-muted-foreground">
                      #{idx + 1}
                    </div>

                    <div className="col-span-5 min-w-0">
                      <span className="font-mono font-semibold text-foreground block truncate">
                        {f.name}
                      </span>
                      {f.label && f.label !== f.name && (
                        <span className="text-[10px] text-muted-foreground block truncate">
                          {f.label}
                        </span>
                      )}
                    </div>

                    <div className="col-span-3 flex items-center gap-1.5">
                      <Badge variant="outline" className="font-mono text-xs text-indigo-400 border-indigo-500/30">
                        {f.type}
                      </Badge>
                      {f.cardinality === "Array" && (
                        <Badge variant="secondary" className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          Array
                        </Badge>
                      )}
                    </div>

                    <div className="col-span-3 text-right font-mono text-muted-foreground text-[11px] truncate">
                      {f.defaultValue !== undefined ? JSON.stringify(f.defaultValue) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
              <Boxes className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-xs">Select a struct on the left to view fields and schema definition.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
