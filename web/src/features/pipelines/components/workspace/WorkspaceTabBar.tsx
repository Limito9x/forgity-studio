import { Boxes, KeyRound, Layers, Workflow, X, Cpu } from "lucide-react";
import type { WorkspaceTab } from "../../stores/useWorkspaceTabsStore";

interface WorkspaceTabBarProps {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function WorkspaceTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
}: WorkspaceTabBarProps) {
  const getTabIcon = (tab: WorkspaceTab) => {
    if (tab.kind === "palette") return <Cpu className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    if (tab.kind === "structs") return <Boxes className="h-3.5 w-3.5 text-indigo-400 shrink-0" />;
    if (tab.kind === "constants") return <KeyRound className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
    if (tab.pipelineKind === "component") return <Layers className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    return <Workflow className="h-3.5 w-3.5 text-primary shrink-0" />;
  };

  return (
    <div className="h-9 border-b border-border/70 bg-card/60 px-2 flex items-center justify-between gap-2 shrink-0 select-none overflow-x-auto">
      {/* Open Tabs */}
      <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer transition-colors shrink-0 max-w-[200px] border ${
                isActive
                  ? "bg-background text-foreground border-border/80 shadow-xs font-medium"
                  : "bg-transparent text-muted-foreground border-transparent hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              {getTabIcon(tab)}
              <span className="truncate">{tab.title}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity"
                aria-label={`Close ${tab.title}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

