import { useNavigate, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FormPageShell } from "@/components/layout/shells/FormPageShell";
import { CreateUserForm } from "../components/CreateUserForm";
import { useCreateUser } from "../hooks/useUsers";
import type { CreateUserDetailOutput } from "../schemas/createUserSchema";

export function CreateUserPage() {
    const { t } = useTranslation("users");
    const navigate = useNavigate();
    const router = useRouter();
    const { mutate, isPending } = useCreateUser();

    const handleSubmit = (data: CreateUserDetailOutput) => {
        mutate(
            { data },
            {
                onSuccess: () => {
                    navigate({ to: "/users" });
                }
            }
        );
    };

    return (
        <FormPageShell
            title={t("create.title", { defaultValue: "Create User" })}
            description={t("create.description", { defaultValue: "Add a new user to the system." })}
            formId="create-user-form"
            isPending={isPending}
            submitLabel={t("create.submit", { defaultValue: "Create" })}
            onCancel={() => router.history.back()}
            cancelLabel={t("common:cancel", { defaultValue: "Cancel" })}
        >
            <CreateUserForm onSubmit={handleSubmit} />
        </FormPageShell>
    );
}
