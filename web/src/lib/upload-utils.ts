import axios from "axios";
import { requestUpload, confirmUpload } from "@/gen/endpoints/assets/assets";
import type { ConfirmAssetDto } from "@/gen/model";

export interface MultipleAssetUploadPayload {
  key: string;
  file: File;
}

export interface MultipleAssetUploadResult {
  key: string;
  assetId: string;
  publicUrl: string;
  asset: ConfirmAssetDto;
}

export interface AssetUploadOptions {
  storageProfileId?: string | null;
  projectId?: string | null;
}

/**
 * Calculates the SHA-256 hash of a File or Blob as a hex string.
 */
export async function calculateFileHash(file: File | Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

/**
 * Orchestrates the full presigned URL upload flow for a single file.
 * Returns the confirmed AssetId on success.
 */
export async function uploadAssetFlow(
  file: File,
  options?: AssetUploadOptions | string
): Promise<string> {
  // 1. Calculate file hash
  const hashSha256 = await calculateFileHash(file);

  // 2. Extract extension (fallback to .json if no extension)
  const fileNameParts = file.name.split(".");
  const rawExtension = fileNameParts.length > 1 ? fileNameParts.pop()! : "";
  const extension = rawExtension ? `.${rawExtension.toLowerCase()}` : ".json";

  const detectedType =
    file.type ||
    (extension === ".py"
      ? "text/x-python"
      : extension === ".json"
      ? "application/json"
      : "application/octet-stream");

  const resolvedStorageProfileId =
    typeof options === "string" ? options : options?.storageProfileId;
  const resolvedProjectId =
    typeof options === "object" ? options?.projectId : undefined;

  // 3. Request upload
  const requestPayload: any = {
    items: [
      {
        hashSha256,
        extension,
        sizeBytes: file.size,
        contentType: detectedType,
      },
    ],
  };

  if (resolvedStorageProfileId) {
    requestPayload.storageProfileId = resolvedStorageProfileId;
  }
  if (resolvedProjectId) {
    requestPayload.projectId = resolvedProjectId;
  }

  const uploadRequests = await requestUpload(requestPayload);
  if (!uploadRequests || uploadRequests.length === 0) {
    throw new Error("Failed to get upload request details from server");
  }

  const { assetId, isAlreadyExists, presignedUrl } = uploadRequests[0];

  // 4. Upload file if it doesn't already exist
  if (!isAlreadyExists && presignedUrl) {
    await axios.put(presignedUrl, file, {
      headers: {
        "Content-Type": detectedType,
      },
    });
  }


  // 5. Confirm upload
  await confirmUpload({ assetIds: [assetId] });

  return assetId;
}

/**
 * Orchestrates the full presigned URL upload flow for MULTIPLE files in a single batch.
 * - Validates that each item contains a valid file and key.
 * - Validates that keys in the payload are unique (no duplicates).
 * - Returns array of items containing key, assetId, publicUrl, and asset details.
 */
export async function uploadMultipleAssetsFlow(
  items: MultipleAssetUploadPayload[],
  options?: AssetUploadOptions | string
): Promise<MultipleAssetUploadResult[]> {
  if (!items || items.length === 0) return [];

  // Validate presence of file & key
  for (const item of items) {
    if (!item.key) {
      throw new Error("Each upload item must have a valid key");
    }
    if (!item.file) {
      throw new Error(`Item with key "${item.key}" is missing a file`);
    }
  }

  // Validate duplicate keys
  const keySet = new Set<string>();
  for (const item of items) {
    if (keySet.has(item.key)) {
      throw new Error(`Duplicate key detected in upload payload: "${item.key}"`);
    }
    keySet.add(item.key);
  }

  // 1. Calculate file hashes in parallel
  const itemsPayload = await Promise.all(
    items.map(async (item) => {
      const hashSha256 = await calculateFileHash(item.file);
      const fileNameParts = item.file.name.split(".");
      const rawExtension = fileNameParts.length > 1 ? fileNameParts.pop()! : "";
      const extension = rawExtension ? `.${rawExtension.toLowerCase()}` : ".json";
      return {
        key: item.key,
        file: item.file,
        requestItem: {
          hashSha256,
          extension,
          sizeBytes: item.file.size,
          contentType: item.file.type || (extension === ".json" ? "application/json" : "application/octet-stream"),
        },
      };
    })
  );

  const resolvedStorageProfileId =
    typeof options === "string" ? options : options?.storageProfileId;
  const resolvedProjectId =
    typeof options === "object" ? options?.projectId : undefined;

  const requestPayload: any = {
    items: itemsPayload.map((p) => p.requestItem),
  };

  if (resolvedStorageProfileId) {
    requestPayload.storageProfileId = resolvedStorageProfileId;
  }
  if (resolvedProjectId) {
    requestPayload.projectId = resolvedProjectId;
  }

  // 2. Request upload in 1 single HTTP request to backend
  const uploadRequests = await requestUpload(requestPayload);

  if (!uploadRequests || uploadRequests.length !== items.length) {
    throw new Error("Failed to get upload request details from server");
  }

  // 3. Upload files directly to S3 in parallel
  const confirmedAssetIds: string[] = [];

  await Promise.all(
    uploadRequests.map(async (req, index) => {
      const { assetId, isAlreadyExists, presignedUrl } = req;
      const file = itemsPayload[index].file;

      if (!isAlreadyExists && presignedUrl) {
        await axios.put(presignedUrl, file, {
          headers: {
            "Content-Type": file.type,
          },
        });
      }

      confirmedAssetIds.push(assetId);
    })
  );

  // 4. Confirm upload in 1 single HTTP request to backend & receive confirmed AssetDto list
  const confirmedAssets = await confirmUpload({ assetIds: confirmedAssetIds });

  // 5. Map confirmed assets back to original keys
  const assetMap = new Map<string, ConfirmAssetDto>();
  if (Array.isArray(confirmedAssets)) {
    for (const asset of confirmedAssets) {
      assetMap.set(asset.id, asset);
    }
  }

  const results: MultipleAssetUploadResult[] = uploadRequests.map((req, index) => {
    const key = itemsPayload[index].key;
    const asset = assetMap.get(req.assetId) || {
      id: req.assetId,
      contentType: itemsPayload[index].file.type,
      size: itemsPayload[index].file.size,
      publicUrl: req.publicUrl || "",
    };

    return {
      key,
      assetId: req.assetId,
      publicUrl: asset.publicUrl || req.publicUrl || "",
      asset,
    };
  });

  return results;
}


