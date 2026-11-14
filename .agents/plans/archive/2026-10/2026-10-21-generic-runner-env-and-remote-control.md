# Kế Hoạch Kỹ Thuật: Generic Runner Environment Variables, Remote Control & Global CLI

> **Tài liệu Kế hoạch Kỹ thuật (Technical Plan)**  
> **Ngày lập:** 21/10/2026  
> **Trạng thái:** Sẵn sàng thực thi (Ready for Execution)  
> **Phạm vi:** `packages/proto`, `runner/` (Rust Daemon), `api/` (Backend), `web/` (Frontend)

---

## 1. Bối Cảnh & Động Lực (Context & Motivation)

### Vấn đề hiện tại:
1. **Lộ API Key & Thiếu bảo mật trên Canvas:** Các tham số nhạy cảm (như AI `api_key`) nếu để làm pin trên Canvas sẽ bị lưu dưới dạng plaintext trong DB và lộ khi export/share Pipeline Bundle.
2. **Trải nghiệm Onboarding rườm rà:** Bắt người dùng mới tự mở Explorer mò vào `%LOCALAPPDATA%\Forgity\runner.toml` để sửa file hoặc tạo file cứng `.secret_gemini_key` là một anti-pattern thiếu chuyên nghiệp.
3. **Lạm phát Hợp đồng (Protobuf Contract Bloat):** Nếu mỗi lần thêm một nhu cầu quản trị máy trạm (sửa env, dọn cache, self-update) lại phải đẻ ra một Contract gRPC riêng thì Server và Runner sẽ phình to, phải sửa đồng thời cả 4 subprojects (`proto`, `runner`, `api`, `web`).
4. **Binary chưa nhận toàn cục:** `forgity-runner.exe` chưa được tự động đăng ký vào Windows `PATH`, gây khó khăn cho người dùng khi gõ lệnh từ bất kỳ terminal nào.

### Giải pháp cốt lõi:
Xây dựng kiến trúc **Generic Workstation Environment (`[env]`)** kết hợp **Unified Remote Management Command** theo phong cách PaaS (Northflank / Render / GitHub Actions Runner):
* **Canvas sạch 100%:** Chỉ chứa flow logic; toàn bộ secret/key do máy trạm (Runner) quản lý.
* **Generic 100%:** Bảng `[env]` trong `runner.toml` cho phép nạp bất kỳ biến môi trường nào (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `HUGGINGFACE_TOKEN`, DCC custom paths...) mà không cần sửa code hay thêm struct mới cho Runner.
* **Auto Subprocess Injection:** Runner tự động bơm toàn bộ `[env]` vào biến môi trường của mọi tiến trình con (Python, Unreal, Blender). Script chỉ cần gọi `os.environ.get(...)`.
* **Quản trị 2 chiều (CLI & Web UI):**
  * Cục bộ: Lệnh CLI `forgity-runner env set/list` và `forgity-runner setup` (tự add PATH).
  * Từ xa: Web UI có tab "Environment Variables" (kiểu Northflank) $\rightarrow$ Gửi lệnh xuống Runner cập nhật `runner.toml` tức thì qua gRPC stream.

---

## 2. Kiến Trúc Tổng Thể & Luồng Dữ Liệu (Architecture & Data Flow)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Web Dashboard)                        │
│   Trang Runner Detail (/runners/:id) -> Tab "Environment Variables"   │
│   [ Key: GEMINI_API_KEY ] [ Value: AIzaSy... (•••••) ] -> [Save]       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP PUT /api/runners/{id}/env
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         BACKEND CORE (api/)                            │
│   FastEndpoints Handler -> AgentGrpcService -> Gửi ServerMessage       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ gRPC Bi-directional Stream (agent.proto)
                                    │ ServerMessage: SyncEnvCommand { env_map }
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    RUST RUNNER DAEMON (forgity-runner)                 │
│ 1. Nhận SyncEnvCommand -> Cập nhật bảng [env] trong runner.toml        │
│ 2. Hoặc cấu hình cục bộ qua CLI: forgity-runner env set KEY VAL        │
│ 3. Khi thực thi Stage Pipeline:                                        │
│    Subprocess::spawn -> cmd.env(k, v) cho toàn bộ cặp key trong [env]  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Windows Job Object Subprocess
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             PIPELINE EXECUTOR (Python / Unreal / Blender)              │
│   Script AI (classify_material_manifest.py, v.v.):                     │
│   key = os.environ.get("GEMINI_API_KEY") -> TỰ ĐỘNG CÓ DỮ LIỆU!       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Kế Hoạch Triển Khai Chi Tiết Từng Phase (Step-by-Step Phases)

### Phase 1: Runner Core — Generic `[env]` & Subprocess Auto-Injection (✅ HOÀN THÀNH)
* **Mục tiêu:** Cho phép `runner.toml` chứa bảng `[env]` tùy ý và tự động inject vào mọi process con.
* **Công việc đã hoàn thành:**
  1. [`runner/src/config/mod.rs`](file:///d:/FullStack/Automation/runner/src/config/mod.rs):
     - Đã thêm `pub env: Option<HashMap<String, String>>` vào `RunnerConfig`.
     - Thêm đầy đủ helper methods: `get_env`, `set_env`, `remove_env`, `list_env`.
     - Viết unit test `test_runner_config_env_serde` kiểm thử serde toml chính xác 100%.
  2. [`runner/src/core/dispatcher.rs`](file:///d:/FullStack/Automation/runner/src/core/dispatcher.rs) & [`runner/src/cli/start.rs`](file:///d:/FullStack/Automation/runner/src/cli/start.rs):
     - `StageDispatcher` nhận `config.env` và tự động inject toàn bộ các biến trong `[env]` vào `env_vars` trước khi gọi `SubprocessRunner::spawn_with_job_object`.
     - Banner khởi động Runner hiển thị số lượng và danh sách các biến môi trường được tải.
  3. [`workers/pipelines/ai/classify_material_manifest.py`](file:///d:/FullStack/Automation/workers/pipelines/ai/classify_material_manifest.py):
     - Chuẩn hóa `resolve_api_key()`: Ưu tiên số 1: OS Environment Variable (`GEMINI_API_KEY`/`OPENAI_API_KEY`) do Runner inject; Ưu tiên số 2: đọc `[env]` từ `runner.toml`.
     - Xóa bỏ triệt để việc đọc file rác `.secret_gemini_key`.
* **Tiêu chí hoàn thành (Review Gate):**
  - Đã chạy `cargo test --manifest-path runner/Cargo.toml` -> **12/12 passed (0 failed)**.
  - Đã chạy test thực tế Python `resolve_api_key`: cả fallback từ `runner.toml [env]` lẫn injected OS env đều pass 100%.
  - Đã build binary release `forgity-runner.exe` / `forgity.exe` và đồng bộ vào `%LOCALAPPDATA%\Forgity\bin\`.

---

### Phase 2: Global CLI — Tự Động Add PATH & Quản Trị Env Cục Bộ (✅ HOÀN THÀNH)
* **Mục tiêu:** Người dùng gõ được lệnh `forgity-runner` hoặc alias ngắn `forgity` ở bất kỳ đâu và thao tác env qua terminal.
* **Công việc đã hoàn thành:**
  1. [`runner/src/cli/env.rs`](file:///d:/FullStack/Automation/runner/src/cli/env.rs):
     - Tạo Subcommand `Env` hỗ trợ: `list` (hiển thị mask key nhạy cảm), `get <KEY>`, `set <KEY> <VAL>`, `remove <KEY>`.
  2. [`runner/src/cli/setup.rs`](file:///d:/FullStack/Automation/runner/src/cli/setup.rs):
     - Tạo Subcommand `Setup`: tự động cài đặt `forgity-runner.exe` và alias ngắn `forgity.exe` vào `%LOCALAPPDATA%\Forgity\bin\`.
     - Tự động kiểm tra và thêm `%LOCALAPPDATA%\Forgity\bin\` vào `User PATH` qua Windows Registry `HKCU\Environment\Path`.
  3. [`runner/src/cli/mod.rs`](file:///d:/FullStack/Automation/runner/src/cli/mod.rs) & [`runner/src/main.rs`](file:///d:/FullStack/Automation/runner/src/main.rs):
     - Đăng ký `Commands::Env` và `Commands::Setup`.
* **Tiêu chí hoàn thành (Review Gate):**
  - Chạy `forgity-runner setup` thành công, tự động copy binary và ghi PATH vào User Registry.
  - Chạy `forgity env list` hiển thị chính xác các biến môi trường cấu hình trong `runner.toml`.
  - Chạy `forgity env set TEST_VAR ...` và `forgity env remove TEST_VAR` hoạt động trơn tru 100%.
  - User PATH trong registry đã chứa `C:\Users\congt\AppData\Local\Forgity\bin`.

---

### Phase 3: Contract Điều Khiển Từ Xa — Generic Remote Command Execution (`ExecuteCommand`) (✅ HOÀN THÀNH)
* **Mục tiêu:** Cung cấp 1 contract gRPC duy nhất `ExecuteCommand` cho phép Backend/Web gửi bất kỳ lệnh CLI nào (`forgity env list --json`, `forgity env set`, `forgity doctor`, v.v.) xuống Runner và nhận kết quả stdout/stderr/json.
* **Công việc đã hoàn thành:**
  1. [`packages/proto/agent.proto`](file:///d:/FullStack/Automation/packages/proto/agent.proto):
     - Đã thêm `ExecuteCommand` vào `ServerMessage` và `ExecuteCommandResult` vào `CommandResponse`.
  2. [`runner/src/cli/env.rs`](file:///d:/FullStack/Automation/runner/src/cli/env.rs):
     - Đã thêm cờ `--json` cho `forgity env list`: in ra JSON thuần `{"KEY": "VALUE"}` chuẩn xác.
  3. [`runner/src/grpc/client.rs`](file:///d:/FullStack/Automation/runner/src/grpc/client.rs):
     - Đã triển khai handler `ServerMessage::ExecuteCommand`: tự động resolve binary forgity hiện tại, thực thi lệnh với timeout và trả về stdout/stderr/exit_code/timed_out.
  4. [`api/src/Modules/Runner/Automation.Runner.Contracts/IRunnerApi.cs`](file:///d:/FullStack/Automation/api/src/Modules/Runner/Automation.Runner.Contracts/IRunnerApi.cs) & [`Infrastructure/Services/RunnerApiService.cs`](file:///d:/FullStack/Automation/api/src/Modules/Runner/Automation.Runner/Infrastructure/Services/RunnerApiService.cs):
     - Đã triển khai `SendExecuteCommandAsync` liên thông gRPC với Runner daemon.
  5. [`api/src/Modules/Runner/Automation.Runner/Features/Runners/`](file:///d:/FullStack/Automation/api/src/Modules/Runner/Automation.Runner/Features/Runners/):
     - `POST /api/runners/{runnerId}/execute` (`ExecuteRunnerCommand.cs`): Thực thi lệnh CLI tùy ý từ xa.
     - `GET /api/runners/{runnerId}/env` (`GetRunnerEnv.cs`): Gọi ngầm `ExecuteCommand("forgity", ["env", "list", "--json"])` và parse JSON trả về mượt mà cho Frontend.
     - `PUT /api/runners/{runnerId}/env` (`UpdateRunnerEnv.cs`): Nhận danh sách biến cần gán hoặc xóa và cập nhật vào `runner.toml`.
* **Tiêu chí hoàn thành (Review Gate):**
  - Chạy `cargo test --manifest-path runner/Cargo.toml` -> **12/12 passed (0 failed)**.
  - Chạy `dotnet build api/Automation.sln` -> **Build succeeded (0 Error)**.
  - Chạy thực tế `forgity.exe env list --json` -> in ra chuẩn JSON: `{"GEMINI_API_KEY": "..."}`.
  - Đã triển khai binary release mới vào `%LOCALAPPDATA%\Forgity\bin\`.

---

### Phase 4: Frontend Web UI — Tab Environment Variables Phong Cách PaaS (✅ HOÀN THÀNH)
* **Mục tiêu:** Cung cấp giao diện quản lý biến môi trường hiện đại như Northflank / Render trên Web.
* **Công việc đã hoàn thành:**
  1. [`web/src/features/runners/hooks/useRunnerEnv.ts`](file:///d:/FullStack/Automation/web/src/features/runners/hooks/useRunnerEnv.ts):
     - Tạo custom hooks `useRunnerEnv` và `useUpdateRunnerEnv` bọc Orval API client với auto-invalidation TanStack Query.
  2. [`web/src/features/runners/components/RunnerEnvironmentTab.tsx`](file:///d:/FullStack/Automation/web/src/features/runners/components/RunnerEnvironmentTab.tsx):
     - Bảng Key-Value với font monospace, tính năng Mask/Unmask (Eye/EyeOff) bảo mật giá trị secret, nút Copy nhanh.
     - Nút "Add Variable" thêm dòng tức thì.
     - Nút "Paste .env (Bulk Import)" mở Dialog cho phép dán nguyên file `.env` nhiều dòng và tự động merge.
     - Nút "Save Changes" quản lý dirty state và gửi cập nhật xuống máy trạm qua `PUT /api/runners/{id}/env`.
     - Alert cảnh báo nếu máy trạm đang Offline.
  3. [`web/src/features/runners/pages/RunnerDetailPage.tsx`](file:///d:/FullStack/Automation/web/src/features/runners/pages/RunnerDetailPage.tsx):
     - Tích hợp tab thứ 4 "Environment Variables" (`env`) với icon `KeyRound` vào segmented pill tabs navigation.
* **Tiêu chí hoàn thành (Review Gate):**
  - Đã chạy `pnpm --filter web tsc --noEmit` -> **0 lỗi (Clean 100%)**.
  - Giao diện trau chuốt theo đúng Design System của dự án (React Aria, Tailwind CSS, thông báo Toast Sonner).

---

## 4. Kế Hoạch Kiểm Thử Toàn Diện (Testing & Verification Plan)

1. **Unit Test Backend & Runner:**
   - Test đọc/ghi file TOML với các ký tự đặc biệt trong key/value.
   - Test gRPC message dispatching và error handling khi Runner offline.
2. **Integration Test End-to-End:**
   - Xóa bỏ hoàn toàn biến môi trường `GEMINI_API_KEY` trên OS và xóa file `.secret_gemini_key`.
   - Lên Web Dashboard thêm `GEMINI_API_KEY`.
   - Bấm Chạy Pipeline Material AI trên Canvas.
   - Xác nhận: AI phân loại thành công 100%, log ghi nhận `[classify_material_manifest] Loaded GEMINI_API_KEY from environment`.
