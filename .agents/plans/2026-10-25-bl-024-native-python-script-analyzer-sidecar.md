# Kế Hoạch Kỹ Thuật: Native Python Script Analyzer Sidecar & Form-Registry Pin Convergence

- **Mã kế hoạch**: `BL-024` (Tích hợp & mở rộng toàn diện `BL-021` và nền tảng `BL-014`)
- **Ngày lập**: 25/10/2026
- **Trạng thái**: `Approved / Ready for Implementation`
- **Phạm vi tác động**:
  - **Backend Python Sidecar**: Tạo mới `api/lib/analyzers/python_script_analyzer.py` (Script AST tĩnh native).
  - **Backend C# Core**: 
    - `api/src/Modules/Pipeline/Automation.Pipeline/BuildTime/Services/NativePythonScriptAnalyzer.cs`
    - Cập nhật `ParseScript.cs`, `AnalyzeCustomNodesBatch.cs`
    - Cấu hình `Automation.Pipeline.csproj` (Copy `lib/` to output directory).
  - **Frontend UI & Convergence**:
    - `web/src/features/pipelines/components/script-ingestion/VisualPinMapperTab.tsx` (Dependencies Badges, Preset/Literal Editor, Full-width Markdown Textarea).
    - `web/src/features/pipelines/form-scope/field-adapters/metadataHintAdapter.ts` (Kích hoạt tự động render dropdown qua `FormRenderer`).
  - **Unit Tests**:
    - Python tests: `api/tests/test_python_script_analyzer.py`
    - C# tests: `api/tests/Automation.Pipeline.Tests/NativePythonScriptAnalyzerTests.cs`
  - **Tài liệu & Sổ bộ**: `BACKLOG.md`, `playbooks/pipeline-canvas-sync.md`, `docs/pipelines/SCRIPT_NODE_GUIDELINES.md`.

---

## 1. Bối Cảnh & Tầm Nhìn Kiến Trúc Hội Tụ (Architectural Convergence)

### 1.1. Thực trạng & Những bất cập của bộ parser C# TreeSitter
1. **Bất lợi sân khách khi C# parse Python**:
   - `PythonScriptSchemaParser.cs` hiện tại dùng TreeSitter để duyệt token C-syntax.
   - Không thể hiểu các cú pháp typing hiện đại của Python: `Literal["gemini", "openai", "ollama"]`, `Union[str, List[str]]`, `int | None`.
   - Bóc tách docstring bằng chuỗi thô rất dễ lỗi, làm cụt mô tả hoặc để lọt các khối `Args:`/`Returns:` trùng lặp.
   - Không thể phát hiện được các dependencies bên ngoài (`openai`, `pydantic`, `pillow`, `scipy`) và không biết phân biệt với thư viện chuẩn `os`, `sys`, `json`.
2. **Sự thật kiến trúc: Đường ống Frontend đã chờ sẵn từ trước!**
   - Phía Frontend, hệ thống đã có sẵn [field-registry.ts](file:///d:/FullStack/Automation/web/src/lib/field-registry.ts), [pipelineRegistry.ts](file:///d:/FullStack/Automation/web/src/features/pipelines/form-scope/pipelineRegistry.ts), và đặc biệt là [metadataHintAdapter.ts](file:///d:/FullStack/Automation/web/src/features/pipelines/form-scope/field-adapters/metadataHintAdapter.ts).
   - Adapter này đã code sẵn logic: Nếu `pin.metadata` chứa `{"type": "select", "options": [...]}` thì tự động biến Pin thành control `select` trên Canvas Inspector!
   - Nhưng do bộ parser C# cũ không trích xuất được `Literal` để nhét vào `metadata`, adapter này chưa bao giờ được cấp dữ liệu để kích hoạt.

### 1.2. Tầm nhìn "Cú hích" BL-024
Cú hích này kết nối 3 mắt xích lớn lại làm một:
- **Mắt xích 1 (Sân nhà Python)**: Tận dụng `ast` an toàn 100% bóc tách triệt để Types, Defaults, `Literal`, Outputs và Dependencies.
- **Mắt xích 2 (Hội tụ Form Registry)**: Đẩy `options` vào `PinDefinition.Metadata`, kích hoạt ngay lập tức `metadataHintAdapter` trên Canvas mà **không cần viết lại 1 dòng code render Canvas nào**.
- **Mắt xích 3 (Mở đường cho BL-014 - Preset Mode)**: Mở rộng UI Ingestion cho phép user xem/chỉnh sửa Presets trước khi lưu Node.

---

## 2. Thiết Kế Kiến Trúc Chi Tiết

```mermaid
graph TD
    subgraph "Phase 1 & 2: Subprocess Sidecar Ingestion"
        A[User Uploads .py / Ingest Script] --> B[FastEndpoints: ParseScript]
        B --> C{Host có Python?}
        C -->|Có (Khuyên dùng)| D[Spawn process: `python api/lib/analyzers/python_script_analyzer.py`]
        D --> E[Python Native AST Analyzer:<br/>- ast tĩnh, KHÔNG eval/exec<br/>- Literal -> options<br/>- Return dict -> Outputs<br/>- sys.stdlib_module_names -> Dependencies]
        E -->|JSON Schema qua stdout <50ms| B
        C -->|Không (Docker minimal)| F[Graceful Fallback: C# TreeSitter cũ]
        F --> B
    end

    subgraph "Phase 3: Database & NodeDefinition Persistence"
        B --> G[PinDefinition DTO:<br/>Metadata = '{\"type\":\"select\",\"options\":[\"gemini\",\"openai\"]}'<br/>DefaultValue = 'gemini']
        G --> H[(PostgreSQL jsonb: Inputs/Outputs)]
    end

    subgraph "Phase 4: Frontend Form-Registry Convergence"
        H --> I[Canvas NodeConfigInspector]
        I --> J[pinToFieldDefinition]
        J --> K[metadataHintAdapter MATCHES!]
        K --> L[FormRenderer pipelineRegistry]
        L --> M[Render Dropdown Select UI tự động 100%!]
    end
```

### 2.1. Chuẩn Hóa Cấu Trúc Thư Mục & Đóng Gói
- Vị trí: **`api/lib/analyzers/python_script_analyzer.py`** (ngang cấp với `api/src/`).
- Cấu hình file `Automation.Pipeline.csproj`:
  ```xml
  <ItemGroup>
    <None Include="..\..\..\lib\**\*" CopyToOutputDirectory="PreserveNewest" Link="lib\%(RecursiveDir)%(Filename)%(Extension)" />
  </ItemGroup>
  ```
  Khi build .NET, thư mục `lib/` tự động được sao chép vào `bin/Debug/net10.0/lib/`, đảm bảo gọi được ở mọi môi trường runtime mà không phụ thuộc CWD.

### 2.2. Hợp Đồng Dữ Liệu (JSON Schema Output của Python Analyzer)
```json
{
  "suggestedName": "classify_mesh_types",
  "suggestedLabel": "Classify Mesh Types",
  "executor": "python", // "blender" nếu có bpy, "unreal" nếu có unreal, ngược lại "python"
  "summary": "AI Mesh Role & Cloth Type Classifier",
  "description": "Full markdown description without duplicate Args/Returns blocks...",
  "inputs": [
    {
      "name": "raw_metadata",
      "dataType": "Text",
      "cardinality": "Single",
      "required": true,
      "defaultValue": null,
      "description": "Raw JSON metadata text/string."
    },
    {
      "name": "provider",
      "dataType": "Text",
      "cardinality": "Single",
      "required": false,
      "defaultValue": "gemini",
      "options": ["gemini", "openai", "ollama"], // Bóc tách từ Literal["gemini", "openai", "ollama"]
      "description": "AI provider target"
    }
  ],
  "outputs": [
    {
      "name": "body_meshes",
      "dataType": "Text",
      "cardinality": "Array",
      "description": "List of character body mesh names for baking."
    },
    {
      "name": "cloth_map",
      "dataType": "Text",
      "cardinality": "Map",
      "description": "Dictionary mapping clothing to cloth type."
    }
  ],
  "dependencies": [
    { "module": "openai", "packageName": "openai" },
    { "module": "pydantic", "packageName": "pydantic" }
  ],
  "warnings": []
}
```

---

## 3. Lộ Trình Triển Khai 5 Giai Đoạn (Phased Execution)

### Phase 1: Core Python Analyzer Module (`api/lib/analyzers/`) - [COMPLETED]
- **Nhiệm vụ đã hoàn thành**:
  1. Module hóa package `api/lib/analyzers/` với `__init__.py`, `__main__.py` (hỗ trợ gọi qua thư mục hoặc CLI trực tiếp).
  2. Bóc tách an toàn 100% qua `ast` (tuyệt đối không `eval`/`exec`).
  3. Xử lý `Literal[...]`: trích xuất danh sách options chuỗi và sinh `metadata = '{"type": "select", "options": [...]}'`.
  4. Xử lý `default value`: trích xuất giá trị tĩnh nguyên bản (string, number, boolean, list, dict) không dùng `eval`.
  5. Xử lý `return { ... }`: duyệt câu lệnh return dạng dict, trace annotation của biến local để gán đúng cardinality (`Array`, `Map`, `Single`).
  6. Xử lý `dependencies`: dùng `sys.stdlib_module_names` loại bỏ thư viện chuẩn; dùng `importlib.metadata.packages_distributions()` tự động map import sang tên package pip cài đặt; lọc bỏ DCC builtins (`bpy`, `unreal`, v.v.).
  7. Phân tách `ExecutorStrategy` (Blender, Unreal, Generic Python) và `OutputDiscoveryStrategy` theo Strategy Pattern.
  8. Làm sạch docstring: tách `summary`, loại bỏ `Args:`/`Returns:` lặp lại, và thêm heuristic fallback trích xuất options nếu docstring có dạng `('a', 'b', 'c')`.
- **Kiểm chứng Phase 1**:
  - Test suite `api/lib/analyzers/test_python_script_analyzer.py` gồm 10 tests bao quát toàn bộ strategies, stdlib filtering, options fallback, subprocess stdin piping, và script thực tế (`classify_mesh_types.py`, `export_fbx.py`).
- **Kết quả Review Gate Phase 1**: 10/10 test cases pass 100% (`Ran 10 tests in 10.030s - OK`). Chạy CLI trực tiếp ra JSON chuẩn chỉnh.

---

### Phase 2: C# Subprocess Bridge & Build Packaging
- **Nhiệm vụ**:
  1. Cấu hình `Automation.Pipeline.csproj` copy `lib/` khi build.
  2. Tạo interface `IScriptSchemaAnalyzer` trong `Automation.Pipeline.BuildTime.Services`.
  3. Tạo class `NativePythonScriptAnalyzer`:
     - Định vị executable: thử `python`, `py`, hoặc đọc cấu hình từ appsettings / environment.
     - Spawn subprocess chớp nhoáng, truyền code qua `StandardInput`, nhận JSON qua `StandardOutput`.
     - Timeout an toàn: 2000ms.
  4. Tạo class `HybridScriptSchemaAnalyzer`:
     - Ưu tiên gọi `NativePythonScriptAnalyzer`.
     - Nếu lỗi, crash hoặc không có Python $\rightarrow$ Graceful fallback sang `PythonScriptSchemaParser` (TreeSitter) cũ, không làm gián đoạn API.
  5. Mở rộng DTO `PinDefinition`:
     - Nếu pin có `options` $\rightarrow$ tự đóng gói vào `Metadata = "{\"type\": \"select\", \"options\": [...]}"`.
- **Kiểm chứng Phase 2**:
  - Viết bộ unit tests C# `NativePythonScriptAnalyzerTests.cs` kiểm tra cả Happy Path và Fallback khi python binary bị trỏ sai.
- **Review Gate Phase 2**: Build solution thành công, toàn bộ tests C# pass.

---

### Phase 3: Tích Hợp Endpoints & Custom Nodes Pipeline
- **Nhiệm vụ**:
  1. Inject `IScriptSchemaAnalyzer` vào `ParseScript.cs` (endpoint `/api/pipelines/custom-nodes/parse`).
  2. Inject `IScriptSchemaAnalyzer` vào `AnalyzeCustomNodesBatch.cs` (endpoint batch analyze).
  3. Cập nhật DTO trả về cho Web: bổ sung trường `dependencies` (`List<ScriptDependencyDto>`).
- **Kiểm chứng Phase 3**:
  - Chạy API test thử endpoint `ParseScript` với payload file `classify_mesh_types.py`.
- **Review Gate Phase 3**: Response API trả về đầy đủ metadata hint `options` và `dependencies`.

---

### Phase 4: Giao Diện Ingestion & Hội Tụ Form-Registry (`web/`)
- **Nhiệm vụ**:
  1. **VisualPinMapperTab.tsx**:
     - Hiển thị badge danh sách **Dependencies** (ví dụ: `openai`, `pydantic`).
     - Tối ưu layout Description: Dành riêng 1 hàng full-width (`col-span-full`) cho `<Textarea>` co giãn nhiều dòng, render markdown preview nếu có.
     - Bổ sung cột/badge **Presets / Options**: hiển thị danh sách options nếu pin có `options` (từ `Literal`), cho phép người dùng xem trước hoặc thêm bớt preset (nền tảng BL-014).
  2. **Canvas Node Inspector**:
     - Kiểm tra trực quan trên Canvas: Node có `Literal` (như pin `provider`) tự động kích hoạt `metadataHintAdapter` và hiển thị Combobox/Select options `["gemini", "openai", "ollama"]`.
- **Kiểm chứng Phase 4**:
  - Tải script `classify_mesh_types.py` trên giao diện web, xác nhận UI hiển thị đầy đủ Dependencies và Description.
  - Thêm node vào Canvas, click mở Inspector, xác nhận pin `provider` tự động là dropdown select.
- **Review Gate Phase 4**: Giao diện hiển thị sắc nét, responsive, không có warning console.

---

### Phase 5: End-to-End Verification, Tests & Documentation
- **Nhiệm vụ**:
  1. Chạy toàn bộ test suites Backend .NET (`dotnet test`).
  2. Cập nhật `BACKLOG.md`: chuyển `BL-024` sang `Resolved`, đóng `BL-021`.
  3. Cập nhật `docs/pipelines/SCRIPT_NODE_GUIDELINES.md` hướng dẫn viết script với `Literal` để tự sinh Dropdown trên Canvas.
- **Review Gate Phase 5**: Toàn bộ hệ thống xanh mượt, documentation phản ánh đúng 100% thực tế.

---

## 4. Kế Hoạch Xác Minh & Kiểm Thử (Verification Plan)

### Automated Tests
1. **Python Unit Tests**:
   ```bash
   python api/tests/test_python_script_analyzer.py
   ```
   - Kiểm tra bóc tách `classify_mesh_types.py`:
     - `contracts` $\rightarrow$ `Text[]` (Array)
     - `provider` $\rightarrow$ `Text` (Single) kèm `options: ["gemini", "openai", "ollama"]`, `defaultValue: "gemini"`
     - `body_meshes` $\rightarrow$ `Text[]` (Array)
     - `cloth_map` $\rightarrow$ `Text` (Map)
     - `dependencies` $\rightarrow$ `["openai", "pydantic"]`
2. **.NET Backend Tests**:
   ```bash
   dotnet test api/tests/Automation.Pipeline.Tests --filter "FullyQualifiedName~NativePythonScriptAnalyzer"
   ```
   - Pass 100% tests.

### Manual Verification
1. Mở Web Dashboard $\rightarrow$ Truy cập mục **Custom Nodes** / **Script Ingestion**.
2. Chọn file `workers/pipelines/ai/classify_mesh_types.py`.
3. Quan sát giao diện:
   - Thấy badge `Dependencies: openai, pydantic`.
   - Thấy ô Description hiển thị đầy đủ, không bị cắt cụt.
   - Chân pin `provider` có hiển thị tag Options `[gemini, openai, ollama]`.
4. Bấm Lưu và kéo node vào Canvas Pipeline.
5. Click vào Node để mở Inspector:
   - Thấy chân pin `provider` hiển thị dạng **Dropdown Select** với giá trị mặc định là `"gemini"`.
