import type { FilterField } from '@/gen/model'

export const AUDIT_LOG_FILTERABLE_FIELDS = {
    action: ['Contains', 'Equal'],
    entityName: ['Contains', 'Equal'],
    entityId: ['Contains', 'Equal'],
    userId: ['Contains', 'Equal'],
    ipAddress: ['Contains', 'Equal']
} as const satisfies Record<string, FilterField['operator'][]>;
