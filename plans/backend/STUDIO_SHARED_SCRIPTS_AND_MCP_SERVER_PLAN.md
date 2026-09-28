# Kế Hoạch Thiết Kế Kiến Trúc: Studio Shared Scripts Repository & Automation Studio MCP Server

> **Tài liệu Kế hoạch & Thiết kế Kiến trúc (Design Document)**
> **Vị trí**: `plans/backend/STUDIO_SHARED_SCRIPTS_AND_MCP_SERVER_PLAN.md`
> **Phiên bản**: v1.0 (2026-09-27)
> **Nguyên tắc xuyên suốt**: Pragmatic Collaboration — xây dựng kho script tập trung cho studio nhiều người dùng, bảo đảm an toàn hệ thống (Governance), và đón đầu giao thức MCP (Model Context Protocol) để AI Agent có thể trực tiếp tham gia tạo node và tự động hoá quy trình.

---

## 1. Bối Cảnh & Các Thách Thức Cốt Lõi

Trong môi trường Studio Game / VFX / 3D Animation, việc quản lý mã script (Custom Nodes cho Blender, Unreal Engine, Python) và tích hợp trí tuệ nhân tạo (AI Agent) đặt ra hai bài toán lớn:

### 1.1. Bài toán Studio Shared Scripts (Không còn là script của cá nhân 1 máy)

- **Tính phân tán & Chia sẻ**: Technical Artist (TA) A viết một script xử lý Rigging trong Blender trên máy trạm của họ. Tuy nhiên, Animator B hoặc một Pipeline Worker trên máy Render Farm cũng cần phải thực thi được node này. Script không thể nằm chết trên ổ đĩa của một Runner cá nhân.
- **Tính toàn vẹn (Immutability & Impact Analysis)**: Một script khi đã được đưa vào Canvas và sử dụng bởi hàng chục Pipeline không thể bị sửa đè một cách tùy tiện làm gãy dây nối (Breaking Changes) hoặc làm sai lệch kết quả đồ họa của đồng đội.
- **Môi trường & Dependency**: Mỗi script có thể đòi hỏi thư viện Python riêng (Pillow, OpenColorIO, trimesh...) hoặc tương thích với các phiên bản phần mềm DCC khác nhau (Blender 4.2 vs 5.2, Unreal Engine 5.4 vs 5.5).
- **Kiểm duyệt an toàn (Governance)**: Tránh việc ai cũng tự do nạp script chạy ngầm với quyền hạn cao mà không qua kiểm tra cú pháp, chân cắm (pins) hoặc rủi ro bảo mật hệ thống (`subprocess`, `shutil.rmtree`).

### 1.2. Bài toán Tích Hợp AI Agent thông qua MCP (Model Context Protocol)

- Thay vì người dùng phải tự mở Blender tra cứu API `bpy`, tự gõ code Python, tự cấu hình từng pin trên giao diện:
  - Game Developer / TA chỉ cần mô tả ý tưởng trong công cụ AI yêu thích (Cursor, Claude Desktop, Antigravity): _"Viết cho tôi một tool Blender kiểm tra vertex count và xuất FBX theo chuẩn Unreal"_.
  - AI Agent cần có một **giao thức chuẩn hóa (MCP)** để giao tiếp hai chiều với Automation Studio API: đọc ngữ cảnh dự án, biên dịch schema pins từ mã nguồn, chạy thử nghiệm trên Runner thật (Sandboxed Test Run), và đẩy lên Studio dưới dạng Custom Node hoàn chỉnh.
  - Người dùng có thể kiểm chứng trực quan trên Web UI trước khi chính thức phát hành (Publish) vào thư viện đồ thị.

---

## 2. Trụ Cột 1: Kiến Trúc Quản Lý Thư Viện Script Tập Trung Trong Studio (Shared Scripts Repository)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   AUTOMATION STUDIO API                                │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                 Script Registry & Governance Service (C# .NET)                 │   │
│   │  • Script Hashing (SHA-256)        • Tree-sitter AST Parser Engine             │   │
│   │  • Semantic Versioning (v1, v2)     • Impact Analysis ("Used in 4 Pipelines")  │   │
│   │  • Lifecycle: Draft -> Review -> Published -> Deprecated                       │   │
│   └──────────────────────┬──────────────────────────────────┬──────────────────────┘   │
│                          │                                  │                          │
│                          ▼                                  ▼                          │
│              ┌───────────────────────┐          ┌───────────────────────┐              │
│              │ PostgreSQL Metadata   │          │ S3 / MinIO Storage    │              │
│              │ (NodeDefinition DB)   │          │ (Source Code Storage) │              │
│              └───────────────────────┘          └───────────────────────┘              │
└──────────────────────────┬──────────────────────────────────┬──────────────────────────┘
                           │                                  │
          Sync Script via  │                 Fetch Code via   │
          RabbitMQ / gRPC  │                 Asset Public URL │
                           ▼                                  ▼
┌───────────────────────────────────────┐      ┌─────────────────────────────────────────┐
│         RUNNER A (Dev / TA Machine)   │      │        RUNNER B (Render Machine / Farm) │
│  • Pinned Scripts Folder:             │      │  • Cached Scripts Directory             │
│    D:/Studio/Scripts/Blender          │      │    ~/.automation/cache/scripts/         │
│  • Local File Watcher & Push Changes  │      │  • Auto-download & Execute Isolated     │
└───────────────────────────────────────┘      └─────────────────────────────────────────┘
```

### 2.1. Cấu trúc Thực thể (Domain Entity Updates)

Thay vì tạo bảng cồng kềnh, ta nâng cấp bảng `NodeDefinition` hiện hữu trong module `Automation.Pipeline` để hỗ trợ vòng đời phân tán:

```csharp
// api/src/Modules/Pipeline/Automation.Pipeline/Domain/Entities/NodeDefinition.cs
public class NodeDefinition : AuditableEntity
{
    public Guid ProjectId { get; set; }
    public string Key { get; set; } = string.Empty;              // "blender.mesh.export_fbx"
    public string Name { get; set; } = string.Empty;             // "Export FBX"
    public string? Label { get; set; }
    public string? Category { get; set; }                        // "Modeling", "Animation"
    public string Executor { get; set; } = "blender";            // "blender", "unreal", "python"

    // --- Bổ sung cho Studio Collaboration & Versioning ---
    public string SemanticVersion { get; set; } = "1.0.0";       // SemVer
    public string ContentHash { get; set; } = string.Empty;       // SHA-256 hash của mã nguồn
    public NodeLifecycleStatus Status { get; set; } = NodeLifecycleStatus.Published;
    public Guid AuthorUserId { get; set; }                       // Người tạo / nạp script
    public string? SourceRepositoryPath { get; set; }            // Đường dẫn tương đối trong Pinned Folder
    public string? PythonRequirements { get; set; }              // "scipy>=1.10.0, pillow"
    public string? TargetEngineVersion { get; set; }             // "Blender >= 4.2"

    // JSON Value Objects
    public List<PinDefinition> Inputs { get; set; } = [];
    public List<PinDefinition> Outputs { get; set; } = [];
}

public enum NodeLifecycleStatus
{
    Draft = 0,        // Mới tạo từ AI / Local scan, đang chỉnh sửa / chạy thử
    InReview = 1,     // Đã submit, chờ Lead / TA kiểm tra chân cắm
    Published = 2,    // Đã phát hành, xuất hiện trên Canvas Palette cho toàn team
    Deprecated = 3    // Không khuyến khích dùng mới, chỉ giữ để pipeline cũ không vỡ
}
```

### 2.2. Cơ chế Phân Phối Mã Nguồn (Script Distribution Mechanism)

1. **Lưu trữ trung tâm (Source of Truth)**: Khi một script được nạp vào Studio, toàn bộ nội dung file được lưu vào `AssetApi` (MinIO/S3 hoặc Local Storage của server) gắn với Slot `PipelineAssetSlots.CustomScript`.
2. **Cơ chế Cache trên Runner Worker**:
   - Khi `AgentSegmentDispatcher` dispatch một `StageTaskMessage`, nó gửi kèm `ScriptUrl` và `ScriptHash`.
   - Worker kiểm tra thư mục đệm cục bộ `workers/worker/cache/scripts/{ScriptHash}.py`:
     - Nếu đã có và hash khớp: Thực thi ngay mà không cần tải lại (Zero Network Latency).
     - Nếu chưa có: Tải từ Server qua HTTP/gRPC stream, kiểm tra SHA-256 và cache lại.
   - Nhờ cơ chế này, bất kỳ máy trạm Runner nào trong studio cũng có thể thực thi chính xác phiên bản script mà tác giả đã viết, dù máy trạm đó không hề có file gốc trong ổ cứng!

### 2.3. Quy trình Đối soát Thư mục Ghim & Xử Lý Breaking Changes (Reconciliation)

Khi quét thư mục scripts trên Runner hoặc đĩa cục bộ (ví dụ: `D:/GameProject/PipelineTools`):

- Runner/Scanner tính mã băm SHA-256 cho từng file `.py` và phân tích AST các chân cắm (Pins).
- Backend so sánh với danh mục `NodeDefinition` hiện có trong DB:
  - 🟢 **New**: Xuất hiện file mới trên ổ đĩa -> Sẵn sàng Import vào Studio.
  - 🔄 **Override**: Script được chỉ định hoặc tự nhận diện ghi đè một Builtin Tool / Tool khác (`@override: builtin.xxx` hoặc trùng key) -> Hiển thị mũi tên liên kết `script.py -> Target Tool`.
  - 🟡 **Modified**: File bị sửa nội dung hoặc thay đổi chân cắm.
  - ⚪ **Synced**: File đĩa cứng khớp 100% với phiên bản đang lưu trên DB.
  - 🔴 **Missing**: File bị xoá trên đĩa -> Không xoá trong DB, chỉ chuyển trạng thái sang `MissingSource` / `Deprecated` để bảo vệ các pipeline đã lưu.

#### Cơ chế Xử Lý Chân Cắm (In-place Breaking Change Reconciliation)

Thay vì bắt buộc phải tạo phiên bản mới (`v2, v3`) gây rác Database trong giai đoạn phát triển lặp (iterative dev), hệ thống cho phép **Cập nhật đè (In-place Update)** với tùy chọn chiến lược xử lý dây nối trực tiếp trên giao diện:

1. **Option 1: `KeepCompatiblePins` (Mặc định - Smart Auto-reconcile)**:
   - Tự động giữ nguyên dây nối (`PipelineEdge`) cho các pin có Tên và Kiểu dữ liệu tương thích.
   - Tự động tháo các dây nối vào chân đã bị **XÓA** hoặc **ĐỔI KIỂU KHÔNG TƯƠNG THÍCH** trên toàn bộ các Pipeline đang sử dụng node này.
2. **Option 2: `UnpinAll` (Triệt để - Reset All Connections)**:
   - Rút sạch toàn bộ dây cắm (inputs & outputs) của node này trên mọi pipeline để người dùng tự nối dây lại từ đầu, tránh hoàn toàn rủi ro chạy sai logic ngầm.

#### Luồng Kỹ Thuật Backend (Wolverine Event-Driven Architecture)

Để tránh làm nghẽn API khi một script được dùng trong hàng chục pipeline với hàng trăm dây nối:

```csharp
// 1. DTO & Strategy Enum
public enum EdgeReconciliationStrategy { KeepCompatiblePins = 0, UnpinAll = 1 }

// 2. Domain / Integration Event
public record NodeDefinitionPinsChangedEvent(
    Guid ProjectId,
    string NodeRefId,
    List<PinDefinition> OldInputs,
    List<PinDefinition> NewInputs,
    List<PinDefinition> OldOutputs,
    List<PinDefinition> NewOutputs,
    EdgeReconciliationStrategy Strategy
);

// 3. API Handler: Lưu NodeDefinition và publish event ngay lập tức (< 50ms)
// UpdateCustomNodeHandler:
node.Update(command.Name, label, executor, sanitizedInputs, sanitizedOutputs);
await db.SaveChangesAsync(ct);
await bus.PublishAsync(new NodeDefinitionPinsChangedEvent(...));

// 4. Wolverine Background Consumer: Dọn rác dây nối ngầm mà không block HTTP API
public class ReconcilePipelineEdgesHandler(PipelineDbContext db)
{
    public async Task Handle(NodeDefinitionPinsChangedEvent evt, CancellationToken ct) { ... }
}
```

---

### 2.4. Kiến Trúc Quét Thư Mục Đa Nền Tảng (Folder Scanner Architecture)

Để giải quyết bài toán đọc thư mục cục bộ của Technical Artist (TA) mà vẫn tương thích với các môi trường khác nhau:

1. **Trên Tauri Desktop App (Trải nghiệm tốt nhất)**:
   - Dùng native file dialog `dialog.open({ directory: true })`.
   - Sử dụng thư viện Rust `notify` crate làm Native File Watcher: Bắt sự kiện khi TA bấm `Ctrl+S` trong VS Code/PyCharm và cập nhật giao diện `MODIFIED` tức thì (< 10ms), đồng thời lấy được đường dẫn tuyệt đối (`D:/...`) phục vụ cấu hình Runner.
2. **Trên Web App thông qua Local Runner Daemon (Khuyến nghị cho Studio)**:
   - Web App kết nối tới Runner Worker (Python Daemon) đang chạy ngầm trên máy cục bộ qua `localhost` gRPC/SignalR/WebSocket.
   - Runner dùng thư viện Python `watchdog` và `ast` để quét thư mục, phân tích hàm `execute()`, docstrings, type hints và báo cáo kết quả lên Web.
3. **Trên Web App độc lập (Fallback Browser File System API)**:
   - Dùng `showDirectoryPicker()` (HTML5 File System Access API) trên trình duyệt Chromium (Chrome/Edge) để đọc/ghi file trực tiếp khi người dùng chưa khởi động Runner.

---

## 3. Trụ Cột 2: Kiến Trúc Automation Studio MCP Server

Giao thức **Model Context Protocol (MCP)** do Anthropic khởi xướng là cầu nối tiêu chuẩn giữa các LLM (Claude, ChatGPT, Cursor, Antigravity) và các hệ thống backend. Chúng ta sẽ xây dựng **Automation Studio MCP Server** để AI có thể trực tiếp thao tác với hệ thống.

```
┌────────────────────────────────────────────────────────┐
│           CLIENTS (AI Coding Agents)                   │
│   Cursor / Claude Desktop / Antigravity / CLI Tools    │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ MCP Protocol (JSON-RPC over SSE / Stdio)
                            ▼
┌────────────────────────────────────────────────────────┐
│             AUTOMATION STUDIO MCP SERVER               │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │ Tools Registry (MCP Tools Exposed)             │   │
│   │                                                │   │
│   │ • pipeline_list_projects                       │   │
│   │ • pipeline_get_node_catalogue                  │   │
│   │ • pipeline_parse_python_script                 │   │
│   │ • pipeline_test_run_node                       │   │
│   │ • pipeline_upsert_custom_node                  │   │
│   │ • pipeline_trigger_execution                   │   │
│   └───────────────────────┬────────────────────────┘   │
│                           │ Calls Internal VSA Bus     │
│                           ▼                            │
│   ┌────────────────────────────────────────────────┐   │
│   │ Automation.Pipeline Backend Modules & Handlers │   │
│   └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

### 3.1. Danh Sách Công Cụ MCP (Tools Catalogue)

| MCP Tool Name                  | Mục Đích                                              | Tham Số Đầu Vào (JSON Schema)                                                                                                | Kết Quả Trả Về                                                          |
| :----------------------------- | :---------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| `pipeline_list_projects`       | Lấy danh sách dự án và ngữ cảnh Studio                | `{}`                                                                                                                         | Danh sách `ProjectId`, `ProjectName`, `DefaultRunner`                   |
| `pipeline_get_node_catalogue`  | Lấy danh mục node hiện có để AI học cách phối hợp     | `{ projectId: string, executor?: string }`                                                                                   | Danh sách các BuiltIn Tools, Custom Nodes, Pin schemas                  |
| `pipeline_parse_python_script` | Phân tích cú pháp script, suy luận chân Pin qua AST   | `{ scriptContent: string, fileName?: string }`                                                                               | Suggested Name, Label, Executor, List of Input/Output Pins, Description |
| `pipeline_test_run_node`       | Chạy thử nghiệm script trên Runner thật trong sandbox | `{ runnerId: string, executor: string, scriptContent: string, mockInputs: object }`                                          | `succeeded`, `logs`, `mockOutputs`, `executionTimeMs`                   |
| `pipeline_upsert_custom_node`  | Nạp hoặc cập nhật script thành Custom Node chính thức | `{ projectId: string, key: string, name: string, executor: string, scriptContent: string, status?: "Draft" \| "Published" }` | `nodeId`, `version`, `status`                                           |
| `pipeline_trigger_execution`   | Chạy một Pipeline cụ thể từ xa                        | `{ pipelineId: string, runtimeInputs?: object, runnerId?: string }`                                                          | `executionId`, `status`, `trackingUrl`                                  |

---

## 4. Kịch Bản Thực Tế: Từ Ý Tưởng Game Dev Đến Custom Node Hoàn Chỉnh

Dưới đây là luồng phối hợp hoàn hảo giữa **Game Developer**, **AI Agent (qua MCP)** và **Automation Studio Web UI**:

```
[Game Developer]
      │
      │ 1. Prompt: "Viết script Blender gom các material trùng tên và đổi đường dẫn texture"
      ▼
[AI Agent (Cursor/Claude)]
      │
      │ 2. Đọc ngữ cảnh Studio: MCP.pipeline_get_node_catalogue()
      │ 3. Sinh mã Python chuẩn (có docstring, hàm main, type annotations)
      │ 4. Kiểm tra schema: MCP.pipeline_parse_python_script()
      │ 5. Chạy thử trên máy trạm: MCP.pipeline_test_run_node(runnerId="PC-01")
      │    └──> Kết quả: Thành công, log sạch sẽ!
      │ 6. Nạp vào Studio ở dạng DRAFT: MCP.pipeline_upsert_custom_node(status="Draft")
      ▼
[Automation Studio API]
      │
      │ 7. Bắn SignalR thông báo tới Web UI
      ▼
[Web UI - Studio Dashboard]
      │
      │ 8. Hiển thị thông báo: "AI Agent vừa tạo 1 Draft Node mới: Blender Material Merge"
      │ 9. Technical Artist mở tab "Script Manager" -> Xem Code Diff & Cấu hình Pins
      │ 10. Bấm nút [Run Verification Test] kiểm tra lại -> Bấm [Approve & Publish]
      ▼
[Canvas Palette]
      │
      └─> Node mới xuất hiện ngay lập tức trên Canvas để toàn bộ Studio kéo thả!
```

---

## 5. Thiết Kế Giao Diện: Script Ingestion Deck & Preview Sidebar (PowerPoint Style)

Thay vì dùng giao diện bảng biểu Data Table truyền thống gây nhàm chán và bắt người dùng mở nhiều modal phiền toái, hệ thống áp dụng thiết kế **Script Ingestion Deck** trực quan:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  📁 Pinned Folder: D:/Studio/Scripts/Blender   [📂 Choose Folder]  [🔄 Rescan]   [✓ Sync All to Studio] │
├────────────────────────────────┬───────────────────────────────────────────────────────────────────────┤
│  SIDEBAR PREVIEW (Trái)         │  MAIN WORKSPACE (Phải - In-place Inspector, No Modals!)               │
│  (Thẻ trượt mini như PPT)      │                                                                       │
│                                │  ┌──────────────────────────────────────────────────────────────────┐ │
│  ┌──────────────────────────┐  │  │ 🏷️ clean_mesh.py  [Status: 🟡 MODIFIED]            [Version 1.0.2]│ │
│  │ 🟢 NEW                   │  │  │ Target: OVERRIDE -> Builtin: "Mesh Cleaner"                      │ │
│  │ 🐍 auto_rig.py           │  │  └──────────────────────────────────────────────────────────────────┘ │
│  │ (in: 2 ●)     (● out: 1) │  │                                                                       │
│  └──────────────────────────┘  │  ┌─────────────────────────┬────────────────────────────────────────┐ │
│                                │  │ 📌 VISUAL PIN MAPPER    │ 💻 MONACO CODE / DIFF VIEW             │ │
│  ┌──────────────────────────┐  │  │                         │                                        │ │
│  │ 🔄 OVERRIDE              │  │  │ Inputs:                 │ 1  import bpy                          │ │
│  │ 🐍 clean_mesh.py         │◄─┼──┤  ● mesh_obj (EntityRef) │ 2  from automation import tool_pin     │ │
│  │    ↳ builtin.mesh_clean  │  │  │  ● threshold (Float)    │ 3                                      │ │
│  │ (in: 3 ●)     (● out: 2) │  │  │                         │ 4  def execute(context):               │ │
│  └──────────────────────────┘  │  │ Outputs:                │ 5      # Clean isolated vertices       │ │
│                                │  │  ● cleaned_mesh         │ 6      ...                             │ │
│  ┌──────────────────────────┐  │  │                         │                                        │ │
│  │ 🟡 MODIFIED (Diff)       │  │  └─────────────────────────┴────────────────────────────────────────┘ │
│  │ 🐍 export_fbx.py         │  │                                                                       │
│  │ (in: 4 ●)     (● out: 1) │  │  ⚙️ BREAKING CHANGE HANDLING (In-place Action Bar):                    │ │
│  └──────────────────────────┘  │    (●) Keep Compatible Pins (Giữ dây trùng tên & kiểu, tháo dây xóa) │ │
│                                │    ( ) Unpin All Relative Nodes (Rút sạch dây trên mọi pipeline)     │ │
│  ┌──────────────────────────┐  │                                                                       │
│  │ ⚪ SYNCED                 │  │  [▶ Test Run on Runner]   [↺ Revert to Studio]   [✓ Publish Update]  │ │
│  │ 🐍 cloth_sim.py          │  │                                                                       │
│  └──────────────────────────┘  │                                                                       │
└────────────────────────────────┴───────────────────────────────────────────────────────────────────────┘
```

### 5.1. Cột Sidebar Preview bên trái (PowerPoint Thumbnail Deck)
- Hiển thị danh sách toàn bộ script trong thư mục dưới dạng **Thẻ thu nhỏ (Mini-Card)**:
  - **Header**: Tên file, icon engine (Blender / Unreal / Python).
  - **Trạng thái đối soát (Reconciliation Badges)**:
    - 🟢 `NEW`: File mới trên ổ đĩa, chưa có trong DB Studio.
    - 🔄 `OVERRIDE -> [Target Tool]`: Script được chỉ định ghi đè tool khác (kèm mũi tên chỉ rõ tool đích).
    - 🟡 `MODIFIED`: Script đã có trên Studio nhưng file đĩa cứng vừa được sửa code/chân pin.
    - ⚪ `SYNCED`: Khớp 100% giữa đĩa cứng và Database.
    - 🔴 `SYNTAX_ERROR`: File bị lỗi cú pháp Python hoặc thiếu hàm thực thi.
  - **Mini Pin Visual**: Hai bên viền thẻ có các chấm tròn đại diện cho `Inputs` (trái) và `Outputs` (phải). Người dùng nhìn lướt qua cả danh sách là thấy ngay hình dáng chân cắm của toàn bộ 30+ script mà không cần click mở!

### 5.2. Khu vực làm việc chính bên phải (In-place Inspector - Tránh Modal Fatigue)
Tuyệt đối **không mở popup modal** khi bấm cập nhật. Toàn bộ thông tin và thao tác xử lý Breaking Changes nằm ngay trên giao diện chính của file đang chọn:
1. **Thanh Cấu Hình Breaking Change (In-place Action Bar)**:
   - Radio buttons cho phép chọn ngay chiến lược xử lý dây cắm:
     - `Keep Compatible Pins (Default)`: Tự động giữ dây nối còn tương thích, tháo bỏ dây của các chân đã bị xóa.
     - `Unpin All Relative Nodes`: Rút sạch toàn bộ dây cắm trên tất cả pipeline để kết nối lại từ đầu.
   - Các nút hành động chính: `[▶ Test Run on Runner]`, `[↺ Revert to Studio Version]`, `[✓ Publish Update]`.
2. **Visual Pin Mapper**: Cho phép chỉnh sửa nhanh tên hiển thị, kiểu dữ liệu Pin (`EntityRef`, `AssetSlot`, `Float`...), giá trị mặc định.
3. **Monaco Code & Diff View**:
   - Nếu là file `NEW`: Xem và edit code trực tiếp.
   - Nếu là file `MODIFIED` hoặc `OVERRIDE`: Hiển thị giao diện **Side-by-Side Diff** (bên trái là code Studio hiện tại, bên phải là code mới trên ổ đĩa) để thấy rõ từng dòng code thay đổi trước khi bấm Publish.

---

## 6. Lộ Trình Triển Khai Kỹ Thuật (Phased Implementation Roadmap)

Theo định hướng ưu tiên kiểm chứng thực chiến (Proof-of-Concept Verification First), lộ trình được chia thành 4 giai đoạn rõ rệt:

```
┌──────────────────────────────────────────────┐
│ GIAI ĐOẠN 0: TINH GỌN RUNNER & EXECUTORS     │  <-- MÓNG NHÀ NỀN TẢNG (Gom cấu hình
│ • Xóa bỏ ProjectExecutorConfig thừa ở Studio │      Blender, UE5, Python về duy nhất Runner,
│ • Nâng cấp RunnerExecutorConfig (JSONB)      │      UI kiểu VS Code Settings, map .uproject)
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ GIAI ĐOẠN 1: HOÀN THIỆN QUẢN LÝ SCRIPT       │  <-- NGUYÊN LIỆU ĐẦU VÀO (Kiểm chứng luồng
│ • Backend: NodeDefinition & Wolverine Events │      từ File đĩa -> Ingestion Deck ->
│ • Frontend: Script Ingestion Deck (PowerPt)  │      Map Pins -> Test Run trên Runner -> Publish)
└──────────────────────┬───────────────────────┘
                       │ (Sau khi kho Script đã hoàn toàn ổn định)
                       ▼
┌──────────────────────────────────────────────┐
│ GIAI ĐOẠN 2: REFACTOR PIPELINE ENGINE & UI   │
│ • Chuyển Canvas sang Draft State (Local RAM) │  <-- Hỗ trợ Ctrl+C, Ctrl+V, Ctrl+Z mượt mà
│ • Batch Save API (PUT /pipelines/{id}/graph) │      Lưu đồ thị theo chu kỳ, không nghẽn DB
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ GIAI ĐOẠN 3: AUTOMATION STUDIO MCP SERVER    │  <-- Mở rộng đón đầu AI Agents
│ • Sub-project Automation.Mcp (SSE/Stdio)     │      Cursor, Antigravity, Claude tự động sinh
│ • Bộ 6 MCP Tools kết nối trực tiếp vào Studio│      Custom Nodes từ xa
└──────────────────────────────────────────────┘
```

### Chi tiết Giai đoạn 0: Tinh Gọn & Thống Nhất Cấu Hình Runner/Executor (Runner-First Consolidation)
* **Vấn đề giải quyết**: Chấm dứt sự phân mảnh cấu hình giữa `RunnerExecutorConfig` (bên Runner) và `ProjectExecutorConfig` (bên Studio). Dồn toàn bộ cấu hình máy trạm về Nguồn chân lý duy nhất (Single Source of Truth) là Runner.
* **Backend**:
  - Xóa bỏ thực thể `ProjectExecutorConfig` và các API liên quan trong module `Automation.Studio`.
  - Nâng cấp `RunnerExecutorConfig` trong module `Automation.Runner`: Thêm cột `Settings` (`JSONB`) để lưu các cấu hình đặc thù (headless flags, GPU acceleration của Blender, và map `registeredProjects` cho Unreal Engine: `{ [projectId]: "D:/...uproject" }`).
  - Cập nhật `AgentSegmentDispatcher` trong module `Automation.Pipeline`: Chuyển sang đọc cấu hình từ `IRunnerApi` thay vì `IStudioApi`.
* **Frontend**:
  - Xây dựng giao diện **"Runner Configuration Workspace"** theo phong cách VS Code Settings (phân cấp danh mục trái: General, Concurrency, Executors; nội dung phải render theo `ExecutorConfigRegistry`).
  - Hỗ trợ component `UnrealProjectsMapControl` có nút `+ Add Project` để map linh hoạt `ProjectId -> Đường dẫn .uproject` trên máy trạm.

### Chi tiết Giai đoạn 1: Hoàn Thành & Kiểm Chứng Toàn Diện Luồng Quản Lý Script (End-to-End)
* **Backend**:
  - Bổ sung `ContentHash`, `SemanticVersion`, `Status`, `SourceRepositoryPath`, `OverrideTargetRefId` vào `NodeDefinition`.
  - Cập nhật `UpdateCustomNode` hỗ trợ tham số `EdgeReconciliationStrategy` (`KeepCompatiblePins` | `UnpinAll`).
  - Viết Wolverine Event `NodeDefinitionPinsChangedEvent` và Consumer `ReconcilePipelineEdgesHandler` dọn dẹp các `PipelineEdge` bất đồng bộ.
  - Hoàn thiện Endpoint `ScanScriptFolder` (nhận danh sách files & hash, trả về trạng thái Diff: New, Override, Modified, Synced).
* **Frontend**:
  - Xây dựng giao diện **Script Ingestion Deck** (`/projects/:id/scripts`) với Sidebar Preview kiểu PowerPoint và Main Inspector in-place (không modal).
  - Tích hợp Monaco Editor cho Code Viewer và Side-by-side Diff.
  - Tích hợp tính năng Test Run trên Runner trước khi Publish.
* **Mục tiêu nghiệm thu**: Người dùng chỉ cần trỏ vào một thư mục script trên máy, giao diện tự động phân loại, cho phép xem code, chỉnh pin, test run trên Blender/Python Runner thật và bấm Publish đồng bộ sạch sẽ vào DB.

### Chi tiết Giai đoạn 2: Tối Ưu Hóa & Refactor Pipeline Canvas (Draft State & Undo/Redo)
* Tái cấu trúc State của `PipelineCanvas` từ Granular CRUD sang **Local Store (Zustand + History Stack)**.
* Triển khai thao tác Copy/Paste (`Ctrl+C`, `Ctrl+V`) và Undo/Redo (`Ctrl+Z`).
* Thay thế các API vụn vặt bằng endpoint lưu đồ thị tổng thể `PUT /api/pipelines/{id}/graph`.

### Chi tiết Giai đoạn 3: Triển Khai Automation Studio MCP Server
* Tạo sub-project `Automation.Mcp` hỗ trợ JSON-RPC over SSE / Stdio.
* Kết nối AI Coding Agent (Cursor, Claude, Antigravity) để AI tự động tra cứu danh mục node, viết code Python, test run trên Runner và nạp Draft Node vào Ingestion Deck.
