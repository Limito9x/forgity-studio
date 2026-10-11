# Worker & Pipeline Engine Rules (`workers/`)

Quy tắc áp dụng bắt buộc khi xây dựng, mở rộng hoặc sửa đổi mã nguồn trong thư mục `workers/`.

---

## 1. Môi Trường Thực Thi & Kiến Trúc Phân Tầng

Worker sử dụng Python 3.12+ (venv tại `workers/worker/venv`). Hệ thống phân tách thành 3 phân vùng độc lập và phẳng:
1. **Tầng Host & Daemon (Runner Runtime)** tại `workers/worker/executors/`, `core/`, `commands/`: Quản lý vòng đời tiến trình phần mềm đồ họa (Blender, Unreal, Python CLI) và giao tiếp RabbitMQ/gRPC.
2. **Tầng Guest (Stage Runner)** tại `workers/worker/scripts/`: Đoạn code mồi chạy ngầm BÊN TRONG tiến trình con (`stage_runner.py`, `ue_stage_runner.py`, `lib/`) để điều phối các step và tương tác trực tiếp với RAM của engine.
3. **Kho Script Nghiệp Vụ (Pipeline Scripts Library)** tại `workers/pipelines/`: Chứa các script nghiệp vụ độc lập (`blender/`, `unreal/`, `daz/`, `inspectors/`, `ai/`) được upload lên Pipeline Canvas hoặc đóng gói Bundle. Thư mục này **không thuộc mã nguồn đóng gói của Runner client**.
4. **Kịch Bản Kiểm Thử & Luồng Chạy Thử** tại `workers/tests/flows/daz_to_ue5/`: Chứa toàn bộ kịch bản test luồng Daz ➔ Blender ➔ UE5 độc lập, không để file test lẫn lộn trong thư mục nghiệp vụ.

---

## 2. Quy Tắc Bất Di Bất Dịch Về Stage Runner
- **TUYỆT ĐỐI KHÔNG xóa, di chuyển hoặc import từ bên ngoài** vào hai file:
  - [stage_runner.py](file:///d:/FullStack/Automation/workers/worker/scripts/stage_runner.py)
  - [ue_stage_runner.py](file:///d:/FullStack/Automation/workers/worker/scripts/ue_stage_runner.py)
- **Lý do:** Các Executor (`BlenderExecutor`, `PythonExecutor`, `UnrealEngineExecutor`) phụ thuộc cứng vào đường dẫn tới 2 file này khi spawn subprocess.
- **Tính đa hình của `stage_runner.py`:** File này dùng chung cho cả Blender và Python thuần. Kiểm tra `import bpy` động để quyết định có chạy `purge_orphans()` dọn RAM Blender hay không. Không tách riêng thành file khác nếu không có lý do kiến trúc thực sự đặc thù.
- **Tính đặc thù của `ue_stage_runner.py`:** Unreal Engine Headless CLI (`UnrealEditor-Cmd.exe`) nhận payload thông qua file tạm trỏ bởi biến môi trường `UE_STAGE_TASK_FILE` để tránh lỗi pipe deadlock của Windows stdin. Không đổi cơ chế này sang stdin pipe thông thường.

---

## 3. Ràng Buộc Kỹ Thuật Subprocess (Executors)
- **Kế Thừa BaseSubprocessExecutor:** Mọi executor tiến trình mới phải kế thừa từ `BaseSubprocessExecutor` (`workers/worker/executors/base.py`).
- **Mã Hóa UTF-8 Bắt Buộc:** Trong `prepare_environment()`, luôn thiết lập:
  ```python
  env["PYTHONIOENCODING"] = "utf-8"
  env["PYTHONUTF8"] = "1"
  env["PYTHONUNBUFFERED"] = "1"
  ```
- **Hợp Nhất Kênh Log cho Unreal:** Unreal Headless yêu cầu `merge_stderr_to_stdout = True` để toàn bộ luồng log hệ thống và script được gom về một luồng duy nhất, tránh tình trạng treo tiến trình do đầy buffer stderr.

---

## 4. Quản Lý Bộ Nhớ & Dọn Rác Engine (Memory Management)
- Trong một Stage gồm nhiều Step chạy liên tiếp trong cùng một phiên làm việc:
  - Với **Blender**: Gọi `purge_orphans()` sau mỗi step để xóa sạch unused datablocks/meshes, tránh phình RAM.
  - Với **Unreal Engine**: Gọi `unreal.SystemLibrary.collect_garbage()` sau mỗi step để giải phóng UObjects không còn tham chiếu.

---

## 5. Chuẩn Hóa Hợp Đồng Dữ Liệu (RabbitMQ Contracts)
- Mọi thông điệp trao đổi qua RabbitMQ phải tuân thủ nghiêm ngặt schema trong [workers/worker/contracts.py](file:///d:/FullStack/Automation/workers/worker/contracts.py):
  - Nhận nhiệm vụ từ: `stage_tasks.{agent_id}` (`StageTaskMessage`).
  - Gửi tiến độ từng step về: `step_progress` (`StepProgressMessage`).
  - Gửi kết quả cuối cùng về: `stage_results` (`StageResultMessage`).
