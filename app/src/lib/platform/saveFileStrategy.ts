import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";

export interface SaveFileOptions {
  fileName: string;
  blob: Blob;
  extensions?: string[];
  filterName?: string;
}

/**
 * Downloads a file across Web and Tauri Desktop:
 * - On Tauri Desktop: Prompts native Windows "Save As..." dialog (`save()`), then writes bytes via `@tauri-apps/plugin-fs`.
 * - On Web Browser: Falls back to classical `<a download>` blob URL anchor click.
 */
export async function saveFileWithStrategy({
  fileName,
  blob,
  extensions = ["forgity.pkg", "zip", "pkg"],
  filterName = "Forgity Package",
}: SaveFileOptions): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");

      const targetPath = await save({
        defaultPath: fileName,
        filters: [
          {
            name: filterName,
            extensions,
          },
          {
            name: "All Files",
            extensions: ["*"],
          },
        ],
      });

      if (!targetPath) {
        // User cancelled save dialog
        return false;
      }

      const buffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      await writeFile(targetPath, uint8);
      return true;
    } catch (err) {
      console.warn(
        "[SaveFileStrategy] Native save failed, falling back to browser download:",
        err,
      );
    }
  }

  // Web Browser fallback
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  return true;
}
