import type { TagLinkDetailDto } from "@/features/tags/types";

export interface TagMapPreviewOptions {
    keyMode?: "Both" | "LeafOnly" | "FullPathOnly";
    rootPath?: string;
}

export interface TagMapPreviewResult {
    objects_map: Record<string, any>;
    all_tags: string[];
    summary: {
        totalAssets: number;
        mappedPathsCount: number;
        uniqueTagsCount: number;
    };
}

export function extractValueFromMetadata(root: any, path: string): any {
    if (!root || !path) return root;

    const cleanPath = path.replace(/^\$\.?/, "").trim();
    if (!cleanPath) return root;

    // 1. Direct path evaluation
    const direct = evaluateDirectPath(root, cleanPath);
    if (direct !== undefined && direct !== null) return direct;

    // 2. Semantic Predicate fallback (e.g. slots[name='Eye Left'])
    const predMatch = cleanPath.match(/\[([a-zA-Z0-9_]+)='([^']+)'\]/);
    if (predMatch) {
        const [, key, val] = predMatch;
        const found = findNodeByPredicate(root, key, val);
        if (found !== undefined && found !== null) {
            const predIndex = cleanPath.indexOf(predMatch[0]);
            const remaining = cleanPath.substring(predIndex + predMatch[0].length);
            if (remaining.startsWith(".")) {
                return evaluateDirectPath(found, remaining.substring(1));
            }
            return found;
        }
    }

    return null;
}

function evaluateDirectPath(obj: any, path: string): any {
    if (obj === undefined || obj === null) return null;

    const tokens = tokenizePath(path);
    let current = obj;

    for (const token of tokens) {
        if (current === undefined || current === null) return null;

        if (token.type === "property") {
            if (typeof current !== "object") return null;
            if (token.value in current) {
                current = current[token.value];
            } else if (current.objects && typeof current.objects === "object") {
                const childObj = Object.values(current.objects)[0];
                if (childObj && typeof childObj === "object" && token.value in childObj) {
                    current = (childObj as any)[token.value];
                } else {
                    return null;
                }
            } else {
                return null;
            }
        } else if (token.type === "index") {
            if (!Array.isArray(current)) return null;
            const idx = parseInt(token.value, 10);
            current = current[idx];
        } else if (token.type === "predicate") {
            if (!Array.isArray(current)) return null;
            const found = current.find(
                (item) => item && typeof item === "object" && String(item[token.predicateKey!]) === token.value
            );
            current = found;
        }
    }

    return current;
}

interface PathToken {
    type: "property" | "index" | "predicate";
    value: string;
    predicateKey?: string;
}

function tokenizePath(path: string): PathToken[] {
    const tokens: PathToken[] = [];
    const segments = path.split(".");

    for (const seg of segments) {
        if (!seg) continue;

        const bracketIndex = seg.indexOf("[");
        if (bracketIndex >= 0) {
            const propName = seg.substring(0, bracketIndex);
            if (propName) {
                tokens.push({ type: "property", value: propName });
            }

            const bracketPart = seg.substring(bracketIndex);
            const regex = /\[(?:([a-zA-Z0-9_]+)='([^']+)'|(\d+))\]/g;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(bracketPart)) !== null) {
                if (match[1] && match[2] !== undefined) {
                    tokens.push({
                        type: "predicate",
                        predicateKey: match[1],
                        value: match[2],
                    });
                } else if (match[3] !== undefined) {
                    tokens.push({
                        type: "index",
                        value: match[3],
                    });
                }
            }
        } else {
            tokens.push({ type: "property", value: seg });
        }
    }

    return tokens;
}

function findNodeByPredicate(root: any, key: string, val: string): any {
    if (!root || typeof root !== "object") return null;

    if (Array.isArray(root)) {
        for (const item of root) {
            if (item && typeof item === "object") {
                if (String(item[key]) === val) return item;
                const found = findNodeByPredicate(item, key, val);
                if (found) return found;
            }
        }
    } else {
        for (const propVal of Object.values(root)) {
            if (propVal && typeof propVal === "object") {
                const found = findNodeByPredicate(propVal, key, val);
                if (found) return found;
            }
        }
    }

    return null;
}

export function simulateBuildTagMap({
    resourceId,
    versionId,
    repositoryId,
    resourceName,
    relativePath,
    filePath,
    metadata,
    tagsByPath,
    resourceTags = [],
    options = {},
}: {
    resourceId: string;
    versionId: string;
    repositoryId?: string;
    resourceName: string;
    relativePath?: string;
    filePath?: string;
    metadata: any;
    tagsByPath: Record<string, TagLinkDetailDto[]>;
    resourceTags?: { tagPath: string; tagName?: string }[];
    options?: TagMapPreviewOptions;
}): TagMapPreviewResult {
    const keyMode = options.keyMode || "Both";
    const rootPath = options.rootPath?.trim() || "";

    const assetName: string = resourceName || (relativePath ? relativePath.split("/").pop() : "") || resourceId || "Resource";
    const assetPathMap: Record<string, any> = {};
    const assetTagMap: Record<string, any> = {};
    const allTagsSet = new Set<string>();

    for (const [subpath, tagLinks] of Object.entries(tagsByPath)) {
        if (!tagLinks || tagLinks.length === 0) continue;

        const val = extractValueFromMetadata(metadata, subpath);
        const matchedTagItems: any[] = [];

        for (const tag of tagLinks) {
            if (rootPath && !tag.tagPath.toLowerCase().startsWith(rootPath.toLowerCase())) {
                continue;
            }

            if (tag.tagName) allTagsSet.add(tag.tagName);
            if (tag.tagPath) allTagsSet.add(tag.tagPath);

            matchedTagItems.push({
                id: tag.tagId,
                name: tag.tagName,
                path: tag.tagPath,
            });

            if (keyMode === "Both" || keyMode === "LeafOnly") {
                if (tag.tagName) assetTagMap[tag.tagName] = val;
            }
            if (keyMode === "Both" || keyMode === "FullPathOnly") {
                if (tag.tagPath) assetTagMap[tag.tagPath] = val;
            }
        }

        if (matchedTagItems.length > 0) {
            assetPathMap[subpath] = {
                value: val,
                tags: matchedTagItems,
            };
        }
    }

    const resourceTagStrings: string[] = [];
    for (const rTag of resourceTags) {
        if (rTag.tagPath) {
            resourceTagStrings.push(rTag.tagPath);
            allTagsSet.add(rTag.tagPath);
        }
    }

    const assetObj = {
        resource_id: resourceId,
        version_id: versionId,
        repository_id: repositoryId || "",
        asset_name: assetName,
        relative_path: relativePath || "",
        file_path: filePath || relativePath || "",
        resource_tags: resourceTagStrings,
        path_map: assetPathMap,
        tag_map: assetTagMap,
    };

    const objectsMap: Record<string, any> = {
        [assetName]: assetObj,
    };

    return {
        objects_map: objectsMap,
        all_tags: Array.from(allTagsSet).sort(),
        summary: {
            totalAssets: 1,
            mappedPathsCount: Object.keys(assetPathMap).length,
            uniqueTagsCount: allTagsSet.size,
        },
    };
}
