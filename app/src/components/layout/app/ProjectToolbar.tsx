import { useProjectToolbarStore } from "@/stores/projectToolbarStore";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function ProjectToolbar() {
    const { tools, activePanelId, togglePanel } = useProjectToolbarStore();
    const [isHovered, setIsHovered] = useState(false);

    if (tools.length === 0) {
        return null;
    }

    const activeTool = tools.find((t) => t.id === activePanelId);
    const ActivePanelComponent = activeTool?.panel;

    return (
        <>
            {/* Right side floating toolbar strip */}
            <div
                className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center select-none"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div
                    className={cn(
                        "bg-card/95 backdrop-blur-md border border-r-0 border-border/80 rounded-l-xl p-1.5 shadow-xl transition-all duration-300 flex flex-col items-center gap-2",
                        isHovered || activePanelId !== null
                            ? "translate-x-0 opacity-100 ring-1 ring-primary/20"
                            : "translate-x-3 opacity-70 hover:translate-x-0 hover:opacity-100"
                    )}
                >
                    {/* Tool Buttons */}
                    <div className="flex flex-col gap-1.5">
                        {tools.map((tool) => {
                            const Icon = tool.icon;
                            const isActive = activePanelId === tool.id;

                            return (
                                <button
                                    key={tool.id}
                                    type="button"
                                    onClick={() => togglePanel(tool.id)}
                                    title={tool.label}
                                    className={cn(
                                        "relative group flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer",
                                        isActive
                                            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                                    )}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tool.badge != null && (
                                        <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                                            {tool.badge}
                                        </span>
                                    )}

                                    {/* Tooltip on hover */}
                                    <div className="absolute right-full mr-2 px-2 py-1 bg-popover/95 border border-border text-popover-foreground text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-md z-50">
                                        {tool.label}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Active Floating Panel */}
            {ActivePanelComponent && <ActivePanelComponent />}
        </>
    );
}
