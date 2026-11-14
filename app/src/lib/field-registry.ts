import type { ComponentType } from "react";
import type { FieldValues, Path } from "react-hook-form";
import type { ZodType } from "zod";

export interface BaseFieldRules {
  required?: boolean;
  requiredMsg?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
export interface GlobalFieldRegistry {}

export type ExtractConfig<P> = {
  properties?: Omit<P, "name" | "control" | "label" | "description">;
};

export interface FieldBuilderSpec {
  name: string
  label?: string
  description?: string
  isRequired?: boolean
  fieldType: keyof GlobalFieldRegistry | string
  fieldConfig?: Record<string, any>
  resolverFieldConfig?: (builderContext?: Record<string,any>) => Record<string, any>
}

export interface FieldRegistration {
  type: string
  component: ComponentType<any>
  isAvailable?: boolean
  builderFields?: FieldBuilderSpec[]
  buildSchema?: (properties: any, field?: FieldDefinition<any, any>) => ZodType
  resolveProps?: (properties: any, context?: Record<string,any>) => Record<string, any>
  resolvedDataProp?: string
}

export class ScopedFieldRegistry {
  protected parent?: ScopedFieldRegistry;
  protected _controls = new Map<string, FieldRegistration>();

  constructor(parent?: ScopedFieldRegistry) {
    this.parent = parent;
  }

  register(registration: FieldRegistration): this {
    if (this._controls.has(registration.type)) {
      console.warn(`Field "${registration.type}" already registered in this scope — skipping`);
      return this;
    }
    this._controls.set(registration.type, registration);
    return this;
  }

  get(type: string): FieldRegistration | undefined {
    return this._controls.get(type) ?? this.parent?.get(type);
  }

  getAllTypes(): string[] {
    const parentTypes = this.parent ? this.parent.getAllTypes() : [];
    return [...new Set([...parentTypes, ...this._controls.keys()])];
  }

  getAvailableTypes(): string[] {
    return this.getAllTypes().filter((type) => this.get(type)?.isAvailable !== false);
  }
}

class BaseFieldRegistry extends ScopedFieldRegistry {
  private static readonly ALIASES: Record<string, string> = {
    input: "text",
    tagsInput: "tags",
    keyValue: "key-value",
  };

  override get(type: string): FieldRegistration | undefined {
    const direct = super.get(type) ?? getInternalRegistry().get(type);
    if (direct) return direct;

    const alias = BaseFieldRegistry.ALIASES[type];
    if (alias) {
      return super.get(alias) ?? getInternalRegistry().get(alias);
    }

    return undefined;
  }

  override getAllTypes(): string[] {
    const globalTypes = Array.from(getInternalRegistry().keys());
    return [...new Set([...globalTypes, ...super.getAllTypes(), ...Object.keys(BaseFieldRegistry.ALIASES)])];
  }
}

export const baseRegistry = new BaseFieldRegistry();

var _fieldRegistry: Map<string, FieldRegistration> | undefined;

function getInternalRegistry() {
  if (!_fieldRegistry) {
    _fieldRegistry = new Map();
  }
  return _fieldRegistry;
}

export function registerField(registration: FieldRegistration) {
  const registry = getInternalRegistry();
  if (registry.has(registration.type)) {
    console.warn(`Field "${registration.type}" already registered — skipping`);
    return;
  }
  registry.set(registration.type, registration);
}

export function getFieldRegistration(type: string) {
  return getInternalRegistry().get(type);
}

export function getFieldRegistry() {
  return getInternalRegistry();
}

const modules = import.meta.glob('../components/form-controls/Form*.tsx', { eager: true });
if (import.meta.env.DEV) {
  console.log("Registered form controls:", Object.keys(modules));
}

export interface FieldDefinition<
  T extends FieldValues,
  TType extends keyof GlobalFieldRegistry = keyof GlobalFieldRegistry
> {
  name: Path<T>
  label?: string
  description?: string
  type: TType | string
  defaultValue?: GlobalFieldRegistry[TType extends keyof GlobalFieldRegistry ? TType : never] extends { defaultValue: infer D } ? D : any
  properties?: GlobalFieldRegistry[TType extends keyof GlobalFieldRegistry ? TType : never] extends { properties: infer P } ? P : any
  
  // Backward compatibility during migration (optional, can be removed once all fields migrated)
  config?: any
  rules?: any
}