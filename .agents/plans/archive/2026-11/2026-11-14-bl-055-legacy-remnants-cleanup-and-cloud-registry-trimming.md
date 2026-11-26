# Kế Hoạch Kỹ Thuật: Làm Sạch Tàn Dư Kiến Trúc Cũ (`Repository`, `Tag`, Cloud Live-Edit & Server-Worker Remnants) (BL-055)

- **Mã Backlog**: `BL-055`
- **Ngày lập**: 14/11/2026
- **Trạng thái**: `Proposed / Pending Review`
- **Tài liệu kiến trúc nền tảng**:
  - [ADR-007: Two-Tier Pipeline & Local SQLite Index](file:///d:/FullStack/Automation/docs/adr/ADR-007-two-tier-component-master-pipeline-and-local-sqlite-index.md)
  - [ADR-008: Runner-Only Local Execution Engine & Backend Runtime Removal](file:///d:/FullStack/Automation/docs/adr/ADR-008-runner-only-local-execution-engine-and-backend-runtime-removal.md)
  - [BL-053: Pipeline Engine De-Shackling](file:///d:/FullStack/Automation/.agents/plans/2026-11-12-bl-053-pipeline-engine-de-shackling-component-pipes-and-rust-dag-scheduler.md)
- **Phạm vi tác động**:
  - **Phase A**: `api/src/Modules/Repository/`, `api/src/Modules/Tag/`, `api/src/Modules/Pipeline/Contracts/` (Struct & Tools gắn Repository), `api/src/Modules/Studio/`, `web/src/features/repositories/`, `web/src/routes/.../repositories*`, `web/src/routes/.../resources*`, các picker/dialog liên quan.
  - **Phase B**: `api/src/Automation.Api/Program.cs`, `api/src/Modules/Pipeline/` (`Hubs/`, `BuildTime/`), `web/src/features/pipelines/` (`adapters/CloudPipelineStorageAdapter.ts`, `usePipelineSignalR.ts`, canvas save flow).
  - **Phase C**: `web/src/features/contentItems/`, `runner/src/` (`cli/start.rs`, `queue/`, `grpc/`), `api/src/Modules/Runner/`.

---

## 1. Bảng Đối Chiếu Trước & Sau Thực Hiện (Before vs After Matrix)

| Hạng mục | TRƯỚC (Tàn dư kiến trúc cũ) | SAU (Chuẩn Local-First & Cloud Template Registry) |
| :--- | :--- | :--- |
| **1. `Repository` & `Tag` (`GameplayTags`)** | - Tồn tại 4 project C# (`Automation.Repository`, `Automation.Repository.Contracts`, `Automation.Tag`, `Automation.Tag.Contracts`) cùng Entity, Migration, Picker UI, và Route `/repositories`, `/resources`.<br/>- Phản ánh tư duy DAM/VCS thủ công (scan đĩa, gắn Tag từng file để truyền giữa các chặng DB), đi ngược luồng tự động hóa Local-First và cạnh tranh vô ích với ổ đĩa cục bộ / Git / Perforce. | - Xóa bỏ hoàn toàn module `Repository` và `Tag` khỏi Backend `.NET` & Frontend `web/`.<br/>- Dữ liệu giữa các bước trong pipeline truyền qua **In-Memory Blackboard + Local Struct/Asset Path**; hậu xử lý bên ngoài (nếu có) do post-run plugin/script xử lý. |
| **2. Vai trò của Cloud `Automation.Pipeline`** | - Cho phép sửa đồ thị trực tiếp từng nét qua `SavePipelineGraph`, đổi trigger server, rollback snapshot, CRUD custom node lẻ và stream trạng thái chạy qua SignalR `PipelineExecutionHub`.<br/>- Mang tàn dư `ScopeContainer` & C# Server Tools (`LookupContentMapTool`, `AssignResourcesToContentTool`, `SyncLocalChangeToRepositoryTool`...). | - Cloud Studio thu gọn thành **Immutable Template & Artifact Registry**: xem danh sách, xem đồ thị (Read-only), tải Bundle (`ExportPipelineBundle`), Publish mới/lại từ Local Workspace (`PublishDraftPipeline`), và Archive/Restore.<br/>- Xóa SignalR `PipelineExecutionHub` và luồng live-edit cạnh/node trực tiếp trên Cloud DB. Mọi chỉnh sửa thực hiện tại Local Workspace rồi **Publish** lại. |
| **3. Mô hình Thực thi (`Single-Machine Execution`)** | - Cả Rust `runner/` (`cli/start.rs`, `queue/rabbitmq.rs`, `grpc/client.rs`) lẫn `Automation.Runner` (`RunnerGrpcService`, remote `ExecuteRunnerCommand`, `EncryptedRabbitMqPassword`) vẫn giữ hạ tầng multi-worker server-push qua RabbitMQ + gRPC. | - Khẳng định kiến trúc **1 máy chạy trọn 1 Component Pipe hoặc 1 Master Pipeline** (`forgity-runner run-bundle --stdin --json-events`).<br/>- Sau khi hoàn tất luồng pull Template từ Cloud + Quota/License token check, gỡ bỏ RabbitMQ worker queue và gRPC persistent command stream. |
| **4. Module `Content` (`Automation.Content`)** | - Không còn phụ thuộc code C# trực tiếp tới `Repository`/`Tag`, nhưng Frontend còn dialog `LinkContentResourcesDialog.tsx` trỏ tới Resource Repository và `LookupContentMapTool` / `AssignResourcesToContentTool` nối Content với Pipeline Runtime cũ. | - **Giữ lại `Automation.Content` & `DynamicForms`** nhưng tháo bỏ mọi dây nối tới `Repository`/`Resource`, chuẩn bị tái cấu trúc thành Catalog/Schema lưu thành phẩm cho nhu cầu tương lai. |

---

## 2. Đặc Tả Chi Tiết Từng Phase

### Phase A: Xóa bỏ hoàn toàn `Repository`, `Tag` & Các Struct/Tools Phụ Thuộc

> **Mục tiêu**: Cắt bỏ 100% mã nguồn, dependency project, route và UI thuộc hệ sinh thái `Repository` và `GameplayTags` để giải phóng solution và giảm diện tích bảo trì.

#### A.1. Backend `.NET` (`api/`)
1. **[XÓA PROJECT & THƯ MỤC]**:
   - `api/src/Modules/Repository/Automation.Repository/`
   - `api/src/Modules/Repository/Automation.Repository.Contracts/`
   - `api/src/Modules/Tag/Automation.Tag/`
   - `api/src/Modules/Tag/Automation.Tag.Contracts/`
   - Gỡ 4 project + Solution Folders (`Repository`, `Tag`) khỏi `api/Automation.sln`.
2. **[SỬA] Đăng ký Module & Project References**:
   - [api/src/Automation.Api/Automation.Api.csproj](file:///d:/FullStack/Automation/api/src/Automation.Api/Automation.Api.csproj): xóa `<ProjectReference>` tới `Automation.Repository` và `Automation.Tag`.
   - [api/src/Automation.Api/Modules/ModuleRegistry.cs](file:///d:/FullStack/Automation/api/src/Automation.Api/Modules/ModuleRegistry.cs): xóa `using Automation.Tag;` (line 7), `using Automation.Repository;` (line 8) và các lời gọi `AddTagModule` / `AddRepositoryModule` / `MapTagEndpoints` / `MapRepositoryEndpoints`.
   - [api/src/Modules/Pipeline/Automation.Pipeline/Automation.Pipeline.csproj](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Automation.Pipeline.csproj): xóa `<ProjectReference>` tới `Automation.Tag.Contracts` và `Automation.Repository.Contracts`.
   - [api/src/Modules/Studio/Automation.Studio/Automation.Studio.csproj](file:///d:/FullStack/Automation/api/src/Modules/Studio/Automation.Studio/Automation.Studio.csproj): xóa `<ProjectReference>` tới `Automation.Repository`.
3. **[XÓA] Phần phụ thuộc trong `Automation.Studio` & `Automation.Pipeline`**:
   - Xóa [RepositoryMigrationProvider.cs](file:///d:/FullStack/Automation/api/src/Modules/Studio/Automation.Studio/Features/Migrations/Providers/RepositoryMigrationProvider.cs) và tham chiếu domain `Repositories` khỏi Unified Project Migration (nếu có trong enum/service).
   - Xóa các Entity Struct gắn hạ tầng cũ khỏi `Automation.Pipeline/Contracts/StructRegistry/Definitions/`:
     - `RepositoryStructDefinition.cs`
     - `ResourceStructDefinition.cs`
     - `WorkstationStructDefinition.cs`
     - Kiểm tra `RunnerStructDefinition.cs` & `ContentTypeStructDefinition.cs` (giữ hoặc tách sạch nếu không còn dùng trên Cloud DAG).
   - Xóa các Workspace Tools gắn `Repository` khỏi `Automation.Pipeline/Contracts/Tools/Workspaces/`:
     - `AssignResourcesToContentTool.cs` (+ xóa `api/tests/Automation.Pipeline.Tests/AssignResourcesToContentToolTests.cs`)
     - `SyncLocalChangeToRepositoryTool.cs`
   - Dọn các test còn dùng `Automation.Repository.*` trong `api/tests/Automation.Pipeline.Tests/`.
4. **[VERIFY BACKEND PHASE A]**:
   - `dotnet build api/Automation.sln` -> 0 errors.
   - `dotnet test api/Automation.sln` -> toàn bộ test suite pass.

#### A.2. Frontend (`web/`)
1. **[XÓA FEATURE & ROUTES]**:
   - Xóa toàn bộ `web/src/features/repositories/` (bao gồm `RepositoryResourcesTab`, `RepositorySyncTab`, `ResourceTagDropZone`, `TagMapPreviewDialog`, `useRepositories`, v.v.).
   - Xóa `web/src/features/tags/` (nếu tồn tại) và các shared pickers/panels chỉ phục vụ Repository/Tag:
     - `TagPanel.tsx`, `TagPicker.tsx`, `RepositoryPicker.tsx`, `WorkstationPicker.tsx`
     - `FormPinRepositorySelect.tsx`, `FormPinTagTreeSelect.tsx`, `ResourceWorkstationSelect.tsx`
   - Xóa routes:
     - `web/src/routes/_protected/_project/s/$studioSlug/projects/$projectId/repositories.tsx`
     - `web/src/routes/_protected/_project/s/$studioSlug/projects/$projectId/repositories/`
     - `web/src/routes/_protected/_project/s/$studioSlug/projects/$projectId/resources/$resourceId.tsx`
2. **[SỬA] Dọn Điều Hướng, Inspector & Runner Tabs**:
   - `ProjectSidebar.tsx`, `ProjectShell.tsx`, `useProjectNav.ts`, `onboarding.tsx`, `CreateProjectForm.tsx`: bỏ tab/link Repositories & Resources.
   - `RunnerDetailPage.tsx` & `RunnerAttachedRepositoriesTab.tsx` / `useAttachedRepositoriesByRunner.ts`: xóa tab Repositories gắn với Runner.
   - `PipelineStartNodeInspector.tsx`: gỡ nhánh cấu hình Resource/Repository/Workstation trigger.
   - `UnifiedMigrationWizardDialog.tsx`: bỏ lựa chọn domain `Repositories` trong wizard export/import.
   - `web/src/config/featureFlags.ts`: dọn hoặc thu gọn cờ `enableStudioCatalog` cho khớp trạng thái mới (chỉ còn Content nếu vẫn giữ cờ ẩn).
3. **[VERIFY FRONTEND PHASE A]**:
   - Regenerate route tree (`pnpm build` / TanStack Router Vite plugin) & chạy `pnpm --dir d:\FullStack\Automation\web tsc --noEmit` + `pnpm --dir d:\FullStack\Automation\web build`.

---

### Phase B: Thu Gọn `Automation.Pipeline` Thành Cloud Immutable Template & Artifact Registry

> **Mục tiêu**: Cắt bỏ luồng Cloud Live Execution (SignalR) và các endpoint cho phép chỉnh sửa graph trực tiếp trên Cloud DB; giữ mô hình *"tải dữ liệu Cloud Studio về Local Workspace để sửa rồi Publish phiên bản mới lên lại"*.

#### B.1. Xóa SignalR Hub & Live Execution Endpoint/Hooks
1. **[XÓA] Backend Hub**:
   - Xóa [PipelineExecutionHub.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Hubs/PipelineExecutionHub.cs).
   - Sửa [Program.cs](file:///d:/FullStack/Automation/api/src/Automation.Api/Program.cs#L120): xóa `app.MapHub<Automation.Pipeline.Hubs.PipelineExecutionHub>("/hubs/pipeline-executions");`.
   - Kiểm tra xem `Automation.Pipeline` còn nơi nào reference `SignalR` hay entity `PipelineExecution.cs` phục vụ DB execution log cũ không; nếu `PipelineExecution` chỉ phục vụ server execution bị xóa ở ADR-008, dọn luôn hoặc tách nhẹ nếu dùng cho audit quota.
2. **[XÓA/SỬA] Frontend SignalR Hook**:
   - Xóa hoặc vô hiệu hóa `usePipelineSignalR.ts` khỏi `web/src/features/pipelines/`. Đảm bảo mọi Live Tracking đi qua Tauri IPC (`usePipelineLiveTracking.ts` + `local-pipeline://event`).

#### B.2. Phân Loại Endpoint Trong `BuildTime/` (Giữ vs Cắt)
1. **NHÓM GIỮ LẠI (Immutable Template & Artifact Registry)**:
   - **Truy vấn & Xem**: `GetPipelines.cs`, `GetPipelineGraph.cs`, `GetPipelineSnapshots.cs`, `GetPinCatalogue.cs`, `GetStructCatalogue.cs`, `GetNodePalette.cs`, `GetCustomNodeById.cs`, `GetCustomNodeSource.cs`.
   - **Tải về Local & Đóng gói**: `ExportPipelineBundle.cs` (và hỗ trợ trả về Asset SHA-256 + Graph + Contracts để Client tải về Local Workspace / Runner cache), `ImportPipelinePackage.cs`, `ValidatePipelinePackage.cs`.
   - **Publish & Vòng đời Registry**: `PublishDraftPipeline.cs` (cổng duy nhất đẩy phiên bản hoàn chỉnh từ Local lên Cloud Registry), `UpdatePipeline.cs` (chỉ metadata tên/mô tả nếu cần), `DeletePipeline.cs` (Archive / Soft Delete), `RestorePipeline.cs`, `PurgePipeline.cs`.
2. **NHÓM CẮT BỎ / NGƯNG CHỈNH SỬA TRỰC TIẾP TRÊN CLOUD**:
   - Xóa `SavePipelineGraph.cs` (autosave cạnh/node trực tiếp trên Cloud Canvas) và `useSavePipelineGraph` / `saveDraft` trong `CloudPipelineStorageAdapter.ts`.
   - Xóa `UpdatePipelineTrigger.cs` (trigger gắn với Server RabbitMQ/Repository event cũ).
   - Xóa `ResolveToolPins.cs` (chỉ dùng cho C# Server Resolver Tools lúc vẽ graph trực tiếp trên Cloud).
   - Đánh giá & gỡ bỏ `CreatePipeline.cs` (nếu pipeline mới luôn tạo tại Local rồi Publish qua `PublishDraftPipeline.cs`), `CreatePipelineSnapshot.cs` / `RollbackPipelineSnapshot.cs` (nếu mỗi lần Publish tự tạo Snapshot bất biến).
   - Đánh giá & gỡ bỏ nhóm `BuildTime/Features/CustomNodes/` cho phép sửa node lẻ trên Cloud (`CreateCustomNode.cs`, `UpdateCustomNode.cs`, `DeleteCustomNode.cs`, `DeleteCustomNodesBulk.cs`, `BatchUpsertCustomNodes.cs`, `ReconcilePipelineEdgesHandler.cs`, `NodeDefinitionPinsChangedEvent.cs`), thay vào đó mọi CustomNode được sync trọn gói khi `PublishDraftPipeline`.
   - Đánh giá & gỡ nốt các C# Server Tools trong `Contracts/Tools/` (`LookupContentMapTool.cs`, `BreakStructTool.cs`, `FormatStringTool.cs`, `SplitStringTool.cs`) sau khi rà soát `PipelineNodeContractResolver` / `ToolRegistry` không còn phụ thuộc vào chúng.
3. **Cập nhật UX Frontend Cloud Canvas**:
   - Trong `web/src/features/pipelines/adapters/CloudPipelineStorageAdapter.ts` và trang chi tiết `$pipelineId.tsx`: khóa Canvas Cloud thành chế độ **Read-Only Inspector / Registry View** kèm nút **"Open / Pull to Local Workspace"** (tải bundle về Local SQLite + YAML để chỉnh sửa và chạy thử trên máy) và nút **"Archive / Restore"**.

---

### Phase C: Tách Rời `Content` & Lộ Trình Dọn Server-Worker (`Runner` RabbitMQ / gRPC)

> **Mục tiêu**: Giữ `Automation.Content` sạch sẽ để tái cấu trúc sau, đồng thời dọn nốt hạ tầng multi-worker phân tán không còn phù hợp với mô hình Single-Machine Execution.

#### C.1. Decouple `Automation.Content`
1. Backend `Automation.Content`:
   - Kiểm tra lại `Automation.Content.csproj` và `ContentMigrationProvider.cs` để đảm bảo hoàn toàn độc lập với `Repository` & `Tag`.
   - Giữ nguyên `DynamicForms` + `ContentType` + `ContentItem` làm nền cho định hướng **Project Result Catalog** trong tương lai (nhận output từ Post-Run Hook hoặc Export).
2. Frontend `contentItems`:
   - Gỡ `LinkContentResourcesDialog.tsx`, `LinkedContentsCell.tsx`, `AssignContentSidePanel.tsx` (hoặc thay tham chiếu Resource bằng Asset/File link thuần túy nếu còn dùng).

#### C.2. Dọn Hạ Tầng Server-Worker Trong `runner/` & `Automation.Runner` *(Thực hiện sau khi xong luồng Pull Cloud Template + Quota Gate)*
1. **Rust Runner (`runner/`)**:
   - Xóa daemon RabbitMQ consumer & gRPC client nếu Runner không còn lắng nghe job push từ Server:
     - `runner/src/cli/start.rs`
     - `runner/src/queue/mod.rs`, `runner/src/queue/rabbitmq.rs` (`RabbitMqClient`, `RabbitMqEventSink`)
     - `runner/src/grpc/mod.rs`, `runner/src/grpc/client.rs`
   - Giữ lại hoàn chỉnh toàn bộ engine thực thi 1 máy & tiện ích cục bộ: `run_local.rs` (`run-bundle` / `run-local`), `mcp.rs`, `dcc.rs`, `clean.rs`, `doctor.rs`, `env.rs`, `setup.rs`, `core/` (2-tier orchestrators, executors, python_packages), `process/` (Job Object, DCC pool), `storage/` (SQLite WAL `runner_state.db`, zero-RAM streaming asset downloader từ Cloud S3 khi pull Template).
2. **Backend `Automation.Runner`**:
   - Thu gọn `Automation.Runner` từ **Remote Command & Fleet Orchestrator** về **Machine Licensing / Quota & Auth Gate** (định danh máy, cấp token tải Cloud Template & kiểm tra quota chạy).
   - Loại bỏ: `RunnerGrpcService.cs`, `RunnerGrpcExtensions.cs`, `RunnerConnectionRegistry.cs`, `CommandTracker.cs`, `ExecuteRunnerCommand.cs`, các remote RPC (`ScanExecutors.cs`, `ScanRunnerHardware.cs`, `DiscoverRunnerFolder.cs`, `StopRunnerDccSession.cs`, `UpgradeRunner.cs`, `ReportExecutorConfigs.cs`), và cột `EncryptedRabbitMqPassword` + RabbitMQ provisioning trong `RegisterRunnerWithToken.cs`.
   - Đồng bộ dọn `packages/proto/` (`agent.proto`, `execution_state.proto`) nếu không còn giao tiếp gRPC hai chiều giữa API và Runner.

---

## 3. Rủi Ro & Chiến Lược Triển Khai An Toàn

1. **Snapshot & Branching**: Toàn bộ kiến trúc cũ đã được lưu bảo toàn tại nhánh `archive/pre-local-first-cleanup` (`95de420`). Trước khi bắt đầu Phase A, nên commit phần Phase 3 + `ADR-008` hiện tại trên `develop` để ranh giới lịch sử Git rõ ràng.
2. **Database Migrations (PostgreSQL)**: Không tự ý sửa file migration cũ đã chạy; khi bỏ hoàn toàn schema `repository` / `tag` hoặc bảng `PipelineExecutions`, hoặc chỉ gỡ `DbContext` khỏi runtime, hoặc cung cấp script/migration drop bảng sạch cho môi trường fresh DB.
3. **Orval API Client (`web/src/gen/`)**: Vì `web/src/gen/` là code tự sinh từ OpenAPI của Backend, sau mỗi Phase Backend (`A`, `B`) cần chạy lại generator (`pnpm gen:api`) trước khi chạy `pnpm tsc` để frontend không giữ type chết.
4. **Thứ tự ưu tiên khuyến nghị**:
   - **Ngay bây giờ**: Commit Phase 3 + `ADR-008` ➔ Thực thi **Phase A** (`Repository` + `Tag`) vì ít rủi ro và cắt bỏ ngay khối nợ kỹ thuật lớn nhất.
   - **Tiếp theo**: Thực thi **Phase B** (`Automation.Pipeline` -> Cloud Template Registry, bỏ `PipelineExecutionHub` & `SavePipelineGraph`).
   - **Song song / Sau thiết kế Cloud Template + Quota Gate**: Thực thi **Phase C** (tinh gọn `runner/` & `Automation.Runner`).
