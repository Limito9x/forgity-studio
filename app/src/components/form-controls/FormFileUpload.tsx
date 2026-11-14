import type { FieldValues } from "react-hook-form";
import type { Accept } from "react-dropzone";
import { BaseFormField } from "./BaseFormField";
import type { BaseFormControlProps, OmitFormProps } from "./type";
import { useAssetField } from "@/hooks/useFileUpload";
import { useOptionalProject } from "@/features/projects/context/ProjectContext";
import { FileUploadField } from "../custom-ui/inputs/file-upload/FileUploadField";
import { registerField, type ExtractConfig } from "@/lib/field-registry";
import type { AssetDto } from "@/gen/model/assetDto";

export interface FormFileUploadProps<T extends FieldValues>
  extends BaseFormControlProps<T>,
  OmitFormProps<React.ComponentPropsWithoutRef<"div">> {
  variant?: "grid" | "list";
  accept?: Accept;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  initialAssets?: AssetDto[];
  storageProfileId?: string;
  projectId?: string;
}

export function FormFileUpload<T extends FieldValues>({
  variant = "grid",
  accept,
  maxFiles,
  maxSizeMB = 10,
  disabled,
  initialAssets,
  storageProfileId,
  projectId,
  ...rest
}: FormFileUploadProps<T>) {
  const projectContext = useOptionalProject();
  const effectiveProjectId = projectId ?? projectContext?.projectId ?? undefined;
  const effectiveStorageProfileId = storageProfileId ?? projectContext?.project?.storageProfileId ?? undefined;

  return (
    <BaseFormField
      {...rest}
      render={(field) => {
        const { items, uploadingItems, isUploading, uploadAssets, removeAsset } =
          useAssetField({
            value: Array.isArray(field.value) ? field.value : [],
            onChange: field.onChange,
            initialAssets,
            storageProfileId: effectiveStorageProfileId,
            projectId: effectiveProjectId,
          });

        return (
          <FileUploadField
            items={items}
            uploadingItems={uploadingItems}
            isUploading={isUploading}
            onFilesSelected={uploadAssets}
            onRemove={removeAsset}
            variant={variant}
            accept={accept}
            maxFiles={maxFiles}
            maxSizeMB={maxSizeMB}
            disabled={disabled}
          />
        );
      }}
    />
  );
}

declare module "@/lib/field-registry" {
  interface GlobalFieldRegistry {
    "file-upload": ExtractConfig<FormFileUploadProps<any>>;
  }
}

registerField({
  type: "file-upload",
  component: FormFileUpload,
  resolvedDataProp: "initialAssets",
  builderFields: [
    {
      name: "variant",
      fieldType: "select",
      fieldConfig: {
        options: [
          {
            label: "Grid",
            value: "grid"
          },
          {
            label: "List",
            value: "list"
          }
        ]
      }
    },
    {
      name: "maxSizeMB",
      label: "Max Size MB",
      fieldType: "number",
      fieldConfig: {
        min: 0,
        max: 100,
      }
    }
  ]
});
