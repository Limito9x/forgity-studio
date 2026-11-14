import { useDialogStore } from "@/stores/dialogStore";
import { getRegistry } from "@/lib/dialog-registry";
import { useMemo, Suspense } from "react";

export function DialogRenderer() {
    const dialogs = useDialogStore((state) => state.dialogs);
    const closeDialog = useDialogStore((state) => state.closeDialog);
    
    // Lấy ra danh sách các dialog đang mở và có trong registry
    const activeDialogs = useMemo(() => {
        const registry = getRegistry();
        return Object.values(dialogs)
            .filter((entry) => entry.isOpen && registry.has(entry.id))
            .map((entry) => ({
                id: entry.id,
                Component: registry.get(entry.id)!,
                data: entry.data
            }));
    }, [dialogs]);

    return (
        <>
            {activeDialogs.map(({ id, Component, data }) => (
                <Suspense key={id} fallback={null}>
                    <Component
                        open={true}
                        onOpenChange={(open: boolean) => {
                            if (!open) closeDialog(id);
                        }}
                        data={data}
                    />
                </Suspense>
            ))}
        </>
    );
}
