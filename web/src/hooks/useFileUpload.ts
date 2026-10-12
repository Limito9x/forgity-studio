import { useState, useEffect, useCallback } from "react";
import { uploadMultipleAssetsFlow, type AssetUploadOptions } from "@/lib/upload-utils";

import type { ConfirmAssetDto } from "@/gen/model";
import type { AssetDto } from "@/gen/model/assetDto";

export interface FileValueItem {
    assetId: string;
    name: string;
}

export interface UploadAssetItem extends ConfirmAssetDto {
    name: string; // Tên file gốc dùng để hiển thị / hover trên UI
    key?: string; // Key định danh UI
}

export interface UploadingItem {
    key: string;
    name: string;
    previewUrl?: string;
    progress: number;
}

interface UseAssetFieldOptions {
    value: (string | FileValueItem)[];
    onChange: (value: FileValueItem[]) => void;
    initialAssets?: AssetDto[];
    storageProfileId?: string | null;
    projectId?: string | null;
}

const generateKey = () => {
    return `upload-${Date.now()}-${Math.random()}`;
};

const normalizeValueItem = (item: string | FileValueItem): FileValueItem => {
    if (typeof item === "string") {
        return { assetId: item, name: "" };
    }
    return item;
};

export function useAssetField({
    value,
    onChange,
    initialAssets,
    storageProfileId,
    projectId,
}: UseAssetFieldOptions) {
    const [assetItems, setAssetItems] = useState<UploadAssetItem[]>([]);
    const [uploadingItems, setUploadingItems] = useState<UploadingItem[]>([]);

    useEffect(() => {
        if (initialAssets && initialAssets.length > 0) {
            const normalized: UploadAssetItem[] = initialAssets.map((item, idx) => ({
                ...item,
                name: (item as any).name || (item as any).originalName || `Attachment ${idx + 1}`,
                key: (item as any).key || item.id,
            }));
            setAssetItems(normalized);
        }
    }, [initialAssets]);

    const uploadAssets = useCallback(async (files: File[]) => {
        if (!files || files.length === 0) return;

        // 1. Tạo items tạm thời cho UI hiển thị ngay lập tức (Instant Preview + Loading state)
        const pendingItems = files.map(file => ({
            key: generateKey(),
            name: file.name,
            previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
            progress: 0,
            file
        }));

        setUploadingItems(prev => [
            ...prev,
            ...pendingItems.map(({ file, ...item }) => item)
        ]);

        try {
            const payload = pendingItems.map(item => ({
                key: item.key,
                file: item.file
            }));

            const result = await uploadMultipleAssetsFlow(payload, { storageProfileId, projectId });

            if (result && result.length > 0) {
                const newCompletedItems: UploadAssetItem[] = result.map(res => {
                    const original = pendingItems.find(item => item.key === res.key);
                    return {
                        ...res.asset,
                        name: original?.name || "Attachment",
                        key: res.key
                    };
                });

                setAssetItems(prev => [...prev, ...newCompletedItems]);

                const currentNormalized = (Array.isArray(value) ? value : []).map(normalizeValueItem);
                const newFileValues: FileValueItem[] = newCompletedItems.map(asset => ({
                    assetId: asset.id,
                    name: asset.name
                }));

                onChange([...currentNormalized, ...newFileValues]);
            }
        } finally {
            // Xóa các item đã xử lý khỏi mảng uploadingItems và thu hồi Blob Object URLs
            const keysToRemove = new Set(pendingItems.map(i => i.key));
            setUploadingItems(prev => prev.filter(item => !keysToRemove.has(item.key)));

            pendingItems.forEach(item => {
                if (item.previewUrl?.startsWith("blob:")) {
                    URL.revokeObjectURL(item.previewUrl);
                }
            });
        }
    }, [value, onChange, storageProfileId, projectId]);

    const removeAsset = useCallback((assetId: string) => {
        setAssetItems(prev => prev.filter(asset => asset.id !== assetId && asset.key !== assetId));
        const currentNormalized = (Array.isArray(value) ? value : []).map(normalizeValueItem);
        onChange(currentNormalized.filter(item => item.assetId !== assetId));
    }, [value, onChange]);

    return {
        items: assetItems,
        uploadingItems,
        isUploading: uploadingItems.length > 0,
        uploadAssets,
        removeAsset,
    };
}
