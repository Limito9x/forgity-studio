import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ProjectSidebar } from "./ProjectSidebar";
import { MobileNavigationClose } from "./AppShell";
import { AppHeader } from "./AppHeader";
import { ProjectToolbar } from "./ProjectToolbar";
import {
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    pointerWithin,
    rectIntersection,
    type CollisionDetection,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import { useCreateTagLink } from "@/features/tags/hooks/useTags";
import { DraggableTagCard } from "@/features/tags/components/DraggableTagCard";
import { useProjectToolbarStore } from "@/stores/projectToolbarStore";
import type { DraggableTagPayload, TagDropZonePayload } from "@/features/tags/types";
import { TagTool } from "@/features/tags/components/TagTool";
import { toast } from "sonner";

import type { Modifier } from "@dnd-kit/core";

const collisionDetectionStrategy: CollisionDetection = (args) => {
    // 1. Try pointer-first collision detection
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
        return pointerCollisions;
    }
    // 2. Fallback to bounding rect intersection (for small cells)
    return rectIntersection(args);
};

const snapCenterToCursor: Modifier = ({
    activatorEvent,
    draggingNodeRect,
    transform,
}) => {
    if (draggingNodeRect && activatorEvent) {
        const eventCoordinates =
            "touches" in activatorEvent && (activatorEvent.touches as TouchList).length > 0
                ? (activatorEvent.touches as TouchList)[0]
                : "clientX" in activatorEvent
                ? (activatorEvent as MouseEvent)
                : null;

        if (!eventCoordinates) return transform;

        const offsetX = eventCoordinates.clientX - draggingNodeRect.left;
        const offsetY = eventCoordinates.clientY - draggingNodeRect.top;

        return {
            ...transform,
            x: transform.x + offsetX - draggingNodeRect.width / 2,
            y: transform.y + offsetY - draggingNodeRect.height / 2,
        };
    }

    return transform;
};

export function ProjectShell({ children }: { children: React.ReactNode }) {
    const { projectId } = useParams({ strict: false }) as { projectId?: string };
    const createTagLink = useCreateTagLink();
    const setIsDragging = useProjectToolbarStore((s) => s.setIsDragging);
    const [activeTag, setActiveTag] = useState<DraggableTagPayload | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 4,
            },
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        const data = event.active.data.current as DraggableTagPayload | undefined;
        if (data?.type === "tag") {
            setActiveTag(data);
            setIsDragging(true);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveTag(null);
        setIsDragging(false);

        const { active, over } = event;
        if (!over) return;

        const activeData = active.data.current as DraggableTagPayload | undefined;
        const overData = over.data.current as TagDropZonePayload | undefined;

        // Guard: check if tag dropped onto a tag drop zone
        if (activeData?.type === "tag" && overData?.type === "tag-drop-zone") {
            const finalProjectId = activeData.projectId || projectId || "";
            createTagLink.mutate(
                {
                    data: {
                        projectId: finalProjectId,
                        tagPath: activeData.tagPath,
                        entityId: overData.entityId,
                        entityType: overData.entityType,
                        targetSubPath: overData.path,
                    },
                },
                {
                    onSuccess: () =>
                        toast.success(
                            `Linked tag '${activeData.tagName}'${overData.path ? ` to ${overData.path}` : ""}`
                        ),
                    onError: (err: any) =>
                        toast.error(err?.response?.data?.message || err?.message || "Failed to link tag"),
                }
            );
        }
    };

    const handleDragCancel = () => {
        setActiveTag(null);
        setIsDragging(false);
    };

    return (
        <SidebarProvider className="h-svh overflow-hidden">
            <MobileNavigationClose />
            <ProjectSidebar />
            <SidebarInset className="flex flex-col h-full">
                <AppHeader showSidebarTrigger={true} />
                <DndContext
                    sensors={sensors}
                    collisionDetection={collisionDetectionStrategy}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                >
                    <div className="flex-1 bg-muted/20 min-w-0 overflow-auto relative">
                        {children}
                        <ProjectToolbar />
                        {projectId ? <TagTool projectId={projectId} /> : null}
                    </div>

                    {/* Smooth Drag Overlay floating over all containers snapped directly to cursor */}
                    <DragOverlay
                        modifiers={[snapCenterToCursor]}
                        dropAnimation={{ duration: 150, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}
                    >
                        {activeTag ? (
                            <div className="w-64 pointer-events-none cursor-grabbing">
                                <DraggableTagCard
                                    tag={{
                                        id: activeTag.tagId,
                                        name: activeTag.tagName,
                                        path: activeTag.tagPath,
                                        color: activeTag.tagColor,
                                        description: activeTag.tagDescription,
                                    }}
                                    isOverlay
                                />
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </SidebarInset>
        </SidebarProvider>
    );
}
