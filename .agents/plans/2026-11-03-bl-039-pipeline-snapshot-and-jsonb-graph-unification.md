# Kế Hoạch Kỹ Thuật: Hợp Nhất Đồ Thị Pipeline Sang JSONB & Kiến Trúc Pipeline Snapshot (BL-039)

> **Mã định danh**: `BL-039`  
> **Ngày khởi tạo**: 03/11/2026  
> **Cập nhật gần nhất**: 03/11/2026 (Bổ sung Retention Pruner, Tách biệt Working Copy vs Snapshot, Nâng Delay Autosave & Phân tầng Undo/Redo)  
> **Phạm vi**: `api/src/Modules/Pipeline/` (Domain, Persistence, Migrations, Authoring, Runtime), `web/src/features/pipelines/`  
> **Trạng thái**: `Approved / Ready for Implementation`  

---

## 1. Bối Cảnh & Vấn Đề Cốt Lõi (Problem Statement)

### 1.1. "Tàn dư chuẩn hóa" của `PipelineNodes` và `PipelineEdges`
Trong quá trình tiến hóa của module `Automation.Pipeline`:
- Các thành phần mới như `Pipeline.Parameters` (`List<PipelineParameter>`) và `PipelineExecution.ExecutionState` đều đã chuyển sang lưu trữ dạng **`jsonb` nguyên khối** của PostgreSQL.
- Ngay cả ở Runtime, `FrozenExecutionGraph` và `TransientPipelineGraphFactory` (ADR-005) cũng luôn nạp toàn bộ đồ thị vào một cấu trúc In-Memory duy nhất để kiểm tra và thực thi.
- Tuy nhiên, `PipelineNodes` và `PipelineEdges` vẫn bị tách thành 2 bảng quan hệ rời rạc từ thời kỳ đầu, gây ra các hệ lụy:
  1. **Không bao giờ truy vấn đơn lẻ**: Hệ thống không bao giờ query 1 `PipelineEdge` hay 1 `PipelineNode` độc lập mà luôn phải `.Include(p => p.Nodes).Include(p => p.Edges)` ở hơn 14 handlers.
  2. **Độ phức tạp cao khi Lưu (`SavePipelineGraph.cs`)**: Mỗi lần autosave, Backend phải chạy hơn 150 dòng code diffing để xóa edges cũ, đối chiếu thêm/sửa/xóa từng dòng node trong transaction, tiềm ẩn rủi ro lỗi khóa ngoại (FK constraint) hoặc race condition.

### 1.2. Nhu cầu cấp thiết về "Pipeline Snapshot" (Bất biến - Immutable Versioning)
Khi mở rộng hệ thống cho **Team Collaboration**, **Undo/Rollback (Lịch sử phiên bản)** và đặc biệt là **AI Agent (MCP Server - `BL-028`)**:
1. **Chống xung đột (Race Condition) giữa Người và AI**: Khi người dùng đang mở Canvas chỉnh sửa mà AI qua MCP cũng tác động vào Pipeline, nếu dùng chung một trạng thái mutable duy nhất sẽ dẫn đến đè mất dữ liệu của nhau (Last-Write-Wins).
2. **Bảo vệ phiên chạy đang diễn ra (In-Flight Execution Safety)**: Khi một Pipeline mất 5–10 phút để chạy qua các Stage (Blender $\to$ AI $\to$ Unreal), việc người dùng sửa đồ thị trên Canvas ngay trong lúc đang chạy không được phép làm hỏng cấu trúc DAG của phiên chạy đó. Each `PipelineExecution` cần gắn chặt với một `SnapshotId` bất biến.
3. **Lịch sử phiên bản & Rollback 1-Click**: Người dùng có thể quay lại bất kỳ phiên bản đồ thị nào trước đó (hoặc xem/duyệt bản đề xuất từ AI Agent) một cách tức thì.

---

## 2. Kiến Trúc Hai Tầng Undo / Redo & Tách Biệt "Working Copy" vs "Snapshot"

### 2.1. Phân Tầng Trải Nghiệm Undo / Redo (Mental Model)

Cần phân biệt rành mạch giữa **Local Micro-Undo trên Canvas** và **Server-side Snapshots**:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. TẦNG CLIENT: LOCAL IN-MEMORY UNDO / REDO (Ctrl + Z / Ctrl + Y)       │
│ • Phạm vi: Hoàn tác vi mô (kéo rê node 10px, xóa dây, gõ config)      │
│ • Độ trễ: 0ms (In-Memory trên Client / React-XYFlow state)             │
│ • Cơ chế: Quản lý qua History Stack in-memory (không gọi API server)   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Autosave Debounce (1500ms)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. TẦNG WORKING COPY: PIPELINES."GraphData" (JSONB Đơn Nhất)            │
│ • Bản nháp hoạt động mới nhất (Last Write)                             │
│ • Autosave chỉ ghi đè vào đây để giữ Canvas đồng bộ                    │
│ • KHÔNG tạo Snapshot ở mỗi lần autosave (chống rác DB)                 │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Các mốc trọng yếu (Triggered)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. TẦNG BẤT BIẾN: PIPELINE."PipelineSnapshots" (Version History)       │
│ • Phạm vi: Mốc an toàn vĩ mô (Time Machine, Rollback, AI Gate, Run DAG) │
│ • Độ bền: Lưu vĩnh viễn hoặc theo chính sách Retention                 │
│ • Rollback: 1-Click khôi phục lại toàn bộ đồ thị về một mốc lịch sử    │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2. Chiến Lược Tạo Snapshot (Chống Phình Dữ Liệu)

Tuyệt đối **KHÔNG tạo Snapshot ở mỗi nhịp Autosave**. Bảng `PipelineSnapshots` chỉ ghi nhận bản ghi mới trong 4 tình huống có chủ đích:
1. **`Source = "RunFreeze"` (Bắt buộc)**: Khi bấm Run Pipeline, hệ thống tự động chốt snapshot đồ thị tại thời điểm đó để gán vào `PipelineExecution.SnapshotId`.
2. **`Source = "ManualCheckpoint"`**: Người dùng chủ động bấm "Save Version / Checkpoint" (hoặc qua phím tắt / Dialog đặt tên phiên bản).
3. **`Source = "AiMcp"`**: Trước và sau khi AI Agent (MCP Tool) can thiệp sửa đổi đồ thị, server tự động tạo snapshot làm điểm phục hồi an toàn (*"Undo AI Changes"*).
4. **`Source = "Import"`**: Khi import một package từ ngoài vào.
5. *(Tùy chọn Milestone)*: Tự động lưu checkpoint nếu đồ thị thay đổi sau hơn 20 phút làm việc liên tục mà chưa có snapshot mới.

### 2.3. Chính Sách Dọn Dẹp Snapshot Cũ (Pruning & Retention Policy)

Để tránh phình to dung lượng `jsonb` theo năm tháng:
1. **Snapshot Bất Khả Xâm Phạm (Never Prune)**:
   - Snapshot đang được tham chiếu bởi bất kỳ phiên chạy nào (`SnapshotId IN (SELECT SnapshotId FROM PipelineExecutions WHERE SnapshotId IS NOT NULL)`).
   - Snapshot đang là `ActiveSnapshotId` của Pipeline.
   - Snapshot có tên do người dùng đặt (`Summary != null` và `Source == "ManualCheckpoint"`).
2. **Quy Tắc Rolling Retention (50 bản gần nhất)**:
   - Mỗi Pipeline duy trì tối đa **50 snapshot tạm** gần nhất. Khi vượt quá 50, hệ thống tự động dọn các bản ghi cũ nhất thỏa mãn điều kiện không có `Execution` trỏ tới.
3. **Cơ Chế Thực Thi**:
   - **Inline Prune**: Chạy ngầm khi tạo snapshot mới thứ $N+1$ cho chính Pipeline đó.
   - **Nightly Retention Job**: Background Service quét dọn các snapshot tạm không dùng có tuổi đời > 30 ngày vào 02:00 sáng.

---

## 3. Kiến Trúc Đề Xuất: Unified JSONB Graph & Immutable Snapshots

### 3.1. Mô Hình Dữ Liệu (Domain & Database Schema)

Gom toàn bộ cấu trúc đồ thị (`Parameters`, `Nodes`, `Edges`) thành Value Object nguyên khối `PipelineGraphDocument` lưu trong cột **`GraphData (jsonb)`**:

```
┌────────────────────────────────────────────────────────────────────────┐
│  pipeline."Pipelines" (Khung định danh & Working Copy)                 │
│  • Id (PK, uuid)                                                       │
│  • ProjectId (uuid), Name (varchar)                                    │
│  • TriggerType, TriggerConfig (jsonb)                                  │
│  • ActiveSnapshotId (uuid, nullable) ──┐                               │
│  • GraphData (jsonb: { Parameters, Nodes, Edges })                     │
│  • GraphHash (varchar(64): SHA-256 của GraphData)                      │
└────────────────────────────────────────┼───────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│  pipeline."PipelineSnapshots" (Lịch sử Bất biến - Immutable)           │
│  • Id (PK, uuid)                                                       │
│  • PipelineId (FK, uuid, Indexed)                                      │
│  • VersionNumber (int: 1, 2, 3...)                                     │
│  • GraphData (jsonb: { Parameters, Nodes, Edges })                     │
│  • GraphHash (varchar(64): Tránh tạo snapshot trùng lặp)               │
│  • Source (varchar: "ManualCheckpoint" | "RunFreeze" | "AiMcp" | ...) │
│  • Summary (varchar: "Auto-saved", "Run #81a1", "AI Proposal")         │
│  • CreatedAt, CreatedBy                                                │
└────────────────────────────────────────▲───────────────────────────────┘
                                         │
┌────────────────────────────────────────┼───────────────────────────────┐
│  pipeline."PipelineExecutions"         │                               │
│  • Id (PK, uuid)                       │                               │
│  • PipelineId (FK, uuid)               │                               │
│  • SnapshotId (FK, uuid, nullable) ────┘ (Đóng băng đồ thị lúc Run)    │
│  • ExecutionState (jsonb)                                              │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2. Kỹ Thuật C# Facade (`[NotMapped]`): Giữ Tương Thích 100% Code Engine

Để **100% logic của `FrozenExecutionGraph`, `ExecPlanner`, `PipelineOrchestrator`, `ValidatePipeline`, `PinValueResolver` không phải sửa đổi**, class `Pipeline` giữ nguyên các thuộc tính truy cập nhưng trỏ vào `GraphData`:

```csharp
public class PipelineGraphDocument
{
    public List<PipelineParameter> Parameters { get; set; } = new();
    public List<PipelineNode> Nodes { get; set; } = new();
    public List<PipelineEdge> Edges { get; set; } = new();
}

public class Pipeline : BaseEntity
{
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
    public PipelineTriggerType TriggerType { get; set; } = PipelineTriggerType.Manual;
    public JsonDocument? TriggerConfig { get; set; }

    public Guid? ActiveSnapshotId { get; set; }
    public string? GraphHash { get; set; }

    // Lưu trữ duy nhất trong 1 cột JSONB
    public PipelineGraphDocument GraphData { get; set; } = new();

    // Cửa sổ Facade giữ tương thích 100% với toàn bộ codebase hiện hữu
    [NotMapped]
    public List<PipelineParameter> Parameters
    {
        get => GraphData.Parameters;
        set => GraphData.Parameters = value ?? new();
    }

    [NotMapped]
    public IReadOnlyList<PipelineNode> Nodes => GraphData.Nodes;

    [NotMapped]
    public IReadOnlyList<PipelineEdge> Edges => GraphData.Edges;
    
    // Các helper thêm/bớt node và edge thao tác thẳng trên GraphData
    public void AddNode(PipelineNode node) => GraphData.Nodes.Add(node);
    public void RemoveNode(Guid nodeId) => GraphData.Nodes.RemoveAll(x => x.Id == nodeId);
    public void AddEdge(PipelineEdge edge) => GraphData.Edges.Add(edge);
    public void RemoveEdge(Guid edgeId) => GraphData.Edges.RemoveAll(x => x.Id == edgeId);
    public void ClearEdges() => GraphData.Edges.Clear();
}
```

> **Lưu ý trên `PipelineNode` và `PipelineEdge`**:  
> Gắn `[JsonIgnore]` lên các navigation properties vòng lặp (`Pipeline`, `Parent`, `Children`, `SourcePipelineNode`, `TargetPipelineNode`) để `System.Text.Json` tuần tự hóa sạch sẽ vào `jsonb`.

---

## 4. Chiến Lược Migration Dữ Liệu Cũ (Zero-Data-Loss SQL Migration)

### 4.1. Chiều Nâng Cấp (`Up` Migration)
1. **Bước 1**: Tạo bảng mới `pipeline."PipelineSnapshots"`, thêm cột `GraphData (jsonb)`, `GraphHash`, `ActiveSnapshotId` vào bảng `pipeline."Pipelines"`, và thêm cột `SnapshotId` vào `pipeline."PipelineExecutions"`.
2. **Bước 2 (Chuyển đổi dữ liệu tự động bằng SQL trước khi xóa bảng cũ)**:
   Sử dụng hàm `jsonb_agg` và `jsonb_build_object` nguyên bản của PostgreSQL để gom toàn bộ dữ liệu từ `PipelineNodes`, `PipelineEdges` và cột `Parameters` cũ vào `GraphData`:

```sql
-- 1. Gom toàn bộ Parameters, Nodes, Edges hiện có vào cột GraphData (jsonb)
UPDATE pipeline."Pipelines" p
SET "GraphData" = jsonb_build_object(
    'Parameters', COALESCE(p."Parameters", '[]'::jsonb),
    'Nodes', COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'Id', n."Id",
                'PipelineId', n."PipelineId",
                'ParentId', n."ParentId",
                'RefId', n."RefId",
                'Kind', n."Kind",
                'Position', jsonb_build_object('X', n."Position_X", 'Y', n."Position_Y"),
                'Size', CASE 
                    WHEN n."Size_Width" IS NOT NULL AND n."Size_Height" IS NOT NULL 
                    THEN jsonb_build_object('Width', n."Size_Width", 'Height', n."Size_Height")
                    ELSE NULL 
                END,
                'Config', n."Config",
                'Metadata', n."Metadata",
                'CreatedAt', n."CreatedAt",
                'CreatedBy', n."CreatedBy",
                'UpdatedAt', n."UpdatedAt",
                'UpdatedBy', n."UpdatedBy"
            ) ORDER BY n."CreatedAt" ASC
        )
        FROM pipeline."PipelineNodes" n
        WHERE n."PipelineId" = p."Id"
    ), '[]'::jsonb),
    'Edges', COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'Id', e."Id",
                'PipelineId', e."PipelineId",
                'SourcePipelineNodeId', e."SourcePipelineNodeId",
                'SourcePin', e."SourcePin",
                'TargetPipelineNodeId', e."TargetPipelineNodeId",
                'TargetPin', e."TargetPin",
                'Kind', e."Kind",
                'CreatedAt', e."CreatedAt",
                'CreatedBy', e."CreatedBy",
                'UpdatedAt', e."UpdatedAt",
                'UpdatedBy', e."UpdatedBy"
            ) ORDER BY e."CreatedAt" ASC
        )
        FROM pipeline."PipelineEdges" e
        WHERE e."PipelineId" = p."Id"
    ), '[]'::jsonb)
);

-- 2. Khởi tạo Snapshot v1 (Initial Migration Snapshot) cho toàn bộ Pipeline hiện hữu
INSERT INTO pipeline."PipelineSnapshots" (
    "Id", "PipelineId", "VersionNumber", "GraphData", "GraphHash", "Source", "Summary", "CreatedAt", "CreatedBy"
)
SELECT 
    gen_random_uuid(),
    p."Id",
    1,
    p."GraphData",
    encode(sha256(convert_to(p."GraphData"::text, 'UTF8')), 'hex'),
    'Migration',
    'Initial v1 snapshot migrated from relational tables',
    COALESCE(p."UpdatedAt", p."CreatedAt", NOW()),
    p."CreatedBy"
FROM pipeline."Pipelines" p;

-- 3. Cập nhật ActiveSnapshotId và GraphHash trên bảng Pipelines
UPDATE pipeline."Pipelines" p
SET 
    "ActiveSnapshotId" = s."Id",
    "GraphHash" = s."GraphHash"
FROM pipeline."PipelineSnapshots" s
WHERE s."PipelineId" = p."Id" AND s."VersionNumber" = 1;
```

3. **Bước 3**: Sau khi dữ liệu đã nằm an toàn trong `GraphData` và `PipelineSnapshots`, tiến hành xóa cột `Parameters` cũ và xóa 2 bảng `pipeline."PipelineEdges"`, `pipeline."PipelineNodes"`.

### 4.2. Chiều Hạ Cấp (`Down` Migration — Rollback An Toàn)
1. Tạo lại bảng `PipelineNodes`, `PipelineEdges` và cột `Parameters`.
2. Dùng `jsonb_array_elements(p."GraphData"->'Nodes')` và `jsonb_array_elements(p."GraphData"->'Edges')` để bung ngược toàn bộ JSONB trở lại các dòng trong bảng `PipelineNodes` và `PipelineEdges`.
3. Xóa bảng `PipelineSnapshots` và cột `GraphData`.

---

## 5. Lộ Trình Triển Khai Chi Tiết (Implementation Phases)

### Phase 1: Domain & Persistence Refactoring (`api/src/Modules/Pipeline/`)
1. Tạo `PipelineGraphDocument.cs` và Entity `PipelineSnapshot.cs` trong `Domain/Entities/`.
2. Cập nhật `Pipeline.cs`:
   - Thêm `GraphData`, `ActiveSnapshotId`, `GraphHash`.
   - Chuyển `Parameters`, `Nodes`, `Edges` sang `[NotMapped]` properties thao tác trực tiếp trên `GraphData`.
3. Cập nhật `PipelineNode.cs` & `PipelineEdge.cs`:
   - Bổ sung `[JsonIgnore]` cho các navigation properties.
4. Cập nhật `PipelineDbContext.cs` & Model Configurations:
   - Cấu hình `GraphData` với `HasColumnType("jsonb")` và ValueComparer cho `PipelineGraphDocument`.
   - Bổ sung `PipelineSnapshotConfiguration.cs` (Index trên `(PipelineId, VersionNumber)` và `(PipelineId, CreatedAt)`).
   - Loại bỏ `DbSet<PipelineNode>` và `DbSet<PipelineEdge>` khỏi `PipelineDbContext`.

### Phase 2: Refactor Handlers, Tách Biệt Snapshot & Dọn Dẹp Asset Links
1. **Đơn giản hóa `SavePipelineGraph.cs`**:
   - Thêm cờ tùy chọn `bool CreateSnapshot = false` và `string? SnapshotSummary = null` vào request.
   - Giữ nguyên logic xử lý `AssetLink` (Zero-byte copy cho File Pins).
   - **Chủ động dọn dẹp `AssetLink` khi xóa node**: Thay vì dựa vào `EntityDeletedInterceptor` trên `PipelineNode`, quét các node bị gỡ bỏ khỏi Canvas để gọi `assetApi.RemoveLinksForNodesAsync`.
   - Xóa bỏ 150 dòng diffing cũ: Gán trực tiếp `pipeline.GraphData.Nodes` và `pipeline.GraphData.Edges`.
   - Tính SHA-256 (`GraphHash`). Nếu `CreateSnapshot == true`, ghi bản ghi mới vào `PipelineSnapshots` và gọi **Inline Rolling Retention** (giữ 50 bản gần nhất).
2. **Cập nhật `ImportPipelinePackage.cs` & `ExportPipelineBundle.cs`**:
   - `Export`: Loại bỏ `.Include(x => x.Nodes).Include(x => x.Edges)` thừa, tiếp tục xuất qua `graphDtoBuilder`.
   - `Import`: Bỏ các lệnh `db.PipelineNodes.Add` / `db.PipelineEdges.Add`, chỉ `db.Pipelines.Add(item.Pipeline)` và khởi tạo Snapshot `Source = "Import"`.
3. **Cập nhật `PurgePipeline.cs`**:
   - Chủ động quét toàn bộ File Pins trong `pipeline.GraphData.Nodes` để thu hồi `AssetLink` trước khi xóa cứng Pipeline.
4. **Cập nhật Reconcile Edges (`ReconcilePipelineEdgesHandler.cs` & `AnalyzeCustomNodesBatch.cs`)**:
   - Chuyển từ query `db.PipelineNodes` sang duyệt `pipeline.GraphData.Nodes` và loại bỏ edges đứt gãy trực tiếp trong `pipeline.GraphData.Edges`.
5. **Đóng băng đồ thị khi Chạy (`RunPipeline.cs` & `PipelineGraphProvider.cs`)**:
   - Khi kích hoạt `RunPipeline`, tự động tạo/gán `ActiveSnapshotId` cho phiên chạy: `execution.SnapshotId = pipeline.ActiveSnapshotId`.
   - `PipelineGraphProvider.GetPipelineByExecutionIdAsync` ưu tiên nạp `GraphData` từ `SnapshotId` của execution đó.

### Phase 3: EF Core Migration & SQL Transformation Script
1. Sinh EF Core migration `UnifyPipelineGraphJsonbAndSnapshots`.
2. Tích hợp kịch bản SQL Data Migration (Up & Down) đảm bảo zero-data-loss.
3. Chạy `dotnet test` toàn bộ test suite của `Automation.Pipeline` xác nhận không có hồi quy ở Planner, Resolver và Validator.

### Phase 4: Nâng Cấp UX Frontend (`web/src/features/pipelines/`)
1. **Tăng Delay Autosave & Hỗ trợ Phím Tắt**:
   - Trong `usePipelineDraftState.ts`, tăng debounce delay từ `1000ms` lên **`1500ms`**.
   - Bổ sung phím tắt `Ctrl + S`: Kích hoạt lưu ngay lập tức (flush pending save debounce).
2. **API Client & Hook Update**:
   - Hỗ trợ truyền `createSnapshot: true` khi người dùng chủ động bấm lưu checkpoint.
   - Giữ nguyên toàn bộ cấu trúc Inspect Panel (`NodeConfigInspector.tsx`) và Canvas Rendering.
