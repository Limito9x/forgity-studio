import { useRef, useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, Upload, Loader2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { Form, FormGrid, zodResolver, useForm } from "@/components/form"
import { FormInput } from "@/components/form-controls"
import { useTranslation } from "react-i18next"

import { useGetProfile, useUpdateProfile, useUpdateAvatar } from '../hooks/useProfile'
import { updateProfileSchema, type UpdateProfileInput, type UpdateProfileOutput } from '../schemas/profileSchema'
import { uploadAssetFlow } from '@/lib/upload-utils'
import { AvatarCropDialog } from './AvatarCropDialog'

export function ProfileSettings() {
  const { t } = useTranslation("settings")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  // Crop states
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string>('')
  const [originalFileName, setOriginalFileName] = useState<string>('avatar.jpg')

  // 1. Fetch Profile
  const { data: profile, isLoading: isProfileLoading } = useGetProfile()
  const updateProfile = useUpdateProfile()
  const updateAvatar = useUpdateAvatar()

  // 2. Setup Form
  const form = useForm<UpdateProfileInput, any, UpdateProfileOutput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      displayName: '',
      phoneNumber: '',
    }
  })

  // Sync form with loaded data
  useEffect(() => {
    if (profile) {
      form.reset({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        displayName: profile.displayName || '',
        phoneNumber: profile.phoneNumber || '',
      })
    }
  }, [profile, form])

  // 3. Submit handler
  const onSubmit = (data: UpdateProfileOutput) => {
    updateProfile.mutate(
      { data: data as any },
      {
        onSuccess: () => {
          toast.success(t("profile.messages.profileUpdated", { defaultValue: "Profile updated successfully" }))
        }
      }
    )
  }

  // 4. File Selection handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setOriginalFileName(file.name)
    const imageUrl = URL.createObjectURL(file)
    setCropImageSrc(imageUrl)
    setIsCropDialogOpen(true)

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // 5. Upload Cropped Avatar
  const handleCropComplete = async (croppedFile: File) => {
    try {
      setIsUploading(true)
      const assetId = await uploadAssetFlow(croppedFile)

      updateAvatar.mutate(
        { data: { assetId, userId: profile?.id, fileName: originalFileName } },
        {
          onSuccess: () => {
            toast.success(t("profile.messages.avatarUpdated", { defaultValue: "Avatar updated successfully" }))
            setIsCropDialogOpen(false)
          },
          onSettled: () => {
            setIsUploading(false)
          }
        }
      )
    } catch (error: any) {
      toast.error(error?.message || t("profile.messages.avatarFailed", { defaultValue: "Failed to upload avatar" }))
      setIsUploading(false)
    }
  }

  const handleCropDialogChange = (open: boolean) => {
    setIsCropDialogOpen(open)
    if (!open && cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc)
      setCropImageSrc('')
    }
  }

  if (isProfileLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
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
        <h3 className="text-lg font-medium">{t("profile.title", { defaultValue: "Profile" })}</h3>
        <p className="text-sm text-muted-foreground">
          {t("profile.description", { defaultValue: "Manage your public profile and personal information." })}
        </p>
      </div>
      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl">
        {/* Left Col: Avatar (was Right Col) */}
        <div className="md:col-span-1 flex flex-col items-center space-y-4 pt-2">
          <h4 className="font-medium text-sm self-start">{t("profile.avatar.title", { defaultValue: "Profile Picture" })}</h4>

          <div className="relative group rounded-full">
            <Avatar className="h-32 w-32 border-4 border-background shadow-sm">
              <AvatarImage src={profile?.avatarUrl ?? undefined} alt={profile?.displayName} className="object-cover" />
              <AvatarFallback className="text-3xl bg-primary/10 text-primary">
                {profile?.displayName?.substring(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>

            {/* Hover overlay (desktop) */}
            <div
              className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-white mb-1" />
                  <span className="text-xs text-white font-medium">{t("profile.avatar.upload", { defaultValue: "Upload" })}</span>
                </>
              )}
            </div>
          </div>

          <div className="text-center space-y-1">
            <Button
              variant="outline"
              size="sm"
              onPress={() => fileInputRef.current?.click()}
              isDisabled={isUploading}
            >
              {isUploading ? t("profile.avatar.uploading", { defaultValue: "Uploading..." }) : t("profile.avatar.change", { defaultValue: "Change Avatar" })}
            </Button>
            <p className="text-[0.7rem] text-muted-foreground">
              {t("profile.avatar.help", { defaultValue: "JPEG or PNG. Max 5MB." })}
            </p>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/jpeg, image/png, image/webp"
            onChange={handleFileChange}
          />
        </div>

        {/* Right Col: Info Form (was Left Col) */}
        <div className="md:col-span-2 space-y-6">
          <Form form={form} formId="profile-settings-form" onSubmit={onSubmit}>
            <FormGrid cols={2}>
              <FormInput
                control={form.control}
                name="firstName"
                label={t("profile.form.firstName", { defaultValue: "First Name" })}
                placeholder={t("profile.form.firstNamePlaceholder", { defaultValue: "e.g. John" })}
              />
              <FormInput
                control={form.control}
                name="lastName"
                label={t("profile.form.lastName", { defaultValue: "Last Name" })}
                placeholder={t("profile.form.lastNamePlaceholder", { defaultValue: "e.g. Doe" })}
              />
              <div className="col-span-1 @md:col-span-2">
                <FormInput
                  control={form.control}
                  name="displayName"
                  label={t("profile.form.displayName", { defaultValue: "Display Name" })}
                  placeholder={t("profile.form.displayNamePlaceholder", { defaultValue: "e.g. John Doe" })}
                  description={t("profile.form.displayNameDescription", { defaultValue: "This is how others will see you on the site." })}
                />
              </div>
              <div className="col-span-1 @md:col-span-2">
                <FormInput
                  control={form.control}
                  name="phoneNumber"
                  label={t("profile.form.phoneNumber", { defaultValue: "Phone Number" })}
                  placeholder={t("profile.form.phoneNumberPlaceholder", { defaultValue: "e.g. +123456789" })}
                />
              </div>

              {/* Read-only fields */}
              <div className="col-span-1 @md:col-span-2 space-y-4 mt-4 p-4 border rounded-lg bg-muted/30">
                <h4 className="text-sm font-medium">{t("profile.accountInfo.title", { defaultValue: "Account Info (Read Only)" })}</h4>
                <div className="grid grid-cols-1 @md:grid-cols-2 gap-4">
                  <div className="space-y-1 overflow-hidden">
                    <p className="text-xs text-muted-foreground">{t("profile.accountInfo.username", { defaultValue: "Username" })}</p>
                    <p className="text-sm font-medium truncate" title={profile?.userName}>{profile?.userName}</p>
                  </div>
                  <div className="space-y-1 overflow-hidden">
                    <p className="text-xs text-muted-foreground">{t("profile.accountInfo.email", { defaultValue: "Email" })}</p>
                    <p className="text-sm font-medium truncate" title={profile?.email}>{profile?.email}</p>
                  </div>
                </div>
              </div>
            </FormGrid>
            <div className="mt-6">
              <Button type="submit" isDisabled={updateProfile.isPending}>
                {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("profile.form.saveChanges", { defaultValue: "Save Changes" })}
              </Button>
            </div>
          </Form>
        </div>
      </div>

      {cropImageSrc && (
        <AvatarCropDialog
          open={isCropDialogOpen}
          onOpenChange={handleCropDialogChange}
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          isProcessing={isUploading}
        />
      )}
    </div>
  )
}
