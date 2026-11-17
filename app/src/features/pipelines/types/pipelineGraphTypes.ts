/**
 * Pipeline Graph & Node Types for Local / Workstation and Studio Editor Canvas.
 * Self-contained contracts replacing legacy backend monolithic build-time models.
 */

export type PipelineNodeKind =
  (typeof PipelineNodeKind)[keyof typeof PipelineNodeKind];

export const PipelineNodeKind = {
  Start: "Start",
  Return: "Return",
  Tool: "Tool",
  Custom: "Custom",
  FlowControl: "FlowControl",
  Variable: "Variable",
  SubPipeline: "SubPipeline",
  Container: "Container",
  Capsule: "Capsule",
} as const;

export type EdgeKind = (typeof EdgeKind)[keyof typeof EdgeKind];

export const EdgeKind = {
  Flow: "Flow",
  Data: "Data",
} as const;

export type PipelineParameterKind =
  (typeof PipelineParameterKind)[keyof typeof PipelineParameterKind];

export const PipelineParameterKind = {
  String: "String",
  Number: "Number",
  Boolean: "Boolean",
  Asset: "Asset",
  Struct: "Struct",
  Array: "Array",
  Map: "Map",
  Input: "Input",
  Output: "Output",
  Variable: "Variable",
} as const;

export type PipelineTriggerType =
  | "Manual"
  | "Schedule"
  | "Webhook"
  | "Event"
  | "OnResourceCreated"
  | "OnResourceVersionUpdated";

export const PipelineTriggerType = {
  Manual: "Manual",
  Schedule: "Schedule",
  Webhook: "Webhook",
  Event: "Event",
  OnResourceCreated: "OnResourceCreated",
  OnResourceVersionUpdated: "OnResourceVersionUpdated",
} as const;

export type PinDirection = "Input" | "Output" | string;
export type PinCardinality = "Single" | "Array" | string;
export type PinPrimitiveType =
  | "String"
  | "Number"
  | "Boolean"
  | "File"
  | "Directory"
  | "Asset"
  | "Any"
  | string;

export const PinKind = {
  Exec: "Exec",
  Data: "Data",
  Flow: "Flow",
  Asset: "Asset",
} as const;
export type PinKind = (typeof PinKind)[keyof typeof PinKind] | string;

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeSize {
  width: number;
  height: number;
}

export interface PinDefinition {
  id?: string;
  name: string;
  label?: string;
  type?: string;
  kind?: PinKind;
  direction: PinDirection;
  cardinality?: PinCardinality;
  primitiveType?: PinPrimitiveType;
  structRefId?: string | null;
  defaultValue?: any;
  description?: string;
  allowedAssetSlots?: string[];
  isRequired?: boolean;
  [key: string]: any;
}

export interface StructFieldDefinitionDto {
  name: string;
  primitiveType?: string;
  cardinality?: PinCardinality;
  description?: string;
  defaultValue?: any;
  [key: string]: any;
}

export interface StructDefinitionDto {
  id?: string;
  refId: string;
  name: string;
  description?: string;
  category?: string;
  fields?: StructFieldDefinitionDto[];
  [key: string]: any;
}

export interface NodeCapabilitiesDto {
  inspectorMode?: string;
  schemaConfigKeys?: string[];
  isConstantNode?: boolean;
  allowVariablePins?: boolean;
  [key: string]: any;
}

export interface NodePaletteItemDto {
  id?: string;
  refId: string;
  name: string;
  kind: PipelineNodeKind;
  category?: string;
  executor?: string;
  description?: string;
  inputs?: PinDefinition[];
  outputs?: PinDefinition[];
  defaultConfig?: Record<string, any>;
  capabilities?: NodeCapabilitiesDto;
  icon?: string;
  [key: string]: any;
}

export interface PipelineFileAssetDto {
  id: string;
  name: string;
  sizeBytes?: number;
  downloadUrl?: string;
  contentType?: string;
  [key: string]: any;
}

export interface PipelineParameterDto {
  id?: string;
  key?: string;
  name?: string;
  label?: string;
  type?: string | number;
  primitiveType?: string | number;
  kind?: PipelineParameterKind | string | number;
  direction?: "Input" | "Output" | string;
  cardinality?: PinCardinality | number;
  structType?: string | null;
  isRequired?: boolean;
  defaultValue?: any;
  value?: any;
  isExposed?: boolean;
  description?: string;
  contextData?: Record<string, unknown> | string | null;
  metadata?: unknown;
  [key: string]: any;
}

export interface PipelineNodeGraphDto {
  id: string;
  refId: string;
  kind: PipelineNodeKind;
  label: string;
  category?: string | null;
  executor?: string | null;
  position: NodePosition;
  inputs: PinDefinition[];
  outputs: PinDefinition[];
  configValues?: Record<string, any> | null;
  parentId?: string | null;
  size?: NodeSize | null;
  metadata?: Record<string, any> | null;
  fileAssets?: Record<string, PipelineFileAssetDto> | null;
}

export interface PipelineEdgeGraphDto {
  id: string;
  sourceNodeId: string;
  sourcePin: string;
  targetNodeId: string;
  targetPin: string;
  kind?: EdgeKind;
}

export interface PipelineGraphDto {
  id: string;
  name: string;
  description?: string | null;
  nodes: PipelineNodeGraphDto[];
  edges: PipelineEdgeGraphDto[];
  parameters?: PipelineParameterDto[] | null;
  [key: string]: any;
}

export interface SavePipelineNodeItem {
  id?: string | null;
  refId: string;
  kind: PipelineNodeKind;
  positionX: number;
  positionY: number;
  configValues?: Record<string, any> | null;
  parentId?: string | null;
  width?: number | null;
  height?: number | null;
  metadata?: Record<string, any> | null;
  position?: NodePosition | null;
}

export interface SavePipelineEdgeItem {
  id?: string | null;
  sourceNodeId: string;
  sourcePin: string;
  targetNodeId: string;
  targetPin: string;
  kind?: EdgeKind;
}

export interface PipelineDiagnostic {
  nodeId?: string;
  nodeLabel?: string;
  pinId?: string;
  code?: string;
  message: string;
  severity?: PipelineDiagnosticSeverity;
}

export type PipelineDiagnosticSeverity = "Info" | "Warning" | "Error";
export type PipelineDiagnosticCode = string;

export interface PipelineSummaryDto {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface CreatePipelineCommand {
  name: string;
  projectId?: string;
  description?: string;
  [key: string]: any;
}

export interface PipelineSnapshotSummaryDto {
  id: string;
  pipelineId: string;
  name: string;
  createdAt: string;
  [key: string]: any;
}

export interface CreatePipelineSnapshotRequest {
  name: string;
  description?: string;
}

export type ListOfPipelineSnapshotSummaryDto = PipelineSnapshotSummaryDto[];
