import { useEffect, useState } from "react";
import type { RunnerDto } from "@/gen/model/runnerDto";

export interface LocalMachineInfo {
  isDesktop: boolean;
  hardwareFingerprint?: string;
  machineKey?: string;
  hostname?: string;
}

/**
 * Global RAM cache for local machine info (0ms lookups after initial resolution).
 */
let cachedLocalInfo: LocalMachineInfo | null = null;
let resolvePromise: Promise<LocalMachineInfo> | null = null;

/**
 * Checks whether the current runtime is a Tauri Desktop environment.
 * Synchronous check taking 0ms.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

/**
 * Fetches local workstation identity once and caches in RAM.
 * Returns { isDesktop: false } immediately when running in standard Web browser.
 */
export async function getLocalMachineInfo(): Promise<LocalMachineInfo> {
  if (cachedLocalInfo) {
    return cachedLocalInfo;
  }

  if (!isTauriRuntime()) {
    cachedLocalInfo = { isDesktop: false };
    return cachedLocalInfo;
  }

  if (!resolvePromise) {
    resolvePromise = (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const info = await invoke<LocalMachineInfo>("get_local_machine_info");
        cachedLocalInfo = {
          isDesktop: true,
          hardwareFingerprint: info?.hardwareFingerprint,
          machineKey: info?.machineKey,
          hostname: info?.hostname,
        };
        return cachedLocalInfo;
      } catch (err) {
        console.warn("[FilePickerStrategy] Failed to query local machine info via Tauri IPC:", err);
        cachedLocalInfo = { isDesktop: true };
        return cachedLocalInfo;
      }
    })();
  }

  return resolvePromise;
}

import { useQuery } from "@tanstack/react-query";

/**
 * Returns the permanent cryptographic hardware fingerprint on Tauri Desktop,
 * falling back to machineKey or "local-workstation" on Web.
 */
export async function getEffectiveMachineKey(): Promise<string> {
  const info = await getLocalMachineInfo();
  return info.hardwareFingerprint?.trim() || info.machineKey?.trim() || "local-workstation";
}

export function useEffectiveMachineKey() {
  return useQuery({
    queryKey: ["local-machine-effective-key"],
    queryFn: getEffectiveMachineKey,
    staleTime: Infinity,
  });
}

/**
 * Pure evaluation function: determines whether a runner represents the local workstation.
 *
 * Evaluation rules:
 * 1. Must be running inside Tauri Desktop.
 * 2. If both runner and local machine have hardwareFingerprint -> match exactly (case-insensitive).
 * 3. Backward-compatibility fallback: if runner was registered prior to Phase 1 (no fingerprint in DB),
 *    match runner.machineKey with local machineKey OR local hostname.
 */
export function isLocalRunner(
  runner?: (RunnerDto & { hardwareFingerprint?: string | null }) | null,
  localInfo?: LocalMachineInfo | null
): boolean {
  if (!runner || !localInfo || !localInfo.isDesktop) {
    return false;
  }

  const runnerFp = (runner.hardwareFingerprint || "").trim().toLowerCase();
  const localFp = (localInfo.hardwareFingerprint || "").trim().toLowerCase();

  // 1. Primary rule: Cryptographic SHA-256 hardware fingerprint match
  if (runnerFp && localFp) {
    return runnerFp === localFp;
  }

  // 2. Fallback rule: Permanent machineKey or hostname match
  const runnerKey = (runner.machineKey || "").trim().toLowerCase();
  const localKey = (localInfo.machineKey || "").trim().toLowerCase();
  const localHost = (localInfo.hostname || "").trim().toLowerCase();

  if (runnerKey && (runnerKey === localKey || runnerKey === localHost)) {
    return true;
  }

  return false;
}

export interface NativePickerOptions {
  mode?: "file" | "folder";
  title?: string;
  defaultPath?: string;
  extensions?: string[];
}

/**
 * Opens native Windows File or Folder Picker via @tauri-apps/plugin-dialog.
 * Normalizes backslashes to forward slashes for clean cross-platform path representation.
 */
export async function openNativeFileOrFolderDialog(
  options: NativePickerOptions = {}
): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error("Native file picker is only available in Tauri Desktop app");
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const isFolder = options.mode === "folder";

  const filters =
    !isFolder && options.extensions && options.extensions.length > 0
      ? [
          {
            name: "Allowed Files",
            extensions: options.extensions.map((ext) => ext.replace(/^\./, "")),
          },
        ]
      : undefined;

  const result = await open({
    title: options.title,
    directory: isFolder,
    multiple: false,
    defaultPath: options.defaultPath || undefined,
    filters,
  });

  if (!result) return null;

  // Tauri dialog may return string or string[]
  const rawPath = typeof result === "string" ? result : Array.isArray(result) ? result[0] : null;
  return rawPath ? rawPath.replace(/\\/g, "/") : null;
}

/**
 * Opens native Windows File or Folder Picker with multi-select enabled.
 * Returns normalized forward-slash paths.
 */
export async function openNativeMultipleFilesOrFoldersDialog(
  options: NativePickerOptions = {}
): Promise<string[]> {
  if (!isTauriRuntime()) {
    throw new Error("Native file picker is only available in Tauri Desktop app");
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const isFolder = options.mode === "folder";

  const filters =
    !isFolder && options.extensions && options.extensions.length > 0
      ? [
          {
            name: "Allowed Files",
            extensions: options.extensions.map((ext) => ext.replace(/^\./, "")),
          },
        ]
      : undefined;

  const result = await open({
    title: options.title,
    directory: isFolder,
    multiple: true,
    defaultPath: options.defaultPath || undefined,
    filters,
  });

  if (!result) return [];
  const rawList = typeof result === "string" ? [result] : Array.isArray(result) ? result : [];
  return rawList.map((p) => String(p).replace(/\\/g, "/")).filter(Boolean);
}

/**
 * React hook exposing strategic file picker capabilities for a given runner.
 */
export function useFilePickerStrategy(
  runner?: (RunnerDto & { hardwareFingerprint?: string | null }) | null
) {
  const [localInfo, setLocalInfo] = useState<LocalMachineInfo | null>(cachedLocalInfo);

  useEffect(() => {
    let mounted = true;
    getLocalMachineInfo().then((info) => {
      if (mounted) setLocalInfo(info);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const isDesktop = Boolean(localInfo?.isDesktop);
  const isLocal = isLocalRunner(runner, localInfo);

  const pickNative = async (options: NativePickerOptions = {}): Promise<string | null> => {
    return openNativeFileOrFolderDialog(options);
  };

  return {
    isDesktop,
    isLocal,
    localInfo,
    pickNative,
  };
}

