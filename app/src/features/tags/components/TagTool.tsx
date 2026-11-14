import { useEffect } from "react";
import { useProjectToolbarStore } from "@/stores/projectToolbarStore";
import { Tag } from "lucide-react";
import { TagPanel } from "./TagPanel";

interface TagToolProps {
    projectId: string;
    scope?: string;
    contextTitle?: string;
    order?: number;
}

export function TagTool({
    projectId,
    scope = "inspection",
    contextTitle,
    order = 10,
}: TagToolProps) {
    const registerTool = useProjectToolbarStore((s) => s.registerTool);
    const unregisterTool = useProjectToolbarStore((s) => s.unregisterTool);

    useEffect(() => {
        if (!projectId) return;

        registerTool({
            id: "tag-panel",
            icon: Tag,
            label: "Tags Panel",
            order,
            panel: () => (
                <TagPanel
                    projectId={projectId}
                    contextTitle={contextTitle}
                />
            ),
        });

        return () => {
            unregisterTool("tag-panel");
        };
    }, [projectId, scope, contextTitle, order, registerTool, unregisterTool]);

    return null;
}
