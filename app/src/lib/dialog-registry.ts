import type { ComponentType } from "react"

// Bến đỗ (Registry) cho các type được gộp từ các feature
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GlobalDialogRegistry {}

// Contract mọi dialog phải tuân theo
export interface DialogProps<T = undefined> {
  open: boolean
  onOpenChange: (open: boolean) => void
  data?: T
}

// Feature đăng ký theo shape này
export interface DialogRegistration {
  id: string
  component: ComponentType<any>
}

// Sử dụng var để tránh lỗi Temporal Dead Zone (TDZ) do Vite hoisting import
var _registry: Map<string, ComponentType<any>> | undefined;

function getInternalRegistry() {
  if (!_registry) {
    _registry = new Map();
  }
  return _registry;
}

export function registerDialog({ id, component }: DialogRegistration) {
  const registry = getInternalRegistry();
  if (registry.has(id)) {
    console.warn(`Dialog "${id}" already registered — skipping`);
    return;
  }
  registry.set(id, component);
}   

export function getRegistry() {
  return getInternalRegistry();
}
const modules = import.meta.glob('../features/*/dialogs/index.ts', { eager: true });
// Tránh bị tree-shaken bằng cách truy cập Object.keys
if (import.meta.env.DEV) {
  console.log("Registered dialog modules:", Object.keys(modules));
}