# BL-040: Persistent DCC Process Pool & Keep-Alive Worker Daemon

> **Mã công việc**: `BL-040`  
> **Trạng thái**: `Pending` *(Đã lập kế hoạch kiến trúc)*  
> **Ngày tạo**: 03/11/2026  
> **Phạm vi**: Rust Runner Daemon & DCC Inter-Process Communication (IPC)  

---

## 1. Tóm Tắt Mục Tiêu (Executive Summary)
Giải quyết triệt để vấn đề thời gian chờ khởi động nặng nề của các phần mềm DCC (đặc biệt là Unreal Engine 5 mất 15s – 45s cho mỗi lần nạp engine/shader/DDC). Xây dựng cơ chế **Resident Process Pool (Warm Worker)** trong Rust Runner Daemon cho phép giữ tiến trình Unreal Editor tiếp tục sống sau khi thực thi (`Keep-Alive`), tự động đếm lùi thời gian nhàn rỗi (ví dụ `idle_timeout = 30 phút`). Các lần chạy tiếp theo sẽ bơm lệnh trực tiếp qua kênh IPC tốc độ cao (<200ms) mà không phải khởi động lại engine từ đầu.

---

## 2. Vấn Đề & Hiện Trạng (Problem Statement)
1. **Chi phí Cold Start quá lớn**: Mỗi lần chạy 1 Stage Unreal (hoặc test lặp lại), Runner phải spawn một tiến trình `UnrealEditor-Cmd.exe` mới. Thời gian load engine, kiểm tra plugins, mount Content chiếm tới **80% tổng thời gian thực thi**, trong khi script Python thực tế chỉ chạy mất 3 – 5 giây.
2. **Lãng phí tài nguyên nếu bật thường trực 24/7**: Nếu ép Unreal chạy vĩnh viễn ngầm thì máy trạm của Technical Artist sẽ bị chiếm dụng một lượng lớn RAM và VRAM GPU (từ 4GB đến 10GB VRAM) khi không còn nhu cầu làm việc.
3. **Nhu cầu thực tế**: Người dùng thường làm việc theo các phiên tập trung (work sessions): trong 30 – 60 phút sẽ chạy thử, sửa đổi, chạy lại liên tục. Hết phiên làm việc sẽ nghỉ ngơi hoặc chuyển sang việc khác.

---

## 3. Đề Xuất Kỹ Thuật (Technical Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RUST RUNNER DAEMON                              │
│                                                                        │
│   Incoming Stage Task ──────────┐                                      │
│                                 ▼                                      │
│                     ┌───────────────────────┐                          │
│                     │  Warm Process Pool    │                          │
│                     │  (Registry by Project)│                          │
│                     └──────────┬────────────┘                          │
│                                │                                       │
│             ┌──────────────────┴──────────────────┐                    │
│      [Found Warm Process]                 [No Warm Process / Expired]   │
│             │                                     │                    │
│             ▼ (IPC Dispatch <200ms)               ▼ (Cold Start ~25s)  │
│   ┌──────────────────┐                  ┌──────────────────┐           │
│   │ Send payload via │                  │ Spawn Editor Cmd │           │
│   │ Named Pipe / IPC │                  │ + Init IPC Loop  │           │
│   └─────────┬────────┘                  └─────────┬────────┘           │
│             │                                     │                    │
│             └──────────────────┬──────────────────┘                    │
│                                ▼                                       │
│             ┌─────────────────────────────────────┐                    │
│             │   Keep-Alive Idle Timer (30 mins)   │                    │
│             │   - Reset timer on new stage job    │                    │
│             │   - Auto graceful exit on timeout   │                    │
│             └─────────────────────────────────────┘                    │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ IPC
┌────────────────────────────────────────────────────────────────────────┐
│                     UNREAL EDITOR PROCESS                              │
│  - Python IPC Loop Listener (Background thread / Tick)                 │
│  - Executes stage scripts instantly in-memory                          │
│  - Auto-terminates on 'EXIT' command from Runner                       │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Cấu hình trong `runner.toml`
Cho phép cấu hình linh hoạt cho từng loại Executor:
```toml
[executors.unreal]
enabled = true
keep_alive = true
idle_timeout_minutes = 30       # Giữ thức 30 phút sau job cuối
ipc_mode = "named_pipe"         # named_pipe | remote_control_http
max_memory_mb = 16384           # Giới hạn an toàn trước khi restart

[executors.blender]
enabled = true
keep_alive = false              # Blender khởi động rất nhanh (1-2s) nên mặc định cold-start
idle_timeout_minutes = 10
```

### 3.2. Cơ Chế Nhận Diện & Tái Sử Dụng Tiến Trình (Process Scoping)
- Mỗi tiến trình Warm được gắn với một **Khóa Ngữ Cảnh (Context Key)**: `hash(project_path, uproject_file, engine_version)`.
- Nếu Stage mới yêu cầu cùng một Project Unreal $\implies$ Runner sử dụng lại tiến trình đang thức.
- Nếu Stage mới yêu cầu một Project Unreal khác $\implies$ Runner có thể graceful exit tiến trình cũ để nhường RAM cho project mới.

### 3.3. Kênh Giao Tiếp Liên Tiến Trình (IPC Protocol)
1. **Named Pipe IPC (Windows)**: Runner tạo Named Pipe `\\.\pipe\forgity_ue_{project_hash}`. Script khởi động của Unreal lắng nghe pipe này, nhận payload JSON chứa đường dẫn script cần chạy và arguments, thực thi qua `unreal.parent_external_process` hoặc `exec()`, trả stdout/stderr về cho Runner.
2. **Alternative (Unreal Remote Control API)**: Tận dụng plugin có sẵn của Unreal Engine (`Remote Control Web API` cổng 30010) để gửi lệnh Python qua REST/WebSocket.

---

## 4. Lộ Trình Triển Khai Theo Giai Đoạn (Phased Implementation)

### Phase 1: Thiết Kế Hợp Đồng Cấu Hình & Protocol (`runner/`)
- [ ] Thêm schema cấu hình `KeepAliveConfig` vào `runner.toml` (parser Rust `toml-rs`).
- [ ] Định nghĩa gói tin IPC `StageExecutionRequest` và `StageExecutionResponse` (JSON qua Named Pipe).

### Phase 2: Rust Runner Process Pool Manager (`runner/src/process_pool/`)
- [ ] Xây dựng struct `DccProcessPool` quản lý danh sách tiến trình con còn sống (`Child`, `last_active_time`, `idle_timeout`).
- [ ] Cài đặt Background Watcher Thread: mỗi phút kiểm tra `now - last_active_time > idle_timeout` $\to$ gửi lệnh `TERMINATE` và dọn Job Object.
- [ ] Bổ sung cơ chế Fallback: Nếu tiến trình Warm bị crash hoặc không phản hồi sau 5s $\to$ tự động kill và khởi động Cold Start.

### Phase 3: Unreal Python Resident Loop Sidecar (`pipeline-scripts/unreal/`)
- [ ] Xây dựng script `unreal_resident_listener.py` chạy vòng lặp lắng nghe Named Pipe khi Unreal được bật ở chế độ Resident.
- [ ] Chạy script stage được yêu cầu, cô lập exception, bắt stdout/stderr và trả status code về cho Runner.

### Phase 4: Giao Diện Người Dùng & Trạng Thái Runner (`web/`)
- [ ] Hiển thị trạng thái Resident trên Runner Card: Badge `Unreal Engine: Warm (Active, 24m remaining)`.
- [ ] Nút bấm thủ công **"Kill Resident DCCs"** trên UI để người dùng có thể giải phóng RAM ngay lập tức khi cần chơi game hoặc làm việc khác.

---

## 5. Kế Hoạch Kiểm Thử (Test Plan)
- [ ] **Test Case 1 (Cold Start $\to$ Warm Transition)**: Chạy Stage lần 1 mất ~25s; kiểm tra tiến trình `UnrealEditor-Cmd.exe` vẫn tồn tại sau khi stage báo thành công.
- [ ] **Test Case 2 (Sub-second Execution)**: Chạy Stage lần 2 ngay sau đó; xác nhận thời gian hoàn tất giảm xuống còn **< 3 giây** (tiết kiệm 90% thời gian).
- [ ] **Test Case 3 (Idle Timeout Expiration)**: Để nguyên máy trạm không chạy job nào trong 30 phút; xác nhận tiến trình Unreal tự động tắt êm đẹp, giải phóng 100% RAM/VRAM.
- [ ] **Test Case 4 (Emergency Kill)**: Bấm nút Stop hoặc Kill Runner; đảm bảo Windows Job Object dọn dẹp sạch toàn bộ tiến trình con, không bị treo zombie process.
