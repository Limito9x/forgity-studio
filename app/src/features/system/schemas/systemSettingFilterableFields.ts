import type { FilterField } from '@/gen/model'

export const SYSTEM_SETTING_FILTERABLE_FIELDS = {
  key: ['Contains', 'Equal'],
  valueType: ['Equal'],
} as const satisfies Record<string, FilterField['operator'][]>;

export type SystemSettingFilterableField = keyof typeof SYSTEM_SETTING_FILTERABLE_FIELDS;

