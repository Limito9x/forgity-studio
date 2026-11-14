import { Link } from '@tanstack/react-router'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useTranslation } from "react-i18next"
import { toast } from 'sonner'
import { Form, FormGrid, zodResolver, useForm } from "@/components/form"
import { FormInput } from "@/components/form-controls"
import { useChangePassword } from '@/gen/endpoints/profile/profile'
import { changePasswordSchema, type ChangePasswordInput, type ChangePasswordOutput } from '../schemas/securitySchema'

export function SecuritySettings() {
  const { t } = useTranslation("settings")
  const changePassword = useChangePassword()

  const form = useForm<ChangePasswordInput, any, ChangePasswordOutput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }
  })

  const onSubmit = (data: ChangePasswordOutput) => {
    changePassword.mutate(
      { 
        data: {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        } 
      },
      {
        onSuccess: () => {
          toast.success(t("security.messages.passwordChanged", { defaultValue: "Password updated successfully" }))
          form.reset()
        },
        onError: (error: any) => {
          toast.error(error?.message || t("security.messages.passwordFailed", { defaultValue: "Failed to update password" }))
        }
      }
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 md:hidden mb-4">
          <Link to="/settings" className={buttonVariants({ variant: "ghost", size: "icon", className: "-ml-2" })}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h3 className="text-lg font-medium">{t("profile.settings", { defaultValue: "Settings" })}</h3>
        </div>
        <h3 className="text-lg font-medium">{t("security.title", { defaultValue: "Security" })}</h3>
        <p className="text-sm text-muted-foreground">
          {t("security.description", { defaultValue: "Manage your password and security preferences." })}
        </p>
      </div>
      <Separator />

      {/* Form */}
      <div className="space-y-8 max-w-2xl">
        <Form form={form} formId="change-password-form" onSubmit={onSubmit}>
          <FormGrid cols={1}>
            <FormInput
              control={form.control}
              name="currentPassword"
              type="password"
              label={t("security.form.currentPassword", { defaultValue: "Current Password" })}
            />
            <FormInput
              control={form.control}
              name="newPassword"
              type="password"
              label={t("security.form.newPassword", { defaultValue: "New Password" })}
              description={t("security.form.newPasswordHint", { defaultValue: "Must be at least 6 characters long." })}
            />
            <FormInput
              control={form.control}
              name="confirmPassword"
              type="password"
              label={t("security.form.confirmPassword", { defaultValue: "Confirm Password" })}
            />
          </FormGrid>
          
          <div className="mt-6">
            <Button type="submit" isDisabled={changePassword.isPending}>
              {changePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("security.form.updatePassword", { defaultValue: "Update password" })}
            </Button>
          </div>
        </Form>
      </div>
    </div>
  )
}
