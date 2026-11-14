# Forgity Studio — Spec triển khai Local Run & Template Quota Tinh Gọn

_Tài liệu giao cho coding agent. Cập nhật ngày 14/11/2026._

## 0. Ghi chú cho agent (đọc trước)

- Chủ dự án là dev .NET/React mạnh nhưng **không chuyên Rust**. Trước khi viết code Rust cho mỗi bước, hãy giải thích ngắn bằng ngôn ngữ thường: luồng dữ liệu đi đâu, ai sở hữu dữ liệu, vì sao chọn thiết kế đó.
- Làm theo từng bước nhỏ ở mục 10, mỗi bước build + test được độc lập, commit riêng.
- Mọi chữ ký hàm trong tài liệu này là **gợi ý**. Hãy đọc code thật trong `runner/src/core/` trước và điều chỉnh cho khớp, đừng đổi code đang chạy tốt chỉ để giống tài liệu.
- Gặp chỗ mơ hồ hoặc mâu thuẫn với code: hỏi lại, đừng tự đoán.

## 1. Mục tiêu

1. **Engine Local là Open (0-Backend, 0-Quota)**: Bấm **Run** trên pipeline tự viết (`local:*`) thì chạy **hoàn toàn local** qua `forgity-runner`, không gọi `.NET Backend`, không cần đăng nhập, UI nhận tiến độ realtime.
2. **Standalone Workbench (`/workbench`)**: Mở khung Workbench làm việc độc lập với Backend; chỉ khi dùng **Template Pipeline (`template:*`)** mới yêu cầu đăng nhập.
3. **Dọn bỏ Quota Studio cũ (`ExecutionCreditsRemaining`)** và thay bằng **Quota tinh gọn gắn trực tiếp trên từng Template Pipeline** (đếm theo số `Component Pipe` được spawn, chưa làm Subscription/Billing phức tạp).
4. **Template Pipeline chạy từ RAM**: Người dùng mở Template vẫn **điền/chỉnh được tham số runtime** (file `.duf`, `/Game/...`, config), nhưng mã nguồn `.py` và preset nội bộ của Template được nạp thẳng vào **RAM** của `forgity-runner` và truyền qua Named Pipe vào DCC (không lưu file `.py` trên đĩa).

## 2. Vấn đề hiện tại

- Theo ADR-007, node palette, structs, constants và pipelines (`*.component.yaml`, `*.pipeline.yaml`) đã Local-First (đĩa + `.forgity/workspace.db`). Nhưng Run Draft vẫn gửi cả graph + script lên .NET, khiến backend ép slug thành Guid, ép pin type theo enum server, tự lập DAG rồi đẩy qua RabbitMQ ngược về máy local.
- `ExecutionCreditsRemaining` đang gắn sai chỗ trên `Studio` (tính lượt chạy chung cho cả những thứ chạy local của user), và `LocalWorkspacePage` đang bị nhốt dưới route bắt buộc đăng nhập (`_protected`).

## 3. Nguyên tắc thiết kế

1. **Orchestrator chạy ngoài tiến trình DCC**, trong Rust Runner, để không làm bẩn môi trường Blender/Unreal/Python.
2. **Lõi không biết mình đang chạy User Pipeline hay Template Pipeline.** Chỉ có lớp adapter (`ScriptResolver`, `EventSink`, `QuotaGate`) bên ngoài khác nhau.
3. **Script có thể đến từ Đĩa hoặc từ RAM (`ScriptSource`)**:
   - Với **User Pipeline (`local:*`)**: đọc đường dẫn `.py` trên đĩa từ `.forgity/workspace.db`.
   - Với **Template Pipeline (`template:*`)**: nhận mã nguồn `.py` + preset từ Backend vào RAM (`stdin` của Runner) và bắn qua Named Pipe sang `stage_runner_guest.py` (`compile` + `exec` trong RAM).
4. **Hạ tầng truyền tin là chi tiết thay thế được** (stdout JSON, mpsc, RabbitMQ sau này) qua trait `EventSink`, không gắn cứng vào dispatcher.
5. **Đơn vị tính Quota chuẩn duy nhất là `Component Pipe`**: Engine đã tham số hóa nên không biết dữ liệu là "nhân vật" hay "vũ khí", chỉ đếm chính xác mỗi lần 1 phần tử được spawn qua 1 `Component Pipe`.

## 4. Kiến trúc tổng thể

```
Local User Adapter (Open / Free)       Template Adapter (Có đăng nhập & Quota)
- Đọc workspace.db trên đĩa            - User điền runtime_inputs trên Vỏ (PublicManifest)
- ScriptSource::DiskPath               - Gọi acquire-session -> nhận ProtectedBundle vào RAM
- QuotaGate: No-op                     - ScriptSource::InMemoryCode (qua Named Pipe)
           \                                  /
            \______ cùng tạo RunRequest _____/
                            |
                            v
               Master Orchestrator (lõi dùng chung)
                            |  đếm số Component Pipe được spawn
                            v
               Component Orchestrator
                 |- Pure node -> execute_pure_node (in-memory)
                 |- Exec node -> StageDispatcher -> DCC (Named Pipe + Job Object)
```

## 5. Hai tầng orchestrator

### Tầng 1 — Component Pipe Orchestrator
- Một instance cho mỗi lần Master gọi tới 1 `*.component.yaml`. Sở hữu `DagScheduler` + `Blackboard` riêng cho mỗi lần chạy (mỗi phần tử trong mảng input).
- Nhận vào `Array<Struct>` (hoặc `Array<T>` nếu chỉ 1 input pin; **Single mode thực chất là Batch 1 phần tử**).
- Tự quyết định spawn 1 hay nhiều tiến trình Blender/UE/Python để xử lý các phần tử trong mảng tùy `max_concurrency` — đây là nơi thật sự thực hiện "batch", và **mỗi phần tử được xử lý = 1 đơn vị Component Pipe Run**.
- Gom kết quả từng lần chạy, flatten nếu output vốn đã là mảng, trả về `Array<T>` duy nhất ở output pin của Batch Node.

### Sinh Batch Node từ Component (quy tắc "thăng hạng")
| Bên trong Component | Batch Node (bên ngoài) |
| :--- | :--- |
| 1 input pin | `Array<KiểuGốc>` |
| Nhiều input pin | Gộp `Struct{...}`, rồi `Array<Struct>` |
| 1 output pin đơn | `Array<KiểuGốc>` |
| Output vốn đã là mảng | Flatten, không lồng `Array<Array<T>>` |

### Tầng 2 — Master Pipeline Orchestrator
- Chạy `*.pipeline.yaml`. Tuyệt đối không quản lý script lẻ, `Make/Break Struct`, `Constant`.
- **Sequence**: chạy song song nhiều nhánh khác nhau (các Batch Node khác nhau), giới hạn `max_concurrency`.
- **Joint**: 1 node chờ, chỉ kích hoạt khi tất cả node đứng trước đều hoàn thành.

## 6. Luồng dữ liệu của một Exec node (Đĩa vs RAM)

| Cần gì | User Pipeline (`local:*`) | Template Pipeline (`template:*`) |
| :--- | :--- | :--- |
| **Script `.py`** | `ScriptSource::DiskPath` (tra `.forgity/workspace.db`) | `ScriptSource::InMemoryCode` (nạp từ `ProtectedBundle` trong RAM, qua Named Pipe vào `exec()` của `stage_runner_guest.py`) |
| **Tham số Runtime & File đầu vào** | Người dùng cấu hình trên Canvas / ổ đĩa local | Người dùng vẫn **điền/chỉnh trực tiếp trên UI Vỏ Template** (vd đường dẫn `.duf`, `/Game/...`) và truyền vào `runtime_inputs` |
| **Runtime data giữa các node** | `Blackboard` trong RAM: `(node_id, pin_id) -> JSON` | `Blackboard` trong RAM: `(node_id, pin_id) -> JSON` |

## 7. Hợp đồng giữa lõi và adapter (3 Trait)

| Trait | Nhiệm vụ | Bản User Local (Open) | Bản Template (Quota + RAM) |
| :--- | :--- | :--- | :--- |
| `ScriptResolver` | `tool_key` -> `{ source: DiskPath \| InMemoryCode, executor }` | Đọc `workspace.db` -> `DiskPath` | Đọc `ProtectedBundle` trong RAM -> `InMemoryCode` |
| `EventSink` | Nhận sự kiện tiến độ/kết quả (`send_progress`, `send_result`) | Ghi JSON-line ra stdout / mpsc | Ghi JSON-line ra stdout / mpsc |
| `QuotaGate` | Kiểm tra hạn mức `max_spawns` và đếm `used_spawns` mỗi khi spawn 1 Component Pipe | No-op (không giới hạn) | Kiểm tra `used_spawns < max_spawns` (từ `acquire-session`), kết thúc báo `used_spawns` để `settle-session` |

## 8. Thiết kế Quota theo Template (Thay thế Quota Studio cũ)

1. **Xóa bỏ hoàn toàn `ExecutionCreditsRemaining` trên `Studio`**:
   - Xóa khỏi `Studio` entity/DTO, xóa khỏi trang System Admin Studios và xóa badge `Solo Preview: 50/50 Runs` trên Outliner.
2. **2 Bảng tinh gọn ở Backend (`Automation.Pipeline`)**:
   - `PipelineTemplate`: `Id`, `Slug` (vd `daz-to-unreal-g9`), `Name`, `Description`, `DefaultTrialRuns` (vd 30), `PublicManifestJson` (Vỏ công khai gồm khung node + schema các tham số runtime), `ProtectedBundleJson` (Ruột bí mật gồm `.py` scripts + presets).
   - `UserTemplateQuota`: `Id`, `UserId`, `TemplateId`, `RemainingRuns` (số lượt Component Pipe còn lại), `TotalUsedRuns`.
3. **Luồng chạy Template**:
   - Trước khi chạy chưa biết tổng số phần tử động ở các bước sau → gọi `POST /api/pipeline/templates/{slug}/acquire-session`.
   - Nếu `RemainingRuns <= 0` → bật Dialog mời vào Discord để xin cấp thêm lượt test.
   - Nếu `RemainingRuns > 0` → Backend trả `ProtectedBundleJson` + trần `MaxSpawns = RemainingRuns` thẳng vào RAM.
   - Chạy xong (hoặc dừng giữa chừng) → gọi `POST /api/pipeline/templates/{slug}/settle-session` trừ đúng số `components_run` thực tế đã spawn.

## 9. Giao thức sự kiện `--json-events`

Mỗi sự kiện là một dòng JSON trên stdout (log kỹ thuật đi qua stderr):

| `type` | Trường chính | Ý nghĩa |
| :--- | :--- | :--- |
| `run_started` | `run_id`, `pipeline_name` | Bắt đầu phiên chạy |
| `node_started` | `run_id`, `component`, `node_id` | Node bắt đầu chạy |
| `node_progress` | `node_id`, `percent`, `message` | Tiến độ từ DCC |
| `node_completed` | `node_id`, `outputs` | Node hoàn thành |
| `node_failed` | `node_id`, `error` | Node lỗi kèm thông báo |
| `run_completed` | `run_id`, `status`, `components_run` | Kết thúc, trả tổng số Component Pipe đã spawn để trừ quota (nếu là Template) |

## 10. Thứ tự triển khai từng bước

| Bước | Việc | Tiêu chí hoàn thành |
| :--- | :--- | :--- |
| **1** | Tách `dispatcher.rs` khỏi `RabbitMqClient` bằng `EventSink` + hỗ trợ `script_code` in-memory trong `stage_runner_guest.py` | Build qua; test chạy 1 script Python từ chuỗi RAM và 1 script từ đĩa với sink giả |
| **2** | `workspace_resolver.rs` (đọc `workspace.db` trả `DiskPath` & đọc bundle RAM trả `InMemoryCode`) | Test: `tool_key` trả đúng `ScriptSource` + `executor` |
| **3** | `component_orchestrator.rs` nối `DagScheduler` + `Blackboard` + `pure_nodes` + `StageDispatcher` + tiêm `runtime_inputs` | Chạy được 1 component từ đầu tới cuối; `Blackboard` nhận đúng output |
| **4** | `cli/run_local.rs` + Tauri command `run_local_pipeline` (`--json-events`, nhận bundle qua `stdin` nếu có) | UI thấy tiến độ từng node realtime |
| **5** | `master_orchestrator.rs` (`Sequence` / `Joint` / `Batch` với Single = Batch 1 item) + đếm `components_run` | Pipeline 2 component nối tiếp; Batch N item chạy đúng `max_concurrency` và đếm đúng `components_run` |
| **6** | Dọn bỏ `ExecutionCreditsRemaining` trên `Studio` + Tách route Standalone Workbench `/workbench` + nối nút Run vào `run_local_pipeline` | Mở `/workbench` chạy local không cần login, không còn lỗi 400 hay gọi `run-draft` |
| **7** | Thêm `PipelineTemplate` & `UserTemplateQuota` tinh gọn (Publish Template cho SuperAdmin, `acquire-session`, `settle-session`, Admin cấp thêm lượt) | User mở Template, điền tham số runtime, chạy từ RAM và trừ đúng số `components_run` |
