type ResourceGlob = Record<string, any>;

function parseResources(globResult: ResourceGlob, isFeature: boolean) {
    const resources: Record<string, any> = {};
    for (const path in globResult) {
        let namespace = 'common';
        if (isFeature) {
            // path is like "../../features/users/locales/vi.json"
            const match = path.match(/\/features\/([^/]+)\/locales/);
            if (match && match[1]) {
                namespace = match[1];
            }
        } else {
            // path is like "./locales/vi/common.json"
            const match = path.match(/\/locales\/[^/]+\/([^.]+)\.json/);
            if (match && match[1]) {
                namespace = match[1];
            }
        }
        resources[namespace] = globResult[path];
    }
    return resources;
}

const viCommon = import.meta.glob("./locales/vi/*.json", { eager: true, import: "default" });
const enCommon = import.meta.glob("./locales/en/*.json", { eager: true, import: "default" });
const viFeatures = import.meta.glob("../../features/**/locales/vi.json", { eager: true, import: "default" });
const enFeatures = import.meta.glob("../../features/**/locales/en.json", { eager: true, import: "default" });

export const resources = {
    en: {
        ...parseResources(enCommon, false),
        ...parseResources(enFeatures, true),
    },
    vi: {
        ...parseResources(viCommon, false),
        ...parseResources(viFeatures, true),
    }
};