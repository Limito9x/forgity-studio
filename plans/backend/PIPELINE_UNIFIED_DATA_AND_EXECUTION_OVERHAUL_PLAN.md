# KẾ HOẠCH TRÙNG TU TOÀN DIỆN PIPELINE (V4.2): UNIFIED DATA, DISCIPLINED EXECUTION & COMPACT CAPSULE SYSTEM

> **Phiên bản:** 4.2 — Kỷ cương luồng dữ liệu & Tối giản nguyên khối (Disciplined Dataflow & Atomic Architecture)  
> **Phạm vi:** Toàn bộ Monorepo (`api/`, `web/`, `workers/`, `packages/proto/`)  
> **Nguyên tắc:** Xóa bỏ dữ liệu cũ, không code phòng thủ (Zero Legacy Defensive Code), giải phóng hạ tầng và phân định ranh giới Pure / Impure triệt để.

---

## 1. Chiêm Nghiệm & Triết Lý Kiến Trúc (Dataflow Epiphany)

Xây dựng một hệ thống Visual Scripting kết hợp Hybrid Distributed Execution (vừa có tiến trình Backend C#, vừa có Headless Subprocess Python của DCC như Blender/Unreal Engine, vừa có Canvas đồ thị tương tác thời gian thực) là một trong những bài toán phức tạp nhất về mặt kỹ thuật phần mềm. 

Sau nhiều vòng lặp, khi đi sâu vào bản chất của **Data Flow**, chúng ta đúc kết được 3 nguyên lý tối thượng:

### 1.1. Phân định triệt để Pure (Truy cập thuần túy) vs Impure (Hành động có Side-effect)
- **`GET Variable` / `GET Context` (Pure Accessors):** Không làm biến đổi trạng thái của hệ thống. Chúng chỉ là "cửa ngõ" trỏ vào bộ nhớ (Blackboard / Redis / MemoryStore). 
  - **Hình thái hiển thị:** Không cần mang hình dáng card to đùng (350px) với header và chân Exec. Chúng được hiển thị dưới dạng **`Compact Capsule Node`** (viên thuốc nhỏ ~120-160px, bo tròn `rounded-full`, chỉ có 1 chân Data Output bên phải).
  - **Cơ chế thực thi:** Kéo dây dữ liệu tự do xuyên qua bất kỳ Stage nào. Engine giải quyết bằng cơ chế **Data Pull (Demand-driven)** trong tích tắc (in-memory lookup), **hoàn toàn không spawn task, không qua hàng đợi RabbitMQ, không tốn tài nguyên subprocess**.
- **`SET Variable` (Impure Action):** Làm biến đổi trạng thái (Side-effect). Việc ghi đè biến phải tuân theo trình tự thời gian (Temporal Order) chặt chẽ.
  - **Hình thái hiển thị:** Action Card tiêu chuẩn, có cặp chân Exec: `▶ exec_in` và `▶ exec_out`.
  - **Ranh giới thực thi:** Bắt buộc nằm trong **`Core Services Stage` (Server Scope)**. Không được phép để các worker headless như Blender/Unreal ghi trực tiếp vào biến hệ thống, tránh phân tán trạng thái và xung đột bộ nhớ.

### 1.2. Giải phóng hạ tầng khỏi mã nguồn nghiệp vụ (Decoupling Infra & Workspaces)
- Một Runner là tài nguyên hạ tầng (máy trạm vật lý hoặc cloud VM). 
- Một Project có thể chứa nhiều Repositories (Daz Library, Blender Assets, Unreal Project...).
- Tuyệt đối không phỏng đoán đường dẫn tương đối. Hệ thống giải quyết bằng bộ đôi:
  1. **`Runner Context` (Capsule Node):** Đại diện cho Runner đang thực thi (`Active Host Runner` do user chọn khi bấm Run, hoặc Runner ghim tĩnh).
  2. **`Get Repository Info` (Tool trong Core Services):** Nhận `Runner` + chọn `Repository` $\rightarrow$ Truy vấn bảng `RepositoryRunners` để lấy chính xác `RootPath` tuyệt đối trên máy trạm đó.

### 1.3. Tính Nguyên Khối (Atomicity) trong Lưu Trữ Đồ Thị
- Phân mảnh dữ liệu thành nhiều bảng riêng lẻ (`pipeline_inputs`, `pipeline_outputs`, `variables`) dẫn đến hàng loạt API CRUD rời rạc, race conditions khi vừa tạo biến vừa nối dây, và lỗi xung đột khóa ngoại / concurrency.
- Gom toàn bộ vào `List<PipelineParameter> Parameters` lưu dạng **`jsonb`** ngay trong bảng `pipelines`.
- Khi Canvas tự động lưu (`PUT /api/pipelines/{id}/graph`), toàn bộ Stages, StageEdges, Nodes, Edges, và Parameters được lưu **nguyên khối trong 1 Transaction duy nhất**.

---

## 2. Thiết Kế Data Model Đồng Nhất (Unified Parameter Model)

### 2.1. Phân loại 4 nhóm Parameter (Enum)
```csharp
namespace Automation.Pipeline.Domain.Enums;

public enum PipelineParameterKind
{
    Input = 1,      // Tham số đầu vào (Start node Output Pins & Dynamic Form trên Run Modal)
    Output = 2,     // Kết quả đầu ra (Return node Input Pins & Execution Result)
    Variable = 3,   // Biến nội bộ Blackboard (Capsule Get & Action Set Variable)
    Context = 4     // Context môi trường/hạ tầng (Host Runner, Workspace Context)
}
```

### 2.2. Value Object `PipelineParameter`
```csharp
namespace Automation.Pipeline.Domain.ValueObjects;

public record PipelineParameter
{
    public Guid Id { get; init; } = IdGenerator.NewId();
    public string Key { get; init; } = string.Empty;       // Định danh lập trình: "character_name", "target_runner"
    public string Label { get; init; } = string.Empty;     // Tên hiển thị UI: "Character Name"
    public PipelineParameterKind Kind { get; init; }       // Input | Output | Variable | Context

    // Hệ thống kiểu chân cắm chuẩn (Pin Primitive System)
    public PinPrimitiveType Type { get; init; }            // String, Number, Boolean, Path, EntityRef, Asset...
    public PinCardinality Cardinality { get; init; } = PinCardinality.Single; // Single | Array | Map
    public string? StructType { get; init; }               // "Resource", "Workspace", "Runner",...

    // Metadata nghiệp vụ
    public bool IsRequired { get; init; } = false;         // Bắt buộc nhập khi Run (dành cho Input)
    public string? DefaultValue { get; init; }             // Giá trị khởi tạo mặc định
    public string? Description { get; init; }              // Chú thích giải thích tham số
    public int Order { get; init; } = 0;                   // Thứ tự sắp xếp trên Form / Chân cắm
    public Dictionary<string, object?>? ContextData { get; init; } // Metadata phụ trợ (vd: RepoId, default RunnerId...)
}
```

### 2.3. Cập nhật Thực thể `Pipeline.cs`
- Xóa bỏ quan hệ `Inputs`, `Outputs`, và `Variables` cũ.
- Thay thế bằng thuộc tính duy nhất:
  ```csharp
  public List<PipelineParameter> Parameters { get; set; } = new();
  ```
- Cấu hình Entity Framework Core (`PipelineConfiguration.cs`):
  ```csharp
  builder.Property(x => x.Parameters)
      .HasColumnType("jsonb")
      .HasDefaultValueSql("'[]'::jsonb");
  ```

---

## 3. Kiến Trúc Luồng Thực Thi & Phân Tầng Canvas

### 3.1. Sơ Đồ Topology Luồng Dữ Liệu & Thực Thi

```
┌────────────────────────────────────────────────────────────────────────┐
│ TẦNG TRẠNG THÁI & CONTEXT (Nằm tự do trên Canvas - Pure Accessors)     │
│                                                                        │
│   💊 [Runner: Active Host]    💊 [Repo: Daz Library]   💊 [MeshDir]    │
│   (Capsule Node siêu gọn ~140px, rounded-full, chỉ có 1 output data)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Dây Data cắm tự do xuyên biên giới)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ [STAGE 1] Core Services (Server Scope - C# Backend Process)            │
│  - Chuyên trách: Xử lý logic, tính toán, quản lý state hệ thống.       │
│                                                                        │
│  ┌──────────────────────┐  exec  ┌────────────────────┐                │
│  │ Get Repository Info  ├───────►│ Set Variable       │                │
│  │ (In: Runner + Repo)  │        │ (Key: BaseMeshDir) │                │
│  │ - Out: RootPath ─────┼───────►│ - In: Value        │                │
│  └──────────────────────┘  data  └────────────────────┘                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Dây Exec mép viền Stage)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ [STAGE 2] Blender Worker (DCC Process - Headless Python Subprocess)    │
│  - Chuyên trách: Đồ họa nặng (Import Daz, Bake Texture, UV, Export).   │
│  - Tuyệt đối không ôm đồm việc quản lý DB / biến hệ thống.             │
│                                                                        │
│  ┌──────────────────────────────────────────────────┐                  │
│  │ Differomorphic Import                            │                  │
│  │ - Input Path ◄── (Kéo từ Capsule 💊 BaseMeshDir) │                  │
│  └──────────────────────────────────────────────────┘                  │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2. Cơ Chế Runtime Của Pipeline Execution Engine
1. **Giải quyết Pure Capsule Nodes (`GetVariable`, `RunnerContext`):**
   - Khi một Node trong Stage 1 hoặc Stage 2 cần giá trị đầu vào từ Capsule Node, `PinValueResolver` và `PureNodeResolver` sẽ thực hiện truy vấn trực tiếp vào `IExecutionMemoryStore`:
     - Nếu là `GetVariable`: đọc từ Redis `pe:{execId}:var:{varName}`.
     - Nếu là `RunnerContext`: đọc từ `ExecutionState.SelectedHostRunnerId` được lưu trong context của lượt chạy.
   - **Thời gian xử lý:** < 1ms, không sinh thêm bước chạy trên DAG, không cần worker xử lý.
2. **Thực thi Impure Action `SetVariable`:**
   - Được kích hoạt khi dây `exec_in` nhận tín hiệu hoàn thành từ node trước (ví dụ `Get Repository Info`).
   - Ghi giá trị vào Redis `SetVariableAsync(executionId, varName, value)`.
   - Bắn tín hiệu ra dây `exec_out` để tiếp tục chuỗi xử lý hoặc hoàn thành Stage 1.
   - Mọi node/stage tiếp theo (kể cả Stage 2 trên Runner từ xa) khi kéo dây từ biến này đều nhận được giá trị mới nhất.

---

## 4. Runner & Workspace Context Subsystem

### 4.1. Capsule Node `Runner Context`
- Cung cấp danh tính Runner cho các tác vụ cần thông tin máy trạm.
- Tùy chọn cấu hình trong Inspector hoặc thả ra:
  - `Active Host Runner`: Tự động lấy Runner mà người dùng chọn trong modal **Run Pipeline**.
  - `Specific Runner`: Ghim cố định vào một Runner cụ thể trong Project.
- Kiểu dữ liệu chân ra: `PinPrimitiveType.EntityRef`, StructType: `"Runner"`.

### 4.2. Tool `GetRepositoryInfoTool`
- **Namespace:** `Automation.Pipeline.Tools.Workspaces`
- **Key:** `GetRepositoryInfo` | **Category:** `Workspaces` | **Scope:** `Core Services`
- **Inputs:**
  - `Runner` (PrimitiveType: `EntityRef`, StructType: `Runner`, IsRequired: true)
  - `Repository` (PrimitiveType: `EntityRef`, StructType: `Workspace`, IsRequired: true)
- **Outputs:**
  - `RootPath`: Đường dẫn local tuyệt đối trên runner đó (vd: `D:\Daz3D\Studio\My Library` hoặc `/home/runner/daz_assets`).
  - `RepositoryId`: Guid của Repository.
  - `RepositoryName`: Tên Repository.
- **Triển khai:**
  - Inject `PipelineDbContext` (hoặc `IRepositoryRunnerProvider`).
  - Truy vấn bảng `RepositoryRunners` theo cặp khóa `(RepositoryId, RunnerId)`.
  - Trả về `RootPath`. Nếu không tìm thấy cấu hình trên máy trạm này, ném lỗi rõ ràng: `"Repository {RepoName} is not mapped to Runner {RunnerName}"`.

---

## 5. Tái Cấu Trúc Frontend (`web/`)

### 5.1. Bảng Điều Khiển Hợp Nhất "Parameters & State Panel" (Blackboard)
Thay thế `VariablePanel.tsx` cũ bằng một Drawer bên trái Canvas hiện đại, chia thành 4 Tab:
1. **Tab `Inputs (Start)`:**
   - Quản lý các tham số đầu vào của Pipeline (tên, kiểu dữ liệu, required, default value).
   - Tự động đồng bộ ra danh sách chân cắm Output của node `Start`.
   - Khi click vào node `Start` trên Canvas $\rightarrow$ Tự động focus sang Tab này.
2. **Tab `Outputs (Return)`:**
   - Quản lý kết quả đầu ra của Pipeline.
   - Tự động đồng bộ ra danh sách chân cắm Input của node `Return`.
   - Khi click vào node `Return` trên Canvas $\rightarrow$ Tự động focus sang Tab này.
3. **Tab `Variables`:**
   - Quản lý các biến nội bộ (Blackboard).
   - Kéo một biến thả ra Canvas $\rightarrow$ Hiển thị popover chọn:
     - 💊 **Create Getter (Capsule Node)**: Tạo một Capsule Node nhỏ gọn để cắm data.
     - ⚡ **Create Setter (Action Node)**: Tạo một `Set Variable` Action Node đặt vào `Core Services Stage`.
4. **Tab `Context`:**
   - Chứa các Context có sẵn của hệ thống: `Host Runner Context`, `Project Workspaces`.
   - Kéo ra Canvas $\rightarrow$ Sinh ra Capsule Node tương ứng (`Runner Context`, `Workspace Context`).

### 5.2. Component `CapsuleNode.tsx`
- Đăng ký vào ReactFlow: `nodeTypes = { ..., capsuleNode: CapsuleNode }`.
- **Thiết kế:**
  - Dạng viên thuốc `rounded-full`, padding ngang `px-3`, chiều cao `h-8` (32px).
  - Background tối mờ, viền đổi màu tinh tế theo kiểu dữ liệu (`String`: sky, `Path`: amber, `EntityRef`: emerald, `Boolean`: purple).
  - Icon nhỏ bên trái thể hiện loại tham số (Context icon / Variable icon).
  - Tên biến ở giữa, font chữ kỹ thuật `text-xs font-mono font-medium`.
  - Duy nhất một chân cắm Output (`Handle type="source"`) nằm sát mép phải.
  - Hoàn toàn không có chân Exec!

### 5.3. Trạng Thái Bản Nháp & Tự Động Lưu (`usePipelineDraftState.ts`)
- Mở rộng state bản nháp để quản lý cả `parameters: PipelineParameterDto[]`.
- Khi người dùng thêm, sửa, xóa bất kỳ Input, Output hay Variable nào $\rightarrow$ `setIsDirty(true)`.
- Hàm auto-save (debounce 600ms) gửi payload đầy đủ:
  ```typescript
  await saveMutationRef.current.mutateAsync({
    stages,
    stageEdges,
    nodes: childNodes,
    edges: childEdges,
    parameters, // Đồng bộ nguyên khối cùng đồ thị
  });
  ```

---

## 6. Lộ Trình Triển Khai Chi Tiết (Step-by-Step Action Plan)

### Giai đoạn 1: Backend Domain & Migration (Dọn dẹp triệt để)
- [x] **1.1.** Tạo `PipelineParameterKind.cs` trong `Automation.Pipeline\Domain\Enums`.
- [x] **1.2.** Tạo `PipelineParameter.cs` trong `Automation.Pipeline\Domain\ValueObjects`.
- [x] **1.3.** Sửa `Pipeline.cs`:
  - Xóa các collection `_inputs`, `_outputs`, `Variables`.
  - Thêm `public List<PipelineParameter> Parameters { get; set; } = new();`.
  - Xóa các phương thức cũ `AddInput`, `RemoveInput`, `AddOutput`, `RemoveOutput`, `SetVariables`.
- [x] **1.4.** Cập nhật `PipelineConfiguration.cs`:
  - Cấu hình `builder.Property(x => x.Parameters).HasColumnType("jsonb")`.
  - Xóa cấu hình quan hệ với `PipelineInput` và `PipelineOutput`.
- [x] **1.5.** Xóa 2 thực thể `PipelineInput.cs` và `PipelineOutput.cs` khỏi thư mục `Domain\Entities`.
- [x] **1.6.** Chạy EF Core Migration:
  - Lệnh: `.\cli add-migration Pipeline UnifiedPipelineParameters`
  - Migration sinh mã Drop Table `pipeline_inputs`, `pipeline_outputs` và Rename Column `Variables` $\rightarrow$ `Parameters` kiểu jsonb.
  - Lệnh: `.\cli update-db Pipeline` (Đã cập nhật database thành công).
- [x] **1.7.** Viết `GetRepositoryInfoTool.cs` trong `Automation.Pipeline\Tools\Workspaces`.

### Giai đoạn 2: Engine Execution & Parameter Runtime Snapshot
- [ ] **2.1.** Xây dựng cơ chế **Snapshot Parameters khi kết thúc Execution** (`PipelineOrchestrator.cs`):
  - Khi Pipeline hoàn tất (`MarkSucceeded` hoặc `MarkFailed`):
    - Đọc toàn bộ giá trị thực thi hiện tại từ Redis/MemoryStore:
      * `Inputs`: Toàn bộ dữ liệu người dùng truyền vào lúc bắt đầu.
      * `Variables`: Đọc tất cả giá trị mới nhất của các biến Blackboard (`Parameters.Where(Kind == Variable)`).
      * `Outputs`: Đọc giá trị kết quả được gom về chân cắm của node `Return`.
      * `Context`: Ghi nhận Runner ID, Runner Name thực tế đã chạy, thông tin Trigger.
    - Đóng gói thành cấu trúc `ParametersSnapshot`:
      ```json
      {
        "parameters": {
          "inputs": { "character_name": "Hero", "lod": 0 },
          "variables": { "BaseMeshDir": "D:/Daz3D/...", "BakeRes": 4096 },
          "outputs": { "ResultFbx": "D:/Export/hero.fbx" },
          "context": { "runnerId": "019...", "runnerName": "Workstation-01" }
        }
      }
      ```
    - Lưu snapshot này vào cột `PipelineExecution.ExecutionState` (`jsonb`) trong database PostgreSQL (đảm bảo audit trail vĩnh cửu kể cả khi Redis hết hạn).
- [ ] **2.2.** Realtime Live State qua SignalR:
  - Khi `SetVariableTool` thực thi thành công, gửi thông điệp SignalR `PipelineVariableChanged(executionId, key, value)` để Canvas Live Drawer hiển thị giá trị biến cập nhật trực tiếp theo thời gian thực.
- [ ] **2.3.** Cập nhật DTO `PipelineExecutionDto`:
  - Bổ sung property helper hoặc DTO giải mã `ParametersSnapshot` để Frontend dễ dàng hiển thị danh sách biến của từng lượt chạy cũ trong Execution History.
- [ ] **2.4.** Hoàn thiện Sub-Pipeline Data Flow:
  - Khi một SubPipeline kết thúc, Dispatcher cha có thể đọc ngay `childExecution.ExecutionState.parameters.outputs` để truyền tiếp cho các node phía sau trên đồ thị cha.

### Giai đoạn 3: Frontend Blackboard & Capsule System
- [ ] **3.1.** Cập nhật TypeScript Types & DTOs trong `usePipelineGraph.ts`:
  - Thêm `PipelineParameterDto`, `PipelineParameterKind`.
  - Bổ sung `parameters` vào `ExtendedPipelineGraphDto` và `SavePipelineGraphRequest`.
- [ ] **3.2.** Xây dựng component `CapsuleNode.tsx` (dạng viên thuốc cho Getter).
- [ ] **3.3.** Xây dựng bảng điều khiển hợp nhất `PipelineParametersPanel.tsx` (4 tab: Inputs, Outputs, Variables, Context).
- [ ] **3.4.** Cập nhật `usePipelineDraftState.ts`: Quản lý state `parameters` và auto-save nguyên khối.
- [ ] **3.5.** Cập nhật `useVariableDropHandler.ts`: Kéo thả biến cho phép chọn tạo `CapsuleNode` hoặc `SetVariable` action node.
- [ ] **3.6.** Cập nhật `RunPipelineModal.tsx`: Render form động từ `parameters.filter(p => p.kind === 'Input')` và combobox chọn Host Runner.

### Giai đoạn 4: Kiểm Thử Toàn Diện (End-to-End Verification)
- [ ] **4.1.** Build Backend: `dotnet build api/Automation.sln` (đạt 0 lỗi).
- [ ] **4.2.** Build Frontend: `pnpm tsc -b` trong thư mục `web` (đạt 0 lỗi).
- [ ] **4.3.** Thiết lập Pipeline thử nghiệm hoàn chỉnh:
  - Đặt Capsule `Runner Context` $\rightarrow$ Nối data vào Core Services: Tool `Get Repository Info` (chọn Daz Library).
  - Dây Exec chạy từ `Get Repository Info` $\rightarrow$ `Set Variable: BaseMeshDir`.
  - Dây Exec mép Stage 1 $\rightarrow$ Mép Stage 2 (Blender Stage trên Runner).
  - Trong Blender Stage: Node `Differomorphic Import` nhận đường dẫn từ Capsule `BaseMeshDir`.
  - Bấm Run Pipeline $\rightarrow$ Kiểm tra luồng chạy mượt mà từ Server đến Worker Daemon và hoàn thành xuất sắc.

---

## 7. Kết Luận
Việc tái cấu trúc này đưa kiến trúc Pipeline Engine của dự án lên một đẳng cấp mới:
- **Tối giản & Tinh khiết:** Không còn bảng thừa, không còn code phòng thủ cho dữ liệu cũ, không còn race conditions.
- **Rõ ràng về mặt ngữ nghĩa:** Pure Accessors thì nhỏ gọn, cắm tự do; Impure Actions thì có kỷ cương, có thứ tự thực thi rõ ràng trong Core Services.
- **Trải nghiệm đỉnh cao (Developer & User Experience):** Canvas trực quan như Unreal Engine Blueprints nhưng nhẹ nhàng, thanh thoát và tự động hóa tuyệt đối.
