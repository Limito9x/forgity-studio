# Kế Hoạch Định Hướng Kỹ Thuật: Automation Studio MCP Server (BL-028)
## Tích Hợp Model Context Protocol — Biến AI Agent Thành Kỹ Sư Tự Động Hóa Pipeline 3D/VFX

> **Mã định danh**: `BL-028`  
> **Ngày khởi tạo**: 28/10/2026  
> **Phạm vi**: `mcp/` (hoặc `tools/Automation.Mcp`), Backend API Integration, AI Pipeline Synthesis  
> **Trạng thái**: `Proposed / Backlog` (Định hướng tương lai)  

---

## 1. Tầm Nhìn & Giá Trị Cốt Lõi (Vision)

Khi Automation Studio phát triển và thu hút cộng đồng kỹ sư kỹ thuật, Technical Artist (TA) và Lead Pipeline 3D/VFX, rào cản lớn nhất của người dùng mới là **phải tự tay kéo thả và cấu hình từng Node trên Canvas** cho một quy trình thủ công phức tạp (vốn có thể gồm 20-30 bước giữa Blender, Unreal, ZBrush, Photoshop).

Bằng cách xây dựng **Automation Studio MCP Server (Model Context Protocol)**, các AI Agent hiện đại (như Claude Desktop, Antigravity, Cursor, Windsurf, v.v.) có thể kết nối trực tiếp vào studio và đóng vai trò như một **Lead Pipeline Engineer AI**:
1. **Lắng nghe quy trình làm việc thủ công của con người**: Nghệ sĩ chỉ cần mô tả:  
   *"Mỗi khi dựng model xong, tôi phải nạp file Blender, tách các mesh tóc/áo/da, export FBX theo quy ước tên `SM_{Name}`, đưa vào Unreal Engine để gán Master Material và sinh DataTable ngoại hình."*
2. **Tự động tổng hợp Pipeline đồ thị (Autonomous DAG Synthesis)**: AI Agent tự động chọn đúng các Tool Nodes trong Studio Palette, nối dây chân Pin (Dataflow & FlowPins), đóng khung vào các Stage (`blender`, `unreal`), thiết lập cấu hình và sinh ra một Pipeline hoàn chỉnh sẵn sàng chạy trên Canvas.
3. **Quản lý & Tương tác hai chiều với Tài nguyên Studio**: Agent có thể kiểm tra danh mục Resource, nạp script Python mới lên hệ thống, tạo Content Item, đồng bộ draft file mà không cần người dùng phải bấm click thủ công trên web UI.

---

## 2. Danh Mục Công Cụ Dự Kiến Của MCP Server (Tool Suite)

Hệ thống MCP sẽ cung cấp 4 nhóm công cụ chính qua giao thức MCP (stdio hoặc SSE/HTTP):

```
┌────────────────────────────────────────────────────────┐
│             Automation Studio MCP Server               │
├────────────────────┬───────────────────────────────────┤
│ 1. Script Deck     │ • ingest_python_script            │
│                    │ • get_node_palette                │
├────────────────────┼───────────────────────────────────┤
│ 2. Repository &    │ • list_repositories               │
│    Resources       │ • query_resources                 │
│                    │ • inspect_resource_metadata       │
│                    │ • sync_draft_resources            │
├────────────────────┼───────────────────────────────────┤
│ 3. Content CMS     │ • list_content_types              │
│                    │ • create_content_item             │
│                    │ • link_resources_to_content       │
├────────────────────┼───────────────────────────────────┤
│ 4. Pipeline Agent  │ • synthesize_pipeline_from_prompt │
│    & Execution     │ • validate_pipeline_graph         │
│                    │ • trigger_pipeline_run            │
│                    │ • get_execution_diagnostics       │
└────────────────────┴───────────────────────────────────┘
```

### Nhóm 1: Node & Script Tools (Mở rộng Palette)
- `ingest_python_script(name, executor, script_path_or_code, description)`:
  - Tự động phân tích AST bằng Sidecar `NativePythonScriptAnalyzer`.
  - Đăng ký script mới vào Node Palette với đầy đủ pins, docstrings và dependency discovery.
- `get_node_palette(category, executor)`:
  - Trả về danh sách toàn bộ các Node Tool hiện có trong hệ thống kèm schema chân Pin (Inputs/Outputs/DataTypes) để AI Agent hiểu rõ nó đang có những khối lego nào để lắp ghép.

### Nhóm 2: Repository, Workstation & Resource Tools
- `list_repositories()` & `list_workstations()`:
  - Cho AI Agent biết đang có những kho lưu trữ và máy trạm (Runner) nào được kết nối.
- `query_resources(workstation_id, keyword, extension)`:
  - Tìm kiếm tệp trong kho theo định dạng (`.blend`, `.fbx`, `.png`, `.uasset`).
- `inspect_resource_metadata(resource_id)`:
  - Trích xuất metadata JSON của tệp (ví dụ: danh sách textures, vertex count, hierarchy).
- `sync_draft_resources(workstation_id, file_paths)`:
  - Đẩy các thay đổi tệp trên máy trạm vào trạng thái Draft để chuẩn bị versioning.

### Nhóm 3: Content CMS & Tagging Tools
- `list_content_types()`:
  - Đọc cấu trúc danh mục dữ liệu của Studio (như `Character`, `Weapon`, `Costume`).
- `create_content_item(type_key, item_key, name, metadata)`:
  - Tạo mới một thực thể nội dung trong Studio.
- `link_resources_to_content(content_id, resource_ids)`:
  - Gắn liên kết tệp 3D vào đúng thẻ Content.

### Nhóm 4: Autonomous Pipeline Synthesis & Execution (Trọng tâm)
- `synthesize_pipeline(project_id, name, description, steps_spec)`:
  - Cho phép AI Agent xuất thẳng cấu trúc `SavePipelineGraphDto` gồm `Nodes`, `Edges`, `Stages` vào Backend.
- `validate_pipeline_graph(pipeline_id)`:
  - Gọi Backend `IPipelineContractValidator` để kiểm tra đồ thị: bắt lỗi Type Mismatch, phát hiện vòng lặp vô tận (Cycles), phát hiện pin Unbound.
- `trigger_pipeline_run(pipeline_id, runtime_inputs)`:
  - Bấm kích hoạt chạy pipeline và trả về `execution_id`.
- `get_execution_status(execution_id)`:
  - Trả về tiến độ thực thi của từng Stage/Node và log lỗi nếu có.

---

## 3. Lộ Trình Kiến Trúc Kỹ Thuật (Architecture Roadmap)

1. **Giai đoạn A (Standalone MCP CLI Service)**:
   - Viết subproject nhẹ `tools/Automation.Mcp` (bằng Python với `mcp` SDK hoặc C# với `ModelContextProtocol.NET`).
   - Sử dụng API Key của Studio để xác thực và gọi ngược về Backend qua REST API / gRPC.
2. **Giai đoạn B (Palette Schema Introspection)**:
   - Xây dựng endpoint trích xuất toàn bộ Node Specifications dưới dạng JSON Schema tương thích chuẩn LLM Function Calling.
3. **Giai đoạn C (Prompt-to-DAG Generator Prompt System)**:
   - Cung cấp System Prompt và vài shot examples mẫu dạy Agent cách ghép các khối (`QueryWorkstationResources` ➔ `FilterResources` ➔ `StageContainer(Blender)` ➔ `StageContainer(Unreal)` ➔ `SyncToRepo`).
4. **Giai đoạn D (One-Click Connect trong Settings)**:
   - Trong trang User Settings / Studio Settings, người dùng chỉ cần copy 1 khối JSON cấu hình:
     ```json
     {
       "mcpServers": {
         "forgity-studio": {
           "command": "forgity-mcp",
           "args": ["--api-url", "http://localhost:5189", "--api-key", "studio_xxx"]
         }
       }
     }
     ```
   - Dán vào Claude Desktop hoặc Antigravity là lập tức có trợ lý ảo toàn quyền điều khiển Studio.
