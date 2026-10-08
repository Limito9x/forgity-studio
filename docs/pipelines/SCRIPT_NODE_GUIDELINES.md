# Custom Script Node Guidelines & Registry Specification

Tài liệu này cung cấp hướng dẫn toàn diện về quy chuẩn lập trình Python Scripts để hệ thống **Automation Studio Pipeline Engine** có thể tự động quét AST (Abstract Syntax Tree), trích xuất schema, tạo node tự động (Batch Ingestion) và thực thi chính xác trên các **Runners**.

---

## 1. Cơ Chế AST Ingestion Scanner

Automation Studio sử dụng bộ phân tích cú pháp AST tĩnh (`PythonScriptSchemaParser.cs`) để phân tích mã nguồn Python ngay trên máy chủ mà không cần thực thi mã, đảm bảo tính bảo mật và tốc độ tức thì.

Scanner tự động nhận diện 4 thành phần chính:
1. **DCC Engine / Executor**: Dựa trên các thư viện được `import`.
2. **Entry Point Function**: Tìm hàm chính (`main`, `run`, `execute`, hoặc hàm cấp cao đầu tiên).
3. **Input Pins & Data Types**: Phân tích Type Hints và giá trị mặc định của tham số hàm.
4. **Output Pins**: Phân tích Dictionary trả về từ câu lệnh `return {...}`.

---

## 2. Quy Tắc Nhận Diện Engine (DCC Auto-Detection)

Hệ thống tự động phân loại Executor cho Node dựa trên câu lệnh import ở đầu file:

| Engine | Điều kiện nhận diện trong Script | Runtime Môi Trường | Thư viện tích hợp sẵn |
| :--- | :--- | :--- | :--- |
| **Blender 3D** | `import bpy` | Embedded Python trong Blender Headless | `bpy`, `mathutils`, `os`, `sys` |
| **Unreal Engine** | `import unreal` | Unreal Python Subsystem (Remote / Headless) | `unreal`, `os`, `sys` |
| **Python Worker** | Không import `bpy` hoặc `unreal` | Python 3.12+ Virtualenv của Runner Daemon | Python standard library |

---

## 3. Quy Ước Tham Số Đầu Vào (Input Pins)

Mọi tham số của hàm entry point sẽ được chuyển đổi thành các **Input Pins** trên Node:

```python
def main(
    input_file: str,                # Pin Kiểu File / Path (Bắt buộc)
    iterations: int = 10,           # Pin Kiểu Int (Không bắt buộc, default = 10)
    ratio: float = 0.5,             # Pin Kiểu Float (Không bắt buộc, default = 0.5)
    apply_modifiers: bool = True,   # Pin Kiểu Boolean (Toggle switch)
    settings: dict = None           # Pin Kiểu Json / Dictionary
) -> dict:
```

### Các quy tắc quan trọng:
- **Type Hinting bắt buộc**: Phải có chú thích kiểu dữ liệu (`str`, `int`, `float`, `bool`, `list`, `dict`).
- **Required vs Optional**:
  - Tham số **không có giá trị mặc định** -> Coi là **Bắt buộc (`isRequired = true`)**.
  - Tham số **có giá trị mặc định** (ví dụ `= 10`) -> Coi là **Tùy chọn (`isRequired = false`)**, giá trị mặc định sẽ hiển thị sẵn trên Node Inspector.
- **Tự động nhận diện File / Asset Pin**:
  - Nếu tên tham số chứa các từ khóa: `path`, `file`, `filepath`, `dir`, `folder`, `asset` -> UI sẽ tự động kích hoạt chế độ File Picker / Asset Link.

---

## 4. Quy Ước Giá Trị Đầu Ra (Output Pins)

Để Pipeline Engine có thể truyền dữ liệu và luồng thực thi sang các node tiếp theo trong đồ thị DAG, hàm entry point **phải trả về một Dictionary (`dict`)**:

```python
return {
    "output_mesh": "/path/to/exported_model.glb",
    "vertex_count": 15420,
    "success": True,
    "manifest": { "format": "glb", "bake_version": 2 }
}
```

- Mỗi key trong dictionary sẽ tương ứng với một **Output Pin** trên node.
- Các node phía sau có thể nối dây vào từng pin riêng biệt để lấy kết quả.

---

## 5. Thư Viện Bên Ngoài & Môi Trường Runner (Third-Party Packages)

> [!WARNING]
> **Vấn đề môi trường Python:**
> Khác với các công cụ built-in, các custom script có thể cần những thư viện bên ngoài (ví dụ `numpy`, `scipy`, `pillow`, `opencv-python`, `pandas`). Các thư viện này **phụ thuộc vào môi trường máy đang chạy Runner**.

### Cơ chế phân tách môi trường:
1. **Blender Runner**:
   - Blender sử dụng Python nhúng đi kèm trong thư mục cài đặt của Blender (ví dụ `Blender/5.2/python/bin/python.exe`).
   - Nếu script cần `scipy` hay `pillow`, bạn cần chạy pip install vào chính Python của Blender:
     ```bash
     & "C:\Program Files\Blender Foundation\Blender 5.2\5.2\python\bin\python.exe" -m pip install pillow scipy
     ```
2. **Unreal Engine Runner**:
   - Unreal Engine chạy thông qua Python Environment của Engine Editor. Thư viện ngoài cần được khai báo trong file cấu hình `.uproject` hoặc cài vào Engine Python.
3. **Generic Python Runner**:
   - Chạy trên môi trường ảo `.venv` của Worker Daemon (`d:\FullStack\Automation\workers\.venv`).
   - Cài đặt trực tiếp bằng lệnh:
     ```bash
     .\runner pip install <package_name>
     ```

### Kiểm tra cấu hình Runner:
Bạn có thể kiểm tra danh sách Runner, trạng thái kết nối và các Engine được hỗ trợ tại trang **[Runner Management](/runners)**.

---

## 6. Mẫu Script Chuẩn (Templates)

Các mẫu code này được đồng bộ trực tiếp với **Registry** trong `dccEngines.ts` và có thể sao chép nhanh qua nút **Script Guidelines** trên giao diện:

### 1. Blender 3D (`blender_bake_mesh.py`)
```python
"""
Blender 3D Custom Pipeline Node Template
Automatically detected as Blender Runner via 'import bpy'.
"""
import bpy
import os

def main(
    input_mesh_path: str,
    output_dir: str,
    decimate_ratio: float = 0.5,
    export_format: str = "fbx"
) -> dict:
    """
    Decimates input 3D mesh and exports optimized geometry.
    """
    if not os.path.exists(input_mesh_path):
        raise FileNotFoundError(f"Source mesh not found: {input_mesh_path}")

    os.makedirs(output_dir, exist_ok=True)
    out_name = os.path.splitext(os.path.basename(input_mesh_path))[0] + f"_baked.{export_format.lower()}"
    output_path = os.path.join(output_dir, out_name)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=input_mesh_path)

    # Process active objects
    for obj in bpy.context.selected_objects:
        if obj.type == 'MESH' and decimate_ratio < 1.0:
            mod = obj.modifiers.new(name="DecimateMod", type='DECIMATE')
            mod.ratio = decimate_ratio
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=mod.name)

    bpy.ops.export_scene.fbx(filepath=output_path, use_selection=False)

    return {
        "output_file": output_path,
        "processed_objects": len(bpy.context.scene.objects),
        "status": "success"
    }
```

### 2. Unreal Engine (`unreal_import_asset.py`)
```python
"""
Unreal Engine Custom Pipeline Node Template
Automatically detected as Unreal Engine Runner via 'import unreal'.
"""
import unreal
import os

def main(
    source_file_path: str,
    destination_path: str = "/Game/ImportedAssets",
    auto_save: bool = True
) -> dict:
    """
    Imports skeletal or static mesh into Unreal Content Browser.
    """
    if not os.path.exists(source_file_path):
        raise FileNotFoundError(f"Input file not found: {source_file_path}")

    task = unreal.AssetImportTask()
    task.filename = source_file_path
    task.destination_path = destination_path
    task.destination_name = os.path.splitext(os.path.basename(source_file_path))[0]
    task.replace_existing = True
    task.automated = True
    task.save = auto_save

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported_path = f"{destination_path}/{task.destination_name}"

    return {
        "imported_asset_path": imported_path,
        "success": len(task.imported_object_paths) > 0
    }
```

### 3. Generic Python Worker (`process_dataset.py`)
```python
"""
Generic Python Worker Node Template
Executes directly within the Pipeline Worker daemon virtual environment.
"""
import os
import json

def main(
    input_file: str,
    batch_size: int = 64,
    debug_mode: bool = False
) -> dict:
    """
    Processes generic file payloads or datasets in the pipeline.
    """
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file does not exist: {input_file}")

    file_size = os.path.getsize(input_file)
    summary_report = {
        "processed_file": input_file,
        "size_bytes": file_size,
        "batch_size": batch_size,
        "mode": "debug" if debug_mode else "production"
    }

    return {
        "report": summary_report,
        "size_kb": round(file_size / 1024, 2),
        "status": "completed"
    }
```
