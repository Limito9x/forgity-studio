# Kế Hoạch Kỹ Thuật: Hủy Chạy Pipeline & Hệ Thống Detach Runner 2 Cấp Độ

> **Mục tiêu:** 
> 1. Bổ sung nút thao tác **Cancel Execution** trên giao diện Pipeline Canvas để người dùng có thể chủ động dừng pipeline đang chạy bất cứ lúc nào.
> 2. Thiết kế và triển khai quy trình **Detach Runner 2 cấp độ** an toàn tuyệt đối:
>    - **Cấp độ 1:** Gỡ Runner khỏi Repository (`RepositoryRunner`).
>    - **Cấp độ 2:** Thu hồi & Xóa Runner hoàn toàn khỏi Studio (`Revoke/Delete Runner`).

---

## 1. Hiện Trạng & Đánh Giá Kỹ Thuật

### 1.1. Luồng Hủy Chạy Pipeline (Cancel Execution)
- **Backend Core (`Automation.Pipeline`):**
  - Đã có sẵn Endpoint `POST /api/pipelines/executions/{id}/cancel` trong `CancelPipelineExecution.cs`.
  - Handler cập nhật trạng thái `PipelineExecution.Status = Cancelled`, đồng thời bắn SignalR `PipelineExecutionFinished` tới toàn bộ client trong nhóm `pipeline_{id}`.
- **Native Rust Runner (`forgity-runner`):**
  - Toàn bộ tiến trình DCC con (Blender, Unreal, Python) được đặt trong **Windows Kernel Job Object** (`KILL_ON_JOB_CLOSE`). Khi nhận hủy hoặc khi daemon ngắt, Windows dọn sạch 100% tiến trình con mà không để lại zombie process.
- **Frontend Web UI (`web/`):**
  - **CHƯA CÓ NÚT CANCEL TRÊN GIAO DIỆN:** Mặc dù Orval đã generate hook `useCancelPipelineExecution`, cả thanh nổi `ExecutionStatusBanner.tsx` lẫn ngăn kéo `LiveExecutionDrawer.tsx` đều chưa có nút bấm để người dùng hủy lệnh chạy khi `isRunning === true`.

---

### 1.2. Luồng Quản Lý & Gỡ Runner
- **Cấp độ 1 (Repository Level):**
  - Đã có `AttachRunnerToRepository.cs` (gắn mount path), `SyncLocalChanges.cs`, `CompareRepositoryResources.cs`.
  - **Chưa có:** Endpoint `DELETE /api/repository-runners/{repositoryId}/{runnerId}` để ngắt liên kết mount.
  - Giao diện `AttachedRunnersCard.tsx` chỉ có nút `Edit Path` và `Scan & Sync`, chưa có nút `Detach Runner`.
- **Cấp độ 2 (Studio Level):**
  - Đã có `RevokeRunner.cs` (`POST /api/runners/{id}/revoke`), vô hiệu hóa `IsActive = false` và xóa user RabbitMQ.
  - **Chưa có ràng buộc kiểm tra (Guard Validation):** Nếu runner đang gắn với 3 repositories khác nhau mà người dùng bấm revoke thì các repository đó sẽ bị mồ côi mount point. Cần kiểm tra xem runner có đang gắn với repository nào trước khi cho phép xóa.

---

## 2. Quy Tắc Nghiệp Vụ & Ràng Buộc An Toàn (Guard Rules)

### 2.1. Cấp độ 1: Gỡ Runner khỏi Repository (Detach Runner from Repository)

| Trường hợp | Trạng thái | Hành động & Phản hồi hệ thống |
| :--- | :--- | :--- |
| **Đang có Pipeline đang chạy** | 🛑 **FORBIDDEN (Chặn)** | Nếu có `PipelineExecution` của Repository này đang `Running` / `Queued` trên Runner này -> Báo lỗi: *"Cannot detach runner while pipelines are actively running."* |
| **Đang giữ Khóa độc quyền (File Lock)** | 🛑 **FORBIDDEN (Chặn)** | Nếu có Resource trong Repository đang bị Runner này lock (`IsLocked == true` và `LockedByRunnerId == runnerId`) -> Báo lỗi: *"Runner is currently holding active file locks. Please release or check in files first."* |
| **Là nơi lưu trữ duy nhất của Asset chưa Publish** | ⚠️ **WARNING (Cảnh báo)** | Nếu có `ResourceVersion` có vị trí duy nhất nằm trên máy trạm này và chưa sync lên Cloud Storage: Yêu cầu xác nhận rõ ràng hoặc cờ `force: true` để tránh mất dấu file gốc. |
| **Runner đang Idle** | ✅ **ALLOWED (Cho phép)** | Xóa bản ghi `RepositoryRunner`. Cascade delete tự động gỡ các `ResourceVersionLocation` trỏ tới mount point này. **Dữ liệu trên ổ cứng máy trạm của người dùng giữ nguyên vẹn 100%.** |

---

### 2.2. Cấp độ 2: Thu hồi & Xóa Runner hoàn toàn khỏi Studio (Revoke / Remove Runner)

| Trường hợp | Trạng thái | Hành động & Phản hồi hệ thống |
| :--- | :--- | :--- |
| **Runner vẫn còn gắn trong Repository** | 🛑 **FORBIDDEN (Chặn)** | Nếu `RepositoryRunners.Any(r => r.RunnerId == runnerId)` -> Báo lỗi: *"Cannot revoke runner because it is still attached to X repository/repositories. Detach it from all repositories first."* |
| **Đang có Pipeline toàn cục đang xử lý** | 🛑 **FORBIDDEN (Chặn)** | Nếu runner đang xử lý bất kỳ task nào trong hệ thống -> Báo lỗi chặn hủy. |
| **Runner đã gỡ sạch sẽ & Idle** | ✅ **ALLOWED (Cho phép)** | Đánh dấu `IsActive = false`, thu hồi RabbitMQ credentials (`rn_{id}`), xóa hoặc vô hiệu hóa bản ghi. Workstation chạy `forgity-runner unregister` / xóa `runner.toml`. |

---

## 3. Các Giai Đoạn Triển Khai (Phases)

### Phase 1: Bổ Sung Nút "Cancel Execution" Trên Pipeline Canvas (Frontend)
- [x] **1.1. Cập nhật `ExecutionStatusBanner.tsx`:**
  - Bổ sung nút **Cancel Execution** (icon `Square` / `XCircle`) khi `isRunning === true`.
  - Hiển thị popover confirmation hoặc toast xác nhận.
- [x] **1.2. Cập nhật `LiveExecutionDrawer.tsx`:**
  - Thêm nút **Stop/Cancel Pipeline** ngay trên thanh điều khiển header của Drawer khi `activeExecution.status` là `Running` (1).
- [x] **1.3. Kết nối Hook `useCancelPipelineExecution`:**
  - Gọi endpoint `POST /api/pipelines/executions/{id}/cancel`.
  - Hiển thị toast thông báo, SignalR cập nhật trạng thái `Cancelled`, tắt ngay viền phát sáng active node.
- [x] **1.4. Hard-Kill Process Subprocess (Native Rust Runner):**
  - Bổ sung `CancelExecutionCommand` (tag 7) trong `agent.proto`.
  - Triển khai `JobObject::terminate` (Win32 `TerminateJobObject`) và `ActiveStageManager` trong Rust runner để hạ gục tức thì toàn bộ cây tiến trình (Blender/Unreal/Python) < 1ms.

---

### Phase 2: Cấp Độ 1 — API & Giao Diện Detach Runner Khỏi Repository
- [x] **2.1. Backend Slice `DetachRunnerFromRepository.cs`:**
  - Endpoint `DELETE /api/repository-runners/{repositoryId:guid}/{runnerId:guid}` trong module `Automation.Repository`.
  - Kiểm tra các ràng buộc: file lock và độc quyền lưu trữ.
  - Xóa `RepositoryRunner` và lưu thay đổi mà không làm ảnh hưởng tới tệp gốc trên máy trạm.
- [x] **2.2. Frontend Hook & UI (`web/`):**
  - Tối giản modal xác nhận `DetachRunnerDialog.tsx`: 1-click confirmation dialog rõ ràng, bỏ checkbox `forceMode`.
  - Bổ sung hook `useDetachRunnerFromRepository` trong `useRepositories.ts`.
  - Nút **Detach** (icon `Unlink`, màu `text-destructive`) trong `AttachedRunnersCard.tsx`.

---

### Phase 3: Cấp Độ 2 — Thu Hồi / Xóa Runner Hoàn Toàn Khỏi Studio [TẠM HOÃN / PAUSED]
> *Ghi chú (2026-10-18): Tạm hoãn Phase 3 để ưu tiên hoàn thiện danh mục Trial User Readiness Backlog trước khi đón người dùng thử nghiệm.*
- [ ] **3.1. Cập nhật Backend `RevokeRunner.cs` & `IRepositoryApi`:**
  - Bổ sung method `Task<Result<bool>> HasAttachedRepositoriesAsync(Guid runnerId)` vào `IRepositoryApi`.
  - Trong `RevokeRunnerHandler`, kiểm tra trước: nếu runner vẫn còn gắn trong bất kỳ repository nào -> Trả về `Result.Fail("Runner is still attached to one or more repositories...")`.
- [ ] **3.2. Frontend UI Quản Lý Runner:**
  - Bổ sung nút **Revoke / Remove** trong màn hình quản lý Runners của Studio.
- [ ] **3.3. Workstation CLI Support (`runner/`):**
  - Đảm bảo lệnh `forgity-runner clean --all` hoạt động chuẩn xác và hỗ trợ flag xóa `runner.toml`.

---

## 4. Kế Hoạch Kiểm Thử & Nghiệm Thu (Verification)
1. **Kiểm thử Cancel Execution:**
   - Kích hoạt 1 pipeline dài (Blender bake/process).
   - Bấm **Cancel** trên `ExecutionStatusBanner` -> Xác nhận SignalR cập nhật trạng thái sang `Cancelled`, node dừng chạy, Windows Task Manager không còn `blender.exe` chạy ngầm.
2. **Kiểm thử Detach Runner (Cấp độ 1):**
   - Thử detach khi runner đang lock file -> Xác nhận hệ thống chặn lại và báo lỗi rõ ràng.
   - Thử detach khi runner idle -> Xác nhận detach thành công, danh sách trên giao diện cập nhật ngay, file trên ổ cứng máy tính vẫn an toàn.
3. **Kiểm thử Revoke Runner (Cấp độ 2):**
   - Thử revoke khi runner vẫn đang gắn vào repository -> Xác nhận hệ thống từ chối.
   - Detach hết rồi mới revoke -> Xác nhận revoke thành công, RabbitMQ user bị thu hồi ngay lập tức.
