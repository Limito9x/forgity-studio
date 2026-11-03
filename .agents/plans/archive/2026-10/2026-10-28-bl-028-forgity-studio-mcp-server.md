# Kế Hoạch Định Hướng Kỹ Thuật: Forgity Studio MCP Server (BL-028)
## Tích Hợp Model Context Protocol — Biến AI Agent Thành Kỹ Sư Tự Động Hóa Pipeline 3D/VFX

> **Mã định danh**: `BL-028`  
> **Ngày khởi tạo**: 28/10/2026  
> **Phạm vi**: `mcp/` (hoặc `tools/Automation.Mcp`), Backend API Integration, AI Pipeline Synthesis  
> **Trạng thái**: `Proposed / Backlog` (Định hướng tương lai)  

---

## 1. Tầm Nhìn & Giá Trị Cốt Lõi (Vision)

Khi Forgity Studio phát triển và thu hút cộng đồng kỹ sư kỹ thuật, Technical Artist (TA) và Lead Pipeline 3D/VFX, rào cản lớn nhất của người dùng mới là **phải tự tay kéo thả và cấu hình từng Node trên Canvas** cho một quy trình thủ công phức tạp (vốn có thể gồm 20-30 bước giữa Blender, Unreal, ZBrush, Photoshop).

Bằng cách xây dựng **Forgity Studio MCP Server (Model Context Protocol)**, các AI Agent hiện đại (như Claude Desktop, Antigravity, Cursor, Windsurf, v.v.) có thể kết nối trực tiếp vào Forgity Studio và đóng vai trò như một **Lead Pipeline Engineer AI**:
1. **Lắng nghe quy trình làm việc thủ công của con người**: Nghệ sĩ chỉ cần mô tả:  
   *"Mỗi khi dựng model xong, tôi phải nạp file Blender, tách các mesh tóc/áo/da, export FBX theo quy ước tên `SM_{Name}`, đưa vào Unreal Engine để gán Master Material và sinh DataTable ngoại hình."*
2. **Tự động tổng hợp Pipeline đồ thị (Autonomous DAG Synthesis)**: AI Agent tự động chọn đúng các Tool Nodes trong Studio Palette, nối dây chân Pin (Dataflow & FlowPins), đóng khung vào các Stage (`blender`, `unreal`), thiết lập cấu hình và sinh ra một Pipeline hoàn chỉnh sẵn sàng chạy trên Canvas.
3. **Quản lý & Tương tác hai chiều với Tài nguyên Studio**: Agent có thể kiểm tra danh mục Resource, nạp script Python mới lên hệ thống, tạo Content Item, đồng bộ draft file mà không cần người dùng phải bấm click thủ công trên web UI.

---

## 2. Danh Mục Công Cụ Dự Kiến Của MCP Server (Tool Suite)

Hệ thống MCP sẽ cung cấp 4 nhóm công cụ chính qua giao thức MCP (stdio hoặc SSE/HTTP):

```
┌────────────────────────────────────────────────────────┐
│             Forgity Studio MCP Server               │
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



---

## 4. Kiến Trúc Dataflow Đóng Khung Cho Agent & Biểu Diễn Kép (Pipeline-as-Code & Stage Retry)

> **Cập nhật ngày 03/11/2026**: Đúc kết từ kinh nghiệm thực chiến khi debug lỗi DCC Guest Runner (Unreal SkeletalMesh type coercion, Blender Headless Multi-Material Bake) và tối ưu hóa quy trình tương tác giữa AI Agent với đồ thị Dataflow của Forgity Studio.

### 4.1. Thách thức cốt lõi: Tại sao Agent bị "ngáo" với Raw Canvas JSON?
Khi hệ thống trả về nguyên bản JSON đồ thị của Canvas (ReactFlow):
- Tràn ngập hàng trăm trường UUID rời rạc (`sourceNodeId`, `targetPinId`, `01a199e9-...`).
- Trộn lẫn thông tin layout 2D không cần thiết cho suy luận logic (`Position_X`, `Position_Y`, `Size_Width`, `Capabilities`).
- LLM rất khó ghép nối các UUID rời rạc để hình dung luồng dữ liệu, dễ dẫn đến nối nhầm chân Pin, bỏ sót Node ngoài Container hoặc làm đứt gãy đồ thị.

### 4.2. Giải pháp: Biểu Diễn Kép (Dual-Projection — Visual Canvas & Pipeline-as-Code)
Tương tự như Terraform cho Cloud Infrastructure hay GitHub Actions cho CI/CD:
- **Với Con người (Technical Artist)**: Cần **Visual Canvas** để kéo thả, trực quan hóa luồng dữ liệu 3D phức tạp.
- **Với AI Agent**: Cần **Mặt Code (Pipeline-as-Code / Symbolic Dataflow View)** để đọc và viết dễ dàng bằng tư duy lập trình tự nhiên.

#### Minh họa Mặt Code (Symbolic DSL View):
```hcl
pipeline "character_wardrobe_ingestion" {

  # 1. Pipeline Inputs (Tham số đầu vào)
  input "character_file" {
    type = "Resource"
    allowed_extensions = [".duf", ".blend"]
  }
  input "target_skeleton" {
    type = "String"
    default = "/Game/Characters/Genesis9/SKEL_Genesis9"
  }

  # 2. Stage 1: Blender Bake & Export (Executor: blender)
  stage "Blender Stage" {
    executor = "blender"

    node "import_daz" (script = "import_daz") {
      daz_path = input.character_file
    }

    node "bake_mesh" (script = "bake_mesh") {
      target_objects = node.import_daz.imported_meshes  # <-- Nối dây ngữ nghĩa bằng Alias
      bake_mode      = "head_and_body"                  # <-- Config tĩnh
      resolution     = 4096
    }

    node "export_fbx" (script = "export_modular_fbx") {
      objects = node.bake_mesh.applied_objects
    }
  }

  # 3. Stage 2: AI Classification & Contract Inspection (Executor: python)
  stage "Classify & Contracts" {
    executor = "python"

    node "inspect_contracts" (script = "inspect_game_contracts") {
      project_dir = "D:/Games/UnrealEngine/Projects/TemplateProject"
    }

    node "classify_manifest" (script = "classify_character_manifest") {
      fbx_files     = node.export_fbx.exported_files
      texture_files = node.bake_mesh.baked_files
      contracts     = node.inspect_contracts.contracts
    }
  }

  # 4. Stage 3: Unreal Engine Ingestion (Executor: unreal)
  stage "Unreal Ingestion" {
    executor = "unreal"

    node "ingest_wardrobe" (script = "import_character_wardrobe") {
      manifest      = node.classify_manifest.manifest
      contracts     = node.contracts.contracts
      skeleton_path = input.target_skeleton
    }
  }
}
```

#### Bộ chuyển đổi hai chiều (Two-Way Transpiler):
1. **Chiều Đọc (`DB Graph -> Mặt Code`)**: Đọc `PipelineNodes` + `PipelineEdges`, thay thế UUID bằng Tên Alias ngữ nghĩa (`stage`, `node`, `pin`).
2. **Chiều Ghi (`Mặt Code -> DB Graph`)**:
   - Biên dịch các block thành Nodes và Edges.
   - Chạy qua **`TransientPipelineGraphFactory` (ADR-005)** để kiểm tra cứng tại thời điểm compile (báo lỗi chính xác dòng: sai tên Pin, Type Mismatch, vòng lặp DAG).
   - Tự động chạy thuật toán Auto-Layout để sinh tọa độ `Position_X`, `Position_Y` đẹp mắt trên Canvas trước khi lưu DB.

---

### 4.3. Đóng khung quy trình phát triển khép kín cho Agent (5 Atomic Tools)

Để giải phóng người dùng khỏi việc làm "tester chạy bằng cơm" (phải tự tay upload script, tự bấm chạy, tự copy paste log lỗi về cho AI):

1. **`forgity_sync_script(script_path)`**:
   - Tự động chạy `script_harness.py check` (kiểm tra cú pháp, pin, docstrings).
   - Đẩy trực tiếp nhị phân Server-to-Server lên R2/S3 (hoàn toàn tránh lỗi CORS của trình duyệt).
   - Tự động Confirm Asset và cập nhật `pipeline."NodeDefinitions"` trong DB với chiến lược `KeepCompatiblePins`.
2. **`forgity_inspect_pipeline(pipeline_id_or_name)`**:
   - Trả về bản đồ **Symbolic Dataflow View** kèm trạng thái đồng bộ của các Script (`[synced]` vs `[local modified]`).
3. **`forgity_patch_pipeline(pipeline_id, code_or_patches)`**:
   - Cho phép Agent sửa đồ thị trực tiếp qua cú pháp DSL bậc cao hoặc JSON patch.
4. **`forgity_run_e2e(pipeline_id, inputs, wait=True)`**:
   - Kích hoạt Runner chạy thật, trả về kết quả từng Node và Traceback chi tiết nếu có lỗi.
5. **`forgity_retry_from_stage(execution_id, stage_name)`**:
   - Kích hoạt chạy lại từ một Stage cụ thể mà không phải chạy lại toàn bộ Pipeline từ đầu.

---

### 4.4. Chiến lược Retry / Resume thực tế theo ranh giới bộ nhớ (Memory Boundaries)

Trong kiến trúc Pipeline Dataflow cho các phần mềm DCC (Blender, Unreal):

#### 1. Ranh giới Stage (`retry_from_stage`) — Đơn vị Retry mặc định & an toàn
- **Bản chất**: Mỗi Stage tương ứng với một `RunnerSegment` (1 tiến trình DCC riêng biệt).
- Khi Stage trước kết thúc (VD: Blender bake xong FBX và textures), toàn bộ dữ liệu đã được lưu bền vững xuống ổ đĩa và `ExecutionStateStore`.
- Nếu Stage sau (Unreal) bị crash: Runner chỉ cần lấy nguyên bộ Output đã lưu của Stage trước nạp vào đầu vào của Stage Unreal $\rightarrow$ **Chạy lại chỉ mất 15-30 giây thay vì phải mở lại Blender bake 4-5 phút từ đầu**.

#### 2. Thử nghiệm bên trong Stage (Intra-Stage Node Testing & Fallback Checkpoints)
- **Vấn đề**: Các Node nằm trong cùng 1 Stage chia sẻ chung Context Scene đang nằm trong RAM (`bpy.context.scene`). Nếu Node ở giữa bị crash, tiến trình DCC tắt, Context trong RAM biến mất hoàn toàn $\rightarrow$ **Không thể tùy tiện retry một Node lẻ loi ở giữa Stage nếu không có Context**.
- **Giải pháp**: Cơ chế **Fallback Scene Checkpoint**:
  - `stage_runner_guest.py` hỗ trợ cờ lưu snapshot `.blend` sau các bước tốn thời gian (hoặc nhận đường dẫn `fallback_scene_path` có sẵn).
  - Khi cần test lại Node bị crash: Guest Runner mở file snapshot lên để **khôi phục 100% Scene trong 1 giây**, sau đó mới nạp inputs gọi hàm `main()` của Node cần kiểm tra.
