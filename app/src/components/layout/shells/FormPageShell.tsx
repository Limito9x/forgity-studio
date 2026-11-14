import * as React from "react";
import { SinglePageShell, type SinglePageShellProps } from "./SinglePageShell";
import { FormSubmitButton } from "@/components/form/FormSubmitButton";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface FormPageShellProps extends Omit<SinglePageShellProps, "children"> {
    children: React.ReactNode;
    /** The ID of the form to submit. If provided, standard submit button is rendered. */
    formId?: string;
    /** Submit button loading state */
    isPending?: boolean;
    /** Custom text for submit button. Defaults to "Save Changes" */
    submitLabel?: string;
    /** Function to call when cancel is clicked. */
    onCancel?: () => void;
    /** Custom text for cancel button. Defaults to "Cancel" */
    cancelLabel?: string;
    /** Optional custom actions to render next to the cancel/submit buttons */
    footerActions?: React.ReactNode;
    /** Optional class name for the card container */
    cardClassName?: string;
}

export function FormPageShell({
    title,
    description,
    children,
    formId,
    isPending = false,
    submitLabel,
    onCancel,
    cancelLabel,
    footerActions,
    cardClassName,
    ...props
}: FormPageShellProps) {
    const { t } = useTranslation("common");

    const renderFooter = () => {
        if (!formId && !onCancel && !footerActions) return null;

        return (
            <div className="flex items-center justify-end gap-3 border-t pt-6">
                {footerActions}
                {onCancel && (
                    <Button type="button" variant="outline" onClick={onCancel}>
                        {cancelLabel || t("cancel", { defaultValue: "Cancel" })}
                    </Button>
                )}
                {formId && (
                    <FormSubmitButton formId={formId} loading={isPending}>
                        {submitLabel || t("saveChanges", { defaultValue: "Save Changes" })}
                    </FormSubmitButton>
                )}
            </div>
        );
    };

    return (
        <SinglePageShell title={title} description={description} {...props}>
            <div className={cn("bg-card p-6 rounded-lg border shadow-sm flex flex-col gap-6", cardClassName)}>
                {children}
                {renderFooter()}
            </div>
        </SinglePageShell>
    );
}
