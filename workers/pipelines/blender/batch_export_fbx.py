# pyrefly: ignore [missing-import]
import bpy
import os
import hashlib
import re


class MockOp:
    """Mock operator object to capture preset options from FBX exporter presets."""
    def __init__(self):
        self.options = {}

    def __setattr__(self, name, val):
        if name == 'options':
            super().__setattr__(name, val)
        else:
            self.options[name] = val


def compute_sha256(filepath: str) -> str:
    """Compute SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
    return sha256.hexdigest()


def normalize_name(name: str) -> str:
    """Strip blender suffixes like .001 and normalize separators."""
    # Strip trailing blender index like .001, .002
    name = re.sub(r'\.\d{3}$', '', name)
    return name.lower().replace("-", "_").replace(" ", "_")


def find_matching_meshes(target_key: str) -> list:
    """
    Tìm mesh trong scene dựa trên cơ chế 'select giống' (fuzzy / normalized pattern matching).
    1. Exact Match
    2. Normalized Match (bỏ qua .001, dấu gạch, hoa thường)
    3. Substring Match (chứa target_key)
    """
    target_norm = normalize_name(target_key)
    all_meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']

    # 1. Exact match
    exact = [obj for obj in all_meshes if obj.name == target_key]
    if exact:
        return exact

    # 2. Normalized match
    normalized = [obj for obj in all_meshes if normalize_name(obj.name) == target_norm]
    if normalized:
        return normalized

    # 3. Substring match (Target nằm trong Object Name hoặc ngược lại)
    substring = [
        obj for obj in all_meshes
        if target_norm in normalize_name(obj.name) or normalize_name(obj.name) in target_norm
    ]
    if substring:
        return substring

    # 4. Custom Property match (fallback)
    custom_props = []
    for obj in all_meshes:
        for prop_name in obj.keys():
            if prop_name.startswith("_"):
                continue
            if target_norm in normalize_name(str(obj[prop_name])):
                custom_props.append(obj)
                break

    return custom_props


def select_mesh_with_armature(target_meshes: list):
    """
    Deselect tất cả và CHỈ chọn target meshes + Armature gắn liền (cho Modular Character trong Game Engine).
    """
    bpy.ops.object.select_all(action='DESELECT')

    for mesh in target_meshes:
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh

        # 1. Bắt Armature qua Parent
        if mesh.parent and mesh.parent.type == 'ARMATURE':
            mesh.parent.select_set(True)

        # 2. Bắt Armature qua Armature Modifier (skinning/weights)
        for mod in mesh.modifiers:
            if mod.type == 'ARMATURE' and mod.object:
                mod.object.select_set(True)


def main(
    export_map: dict,
    output_dir: str = "",
    preset_path: str = ""
) -> dict:
    """
    Batch export modular meshes to FBX.

    Args:
        export_map: Dict mapping object identifier -> desired output file name.
                    Ví dụ: {
                        "Genesis8Female_Hair": "Eva_hair_Noki.fbx",
                        "Genesis8Female_Top": "Eva_top_GND.fbx",
                        "panty": "Eva_panty_GND.fbx"
                    }
        output_dir: Thư mục đích lưu các file FBX.
        preset_path: (Tùy chọn) Đường dẫn file preset cấu hình FBX của Blender.

    Returns:
        dict:
            - export_map: Mapping object_name -> export file path.
            - manifest: Chi tiết từng file xuất (file_name, local_path, file_size, hash).
            - total_exported: Tổng số file xuất thành công.
            - exported_files: Danh sách đường dẫn file đã xuất.
    """
    if isinstance(export_map, str) and export_map.strip().startswith("{"):
        import json
        try:
            export_map = json.loads(export_map)
        except Exception:
            pass

    if isinstance(export_map, list):
        flat_map = {}
        for item in export_map:
            if isinstance(item, dict):
                flat_map.update(item)
            elif isinstance(item, str) and ":" in item:
                k, v = item.split(":", 1)
                flat_map[k.strip()] = v.strip()
        export_map = flat_map

    if not isinstance(export_map, dict):
        export_map = {}

    print(f"[batch_export_fbx] Normalized export_map with {len(export_map)} items: {list(export_map.keys())}", flush=True)

    if not output_dir:
        blend_file = bpy.data.filepath
        if blend_file and os.path.isdir(os.path.dirname(blend_file)):
            output_dir = os.path.dirname(blend_file)
        else:
            output_dir = os.path.join(bpy.app.tempdir, "modular_export")

    os.makedirs(output_dir, exist_ok=True)

    # 1. Đọc preset options nếu có
    preset_options = {}
    if preset_path and os.path.exists(preset_path):
        mock = MockOp()
        with open(preset_path, 'r', encoding='utf-8') as f:
            clean_code = "".join([l for l in f if "active_operator" not in l])
            exec(clean_code, {'bpy': bpy, 'op': mock})
        preset_options = mock.options

    preset_options['use_selection'] = True
    preset_options.pop('filepath', None)

    manifest = {}

    print(f"[batch_export_fbx] Starting modular export for {len(export_map)} items...", flush=True)

    # 2. Lặp qua từng item trong export_map: {object_target: output_filename}
    for object_target, output_name in export_map.items():
        if not output_name:
            output_name = f"{object_target}.fbx"

        # Đảm bảo có đuôi .fbx
        if not output_name.lower().endswith(".fbx"):
            output_name += ".fbx"

        # Tìm các mesh tương ứng bằng cơ chế select giống
        target_meshes = find_matching_meshes(object_target)

        if not target_meshes:
            print(f"[batch_export_fbx] Warning: No matching mesh found for '{object_target}'. Skipping.", flush=True)
            continue

        matched_names = [m.name for m in target_meshes]
        print(f"[batch_export_fbx] Target '{object_target}' matched meshes: {matched_names}", flush=True)

        # Chọn mesh + bắt kèm Armature
        select_mesh_with_armature(target_meshes)

        export_path = output_name if os.path.isabs(output_name) else os.path.join(output_dir, output_name)
        
        # Tự động tạo thư mục cha nếu chưa tồn tại
        export_dir = os.path.dirname(os.path.abspath(export_path))
        os.makedirs(export_dir, exist_ok=True)

        try:
            print(f"[batch_export_fbx] Exporting to '{export_path}'...", flush=True)
            bpy.ops.export_scene.fbx(filepath=export_path, **preset_options)

            file_size = os.path.getsize(export_path) if os.path.exists(export_path) else 0
            file_hash = compute_sha256(export_path) if file_size > 0 else ""

            manifest[object_target] = {
                "object": object_target,
                "file_name": output_name,
                "local_path": export_path,
                "file_size": file_size,
                "hash_sha256": file_hash,
                "matched_meshes": matched_names
            }
            print(f"[batch_export_fbx] Successfully exported '{output_name}' ({file_size} bytes)", flush=True)

        except Exception as e:
            print(f"[batch_export_fbx] Error exporting '{object_target}': {e}", flush=True)
            raise RuntimeError(f"Failed to export '{object_target}': {e}")

    export_paths = {obj: item["local_path"] for obj, item in manifest.items()}
    return {
        "export_map": export_paths,
        "manifest": manifest,
        "total_exported": len(manifest),
        "exported_files": [item["local_path"] for item in manifest.values()]
    }
