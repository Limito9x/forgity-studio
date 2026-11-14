import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { BulkCreateTagForm } from "../components/BulkCreateTagForm";
import { useCreateTagsBulk } from "../hooks/useTags";
import { toast } from "sonner";
import type { BulkCreateTagInput } from "../schemas/bulkCreateTagSchema";

export interface BulkCreateTagData {
    projectId: string;
    parentPath?: string;
}

export function BulkCreateTagDialog({ open, onOpenChange, data }: DialogProps<BulkCreateTagData>) {
    const bulkMutation = useCreateTagsBulk();
    const isPending = bulkMutation.isPending;

    if (!data?.projectId) return null;

    const title = data.parentPath ? `Bulk Create Tags under ${data.parentPath}` : "Bulk Create Tags";

    const handleSubmit = (values: BulkCreateTagInput) => {
        const rows = values.rows.map((r) => ({ name: r.name.trim(), color: (r.color as string) ?? null }));
        bulkMutation.mutate(
            {
                projectId: data.projectId,
                parentPath: data.parentPath ?? null,
                rows,
            },
            {
                onSuccess: (res: any) => {
                    const payload = res?.data ?? res;
                    const created: unknown[] = payload?.created ?? [];
                    const failed: { reason: string }[] = payload?.failed ?? [];
                    if (failed.length === 0) {
                        toast.success(`Created ${created.length} tag(s)`);
                    } else if (created.length === 0) {
                        toast.error(`Failed: ${failed.map((f) => f.reason).join("; ")}`);
                        return;
                    } else {
                        toast.success(`Created ${created.length}/${created.length + failed.length} — ${failed.length} failed`);
                        toast.error(failed.map((f) => f.reason).slice(0, 3).join("; "));
                    }
                    onOpenChange(false);
                },
                onError: (err: any) => {
                    const msg = err?.response?.data?.message ?? err?.response?.data?.title ?? "Bulk create failed";
                    toast.error(msg);
                },
            }
        );
    };

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            description={data.parentPath ? `${data.parentPath}.<Name> • 1–50 rows` : "1–50 rows"}
            formId="bulk-create-tag-form"
            isPending={isPending}
            size="xl"
        >
            <BulkCreateTagForm projectId={data.projectId} parentPath={data.parentPath} formId="bulk-create-tag-form" onSubmit={handleSubmit} />
        </BaseFormDialog>
    );
}
