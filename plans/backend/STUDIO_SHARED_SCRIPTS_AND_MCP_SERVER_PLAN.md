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
  - Game Developer / TA chỉ cần mô tả ý tưởng trong công cụ AI yêu thích (Cursor, Claude Desktop, Antigravity): *"Viết cho tôi một tool Blender kiểm tra vertex count và xuất FBX theo chuẩn Unreal"*.
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
│   │  • Semantic Versioning (v1, v2)     • Impact Analysis ("Used in 4 Pipelines")   │   │
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

### 2.3. Quy trình Đối soát Thư mục Ghim (Pinned Folder Reconciliation)
Khi người dùng gán một Pinned Folder trên một Runner (ví dụ: `D:/GameProject/PipelineTools`):
- Runner tính mã băm SHA-256 cho từng file `.py`.
- Backend so sánh với danh mục `NodeDefinition` hiện có:
  - 🟢 **New**: Xuất hiện file mới -> Mời Import.
  - 🟡 **Modified**: File bị sửa nội dung -> Phân tích Breaking Change:
    - Nếu chân Pin không đổi: Cho phép cập nhật nhanh.
    - Nếu chân Pin thay đổi (thêm/xoá/đổi kiểu): Đưa ra cảnh báo **Impact Analysis** (Liệt kê danh sách các Pipeline đang dùng node này) và đề xuất:
      - *Cập nhật đè (In-place Update)*: Đánh dấu Warning trên các Canvas đang dùng node này.
      - *Tách phiên bản mới (Create v2)*: Giữ v1 cho các pipeline cũ, tạo v2 cho các pipeline mới.
  - 🔴 **Missing**: File bị xoá trên đĩa -> Không xoá trong DB, chỉ chuyển trạng thái sang `Deprecated` / `MissingSource` để bảo vệ các pipeline đã lưu.

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

| MCP Tool Name | Mục Đích | Tham Số Đầu Vào (JSON Schema) | Kết Quả Trả Về |
| :--- | :--- | :--- | :--- |
| `pipeline_list_projects` | Lấy danh sách dự án và ngữ cảnh Studio | `{}` | Danh sách `ProjectId`, `ProjectName`, `DefaultRunner` |
| `pipeline_get_node_catalogue` | Lấy danh mục node hiện có để AI học cách phối hợp | `{ projectId: string, executor?: string }` | Danh sách các BuiltIn Tools, Custom Nodes, Pin schemas |
| `pipeline_parse_python_script` | Phân tích cú pháp script, suy luận chân Pin qua AST | `{ scriptContent: string, fileName?: string }` | Suggested Name, Label, Executor, List of Input/Output Pins, Description |
| `pipeline_test_run_node` | Chạy thử nghiệm script trên Runner thật trong sandbox | `{ runnerId: string, executor: string, scriptContent: string, mockInputs: object }` | `succeeded`, `logs`, `mockOutputs`, `executionTimeMs` |
| `pipeline_upsert_custom_node` | Nạp hoặc cập nhật script thành Custom Node chính thức | `{ projectId: string, key: string, name: string, executor: string, scriptContent: string, status?: "Draft" \| "Published" }` | `nodeId`, `version`, `status` |
| `pipeline_trigger_execution` | Chạy một Pipeline cụ thể từ xa | `{ pipelineId: string, runtimeInputs?: object, runnerId?: string }` | `executionId`, `status`, `trackingUrl` |

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

## 5. Thiết Kế Chi Tiết Giao Diện Web UI Cho Quản Lý Script

Để giải quyết bài toán giao diện mà bạn đã đề cập, Frontend cần triển khai một trang quản trị chuyên dụng:

### 5.1. Trang `Script Management & Node Governance` (`/projects/:id/scripts`)
1. **Header Toolbar**:
   - Nút **"Add Pinned Folder"**: Chọn thư mục từ Runner thông qua `RemoteFileBrowserDialog`.
   - Nút **"Scan & Sync All"**: Đồng bộ toàn bộ các thư mục đã ghim.
   - Nút **"New Script Node"**: Mở trình soạn thảo online.
2. **Bộ Lọc Phân Vùng (Tabs)**:
   - `All Nodes`: Toàn bộ node của dự án.
   - `Pending Review (Drafts)`: Các node được tạo bởi AI hoặc mới scan cần kiểm tra chân cắm.
   - `External Pinned`: Các node liên kết trực tiếp từ thư mục của các Runner.
3. **Bảng Danh Mục Script (Data Table)**:
   - **Tên & Key**: Có icon Executor (Blender/Unreal/Python).
   - **Phiên bản & Trạng thái**: Badge màu xanh `Published`, vàng `Draft`, cam `Modified`, xám `Deprecated`.
   - **Tác giả / Nguồn**: AI Agent (qua MCP) hoặc Tên kỹ sư.
   - **Mức độ ảnh hưởng (Usage)**: Ví dụ: `Used in 3 pipelines` (Hover hiển thị popup danh sách pipeline).
   - **Actions**:
     - *Inspect Pins & Code*: Xem code editor và chân cắm.
     - *Diff Changes*: So sánh bản cũ vs bản mới khi có cập nhật file trên đĩa.
     - *Test Sandbox*: Cho phép nhập giá trị test và bấm chạy thử ngay trên máy Runner.

---

## 6. Lộ Trình Triển Khai Kỹ Thuật (Implementation Roadmap)

### Giai đoạn 1: Chuẩn Hóa Schema & Backend Script Distribution (Immediate)
- Cập nhật entity `NodeDefinition` (thêm `ContentHash`, `SemanticVersion`, `Status`, `SourceRepositoryPath`).
- Xây dựng service `ScriptReconciliationHandler`: Tiếp nhận danh sách file và SHA-256 từ Runner, bóc tách và phân loại 4 trạng thái (`New`, `Modified`, `Unchanged`, `Missing`).
- Hoàn thiện luồng cache script trên Worker: Tải file từ Server qua AssetApi và kiểm tra hash trước khi thực thi.

### Giai đoạn 2: Xây dựng Giao Diện Quản Trị Script (Script Governance UI)
- Xây dựng trang `/projects/:id/scripts` theo chuẩn `ResourcePageShell`.
- Xây dựng component `ScriptSchemaDiffDialog`: So sánh trực quan sự khác biệt của Input/Output pins giữa bản trong DB và bản mới quét từ đĩa.
- Hoàn thiện `PipelineReturnNodeInspector.tsx` trên Canvas để thông luồng liên-pipeline.

### Giai đoạn 3: Triển Khai Automation Studio MCP Server
- Tạo một sub-project hoặc endpoint group `Automation.Mcp` trong Backend:
  - Cung cấp giao thức MCP JSON-RPC qua chuẩn Transport SSE (Server-Sent Events) hoặc Stdio executable (`Automation.Cli mcp-server`).
  - Đăng ký bộ 6 công cụ MCP cơ bản đã thiết kế ở Mục 3.1.
- Kiểm thử tích hợp thực tế: Dùng Cursor / Claude Desktop / Antigravity kết nối vào Studio MCP Server, yêu cầu AI viết script và push trực tiếp thành Custom Node.
