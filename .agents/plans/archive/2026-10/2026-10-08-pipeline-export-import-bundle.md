# Kế hoạch Kỹ Thuật: Unified Pipeline Package Export & Import (Batch & SubPipeline Support)

Ngày: 2026-10-08.  
Trạng thái: Đã hoàn thiện thiết kế kiến trúc (Unified Batch Package, Topological Dependency Order & Manifest).

---

## 1. Mục tiêu và Ranh giới

### Mục tiêu cốt lõi:
Xây dựng tính năng **Export / Import Pipeline** theo chuẩn **Unified Pipeline Package** (`.pipeline-bundle.json` hoặc `.pipeline.json`), đáp ứng toàn diện:
1. **Dồn chung vào 1 file JSON duy nhất (Unified Package cho cả Single & Batch)**:
   - Dù xuất 1 pipeline từ Canvas hay chọn nhiều pipelines từ Table, hệ thống luôn xuất ra **duy nhất 1 file JSON Package**.
   - Mọi pipeline chính được chọn mang cờ `isRoot: true`, các pipeline con phụ thuộc mang cờ `isRoot: false`.
2. **Tường minh hóa phụ thuộc (`dependsOn`) & Thứ tự tạo tính sẵn (`importOrder`)**:
   - Ở cấp từng Pipeline trong file JSON, khai báo rõ mảng `dependsOn: ["sub-pl-id"]`.
   - Backend Export tính sẵn thứ tự tạo tối ưu bằng **Topological Sort** (`importOrder: 1, 2, 3...`), đảm bảo các pipeline con (lá) được tạo trước pipeline cha.
   - Khi Import, Backend chỉ cần duyệt tuần tự theo `importOrder`, tự động giải quyết ID con trước cha mà không cần tính toán lại phức tạp.
3. **Khử trùng lặp tài nguyên tối đa (Deduplication)**:
   - Nếu nhiều pipeline cùng phụ thuộc vào 1 SubPipeline chung, SubPipeline đó chỉ xuất hiện **đúng 1 lần** trong bundle.
   - Các Custom Scripts Python (`dependencies.customScripts`) và Content Types (`dependencies.requiredContentTypes`) được gom chung và deduplicate theo SHA-256 hash và key.
4. **An toàn dữ liệu với 1 Database Transaction**:
   - Toàn bộ quá trình Import nhiều pipelines diễn ra trong **1 Transaction duy nhất**. Nếu 1 bước lỗi -> Rollback sạch sẽ.

### Ranh giới kiến trúc:
- **Giữ nguyên Engine thực thi DAG**: Không can thiệp vào core runtime (`PipelineOrchestrator`, `SubPipelineDispatcher`, `SavePipelineGraph`).
- **Không nhúng Binary nặng**: Không nhúng file 3D Model, Video, hay Content Items cụ thể. Các Pin File vật lý sẽ được chuyển về trạng thái `Unlinked / Requires Binding`.

---

## 2. Đối chiếu Codebase Hiện Tại

| Thành phần | Hiện trạng trong Codebase | Hướng xử lý cho Export/Import |
| :--- | :--- | :--- |
| **SubPipeline Runtime** | `SubPipelineDispatcher.cs`, `PipelineNodeKind.SubPipeline (7)`, `refId` hoặc `configValues["pipelineId"]`. | Quét đệ quy gom vào bundle; Sử dụng `importOrder` và `tempIdMap` để remap ID an toàn. |
| **Chu trình SubPipeline** | `PipelineCycleValidator.cs` đảm bảo đồ thị SubPipeline luôn là DAG (không có cycle). | Đảm bảo 100% giải thuật Topological Sort luôn thành công và không bị deadlock. |
| **Backend Graph Builder** | `PipelineGraphDtoBuilder.cs` dựng Nodes, Edges, inputs/outputs từ Parameters của target pipeline. | Tái sử dụng để trích xuất cấu trúc đồ thị khi Export. |
| **Custom Node Storage** | `NodeDefinition` liên kết với script qua `IAssetApi` (`PipelineAssetSlots.CustomScript`), có `ContentHash`. | Export nhúng script text; Import dùng deduplication của `IAssetApi` để tái sử dụng. |
| **Content Module** | `IContentApi.cs`, `ContentType` entity. | Trích xuất schema `ContentType` vào `dependencies.requiredContentTypes`. |
| **Frontend UI** | `PipelineListPage.tsx` (Table), `PipelineEditorPage.tsx` (Canvas). | Thêm nút Export trên Canvas & Batch Export trên Table; Thêm Dialog Import Pipeline với Pre-flight Review dạng Tree. |

---

## 3. Cấu trúc Hợp đồng Dữ liệu (Unified Pipeline Package Schema)

Định dạng file xuất ra là `.pipeline-bundle.json`:

```json
{
  "formatVersion": "1.0",
  "bundleType": "PipelinePackage",
  "exportedAt": "2026-10-08T16:15:00Z",
  "metadata": {
    "totalPipelines": 3,
    "rootPipelinesCount": 2,
    "subPipelinesCount": 1
  },
  "pipelines": [
    {
      "bundleId": "pl-sub-bake",
      "name": "Sub Bake Mesh",
      "description": "Pipeline con thực hiện bake textures trong Blender",
      "isRoot": false,
      "importOrder": 1,
      "dependsOn": [],
      "triggerType": "Manual",
      "parameters": [
        {
          "key": "input_model",
          "label": "Input Model",
          "kind": "Input",
          "type": "File",
          "isRequired": true,
          "order": 1
        },
        {
          "key": "output_mesh",
          "label": "Output Mesh",
          "kind": "Output",
          "type": "File",
          "order": 1
        }
      ],
      "graph": {
        "nodes": [
          {
            "tempId": "node-bake-custom",
            "kind": "CustomScript",
            "refId": "blender_bake_mesh",
            "label": "Blender Bake Script",
            "executor": "blender",
            "position": { "x": 100, "y": 200 },
            "configValues": { "samples": 64 }
          }
        ],
        "edges": []
      }
    },
    {
      "bundleId": "pl-master-character",
      "name": "Master Character Workflow",
      "description": "Pipeline chính xử lý toàn bộ nhân vật 3D",
      "isRoot": true,
      "importOrder": 2,
      "dependsOn": ["pl-sub-bake"],
      "triggerType": "Manual",
      "triggerConfig": null,
      "parameters": [
        {
          "key": "quality_level",
          "label": "Quality Level",
          "kind": "Input",
          "type": "String",
          "defaultValue": "High",
          "isRequired": true,
          "order": 1
        }
      ],
      "graph": {
        "nodes": [
          {
            "tempId": "node-export-sub",
            "kind": "SubPipeline",
            "refPipelineBundleId": "pl-sub-bake",
            "label": "Bake Mesh SubPipeline",
            "category": "Pipelines",
            "position": { "x": 300, "y": 150 },
            "configValues": {
              "pipelineBundleId": "pl-sub-bake"
            }
          }
        ],
        "edges": [
          {
            "source": "node-export-sub",
            "sourcePin": "output_mesh",
            "target": "node-export-next",
            "targetPin": "input_file",
            "kind": "Data"
          }
        ]
      }
    },
    {
      "bundleId": "pl-texture-opt",
      "name": "Texture Optimizer",
      "description": "Pipeline tối ưu hóa nén texture độc lập",
      "isRoot": true,
      "importOrder": 3,
      "dependsOn": [],
      "triggerType": "Manual",
      "parameters": [],
      "graph": {
        "nodes": [],
        "edges": []
      }
    }
  ],
  "dependencies": {
    "customScripts": [
      {
        "key": "blender_bake_mesh",
        "fileName": "bake_mesh.py",
        "executor": "blender",
        "contentHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "scriptContent": "import bpy\n# Script content text here..."
      }
    ],
    "requiredContentTypes": [
      {
        "key": "characters",
        "displayName": "Characters",
        "icon": "User",
        "description": "3D Character schema",
        "fields": []
      }
    ]
  }
}
```

---

## 4. Giải thuật Cốt lõi (Core Algorithms)

### A. Giải thuật Export (Recursive Traversal, Dependency Graph & Topological Order):
1. **Thu thập danh sách Pipelines**:
   - Nhận `selectedPipelineIds` từ request (1 ID nếu xuất từ Canvas, N IDs nếu chọn nhiều từ Table).
   - Khởi tạo hàng đợi `queue = Queue(selectedPipelineIds)`, tập hợp đã duyệt `visitedMap = Dictionary<Guid, PipelineExportItem>()`.
   - Trong khi `queue` còn phần tử:
     - Lấy `pId` ra. Nếu đã có trong `visitedMap` -> bỏ qua.
     - Dựng đồ thị Nodes & Edges của Pipeline qua `PipelineGraphDtoBuilder`.
     - Quét các nodes:
       - Nếu node là `SubPipeline`: Đọc `childId` (từ `RefId` hoặc `Config["pipelineId"]`). Thêm `childId` vào `queue` và ghi nhận quan hệ phụ thuộc: `currentPipeline phụ thuộc childId`.
       - Nếu node là `CustomScript`: Thu thập vào tập hợp scripts.
       - Nếu node tham chiếu Content: Thu thập schema Content Types.
     - Đánh dấu `isRoot = selectedPipelineIds.Contains(pId)`.
     - Gán `bundleId = "pl-" + slug(name) + "-" + shortHash(pId)`.
2. **Topological Sort tính `importOrder`**:
   - Dựng đồ thị phụ thuộc từ các quan hệ đã ghi nhận: Cạnh `A -> B` nghĩa là A phụ thuộc B (B phải có trước A).
   - Chạy thuật toán Topological Sort (Kahn's Algorithm hoặc DFS Post-order):
     - Pipeline nào không phụ thuộc ai (hoặc chỉ phụ thuộc các pipeline đã xử lý) được xếp trước: gán `importOrder = 1, 2, 3...`.
     - Điền mảng `dependsOn = [list of child bundleIds]`.
3. **Đóng gói Bundle**:
   - Gom và deduplicate `dependencies.customScripts` và `dependencies.requiredContentTypes`.
   - Trả về JSON stream.

### B. Giải thuật Import (Ordered Execution & ID Remapping trong 1 Transaction):
1. **Kiểm tra Pre-flight (Không ghi DB)**:
   - Đọc JSON package.
   - Trả về cấu trúc cây Pipelines dựa vào `isRoot` và `dependsOn`.
   - Kiểm tra hash của các Scripts với DB hiện tại (`Existing` vs `New`).
   - Kiểm tra các Content Types với DB hiện tại (`Matched` vs `Missing`).
2. **Thực thi Import (Bao bọc trong 1 Transaction duy nhất)**:
   - `tempToRealPipelineMap = Dictionary<string, Guid>()`
   - `tempToRealNodeMap = Dictionary<string, Guid>()`
   - **Bước 1 (Xử lý Dependencies)**:
     - Tạo Content Types thiếu (nếu user đồng ý).
     - Đăng ký Custom Scripts thiếu qua `IAssetApi` (tận dụng deduplication).
   - **Bước 2 (Tạo Pipelines theo thứ tự `importOrder`)**:
     - Duyệt `package.Pipelines.OrderBy(p => p.ImportOrder)`:
       - Sinh `newPipelineId = Guid.NewGuid()`.
       - Lưu `tempToRealPipelineMap[pipeline.bundleId] = newPipelineId`.
       - Tạo entity `Pipeline` với tên (kèm prefix nếu người dùng yêu cầu).
       - Duyệt danh sách nodes của pipeline:
         - Sinh `newNodeId = Guid.NewGuid()`.
         - `tempToRealNodeMap[node.tempId] = newNodeId`.
         - Nếu `node.Kind == SubPipeline`:
           - Tra cứu: `childRealId = tempToRealPipelineMap[node.refPipelineBundleId]`.
           - Vì pipeline con luôn có `importOrder` nhỏ hơn nên đã tạo xong trước đó và CHẮC CHẮN có trong `tempToRealPipelineMap`.
           - Gán `node.RefId = childRealId.ToString()`.
           - Cập nhật `node.Config["pipelineId"] = childRealId`.
         - Nếu node chứa pin file vật lý cũ -> reset về unlinked.
       - Duyệt danh sách edges:
         - `edge.SourceNodeId = tempToRealNodeMap[edge.Source]`.
         - `edge.TargetNodeId = tempToRealNodeMap[edge.Target]`.
       - Add Pipeline, Nodes, Edges vào DB context.
   - **Bước 3 (Commit Transaction)**:
     - Lưu toàn bộ thay đổi vào Database. Hoàn tất 100%!

---

## 5. Các Scope Triển Khai Chi Tiết

### Scope 1: Backend Export Endpoints
- **Tập tin**: `api/src/Modules/Pipeline/Automation.Pipeline/Features/Pipelines/ExportPipelineBundle.cs`
- **Hỗ trợ 2 endpoints**:
  1. `GET /api/v1/pipelines/{id}/export`: Xuất đơn lẻ 1 pipeline (tự động gom subpipeline phụ thuộc).
  2. `POST /api/v1/projects/{projectId}/pipelines/export-batch`: Nhận `{ pipelineIds: [Guid] }` xuất hàng loạt nhiều pipeline vào 1 file duy nhất.

### Scope 2: Backend Import Pre-flight & Execution Slices
- **Tập tin**: 
  - `api/src/Modules/Pipeline/Automation.Pipeline/Features/Pipelines/ValidatePipelineBundle.cs` (Pre-flight check)
  - `api/src/Modules/Pipeline/Automation.Pipeline/Features/Pipelines/ImportPipelineBundle.cs` (Thực thi Transaction với `importOrder`)

### Scope 3: Frontend UI/UX
- **Hooks & Services**:
  - `web/src/features/pipelines/hooks/usePipelineExport.ts` (Download single & batch).
  - `web/src/features/pipelines/hooks/usePipelineImport.ts` (Validate file & commit import).
- **Giao diện**:
  - **Trên Canvas Toolbar (`CanvasToolbar.tsx`)**: Nút "Export Pipeline" -> Download file `.pipeline-bundle.json`.
  - **Trên Bảng Pipelines (`PipelineListPage.tsx`)**:
    - Khi tích chọn nhiều dòng trong Table -> Hiển thị action bar nổi với nút `"Export (X) Selected"`.
    - Nút action `"Import Package"` ở góc trên cùng cạnh nút "Create Pipeline".
  - **Dialog Pre-flight Review (`ImportPipelineDialog.tsx`)**:
    - Kéo thả 1 file `.pipeline-bundle.json`.
    - Hiển thị Tree Pipelines (phân biệt Root pipelines vs Sub-pipelines đi kèm), tùy chọn prefix tên, checkbox tạo Content Type.
    - 1-Click Import -> Điều hướng thành công.

---

## 6. Kế hoạch Kiểm Thử & Tiêu chí Nghiệm Thu

1. **Test Case 1 (Single Pipeline)**: Xuất 1 pipeline đơn -> Kiểm tra JSON có `isRoot: true`, `dependsOn: []`, `importOrder: 1`.
2. **Test Case 2 (Nested SubPipelines)**: Pipeline A gọi B, B gọi C -> Xuất A -> File JSON có 3 pipeline: C (`order: 1`), B (`order: 2`, `dependsOn: [C]`), A (`order: 3`, `dependsOn: [B]`). Import vào project mới -> Tất cả node SubPipeline trỏ đúng ID mới.
3. **Test Case 3 (Batch Export có chung SubPipeline)**: Pipeline A và Pipeline B cùng gọi chung SubPipeline C -> Xuất batch A và B -> File JSON chỉ có 1 bản C duy nhất. Khi import, cả A và B đều trỏ đúng vào bản C mới tạo.
4. **Test Case 4 (Rollback an toàn)**: Giả lập lỗi giữa chừng -> Kiểm tra toàn bộ Transaction rollback sạch sẽ, không để lại bất kỳ dữ liệu rác nào trong DB.
