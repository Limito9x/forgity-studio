import type { NodeRendererProps } from "react-arborist";
import type { FileTreeNodeData } from "./directory-tree-types";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileImage,
} from "lucide-react";
import { cn } from "@/lib/utils";

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes === 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (fileName: string) => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "json":
    case "js":
    case "ts":
    case "tsx":
    case "py":
    case "html":
    case "css":
      return <FileCode className="size-4 text-sky-500 shrink-0" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "webp":
      return <FileImage className="size-4 text-emerald-500 shrink-0" />;
    case "md":
    case "txt":
    case "doc":
      return <FileText className="size-4 text-purple-500 shrink-0" />;
    default:
      return <File className="size-4 text-muted-foreground shrink-0" />;
  }
};

export function DirectoryTreeNode({
  node,
  style,
  dragHandle,
}: NodeRendererProps<FileTreeNodeData>) {
  const isDirectory = node.data.isDirectory;

  return (
    <div
      style={style}
      ref={dragHandle}
      onClick={(e) => {
        e.stopPropagation();
        if (isDirectory) {
          node.toggle();
        }
        node.select();
      }}
      className={cn(
        "group flex items-center gap-1.5 px-2 py-1 text-xs select-none cursor-pointer rounded-md transition-colors",
        node.isSelected
          ? "bg-accent text-accent-foreground font-medium"
          : "hover:bg-accent/50 text-foreground"
      )}
    >
      {/* Expand / Collapse Chevron */}
      <span className="size-4 flex items-center justify-center shrink-0">
        {isDirectory ? (
          node.isOpen ? (
            <ChevronDown className="size-3.5 text-muted-foreground transition-transform" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground transition-transform" />
          )
        ) : (
          <span className="w-3.5" />
        )}
      </span>

      {/* Folder / File Icon */}
      {isDirectory ? (
        node.isOpen ? (
          <FolderOpen className="size-4 text-amber-500 shrink-0" />
        ) : (
          <Folder className="size-4 text-amber-500 shrink-0" />
        )
      ) : (
        getFileIcon(node.data.name)
      )}

      {/* Node Name */}
      <span className="truncate flex-1 font-sans">{node.data.name}</span>

      {/* File Size Badge */}
      {!isDirectory && node.data.sizeBytes !== undefined && node.data.sizeBytes > 0 && (
        <span className="text-[10px] text-muted-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity">
          {formatBytes(node.data.sizeBytes)}
        </span>
      )}
    </div>
  );
}
