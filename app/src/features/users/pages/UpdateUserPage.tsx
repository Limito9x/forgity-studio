import { useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FormPageShell } from "@/components/layout/shells/FormPageShell";
import { UpdateUserForm } from "../components/UpdateUserForm";
import { useUpdateUser } from "../hooks/useUsers";
import type { UpdateUserValues } from "../schemas/updateUserSchema";

export function UpdateUserPage() {
    const { t } = useTranslation("users");
    const navigate = useNavigate();
    const router = useRouter();
    const { id } = useParams({ strict: false }) as { id: string };

    const { mutate, isPending } = useUpdateUser();

    const handleSubmit = (data: UpdateUserValues) => {
        mutate(
            { id, data },
            {
                onSuccess: () => {
                    navigate({ to: "/users/$id", params: { id } });
                }
            }
        );
    };

    return (
        <FormPageShell
            title={t("update.title", { defaultValue: "Edit User" })}
            description={t("update.description", { defaultValue: "Modify user information." })}
            formId={`update-user-form-${id}`}
            isPending={isPending}
            submitLabel={t("update.submit", { defaultValue: "Save Changes" })}
            onCancel={() => router.history.back()}
            cancelLabel={t("common:cancel", { defaultValue: "Cancel" })}
        >
            <UpdateUserForm id={id} onSubmit={handleSubmit} />
        </FormPageShell>
    );
}
