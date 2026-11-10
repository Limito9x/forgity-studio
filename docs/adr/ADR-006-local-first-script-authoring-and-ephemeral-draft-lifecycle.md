# Architecture Decision Record (ADR): Local-First Script Authoring & Ephemeral Draft Pipeline Lifecycle

- **Mã tài liệu**: ADR-006
- **Trạng thái**: Đã phê duyệt & Áp dụng bắt buộc (Accepted & Enforced)
- **Ngày quyết định**: 2026-11-10
- **Phạm vi**: Toàn bộ luồng phát triển Script Node, Thực thi Pipeline nháp, Quản lý Thư mục Local, Rust Runner Daemon (`forgity-runner`), Headless CLI & AI MCP Server.

---

## 1. Bối Cảnh & Vấn Đề (Context & Problem Statement)

Trong các phiên bản đầu, quy trình phát triển và kiểm thử Pipeline Custom Node dựa hoàn toàn vào mô hình **Cloud-First & Database-Centric**:
1. **Rào cản khi lặp mã (High Iteration Friction)**:
   - Mỗi lần Technical Artist hoặc Lập trình viên viết hoặc sửa 1 file script Python (ví dụ: `bake_texture.py`), họ buộc phải mở Web UI, chọn tệp, nén/upload lên S3 qua presigned URL, tạo bản ghi `NodeDefinition` trong Database PostgreSQL, rồi mới có thể đưa vào Pipeline để test run.
   - Khi sửa 1 dòng code, quy trình trên phải lặp lại từ đầu, sinh ra hàng chục bản ghi rác và phiên bản mồ côi (orphan records).
2. **Ô Nhiễm Database Cho Các Thử Nghiệm Tạm Thời (DB Pollution for Ephemeral Runs)**:
   - Khi muốn thử nghiệm nhanh một chuỗi 2-3 script với nhau, hệ thống yêu cầu phải tạo `Pipeline`, lưu `PipelineNodes`, `PipelineEdges`, rồi tạo `PipelineExecution` trong DB.
   - 90% các đồ thị nháp (draft graphs) này bị vứt bỏ sau vài phút thử nghiệm nhưng vẫn nằm lại vĩnh viễn trong cơ sở dữ liệu.
3. **Lãng Phí Băng Thông & Tải S3 Không Cần Thiết**:
   - Máy trạm cá nhân (Workstation) vừa là nơi viết script Python, vừa là nơi Runner thực thi tiến trình Blender/Unreal. Việc bắt buộc upload script lên S3 rồi Runner lại download file zip về máy local của chính mình là một sự lãng phí tài nguyên và làm chậm tốc độ phản hồi.
4. **Không Thân Thiện Với Công Cụ Dev Ngoài & AI Coding Agents**:
   - Các nghệ sĩ kỹ thuật và dev muốn làm việc trên IDE chuyên nghiệp (VS Code, PyCharm, Cursor) và quản lý pipeline bằng Declarative YAML (`.pipeline.yaml`) được version control bằng Git, thay vì bị trói chặt vào một Web UI đóng kín.
   - Các trợ lý AI (như Claude, Antigravity, Cursor) không có giao thức chuẩn (MCP) để tự động đọc palette công cụ và kiểm chứng pipeline cho người dùng.

---

## 2. Các Phương Án Đã Cân Nhắc (Considered Options)

1. **Phương án A: Tiếp tục mô hình Web-First và thêm bảng `PipelineDrafts` / `LocalScripts` trong Database**
   - *Hạn chế*: Vẫn gây ô nhiễm database; vẫn cần mạng và backend DB để phát triển local; không tận dụng được sức mạnh filesystem và Git của máy trạm.
2. **Phương án B: Tách rời hoàn toàn một App Desktop Local riêng biệt không liên quan đến Backend**
   - *Hạn chế*: Phân mảnh codebase, trùng lặp logic engine giữa Client và Backend, gây khó khăn khi muốn chuyển giao từ máy cá nhân lên Cloud Studio.
3. **Phương án C: Kiến Trúc Lai Local-First, Ephemeral In-Memory Execution & 1-Click Publish (Được chọn)**
   - Cho phép viết script trực tiếp trên ổ đĩa, scan stateless AST trên backend, chạy nháp hoàn toàn trên RAM/Redis cache mà **không chạm 1 byte vào PostgreSQL**, hỗ trợ file Declarative YAML, và chỉ ghi DB/S3 khi người dùng chủ động chọn **Publish**.

---

## 3. Quyết Định Kiến Trúc (The Decision)

### 3.1. Phân Tách Tuyệt Đối Giữa Local Workspace (Workbench) và Studio Central (Cloud Hub)
- **`Local Workspace` (`/pipeline/workspace`)**:
  - Không gian phát triển cá nhân kiểu **IDE Workbench**.
  - Dữ liệu nằm trực tiếp tại hệ thống tệp của máy trạm (cấu hình qua `forgity.workspace.json` và các thư mục theo dõi `scriptFolders`).
  - Hỗ trợ lưu và mở các tệp đồ thị khai báo `.pipeline.yaml`.
  - Toàn bộ trạng thái thực thi thử nghiệm là tạm thời (Ephemeral), không ghi vào bảng `Pipelines`, `PipelineNodes` hay `PipelineExecutions`.
- **`Studio Central` (`/pipeline`)**:
  - Kho quản trị tập trung của toàn Studio (Cloud Governance).
  - Quản lý các pipeline dùng chung chính thức, lưu lịch sử Snapshot bất biến và bảng thư viện công cụ dùng chung (`Node Catalog`).

### 3.2. Cơ Chế Bóc Tách Chân Pin Phi Trạng Thái (Stateless AST Schema Analysis)
- **Rust Tauri Scanner**: Chỉ chịu trách nhiệm quét danh sách tệp `.py` trong các `scriptFolders` và tính mã băm `contentHash` (SHA-256). Tuyệt đối không nhúng logic parse AST vào client để tránh trùng lặp engine.
- **Backend Stateless Endpoint (`POST /api/pipeline/nodes/custom/analyze-batch-stateless`)**:
  - Nhận danh sách mã nguồn script và băm SHA-256 từ client.
  - Sử dụng trực tiếp `IScriptSchemaAnalyzer` để bóc tách `inputPins`, `outputPins`, `executor`, `summary` theo chuẩn Python Type Hints và docstrings.
  - Trả về danh sách schema trực tiếp mà **hoàn toàn không ghi bất kỳ bản ghi nào vào bảng `NodeDefinitions`**.

### 3.3. Thực Thi Đồ Thị Nháp Trong Bộ Nhớ (Zero-DB Ephemeral Draft Execution)
- Triển khai endpoint **`POST /api/pipeline/pipelines/run-draft`**:
  - Nhận `DraftPipelineGraphDto` trực tiếp từ Canvas hoặc từ file `.pipeline.yaml`.
  - Dựng đồ thị in-memory thông qua `ITransientPipelineGraphFactory.BuildFromDraftSnapshot`.
  - Chạy đầy đủ các bước tiền kiểm định (Structural DAG Gate) của `ADR-005`.
  - Trạng thái thực thi `PipelineExecutionState` được khởi tạo với cờ `IsDraft = true` và thời gian sống `TTL = 2 giờ`, lưu tại `IExecutionStateStore` (Redis hoặc MemoryCache).
  - Không sinh bản ghi trong bảng `Pipelines` hay `PipelineExecutions`. Các truy vấn trạng thái (`GetPipelineExecution`, `GetNodeExecutions`) có cơ chế Fallback tự động: nếu không tìm thấy trong DB thì đọc từ `IExecutionStateStore`.

### 3.4. Bỏ Qua S3 (Direct Disk Script Bypass) & Điều Hướng Máy Trạm (Workstation Affinity)
- Đối với các Node thuộc không gian `local:*`:
  - Trong `RunnerSegmentDispatcher.cs`, hệ thống bỏ qua việc upload/download từ S3. Gói `RunStageExecutionStep` được truyền trực tiếp `ScriptPath = SourceRepositoryPath` và `ScriptUrl = null`.
  - **Workstation Affinity Routing**: Client đính kèm `preferredRunnerId` (chính là `machineKey` của Runner nội bộ). MessageBus ưu tiên điều hướng task trực tiếp đến Runner đang kết nối trên cùng máy trạm đó.

### 3.5. Ngôn Ngữ Khai Báo Hai Chiều (Declarative YAML DSL) & Bộ Chuyển Đổi
- Định nghĩa quy chuẩn `.pipeline.yaml`:
  - Tương thích 100% với Git, con người đọc hiểu và chỉnh sửa được bằng text editor.
  - Chuyển đổi hai chiều mượt mà giữa Visual Graph (React Flow) và Declarative YAML thông qua `pipelineDslConverter.ts`.

### 3.6. Headless CLI Runner & AI-Native MCP Server
- Tích hợp trực tiếp vào daemon nhị phân Native Rust `forgity-runner`:
  - **Headless CLI (`forgity-runner run <pipeline.yaml> --report <report.json>`)**: Cho phép thực thi pipeline tự động hóa từ terminal, CI/CD pipeline, hoặc script bên ngoài mà không cần mở giao diện Web.
  - **AI Model Context Protocol Server (`forgity-runner mcp`)**: Chạy máy chủ MCP qua giao thức chuẩn JSON-RPC 2.0 trên STDIN/STDOUT, cung cấp các công cụ `get_palette_nodes` và `validate_pipeline_yaml` cho các trợ lý AI (Claude Desktop, Cursor, Antigravity) để AI có thể tự đọc catalog, tự nối dây và tự sửa lỗi pipeline.

### 3.7. Quy Trình Xuất Bản Nguyên Tử (1-Click Atomic Publish to Studio)
- Khi một quy trình nháp đã hoàn thiện và kiểm chứng thành công tại Local Workspace:
  - Người dùng bấm nút **Publish to Studio**.
  - Endpoint `POST /api/pipeline/publish-draft` thực hiện các thao tác nguyên tử (atomic transaction):
    1. Đóng gói mã nguồn các local scripts thành file zip, tải lên S3 thông qua storage profile.
    2. Đăng ký các thực thể `NodeDefinitions` chính thức vào DB với phiên bản SemVer `1.0.0` và nguồn gốc `folder@runner-id`.
    3. Tạo thực thể `Pipeline` chính thức và lưu `PipelineSnapshot` đầu tiên (tuân thủ `ADR-005`).

---

## 4. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)

### Lợi ích đạt được (Positive Outcomes)
1. **Tốc độ lặp mã cực nhanh (Sub-second Iteration)**: Nghệ sĩ sửa mã trong IDE ngoài, bấm nút là chạy ngay tại chỗ mà không mất thời gian nén/upload/download hay chờ DB.
2. **Cơ sở dữ liệu hoàn toàn sạch sẽ (Zero DB Pollution)**: Ngăn chặn triệt để hàng nghìn bản ghi rác từ các thử nghiệm dang dở.
3. **Thân thiện với AI (AI-Native By Design)**: Lần đầu tiên AI có thể trở thành một Technical Artist đồng hành, tự sinh và kiểm chứng pipeline thông qua giao thức MCP chuẩn quốc tế.
4. **An toàn & Minh bạch**: Các kịch bản local chỉ được chia sẻ lên studio khi người dùng chủ động kiểm tra và ấn Publish.

### Đánh đổi & Thách thức cần kiểm soát (Trade-offs & Mitigations)
1. **Tuổi thọ dữ liệu nháp (Draft State TTL)**: Vì draft execution chỉ lưu trên cache RAM/Redis với TTL = 2h, nếu người dùng muốn lưu lại lịch sử chạy nhiều ngày trước thì bắt buộc phải Publish pipeline lên Studio.
2. **Sự phụ thuộc vào đường dẫn vật lý cục bộ**: Trong chế độ Local Workspace, các script gắn liền với đường dẫn máy trạm cục bộ. Khi đem file `.pipeline.yaml` sang máy khác, cần đảm bảo máy đó cũng có cấu hình các `scriptFolders` tương đương hoặc phải Publish lên Studio Central.
