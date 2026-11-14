import type { FieldDefinition } from "@/lib/field-registry";

export function findStructDependency(
    dependencies: Record<string, any> = {},
    structId?: string
): any {
    if (!structId) return undefined;
    if (dependencies[structId]) return dependencies[structId];

    const match = Object.entries(dependencies).find(
        ([k]) => k.toLowerCase() === structId.toLowerCase()
    );
    return match ? match[1] : undefined;
}

export function extractChildFields(dep: any): FieldDefinition<any, any>[] {
    if (!dep) return [];
    const fields = dep.fieldsConfig ?? dep.fields;
    if (Array.isArray(fields)) return fields;
    if (typeof fields === "string") {
        try {
            const parsed = JSON.parse(fields);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}
