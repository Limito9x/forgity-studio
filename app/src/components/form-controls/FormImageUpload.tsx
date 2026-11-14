import { useRef, useState } from 'react'
import type { FieldValues } from 'react-hook-form'
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BaseFormField } from './BaseFormField'
import type { BaseFormControlProps, OmitFormProps } from './type'
import { ImageCropDialog } from '@/components/custom-ui/overlays/dialog/ImageCropDialog'
import { uploadAssetFlow } from '@/lib/upload-utils'
import { toast } from 'sonner'
import { registerField, type ExtractConfig } from '@/lib/field-registry'

export interface FormImageUploadProps<T extends FieldValues>
  extends BaseFormControlProps<T>,
    OmitFormProps<React.ComponentPropsWithoutRef<'div'>> {
  aspectRatio?: number
  cropShape?: 'rect' | 'round'
  objectFit?: 'cover' | 'contain'
  defaultPreviewUrl?: string
  maxSizeMB?: number
  accept?: string
  disabled?: boolean
}

export function FormImageUpload<T extends FieldValues>({
  aspectRatio = 16 / 9,
  cropShape = 'rect',
  objectFit = 'cover',
  defaultPreviewUrl,
  maxSizeMB = 5,
  accept = 'image/jpeg, image/png, image/webp',
  disabled,
  ...rest
}: FormImageUploadProps<T>) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const [cropImageSrc, setCropImageSrc] = useState<string>('')
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false)

  return (
    <BaseFormField
      {...rest}
      render={(field) => {
        const previewUrl = localPreviewUrl || defaultPreviewUrl

        const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0]
          if (!file) return

          if (file.size > maxSizeMB * 1024 * 1024) {
            toast.error(`File size exceeds maximum limit of ${maxSizeMB}MB`)
            return
          }

          const imageUrl = URL.createObjectURL(file)
          setCropImageSrc(imageUrl)
          setIsCropDialogOpen(true)

          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        }

        const handleCropComplete = async (croppedFile: File) => {
          try {
            setIsUploading(true)
            const assetId = await uploadAssetFlow(croppedFile)

            // Update form state with uploaded assetId
            field.onChange(assetId)

            // Local preview
            const newPreview = URL.createObjectURL(croppedFile)
            setLocalPreviewUrl(newPreview)

            setIsCropDialogOpen(false)
            toast.success('Image uploaded successfully')
          } catch (error: any) {
            toast.error(error?.message || 'Failed to upload image')
          } finally {
            setIsUploading(false)
          }
        }

        const handleRemove = (e: React.MouseEvent) => {
          e.stopPropagation()
          field.onChange(null)
          setLocalPreviewUrl(null)
        }

        const isRound = cropShape === 'round'

        return (
          <div className="space-y-2">
            <div
              className={`relative border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-muted/20 ${
                isRound
                  ? 'rounded-full w-32 h-32 mx-auto'
                  : 'rounded-lg w-full max-w-md'
              } ${disabled || isUploading ? 'opacity-60 pointer-events-none' : ''}`}
              style={!isRound && aspectRatio ? { aspectRatio: `${aspectRatio}` } : undefined}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <div className="flex flex-col items-center justify-center p-4 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
                  <span className="text-xs font-medium text-muted-foreground">Uploading...</span>
                </div>
              ) : previewUrl ? (
                <div className="relative w-full h-full group bg-black/10 flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Uploaded preview"
                    className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'} ${
                      isRound ? 'rounded-full' : 'rounded-md'
                    }`}
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <span className="text-xs text-white font-medium flex items-center gap-1">
                      <Upload className="h-4 w-4" /> Change
                    </span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={handleRemove}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center">
                  <div className="p-3 bg-background rounded-full shadow-sm mb-2">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-xs font-medium text-foreground">Click to upload image</span>
                  <span className="text-[0.65rem] text-muted-foreground mt-1">JPEG, PNG up to {maxSizeMB}MB</span>
                </div>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept={accept}
              onChange={handleFileChange}
              disabled={disabled || isUploading}
            />

            {cropImageSrc && (
              <ImageCropDialog
                open={isCropDialogOpen}
                onOpenChange={(open) => {
                  setIsCropDialogOpen(open)
                  if (!open && cropImageSrc) {
                    URL.revokeObjectURL(cropImageSrc)
                    setCropImageSrc('')
                  }
                }}
                imageSrc={cropImageSrc}
                onCropComplete={handleCropComplete}
                isProcessing={isUploading}
                aspectRatio={aspectRatio}
                cropShape={cropShape}
              />
            )}
          </div>
        )
      }}
    />
  )
}

declare module '@/lib/field-registry' {
  interface GlobalFieldRegistry {
    'image-upload': ExtractConfig<FormImageUploadProps<any>>
  }
}

registerField({
  type: 'image-upload',
  component: FormImageUpload,
})
