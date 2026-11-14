export type StaticDataSource = {
  type: "static";
  items: { label: string; value: string }[];
};

export type ApiDataSource = {
  type: "api";
  url: string;
  labelKey: string;
  valueKey: string;
  searchParam?: string;
};

// Export the union type of all data sources
export type FieldDataSource = StaticDataSource | ApiDataSource;
