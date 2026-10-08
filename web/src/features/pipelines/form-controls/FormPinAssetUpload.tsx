import type { FieldValues } from "react-hook-form";
import { BaseFormField } from "@/components/form-controls/BaseFormField";
import type { BaseFormControlProps } from "@/components/form-controls/type";
import { AssetPinUpload } from "../components/canvas/AssetPinUpload";
import type { PipelineFileAssetDto } from "../hooks/usePipelineGraph";

export interface FormPinAssetUploadProps<T extends FieldValues>
  extends BaseFormControlProps<T> {
  accept?: string;
  placeholder?: string;
  disabled?: boolean;
  fileAsset?: PipelineFileAssetDto;
  persistAsLink?: boolean;
}

export function FormPinAssetUpload<T extends FieldValues>({
  accept,
  placeholder,
  disabled,
  fileAsset,
  persistAsLink,
  ...rest
}: FormPinAssetUploadProps<T>) {
  return (
    <BaseFormField
      {...rest}
      render={(field) => (
        <AssetPinUpload
          value={field.value}
          onChange={field.onChange}
          accept={accept}
          placeholder={placeholder || "Upload asset file (Preset / Script)..."}
          disabled={disabled}
          fileAsset={fileAsset}
          persistAsLink={persistAsLink}
        />
      )}
    />
  );
}
