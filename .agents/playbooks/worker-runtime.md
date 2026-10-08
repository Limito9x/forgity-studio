# Worker Playbook: Runtime Storage, Cache & Subprocess Lifecycle

> **Phạm vi:** Tài liệu hướng dẫn và kỹ thuật mô tả cốt lõi cách vận hành cho:
> 1. Cấu trúc thư mục Runtime Storage của Worker (`worker/runtime/`).
> 2. Cơ chế Mutex Lock (`.storage.lock`) tránh đụng độ giữa Subprocess và Sweeper.
> 3. Cơ chế Phân giải Script & Asset có Cache theo mã băm SHA-256 (`script_resolver.py`).
> 4. Quá trình thực thi Subprocess Headless (Blender / Unreal Engine).
> 5. Background Cleanup Daemon (TTL & LRU Quota Eviction).
>
> **Quy tắc bắt buộc:** Agent phải đọc tài liệu này trước khi chỉnh sửa bất kỳ module nào trong `workers/`. Sau khi thay đổi code, phải cập nhật lại tài liệu này.

---

## 1. Cấu Trúc Thư Mục Runtime Storage (`worker/runtime/`)

Thư mục runtime của Worker được quản lý tập trung và cô lập, tuyệt đối không xả rác ra thư mục gốc:

```
worker/runtime/
├── .storage.lock                      # Mutex file lock bảo vệ IO đa tiến trình
├── cache/
│   ├── scripts/{sha256_hash}/         # Thư mục cache custom scripts tải từ API
│   │   └── {original_name}.py         # File script Python đã verify SHA-256
│   └── assets/{sha256_hash}/          # Thư mục cache binary file assets (FBX, textures...)
│       └── {filename}                 # File asset đã verify dung lượng / hash
├── temp/
│   └── {stage_execution_id}/          # Thư mục TEMP cô lập cho từng phiên subprocess
└── logs/
    ├── unreal_latest.log              # Log trực tiếp của Unreal Engine
    └── worker.log                     # Log của tiến trình Worker daemon
```

---

## 2. Cơ Chế Mutex File Lock (`.storage.lock`)

Để tránh trường hợp **Background Cleanup Daemon xóa nhầm file temp/cache mà một Subprocess Blender/Unreal đang đọc**, hệ thống sử dụng cơ chế khóa file đa nền tảng:

```python
with storage_lock(blocking=True):
    # Chỉ khi lấy được lock thì mới thực thi StageTaskMessage
    self._process_message(ch, method, properties, body)
```

- **Cơ chế khóa:**
  - Trên Windows (`os.name == "nt"`): Dùng `msvcrt.locking` khóa byte đầu tiên của file `.storage.lock`.
  - Trên Linux/macOS: Dùng `fcntl.flock(handle, fcntl.LOCK_EX)`.
- **Nguyên tắc an toàn:**
  - Tiến trình chạy Stage giữ khóa độc quyền (Exclusive Lock).
  - Background Cleanup chỉ chạy khi acquire được lock không chặn (`blocking=False`). Nếu có Stage đang chạy, cleanup tự động bỏ qua lượt quét để không gây crash.

---

## 3. Cơ Chế Cache Khi Dispatch Script & Asset

Khi Backend dispatch một Stage sang Worker, message mang theo `ScriptUrl` và `ScriptHash` (SHA-256).

```mermaid
graph TD
    A[Worker nhận StepExecution: script_url + script_hash] --> B{Kiểm tra cache local:<br/>cache/scripts/{hash}/{entry}}
    B -->|Đã có & đúng SHA-256| C[Tái sử dụng file ngay lập tức<br/>os.utime cập nhật Access Time]
    B -->|Chưa có hoặc hash lệch| D[Tải file tạm từ script_url vào .tmp]
    D --> E{Verify SHA-256 checksum}
    E -->|Khớp 100%| F[os.replace đổi tên .tmp -> {entry}.py]
    E -->|Không khớp| G[Ném lỗi ValueError, từ chối chạy!]
    F --> C
```

- **Atomic File Download:** File được tải vào file tạm đuôi `.tmp` trước. Chỉ khi verify đúng SHA-256 mới dùng `os.replace` để đưa vào vị trí cache chính thức, tránh tình trạng file bị lỗi khi mạng đứt giữa chừng.
- **Local Fallback:** Chỉ khi không có `script_url` và `script_hash`, Worker mới dò tìm script tích hợp sẵn trong thư mục nội bộ `worker/scripts/`.

---

## 4. Quá Trình Thực Thi Subprocess Headless

`BaseSubprocessExecutor` điều phối việc gọi các phần mềm DCC bên ngoài:

1. **Môi trường cô lập (Isolated Environment):**
   - Tạo thư mục riêng trong `worker/runtime/temp/`.
   - Ghi đè biến môi trường `TEMP`, `TMP`, `TMPDIR` trỏ vào thư mục này để Blender / Unreal không xả rác vào `AppData` của Windows.
2. **Khởi chạy tiến trình con:**
   - **Blender:** Gọi binary `blender.exe -b -P <wrapper_script.py> -- <args>`.
   - **Unreal Engine:** Gọi commandlet headless hoặc Python remote interface.
3. **Quản lý Vòng đời & Dọn rác:**
   - Đọc stdout/stderr theo thời gian thực để bắt log.
   - Khi subprocess kết thúc (dù thành công hay crash): hàm `cleanup_after_execution` luôn được gọi trong khối `finally:` để xóa sạch thư mục temp tương ứng và dọn rác RAM.

---

## 5. Background Cleanup Daemon (TTL & LRU Quota)

Hàm `cleanup(dry_run=False)` trong [runtime_storage.py](file:///d:/FullStack/Automation/workers/core/runtime_storage.py) vận hành theo các chính sách:

- **Temp TTL (24 giờ):** Bất kỳ file temp nào cũ hơn 24 giờ kể từ lần sửa cuối sẽ bị xóa.
- **Logs TTL (7 ngày - 168 giờ):** Log cũ hơn 7 ngày tự động xóa.
- **Cache TTL (7 ngày) & Quota Quá tải (2GB):**
  - Cache cũ hơn 7 ngày bị xóa.
  - Nếu tổng dung lượng thư mục `cache/` vượt quá 2GB (`cache_max_bytes`), cơ chế **LRU (Least Recently Used)** sẽ xóa các file ít được truy cập nhất cho đến khi dung lượng hạ về mức cho phép.
- **Daemon Thread:** Được khởi động ngầm trong `PipelineConsumer.start()` qua thread daemon `sweeper`, tự động kích hoạt sau mỗi chu kỳ (mặc định 1800 giây = 30 phút).

---

## 6. Tóm Tắt Quy Tắc Cho Agent Khi Chạm Vào Worker
1. **Luôn dùng `settings()[0]` để lấy Runtime Root:** Tuyệt đối không hardcode đường dẫn `os.path.join(..., "temp")` lung tung ngoài thư mục runtime.
2. **Không bỏ qua Mutex Lock:** Mọi thao tác tiêu thụ task và dọn dẹp đều phải bọc qua `storage_lock()`.
3. **Script từ xa bắt buộc có URL & SHA-256:** Không bao giờ cho phép thực thi script từ xa trôi nổi mà không kiểm tra mã băm bảo mật.
