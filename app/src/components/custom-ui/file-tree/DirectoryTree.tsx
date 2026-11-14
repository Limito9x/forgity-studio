import { useState, useEffect, useCallback, useRef } from "react";
import { Tree, type TreeApi } from "react-arborist";
import type { FileTreeNodeData } from "./directory-tree-types";
import { DirectoryTreeNode } from "./DirectoryTreeNode";
import { DirectoryTreeToolbar } from "./DirectoryTreeToolbar";
import * as RunnersApi from "@/gen/endpoints/runners/runners";
import { AlertCircle, HardDrive } from "lucide-react";

interface DirectoryTreeProps {
  runnerId: string;
  initialPath?: string;
  onSelectNode?: (node: FileTreeNodeData) => void;
  className?: string;
  height?: number;
}

export function DirectoryTree({
  runnerId,
  initialPath = "",
  onSelectNode,
  className = "",
  height = 450,
}: DirectoryTreeProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [parentPath, setParentPath] = useState<string>("");
  const [canNavigateUp, setCanNavigateUp] = useState<boolean>(false);
  const [treeData, setTreeData] = useState<FileTreeNodeData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const treeRef = useRef<TreeApi<FileTreeNodeData> | null>(null);

  // Helper to recursive update node in tree structure
  const updateNodeChildren = (
    nodes: FileTreeNodeData[],
    targetPath: string,
    children: FileTreeNodeData[]
  ): FileTreeNodeData[] => {
    return nodes.map((node) => {
      if (node.path === targetPath) {
        return {
          ...node,
          children,
          isLoaded: true,
        };
      }
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: updateNodeChildren(node.children, targetPath, children),
        };
      }
      return node;
    });
  };

  // Helper to convert Backend DTOs to FileTreeNodeData
  const mapDtosToNodes = (dtos: any[]): FileTreeNodeData[] => {
    return dtos.map((dto) => ({
      id: dto.path,
      name: dto.name,
      path: dto.path,
      isDirectory: dto.isDirectory ?? true,
      sizeBytes: dto.sizeBytes,
      children: dto.isDirectory ? [] : undefined,
      isLoaded: !dto.isDirectory,
    }));
  };

  // Load directory contents for given path
  const loadDirectory = useCallback(async (path: string) => {
    if (!runnerId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await RunnersApi.discoverRunnerFolders(runnerId, { path });

      const items = res?.items || [];
      const nodes = mapDtosToNodes(items);
      setTreeData(nodes);

      if (res) {
        setCurrentPath(res.currentPath ?? path);
        setParentPath(res.parentPath ?? "");
        setCanNavigateUp(Boolean(res.canNavigateUp));
      } else {
        setCurrentPath(path);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Không thể tải danh sách thư mục từ Agent.");
    } finally {
      setIsLoading(false);
    }
  }, [runnerId]);

  useEffect(() => {
    loadDirectory(initialPath);
  }, [initialPath, loadDirectory]);

  // Lazy Load Subdirectory when folder toggled open
  const handleToggle = async (id: string) => {
    const findNodeByPath = (nodes: FileTreeNodeData[], path: string): FileTreeNodeData | null => {
      for (const n of nodes) {
        if (n.path === path) return n;
        if (n.children) {
          const found = findNodeByPath(n.children, path);
          if (found) return found;
        }
      }
      return null;
    };

    const targetNode = findNodeByPath(treeData, id);
    if (targetNode && targetNode.isDirectory && !targetNode.isLoaded) {
      try {
        const res = await RunnersApi.discoverRunnerFolders(runnerId, { path: targetNode.path });
        const items = res?.items || [];
        const childNodes = mapDtosToNodes(items);
        setTreeData((prev) => updateNodeChildren(prev, id, childNodes));
      } catch (err) {
        console.error("Error loading subdirectory:", err);
      }
    }
  };

  // Navigate Up / Back Action
  const handleNavigateUp = () => {
    if (canNavigateUp) {
      loadDirectory(parentPath);
    }
  };

  return (
    <div className={`flex flex-col border border-border/60 rounded-xl bg-card overflow-hidden shadow-xs ${className}`}>
      {/* Toolbar */}
      <DirectoryTreeToolbar
        searchTerm={searchTerm}
        currentPath={currentPath}
        canNavigateUp={canNavigateUp}
        onSearchChange={setSearchTerm}
        onRefresh={() => loadDirectory(currentPath)}
        onExpandAll={() => treeRef.current?.openAll()}
        onCollapseAll={() => treeRef.current?.closeAll()}
        onNavigateUp={handleNavigateUp}
        isRefreshing={isLoading}
      />

      {/* Main Tree Container */}
      <div className="relative p-2 flex-1 min-h-[300px]" style={{ height: `${height}px` }}>
        {errorMessage && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-destructive p-4 text-center">
            <AlertCircle className="size-6" />
            <p className="text-xs font-medium">{errorMessage}</p>
          </div>
        )}

        {!errorMessage && treeData.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4 text-center">
            <HardDrive className="size-8 opacity-40" />
            <p className="text-xs font-medium">Thư mục trống hoặc Agent chưa phản hồi.</p>
          </div>
        )}

        {!errorMessage && (
          <Tree
            ref={treeRef}
            data={treeData}
            searchTerm={searchTerm}
            onToggle={handleToggle}
            onSelect={(nodes) => {
              if (nodes[0]) {
                if (nodes[0].data.isDirectory) {
                  setCurrentPath(nodes[0].data.path);
                }
                if (onSelectNode) {
                  onSelectNode(nodes[0].data);
                }
              }
            }}
            rowHeight={30}
            width="100%"
            height={height - 75}
            indent={16}
          >
            {DirectoryTreeNode}
          </Tree>
        )}
      </div>
    </div>
  );
}
