import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import { BaseDialog } from './BaseDialog'
import { getCroppedImg } from '@/lib/crop-image'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Slider } from '@/components/ui/slider'

export interface ImageCropDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageSrc: string
  onCropComplete: (file: File) => void
  isProcessing?: boolean
  aspectRatio?: number
  cropShape?: 'rect' | 'round'
  title?: string
}

export function ImageCropDialog({
  open,
  onOpenChange,
  imageSrc,
  onCropComplete,
  isProcessing = false,
  aspectRatio = 1,
  cropShape = 'rect',
  title
}: ImageCropDialogProps) {
  const { t } = useTranslation("common")
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)

  const onCropCompleteHandler = useCallback(
    (_croppedArea: any, croppedAreaPixels: any) => {
      setCroppedAreaPixels(croppedAreaPixels)
    },
    []
  )

  const handleSave = async () => {
    if (!croppedAreaPixels) return
    
    try {
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels, 'image.jpg')
      onCropComplete(croppedFile)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title || t("cropImage.title", { defaultValue: "Crop Image" })}
      size="md"
    >
      <div className="flex flex-col space-y-6 pt-4">
        {/* Cropper Container */}
        <div className="relative h-64 w-full sm:h-80 bg-black/10 rounded-md overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspectRatio}
            cropShape={cropShape}
            showGrid={cropShape === 'rect'}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteHandler}
            onZoomChange={setZoom}
          />
        </div>
        
        {/* Zoom Control */}
        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            {t("cropImage.zoom", { defaultValue: "Zoom" })}
          </label>
          <Slider
            value={zoom}
            minValue={1}
            maxValue={3}
            step={0.1}
            onChange={(val) => setZoom(val as number)}
            aria-label="Zoom"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onPress={() => onOpenChange(false)} isDisabled={isProcessing}>
            {t("actions.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button onPress={handleSave} isPending={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("cropImage.processing", { defaultValue: "Processing..." })}
              </>
            ) : (
              t("actions.save", { defaultValue: "Crop & Save" })
            )}
          </Button>
        </div>
      </div>
    </BaseDialog>
  )
}
