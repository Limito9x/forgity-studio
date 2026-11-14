import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FileTypeIcon } from "@/components/custom-ui/FileTypeIcon";
import { ZoomIn, X, ExternalLink } from "lucide-react";

export interface ResourceThumbnailProps {
  displayName?: string;
  fileName?: string;
  relativePath?: string | null;
  filePath?: string | null;
  thumbnailUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  allowZoom?: boolean;
}

export function ResourceThumbnail({
  displayName,
  fileName,
  relativePath,
  filePath,
  thumbnailUrl,
  size = "md",
  className,
  allowZoom = true,
}: ResourceThumbnailProps) {
  const [hasError, setHasError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const effectiveName = displayName || fileName || "Resource";
  const effectivePath = relativePath || filePath;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (thumbnailUrl && !hasError) {
    const sizeClasses =
      size === "xl" ? "size-14" :
      size === "lg" ? "size-10" :
      size === "md" ? "size-9" : "size-7";

    return (
      <>
        <div
          role={allowZoom ? "button" : undefined}
          tabIndex={allowZoom ? 0 : undefined}
          onClick={(e) => {
            if (!allowZoom) return;
            e.stopPropagation();
            e.preventDefault();
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (!allowZoom) return;
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              e.preventDefault();
              setIsOpen(true);
            }
          }}
          className={`relative shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40 shadow-xs group/thumb ${sizeClasses} ${
            allowZoom ? "cursor-zoom-in hover:border-primary/50 transition-colors" : ""
          } ${className ?? ""}`}
          title={allowZoom ? `Click to enlarge ${effectiveName}` : effectiveName}
        >
          <img
            src={thumbnailUrl}
            alt={effectiveName}
            className="size-full object-cover transition-transform duration-200 group-hover/thumb:scale-110"
            onError={() => setHasError(true)}
            loading="lazy"
          />
          {allowZoom && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
              <ZoomIn className="size-3.5 drop-shadow-md" />
            </div>
          )}
        </div>

        {isOpen && typeof document !== "undefined" &&
          createPortal(
            <div
              className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in-0 duration-150"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setIsOpen(false);
                }
              }}
            >
              <div className="w-full max-w-4xl flex items-center justify-between pb-3 px-1 text-white">
                <div className="min-w-0 pr-4">
                  <h3 className="font-semibold text-base truncate">{effectiveName}</h3>
                  {effectivePath && (
                    <p className="text-xs text-white/70 font-mono truncate">{effectivePath}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={thumbnailUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    title="Open image in new tab"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="size-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    title="Close (Esc)"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              </div>

              <div
                className="relative max-h-[82vh] max-w-[92vw] flex items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black/50 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={thumbnailUrl}
                  alt={effectiveName}
                  className="max-h-[80vh] max-w-[90vw] object-contain rounded-lg select-none"
                />
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }

  return (
    <FileTypeIcon
      fileName={effectiveName}
      relativePath={effectivePath ?? undefined}
      size={size}
    />
  );
}
