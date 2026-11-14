import { BaseFormDialog } from "@/components/custom-ui/overlays/dialog/BaseFormDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { CreateTagForm } from "../components/CreateTagForm";
import { useCreateTag } from "../hooks/useTags";
import { toast } from "sonner";

export interface CreateTagData {
    projectId: string;
    parentPath?: string;
}

export function CreateTagDialog({
    open,
    onOpenChange,
    data,
}: DialogProps<CreateTagData>) {
    const createTagMutation = useCreateTag();
    const isPending = createTagMutation.isPending;

    if (!data?.projectId) return null;

    return (
        <BaseFormDialog
            open={open}
            onOpenChange={onOpenChange}
            title={data.parentPath ? `Add Child Tag under ${data.parentPath}` : "Create GameplayTag"}
            formId="create-tag-form"
            isPending={isPending}
            size="sm"
        >
            <CreateTagForm
                projectId={data.projectId}
                initialPath={data.parentPath}
                onSubmit={(values) => {
                    createTagMutation.mutate(
                        { data: values },
                        {
                            onSuccess: () => {
                                toast.success("Tag created successfully");
                                onOpenChange(false);
                            },
                            onError: (err: any) => {
                                toast.error(err?.response?.data?.message || "Failed to create tag");
                            },
                        }
                    );
                }}
            />
        </BaseFormDialog>
    );
}
