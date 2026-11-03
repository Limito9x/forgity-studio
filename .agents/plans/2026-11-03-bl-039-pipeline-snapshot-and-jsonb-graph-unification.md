# Kế Hoạch Kỹ Thuật: Hợp Nhất Đồ Thị Pipeline Sang JSONB & Kiến Trúc Pipeline Snapshot (BL-039)

> **Mã định danh**: `BL-039`  
> **Ngày khởi tạo**: 03/11/2026  
> **Phạm vi**: `api/src/Modules/Pipeline/` (Domain, Persistence, Migrations, Authoring, Runtime), `web/src/features/pipelines/`  
> **Trạng thái**: `Proposed / Pending` (Sẵn sàng triển khai khi chốt sprint)  

---

## 1. Bối Cảnh & Vấn Đề Cốt Lõi (Problem Statement)

### 1.1. "Tàn dư chuẩn hóa" của `PipelineNodes` và `PipelineEdges`
Trong quá trình tiến hóa của module `Automation.Pipeline`:
- Các thành phần mới như `Pipeline.Parameters` (`List<PipelineParameter>`) và `PipelineExecution.ExecutionState` đều đã chuyển sang lưu trữ dạng **`jsonb` nguyên khối** của PostgreSQL.
- Ngay cả ở Runtime, `FrozenExecutionGraph` và `TransientPipelineGraphFactory` (ADR-005) cũng luôn nạp toàn bộ đồ thị vào một cấu trúc In-Memory duy nhất để kiểm tra và thực thi.
- Tuy nhiên, `PipelineNodes` và `PipelineEdges` vẫn bị tách thành 2 bảng quan hệ rời rạc từ thời kỳ đầu, gây ra các hệ lụy:
  1. **Không bao giờ truy vấn đơn lẻ**: Hệ thống không bao giờ query 1 `PipelineEdge` hay 1 `PipelineNode` độc lập mà luôn phải `.Include(p => p.Nodes).Include(p => p.Edges)` ở hơn 14 handlers.
  2. **Độ phức tạp cao khi Lưu (`SavePipelineGraph.cs`)**: Mỗi lần autosave (debounce 600ms), Backend phải chạy hơn 150 dòng code diffing để xóa edges cũ, đối chiếu thêm/sửa/xóa từng dòng node trong transaction, tiềm ẩn rủi ro lỗi khóa ngoại (FK constraint) hoặc race condition.

### 1.2. Nhu cầu cấp thiết về "Pipeline Snapshot" (Bất biến - Immutable Versioning)
Khi mở rộng hệ thống cho **Team Collaboration**, **Undo/Rollback (Lịch sử phiên bản)** và đặc biệt là **AI Agent (MCP Server - `BL-028`)**:
1. **Chống xung đột (Race Condition) giữa Người và AI**: Khi người dùng đang mở Canvas chỉnh sửa mà AI qua MCP cũng tác động vào Pipeline, nếu dùng chung một trạng thái mutable duy nhất sẽ dẫn đến đè mất dữ liệu của nhau (Last-Write-Wins).
2. **Bảo vệ phiên chạy đang diễn ra (In-Flight Execution Safety)**: Khi một Pipeline mất 5–10 phút để chạy qua các Stage (Blender $\to$ AI $\to$ Unreal), việc người dùng sửa đồ thị trên Canvas ngay trong lúc đang chạy không được phép làm hỏng cấu trúc DAG của phiên chạy đó. Each `PipelineExecution` cần gắn chặt với một `SnapshotId` bất biến.
3. **Lịch sử phiên bản & Rollback 1-Click**: Người dùng có thể quay lại bất kỳ phiên bản đồ thị nào trước đó (hoặc xem/duyệt bản đề xuất từ AI Agent) một cách tức thì.

---

## 2. Kiến Trúc Đề Xuất: Unified JSONB Graph & Immutable Snapshots

### 2.1. Mô hình Dữ liệu (Domain & Database Schema)

Gom toàn bộ cấu trúc đồ thị (`Parameters`, `Nodes`, `Edges`) thành một Value Object nguyên khối `PipelineGraphDocument` được lưu dưới dạng **`jsonb`**:

```
┌────────────────────────────────────────────────────────────────────┐
│  pipeline."Pipelines" (Khung định danh & Working Copy)             │
│  • Id (PK, uuid)                                                   │
│  • ProjectId (uuid), Name (varchar)                                │
│  • TriggerType, TriggerConfig (jsonb)                              │
│  • ActiveSnapshotId (uuid, nullable) ──┐                           │
│  • GraphData (jsonb: { Parameters, Nodes, Edges })                 │
│  • GraphHash (varchar(64): SHA-256 của GraphData)                  │
└────────────────────────────────────────┼───────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────┐
│  pipeline."PipelineSnapshots" (Lịch sử Bất biến - Immutable)       │
│  • Id (PK, uuid)                                                   │
│  • PipelineId (FK, uuid, Indexed)                                  │
│  • VersionNumber (int: 1, 2, 3...)                                 │
│  • GraphData (jsonb: { Parameters, Nodes, Edges })                 │
│  • GraphHash (varchar(64): Tránh tạo snapshot trùng lặp)           │
│  • Source (varchar: "Canvas" | "RunFreeze" | "AiMcp" | "Import")   │
│  • Summary (varchar: "Auto-saved", "Run #81a1", "AI Proposal")     │
│  • CreatedAt, CreatedBy                                            │
└────────────────────────────────────────▲───────────────────────────┘
                                         │
┌────────────────────────────────────────┼───────────────────────────┐
│  pipeline."PipelineExecutions"         │                           │
│  • Id (PK, uuid)                       │                           │
│  • PipelineId (FK, uuid)               │                           │
│  • SnapshotId (FK, uuid, nullable) ────┘ (Đóng băng đồ thị lúc Run)│
│  • ExecutionState (jsonb)                                          │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2. Kỹ thuật C# Facade (`[NotMapped]`): Không Phá Vỡ Code Engine Hiện Tại

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
}
```

> **Lưu ý trên `PipelineNode` và `PipelineEdge`**:  
> Gắn `[JsonIgnore]` lên các navigation properties vòng lặp (`Pipeline`, `Parent`, `Children`, `SourcePipelineNode`, `TargetPipelineNode`) để `System.Text.Json` tuần tự hóa sạch sẽ vào `jsonb`.

---

## 3. Chiến Lược Migration Dữ Liệu Cũ (Zero-Data-Loss SQL Migration)

Đây là phần quan trọng nhất để đảm bảo **mọi Pipeline hiện có trên máy người dùng và server được chuyển đổi tự động 100% sang kiến trúc mới mà không mất bất kỳ Node, Edge, tọa độ hay Config nào**.

### 3.1. Chiều Nâng Cấp (`Up` Migration)
Trong file EF Core Migration, thứ tự thực hiện được kiểm soát chặt chẽ:
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

### 3.2. Chiều Hạ Cấp (`Down` Migration — Rollback an toàn)
Nếu cần rollback migration:
1. Tạo lại bảng `PipelineNodes`, `PipelineEdges` và cột `Parameters`.
2. Dùng `jsonb_array_elements(p."GraphData"->'Nodes')` và `jsonb_array_elements(p."GraphData"->'Edges')` để bung ngược toàn bộ JSONB trở lại các dòng trong bảng `PipelineNodes` và `PipelineEdges`.
3. Xóa bảng `PipelineSnapshots` và cột `GraphData`.

---

## 4. Lộ Trình Triển Khai Chi Tiết (Implementation Phases)

### Phase 1: Domain & Persistence Refactoring (`api/src/Modules/Pipeline/`)
1. Tạo `PipelineGraphDocument.cs` và Entity `PipelineSnapshot.cs` trong `Domain/Entities/`.
2. Cập nhật `Pipeline.cs`:
   - Thêm `GraphData`, `ActiveSnapshotId`, `GraphHash`.
   - Chuyển `Parameters`, `Nodes`, `Edges` sang `[NotMapped]` properties thao tác trực tiếp trên `GraphData`.
3. Cập nhật `PipelineNode.cs` & `PipelineEdge.cs`:
   - Bổ sung `[JsonIgnore]` cho các navigation properties.
   - Đảm bảo constructor / setter tương thích với `System.Text.Json` deserialization.
4. Cập nhật `PipelineConfiguration.cs` và tạo `PipelineSnapshotConfiguration.cs`:
   - Cấu hình `GraphData` với `HasColumnType("jsonb")` và `ValueComparer`.
   - Loại bỏ `PipelineNodeConfiguration.cs` và `PipelineEdgeConfiguration.cs` khỏi `PipelineDbContext`.

### Phase 2: Tinh Gọn Handlers & Runtime (`api/src/Modules/Pipeline/`)
1. **Dọn dẹp `.Include(p => p.Nodes).Include(p => p.Edges)`**:
   - Lược bỏ tại `PipelineGraphProvider.cs`, `GetPipelineGraph.cs`, `RunPipeline.cs`, `ValidatePipeline.cs`, `ExportPipelineBundle.cs`, `ReconcileCustomNodeEdgesHandler.cs`, `PurgePipeline.cs`, v.v.
2. **Đơn giản hóa `SavePipelineGraph.cs`**:
   - Giữ nguyên logic xử lý `AssetLink` (Zero-byte copy cho File Pins).
   - Thay thế toàn bộ đoạn diffing `db.PipelineNodes` / `db.PipelineEdges` bằng việc gán trực tiếp danh sách Nodes/Edges mới vào `pipeline.GraphData`.
   - Tính `SHA-256` (`GraphHash`): Nếu đồ thị thay đổi và lệnh lưu có cờ tạo Snapshot (hoặc khi bấm Run / AI Apply), tạo bản ghi `PipelineSnapshot` mới với `VersionNumber = max + 1`.
3. **Đóng băng đồ thị khi Chạy (`RunPipeline.cs` & `PipelineGraphProvider.cs`)**:
   - Khi kích hoạt `RunPipeline`, tự động đảm bảo `ActiveSnapshotId` chứa đồ thị hiện tại và gắn `execution.SnapshotId = pipeline.ActiveSnapshotId`.
   - `PipelineGraphProvider.GetPipelineByExecutionIdAsync` ưu tiên nạp `GraphData` từ `SnapshotId` của phiên chạy đó, đảm bảo 100% tính bất biến suốt vòng đời chạy đa Stage.

### Phase 3: EF Core Migration & Kiểm Thử Tự Động
1. Tạo migration `UnifyPipelineGraphJsonbAndSnapshots` trong `Automation.Pipeline`.
2. Nhúng kịch bản SQL Zero-Data-Loss vào hàm `Up()` và `Down()`.
3. Chạy `dotnet test` toàn bộ suite `Automation.Pipeline.Tests` để xác nhận không có bất kỳ hồi quy (regression) nào ở tầng Planner, Resolver và Validator.

