export interface DraggableTagPayload {
    type: "tag";
    projectId?: string;
    tagId?: string;
    tagPath: string; // e.g. "Asset.Character.Hero"
    tagName: string; // leaf node label e.g. "Hero"
    tagColor?: string | null;
    tagDescription?: string | null;
}

export interface TagDropZonePayload {
    type: "tag-drop-zone";
    path: string;
    entityId: string;
    entityType: string;
}

export interface TagLinkDetailDto {
    tagLinkId: string;
    tagId: string;
    tagPath: string;
    tagName: string;
    tagColor?: string | null;
    tagDescription?: string | null;
    targetSubPath?: string | null;
    metadataJson?: string | null;
}
