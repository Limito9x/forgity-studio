import { useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Edit, ShieldAlert, UserIcon, Mail, Phone, Hash, TypeIcon, ShieldCheck } from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DescriptionList, DescriptionListItem } from "@/components/custom-ui/data-display/DescriptionList";
import { SinglePageShell } from "@/components/layout/shells/SinglePageShell";
import { useGetUserById } from "../hooks/useUsers";

export function UserDetailPage() {
    const { t } = useTranslation("users");
    const navigate = useNavigate();
    const { id } = useParams({ strict: false }) as { id: string };

    const { data: user, isLoading } = useGetUserById(id);
    const openDialog = useDialogStore((state) => state.openDialog);

    if (isLoading) {
        return (
            <SinglePageShell title={t("detail.title", { defaultValue: "User Details" })}>
                <div className="flex h-32 items-center justify-center">
                    <span className="text-muted-foreground">{t("loading", { defaultValue: "Loading..." })}</span>
                </div>
            </SinglePageShell>
        );
    }

    if (!user) {
        return (
            <SinglePageShell title={t("detail.title", { defaultValue: "User Details" })}>
                <div className="flex h-32 items-center justify-center">
                    <span className="text-destructive">{t("notFound", { defaultValue: "User not found" })}</span>
                </div>
            </SinglePageShell>
        );
    }

    return (
        <SinglePageShell
            title={user.displayName || user.userName}
            description={t("detail.description", { defaultValue: "View user information and settings." })}
            headerActions={
                <>
                    <Button
                        variant="outline"
                        onClick={() => openDialog("assign-user-roles", { id: user.id! })}
                    >
                        <ShieldAlert className="mr-2 h-4 w-4" />
                        {t("actions.assignRoles", { defaultValue: "Assign Roles" })}
                    </Button>
                    <Button onClick={() => navigate({ to: `/users/$id/edit`, params: { id } })}>
                        <Edit className="mr-2 h-4 w-4" />
                        {t("actions.edit", { defaultValue: "Edit User" })}
                    </Button>
                </>
            }
        >
            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-1 flex flex-col gap-6">
                    {/* User Profile Card */}
                    <div className="rounded-lg border bg-card p-6 shadow-sm flex flex-col items-center text-center">
                        <Avatar className="h-24 w-24 mb-4 border-4 border-background shadow-sm">
                            <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
                                {user.displayName?.charAt(0) || user.userName?.charAt(0) || "U"}
                            </AvatarFallback>
                        </Avatar>
                        <h2 className="text-xl font-bold">{user.displayName || user.userName}</h2>
                        <p className="text-muted-foreground text-sm mb-4">{user.email}</p>

                        <div className="flex gap-2 mb-2">
                            {user.status === 1 ? (
                                <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                                    {t("status.active", { defaultValue: "Active" })}
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="bg-gray-500/10 text-gray-600 hover:bg-gray-500/20">
                                    {user.status === 2 ? t("status.inactive", { defaultValue: "Inactive" }) : t("status.suspended", { defaultValue: "Suspended" })}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 flex flex-col gap-6">
                    {/* Details Card */}
                    <div className="rounded-lg border bg-card p-6 shadow-sm">
                        <h3 className="mb-4 text-lg font-medium border-b pb-2 flex items-center gap-2">
                            <UserIcon className="h-5 w-5 text-muted-foreground" />
                            {t("detail.profileInfo", { defaultValue: "Profile Information" })}
                        </h3>
                        <DescriptionList>
                            <DescriptionListItem
                                label={t("fields.firstName", { defaultValue: "First Name" })}
                                icon={<TypeIcon className="h-4 w-4" />}
                                value={user.firstName || "-"}
                            />
                            <DescriptionListItem
                                label={t("fields.lastName", { defaultValue: "Last Name" })}
                                icon={<TypeIcon className="h-4 w-4" />}
                                value={user.lastName || "-"}
                            />
                            <DescriptionListItem
                                label={t("fields.userName", { defaultValue: "Username" })}
                                icon={<Hash className="h-4 w-4" />}
                                value={user.userName}
                            />
                            <DescriptionListItem
                                label={t("fields.email", { defaultValue: "Email" })}
                                icon={<Mail className="h-4 w-4" />}
                                value={user.email}
                            />
                            <DescriptionListItem
                                label={t("fields.phoneNumber", { defaultValue: "Phone Number" })}
                                icon={<Phone className="h-4 w-4" />}
                                value={user.phoneNumber || "-"}
                            />
                        </DescriptionList>
                    </div>

                    {/* System Info Card */}
                    <div className="rounded-lg border bg-card p-6 shadow-sm">
                        <h3 className="mb-4 text-lg font-medium border-b pb-2 flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                            {t("detail.systemInfo", { defaultValue: "System Information" })}
                        </h3>
                        <DescriptionList>
                            <DescriptionListItem
                                label={t("fields.roles", { defaultValue: "Assigned Roles" })}
                                colSpan={2}
                            >
                                {user.roles && user.roles.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {user.roles.map((role: any) => (
                                            <Badge key={role.id || role.name || role} variant="secondary">
                                                {role.name || role}
                                            </Badge>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-muted-foreground italic bg-muted/50 px-3 py-1 rounded-md">{t("detail.noRoles", { defaultValue: "No roles assigned" })}</span>
                                )}
                            </DescriptionListItem>
                            <DescriptionListItem
                                label={t("fields.id", { defaultValue: "User ID" })}
                                colSpan={2}
                            >
                                <span className="font-mono text-xs break-all bg-muted/50 p-2 rounded-md border block">{user.id}</span>
                            </DescriptionListItem>
                        </DescriptionList>
                    </div>
                </div>
            </div>
        </SinglePageShell>
    );
}
