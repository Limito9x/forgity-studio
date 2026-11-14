import { ImageCropDialog, type ImageCropDialogProps } from '@/components/custom-ui/overlays/dialog/ImageCropDialog'

export type AvatarCropDialogProps = ImageCropDialogProps

export function AvatarCropDialog(props: AvatarCropDialogProps) {
  return <ImageCropDialog {...props} cropShape="round" aspectRatio={1} />
}
