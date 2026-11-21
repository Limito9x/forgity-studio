import { Layers, Workflow } from "lucide-react";
import type { TemplateContainerMemberDto } from "@/gen/model";

interface TemplateOutlinerProps {
  members: TemplateContainerMemberDto[];
  selectedVersionId: string | null;
  onSelect: (versionId: string) => void;
}

export function TemplateOutliner({
  members,
  selectedVersionId,
  onSelect,
}: TemplateOutlinerProps) {
  const masterMembers = members.filter((m) => m.role === "master");
  const componentMembers = members.filter((m) => m.role === "component");

  return (
    <aside className="w-60 border-r border-border/60 bg-background/50 p-3 overflow-y-auto shrink-0 space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
          <Workflow className="size-3.5 text-primary" />
          <span>Master Pipelines ({masterMembers.length})</span>
        </div>
        {masterMembers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground px-1">None</p>
        ) : (
          <div className="space-y-1">
            {masterMembers.map((m) => (
              <button
                key={m.pipelineVersionId}
                type="button"
                onClick={() => onSelect(m.pipelineVersionId)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs truncate transition-colors cursor-pointer ${
                  selectedVersionId === m.pipelineVersionId
                    ? "bg-primary/15 text-primary font-medium"
                    : "hover:bg-accent/50 text-foreground"
                }`}
              >
                {m.slug}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
          <Layers className="size-3.5 text-amber-500" />
          <span>Components ({componentMembers.length})</span>
        </div>
        {componentMembers.length === 0 ? (
          <p className="text-[11px] text-muted-foreground px-1">None</p>
        ) : (
          <div className="space-y-1">
            {componentMembers.map((c) => (
              <button
                key={c.pipelineVersionId}
                type="button"
                onClick={() => onSelect(c.pipelineVersionId)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs truncate transition-colors cursor-pointer ${
                  selectedVersionId === c.pipelineVersionId
                    ? "bg-amber-500/15 text-amber-500 font-medium"
                    : "hover:bg-accent/50 text-foreground"
                }`}
              >
                {c.slug}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
