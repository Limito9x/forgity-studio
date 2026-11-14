export interface FileTreeNodeData {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes?: number;
  children?: FileTreeNodeData[] | null;
  isLoaded?: boolean;
}
