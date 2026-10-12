# pyrefly: ignore [missing-import]
import bpy
from typing import Any, List, Optional


def main(
    target_objects: Optional[Any] = None,
    object_name: Optional[str] = None,
    uv_name: str = "UVMap_Baked",
    rename_to: Optional[str] = "UVMap",
    delete_old_uvs: bool = True,
    **kwargs: Any
) -> dict:
    """
    Kích hoạt UV layer chỉ định làm Active và Active Render trên các mesh objects.
    Tùy chọn xóa các UV layers cũ và đổi tên UV layer mới thành tên chuẩn (mặc định: 'UVMap').

    Args:
        target_objects: Danh sách tên object hoặc chuỗi đơn (ví dụ: ["Bra", "GND LNO Top"]).
        object_name: Tên object đơn lẻ (hữu ích khi gọi trong vòng lặp ForEach).
        uv_name: Tên UV layer đích cần kích hoạt / giữ lại (mặc định: 'UVMap_Baked').
        rename_to: Tên mới để chuẩn hóa UV (mặc định: 'UVMap', để None nếu muốn giữ nguyên).
        delete_old_uvs: Nếu True, xóa tất cả các UV layers cũ khác ngoài uv_name (mặc định: True).

    Returns:
        Dict chứa trạng thái, danh sách object đã xử lý và số lượng UV đã xóa.
    """
    # 1. Chuẩn hóa danh sách target_objects
    def _extract_names(val):
        if val is None:
            return []
        if isinstance(val, (list, tuple, set)):
            res = []
            for x in val:
                res.extend(_extract_names(x))
            return res
        if isinstance(val, str):
            s = val.strip()
            if not s:
                return []
            if (s.startswith("[") and s.endswith("]")) or (s.startswith("(") and s.endswith(")")):
                try:
                    import json
                    parsed = json.loads(s)
                    if isinstance(parsed, (list, tuple, set)):
                        return _extract_names(parsed)
                except Exception:
                    pass
                try:
                    import ast
                    parsed = ast.literal_eval(s)
                    if isinstance(parsed, (list, tuple, set)):
                        return _extract_names(parsed)
                except Exception:
                    pass
            return [s]
        return [str(val).strip()]

    raw_targets = []
    raw_targets.extend(_extract_names(target_objects))
    raw_targets.extend(_extract_names(object_name))

    if isinstance(delete_old_uvs, str):
        delete_old_uvs = delete_old_uvs.strip().lower() in ("true", "1", "yes")
    else:
        delete_old_uvs = bool(delete_old_uvs)

    # 2. Tìm kiếm các Mesh Objects phù hợp trong Scene
    matched_objs = set()
    if raw_targets:
        for base_name in raw_targets:
            name_clean = str(base_name).lower().strip()
            if not name_clean:
                continue

            # 1. Ưu tiên exact match
            exact_matches = [
                o for o in bpy.data.objects
                if o.type == "MESH" and (o.name.lower() == name_clean or o.name.lower() == f"{name_clean} mesh")
            ]
            if exact_matches:
                matched_objs.update(exact_matches)
                continue

            # 2. Prefix match
            prefix_matches = [
                o for o in bpy.data.objects
                if o.type == "MESH" and (o.name.lower().startswith(f"{name_clean}_") or o.name.lower().startswith(f"{name_clean}."))
            ]
            if prefix_matches:
                matched_objs.update(prefix_matches)
                continue

            # 3. Fallback substring match
            for obj in bpy.data.objects:
                if obj.type == "MESH" and name_clean in obj.name.lower():
                    matched_objs.add(obj)
    else:
        # Nếu không chỉ định target, áp dụng cho tất cả mesh trong scene
        matched_objs = {obj for obj in bpy.data.objects if obj.type == "MESH"}

    if not matched_objs:
        print(f"[apply_uv] NOTICE: Không tìm thấy mesh object nào khớp với: {raw_targets}", flush=True)
        return {
            "status": "SKIPPED",
            "uv_name": uv_name,
            "processed_objects": [],
            "count": 0,
            "total_deleted_uvs": 0
        }

    processed_objects = []
    total_deleted_uvs = 0

    for obj in matched_objs:
        mesh = obj.data
        if not mesh.uv_layers:
            print(f"[apply_uv] Object '{obj.name}' không có UV layers nào, bỏ qua.", flush=True)
            continue

        # Tìm UV layer mục tiêu
        target_layer = mesh.uv_layers.get(uv_name)
        if not target_layer:
            # Tìm kiếm không phân biệt hoa thường
            for layer in mesh.uv_layers:
                if layer.name.lower() == uv_name.lower():
                    target_layer = layer
                    break

        if not target_layer:
            print(f"[apply_uv] WARNING: Object '{obj.name}' không có UV layer '{uv_name}'. UV hiện có: {[l.name for l in mesh.uv_layers]}", flush=True)
            continue

        # 3. Kích hoạt UV layer làm active và active_render
        mesh.uv_layers.active = target_layer
        target_layer.active_render = True

        # 4. Xóa các UV layers cũ nếu được bật
        deleted_on_obj = 0
        if delete_old_uvs:
            for layer in list(mesh.uv_layers):
                if layer != target_layer:
                    mesh.uv_layers.remove(layer)
                    deleted_on_obj += 1

        total_deleted_uvs += deleted_on_obj

        # 5. Đổi tên chuẩn hóa (ví dụ: UVMap_Baked -> UVMap)
        final_name = target_layer.name
        if rename_to and str(rename_to).strip() and str(rename_to).strip() != target_layer.name:
            target_layer.name = str(rename_to).strip()
            final_name = target_layer.name

        print(f"[apply_uv] Object '{obj.name}': Active UV='{final_name}', Đã xóa {deleted_on_obj} UV layer cũ", flush=True)
        processed_objects.append({
            "object": obj.name,
            "active_uv": final_name,
            "deleted_uvs": deleted_on_obj
        })

    return {
        "status": "SUCCESS",
        "uv_name": uv_name,
        "rename_to": rename_to,
        "delete_old_uvs": delete_old_uvs,
        "processed_objects": [p["object"] for p in processed_objects],
        "details": processed_objects,
        "count": len(processed_objects),
        "total_deleted_uvs": total_deleted_uvs
    }
