import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DescriptionList, DescriptionListItem } from "@/components/custom-ui/data-display/DescriptionList";
import { SinglePageShell } from "@/components/layout/shells/SinglePageShell";
import { useGetContentType } from "../hooks/useContentTypes";
import { useDialogStore } from "@/stores/dialogStore";
import { useProjectNav } from "@/lib/navigation/useProjectNav";

export function ContentTypeDetailPage() {
    const { t } = useTranslation("contentTypes");
    const nav = useProjectNav();
    const openDialog = useDialogStore((state) => state.openDialog);
    const { projectId, contentTypeId } = useParams({ strict: false }) as { projectId: string; contentTypeId: string };

    const { data: item, isLoading } = useGetContentType(projectId, contentTypeId);

    if (isLoading) {
        return (
            <SinglePageShell title={t("detail.title", { defaultValue: "ContentType Details" })}>
                <div className="flex h-32 items-center justify-center">
                    <span className="text-muted-foreground">{t("common:loading", { defaultValue: "Loading..." })}</span>
                </div>
            </SinglePageShell>
        );
    }

    if (!item) {
        return (
            <SinglePageShell title={t("detail.title", { defaultValue: "ContentType Details" })}>
                <div className="flex h-32 items-center justify-center">
                    <span className="text-muted-foreground">{t("common:notFound", { defaultValue: "Not found." })}</span>
                </div>
            </SinglePageShell>
        );
    }

    return (
        <SinglePageShell
            title={t("detail.title", { defaultValue: "ContentType Details" })}
            description={t("detail.description", { defaultValue: "View contentType information." })}
            headerActions={
                <>
                    <Button
                        variant="outline"
                        onClick={() => nav.toContentTypes()}
                    >
                        {t("common:back", { defaultValue: "Back" })}
                    </Button>
                    <Button
                        onClick={() => openDialog("update-content-type", { item })}
                    >
                        <Edit className="mr-2 h-4 w-4" />
                        {t("actions.update", { defaultValue: "Edit" })}
                    </Button>
                </>
            }
        >
            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <DescriptionList>
                    <DescriptionListItem
                        label={t("fields.displayName", { defaultValue: "Display Name" })}
                        value={item.displayName}
                    />
                    <DescriptionListItem
                        label={t("fields.key", { defaultValue: "Key" })}
                        value={<span className="font-mono text-xs">{item.key}</span>}
                    />
                    <DescriptionListItem
                        label={t("fields.description", { defaultValue: "Description" })}
                        value={item.description || "-"}
                    />
                </DescriptionList>
            </div>
        </SinglePageShell>
    );
}
