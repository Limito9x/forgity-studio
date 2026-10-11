import argparse
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

try:
    # pyrefly: ignore [missing-import]
    import bpy
    HAS_BPY = True
except ImportError:
    bpy = None
    HAS_BPY = False


def setup_cycles_engine(resolution: int = 2048, margin: int = 16) -> None:
    """Tối ưu hóa render engine Cycles cho 1-pass bake siêu tốc."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    cycles = scene.cycles

    # Cấu hình GPU nếu có, tự động fallback an toàn
    prefs = bpy.context.preferences
    if 'cycles' in prefs.addons:
        cprefs = prefs.addons['cycles'].preferences
        # Ưu tiên OPTIX, sau đó tới CUDA, HIP
        devices_optix = cprefs.get_devices_for_type('OPTIX')
        devices_cuda = cprefs.get_devices_for_type('CUDA')

        if devices_optix:
            cprefs.compute_device_type = 'OPTIX'
            for d in cprefs.devices:
                d.use = (d.type == 'OPTIX')
            cycles.device = 'GPU'
        elif devices_cuda:
            cprefs.compute_device_type = 'CUDA'
            for d in cprefs.devices:
                d.use = (d.type == 'CUDA')
            cycles.device = 'GPU'
        else:
            cycles.device = 'CPU'

    # Tối ưu hóa sample và bounces để tăng tốc tối đa
    cycles.samples = 1
    cycles.preview_samples = 1
    cycles.use_adaptive_sampling = False
    cycles.use_denoising = False

    cycles.max_bounces = 0
    cycles.diffuse_bounces = 0
    cycles.glossy_bounces = 0
    cycles.transmission_bounces = 0
    cycles.volume_bounces = 0
    cycles.transparent_max_bounces = 0

    cycles.tile_size = resolution
    scene.render.bake.margin = margin
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_selected_to_active = False


def resolve_target_meshes(target_objects: Optional[List[str]] = None) -> List[Any]:
    """Tìm và chọn các Mesh object mục tiêu theo keyword hoặc selection hiện tại."""
    bpy.ops.object.select_all(action='DESELECT')
    selected_meshes = []

    if not target_objects:
        # Nếu không truyền, ưu tiên các mesh đang được select trong scene
        selected_meshes = [o for o in bpy.context.selected_objects if o.type == 'MESH']
        if not selected_meshes and bpy.context.active_object and bpy.context.active_object.type == 'MESH':
            selected_meshes = [bpy.context.active_object]
        if not selected_meshes:
            # Fallback: Lấy tất cả mesh trong scene
            selected_meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    else:
        for name in target_objects:
            if not name:
                continue
            kw = str(name).strip().lower()
            for o in bpy.data.objects:
                if o.type == 'MESH' and kw in o.name.lower():
                    if o not in selected_meshes:
                        selected_meshes.append(o)

    for obj in selected_meshes:
        obj.select_set(True)
        print(f"[NativeBake] Selected target mesh: '{obj.name}'", flush=True)

    if not selected_meshes:
        raise RuntimeError(f"[NativeBake] No valid meshes found for target(s): {target_objects}")

    # Đặt active object là mesh đầu tiên
    bpy.context.view_layer.objects.active = selected_meshes[0]
    return selected_meshes


def configure_uv_layers(meshes: List[Any], uv_name: str) -> None:
    """
    Cấu hình UV Layers cho quá trình Bake:
    - uv_layers.active = target_uv (Nơi Cycles ghi dữ liệu bake vào)
    - uv_layers.active_render = source_uv (Nơi Cycles đọc texture nguồn gốc)
    """
    for obj in meshes:
        uvs = obj.data.uv_layers
        if not uvs:
            continue

        target_uv = uvs.get(uv_name)
        if not target_uv:
            for uv in uvs:
                if uv.name.lower() == uv_name.lower():
                    target_uv = uv
                    break

        if target_uv:
            # UV active là UV đích để nhận kết quả bake
            uvs.active = target_uv
            # Giữ active_render trên UV khác nếu có để sample đúng texture gốc
            source_uv = next((u for u in uvs if u != target_uv), target_uv)
            source_uv.active_render = True
            print(f"[NativeBake] Object '{obj.name}': Target Bake UV = '{target_uv.name}', Source Render UV = '{source_uv.name}'", flush=True)
        else:
            print(f"[NativeBake] Notice: Object '{obj.name}' does not have target UV '{uv_name}'. Using active UV '{uvs.active.name}'", flush=True)


def find_principled_and_output(mat: bpy.types.Material) -> Tuple[Optional[bpy.types.Node], Optional[bpy.types.Node]]:
    """Tìm Principled BSDF node và Output Material node trong Material."""
    if not mat or not mat.use_nodes or not mat.node_tree:
        return None, None

    nodes = mat.node_tree.nodes
    out_node = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    if not out_node:
        out_node = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)

    bsdf_node = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    return bsdf_node, out_node


def setup_emission_routing(mat: bpy.types.Material, map_type: str) -> Optional[Tuple[bpy.types.Node, Any]]:
    """
    Kỹ thuật Emission Routing (SimpleBake pattern):
    Tạm thời nối socket cần bake (Base Color, Roughness, Metallic, Alpha, Specular)
    vào một Emission Shader node để bake EMIT với đúng 1 SAMPLE.
    Trả về (emit_node, original_surface_link_from_socket) để dọn dẹp và khôi phục sau khi bake.
    """
    bsdf_node, out_node = find_principled_and_output(mat)
    if not bsdf_node or not out_node:
        return None

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    # 1. Lưu lại kết nối ban đầu vào Output.Surface
    orig_surface_link = None
    if out_node.inputs['Surface'].is_linked:
        orig_surface_link = out_node.inputs['Surface'].links[0].from_socket

    # 2. Tạo Emission node tạm
    emit_node = nodes.new(type='ShaderNodeEmission')
    emit_node.name = "__Temp_Bake_Emission__"
    emit_node.inputs['Strength'].default_value = 1.0

    # 3. Xác định socket tương ứng trên Principled BSDF
    socket_candidates = {
        "diffuse": ["Base Color", "BaseColor", "Color"],
        "basecolor": ["Base Color", "BaseColor", "Color"],
        "albedo": ["Base Color", "BaseColor", "Color"],
        "roughness": ["Roughness"],
        "metallic": ["Metallic"],
        "specular": ["Specular IOR Level", "Specular", "Specular Tint"],
        "alpha": ["Alpha", "Opacity"],
        "transmission": ["Transmission Weight", "Transmission"],
    }.get(map_type.lower(), [])

    target_socket = None
    for s_name in socket_candidates:
        if s_name in bsdf_node.inputs:
            target_socket = bsdf_node.inputs[s_name]
            break

    if target_socket:
        if target_socket.is_linked:
            from_sock = target_socket.links[0].from_socket
            links.new(from_sock, emit_node.inputs['Color'])
        else:
            val = target_socket.default_value
            if isinstance(val, (int, float)):
                emit_node.inputs['Color'].default_value = (float(val), float(val), float(val), 1.0)
            elif hasattr(val, '__len__') and len(val) >= 3:
                emit_node.inputs['Color'].default_value = (val[0], val[1], val[2], 1.0)
    else:
        # Giá trị mặc định nếu socket không tồn tại
        if map_type.lower() == "roughness":
            emit_node.inputs['Color'].default_value = (0.5, 0.5, 0.5, 1.0)
        elif map_type.lower() == "metallic":
            emit_node.inputs['Color'].default_value = (0.0, 0.0, 0.0, 1.0)
        elif map_type.lower() in ("diffuse", "basecolor", "albedo"):
            emit_node.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1.0)
        elif map_type.lower() == "alpha":
            emit_node.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1.0)

    # 4. Nối Emission sang Surface của Output
    links.new(emit_node.outputs['Emission'], out_node.inputs['Surface'])
    return emit_node, orig_surface_link


def restore_emission_routing(mat: bpy.types.Material, emit_info: Optional[Tuple[bpy.types.Node, Any]]) -> None:
    """Khôi phục lại liên kết shader ban đầu của material."""
    if not emit_info or not mat or not mat.node_tree:
        return

    emit_node, orig_surface_socket = emit_info
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    _, out_node = find_principled_and_output(mat)
    if out_node and orig_surface_socket:
        links.new(orig_surface_socket, out_node.inputs['Surface'])

    if emit_node and emit_node.name in nodes:
        nodes.remove(emit_node)


def main(
    target_objects: Optional[List[str]] = None,
    output_dir: str = "",
    maps: Optional[List[str]] = None,
    uv_name: str = "UVMap_Baked",
    resolution: int = 2048,
    bake_orm: bool = False,
    file_format: str = "PNG",
    file_prefix: str = ""
) -> Dict[str, Any]:
    """
    Hàm entry-point chính cho Native Bake PBR:
    - target_objects: Danh sách tên mesh cần bake (None = auto select)
    - output_dir: Thư mục xuất texture
    - maps: List các map cần bake, vd ['diffuse', 'roughness', 'normal', 'metallic', 'alpha', 'ao']
    - uv_name: Tên UV map đích
    - resolution: Độ phân giải (1024, 2048, 4096)
    - bake_orm: Đóng gói kênh ORM (Occlusion=R, Roughness=G, Metallic=B)
    """
    if not HAS_BPY:
        raise RuntimeError("Blender python (bpy) is not available.")

    # 1. Chuẩn hóa danh sách map
    if not maps:
        maps = ["diffuse", "roughness", "normal"]
    elif isinstance(maps, str):
        maps = [m.strip().lower() for m in maps.split(",") if m.strip()]
    else:
        maps = [str(m).strip().lower() for m in maps if str(m).strip()]

    # Đảm bảo không trùng lặp và giữ thứ tự chuẩn
    valid_map_types = ["diffuse", "basecolor", "roughness", "normal", "metallic", "specular", "alpha", "ao"]
    selected_maps = []
    for m in maps:
        normalized = "diffuse" if m in ("basecolor", "albedo") else m
        if normalized in valid_map_types and normalized not in selected_maps:
            selected_maps.append(normalized)

    if not selected_maps:
        selected_maps = ["diffuse", "roughness", "normal"]

    try:
        resolution = int(resolution) if resolution else 2048
    except (ValueError, TypeError):
        resolution = 2048

    if not output_dir:
        output_dir = os.path.join(bpy.app.tempdir, "baked_textures")

    os.makedirs(output_dir, exist_ok=True)

    # 2. Cấu hình Cycles và xác định Meshes
    setup_cycles_engine(resolution=resolution)
    selected_meshes = resolve_target_meshes(target_objects)
    configure_uv_layers(selected_meshes, uv_name)

    base_name = file_prefix if file_prefix else selected_meshes[0].name
    baked_files: Dict[str, str] = {}
    temp_loaded_images = {}

    # 3. Tạo Target Image Nodes trong mọi Material Slots của các Meshes
    mat_bake_nodes = []
    unique_materials = set()
    for obj in selected_meshes:
        for slot in obj.material_slots:
            mat = slot.material
            if mat and mat.use_nodes and mat.node_tree:
                unique_materials.add(mat)

    for mat in unique_materials:
        nodes = mat.node_tree.nodes
        bnode = nodes.get("__Native_Bake_Target__") or nodes.new(type='ShaderNodeTexImage')
        bnode.name = "__Native_Bake_Target__"
        nodes.active = bnode
        mat_bake_nodes.append((mat, bnode))

    # 4. Thực thi Bake lần lượt từng Map PBR
    scene = bpy.context.scene
    cb = scene.render.bake

    for map_type in selected_maps:
        map_suffix = {
            "diffuse": "BaseColor",
            "roughness": "Roughness",
            "normal": "Normal",
            "metallic": "Metallic",
            "specular": "Specular",
            "alpha": "Alpha",
            "ao": "AO"
        }.get(map_type, map_type.capitalize())

        out_filename = f"{base_name}_{map_suffix}.{file_format.lower()}"
        out_filepath = os.path.join(output_dir, out_filename)

        is_color_map = map_type in ("diffuse", "basecolor")
        bake_image = bpy.data.images.new(
            name=f"Bake_{base_name}_{map_suffix}",
            width=resolution,
            height=resolution,
            alpha=True,
            float_buffer=(map_type == "normal")
        )

        if not is_color_map:
            bake_image.colorspace_settings.name = 'Non-Color'

        # Gán bake_image vào tất cả material bake nodes
        for mat, bnode in mat_bake_nodes:
            bnode.image = bake_image
            mat.node_tree.nodes.active = bnode

        # Bake theo kiểu tương ứng
        if map_type == "normal":
            scene.cycles.samples = 8
            print(f"[NativeBake] Baking Normal map -> '{out_filepath}' (Samples: 8)...", flush=True)
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', save_mode='INTERNAL')

        elif map_type == "ao":
            scene.cycles.samples = 16
            print(f"[NativeBake] Baking AO map -> '{out_filepath}' (Samples: 16)...", flush=True)
            bpy.ops.object.bake(type='AO', save_mode='INTERNAL')

        else:
            # Diffuse, Roughness, Metallic, Specular, Alpha: Dùng Emission Shader Routing
            scene.cycles.samples = 1  # 1 Sample duy nhất cho Emission!
            print(f"[NativeBake] Baking {map_suffix} map via Emission Routing -> '{out_filepath}' (Sample: 1)...", flush=True)

            emit_tracker = {}
            for mat, _ in mat_bake_nodes:
                emit_info = setup_emission_routing(mat, map_type)
                if emit_info:
                    emit_tracker[mat] = emit_info

            # Chạy bake EMIT
            bpy.ops.object.bake(type='EMIT', save_mode='INTERNAL')

            # Khôi phục shader ban đầu
            for mat, emit_info in emit_tracker.items():
                restore_emission_routing(mat, emit_info)

        # Lưu ảnh ra đĩa
        bake_image.filepath_raw = out_filepath
        bake_image.file_format = file_format.upper()
        bake_image.save()
        baked_files[map_type] = out_filepath
        print(f"[NativeBake] Saved: '{out_filepath}'", flush=True)

        if bake_orm and map_type in ("roughness", "metallic"):
            temp_loaded_images[map_type] = bake_image
        else:
            bpy.data.images.remove(bake_image)

    # 5. Tùy chọn Channel Packing (ORM: Occlusion = R, Roughness = G, Metallic = B)
    if bake_orm and "roughness" in temp_loaded_images:
        try:
            import numpy as np
            num_pixels = resolution * resolution
            rough_img = temp_loaded_images["roughness"]

            rough_pixels = np.empty(num_pixels * 4, dtype=np.float32)
            rough_img.pixels.foreach_get(rough_pixels)
            g_channel = rough_pixels[0::4]

            if "metallic" in temp_loaded_images:
                metal_pixels = np.empty(num_pixels * 4, dtype=np.float32)
                temp_loaded_images["metallic"].pixels.foreach_get(metal_pixels)
                b_channel = metal_pixels[0::4]
            else:
                b_channel = np.zeros(num_pixels, dtype=np.float32)

            r_channel = np.ones(num_pixels, dtype=np.float32)  # Default AO = 1.0

            orm_pixels = np.empty(num_pixels * 4, dtype=np.float32)
            orm_pixels[0::4] = r_channel
            orm_pixels[1::4] = g_channel
            orm_pixels[2::4] = b_channel
            orm_pixels[3::4] = 1.0

            orm_filename = f"{base_name}_ORM.{file_format.lower()}"
            orm_filepath = os.path.join(output_dir, orm_filename)

            orm_img = bpy.data.images.new("Bake_ORM", width=resolution, height=resolution)
            orm_img.colorspace_settings.name = 'Non-Color'
            orm_img.pixels.foreach_set(orm_pixels)
            orm_img.filepath_raw = orm_filepath
            orm_img.file_format = file_format.upper()
            orm_img.save()

            baked_files["orm"] = orm_filepath
            bpy.data.images.remove(orm_img)
            print(f"[NativeBake] Packed and saved ORM: '{orm_filepath}'", flush=True)
        except Exception as ex:
            print(f"[NativeBake] Warning: Failed to pack ORM texture: {ex}", flush=True)

    # Dọn dẹp images còn lại nếu có
    for img in temp_loaded_images.values():
        try:
            bpy.data.images.remove(img)
        except Exception:
            pass

    # 6. Dọn dẹp Bake Image Nodes khỏi materials
    for mat, bnode in mat_bake_nodes:
        try:
            if bnode.name in mat.node_tree.nodes:
                mat.node_tree.nodes.remove(bnode)
        except Exception:
            pass

    print(f"[NativeBake] Successfully completed bake for {len(selected_meshes)} mesh(es). Output: {output_dir}", flush=True)

    return {
        "status": "SUCCESS",
        "output_dir": output_dir,
        "baked_maps": baked_files,
        "meshes": [m.name for m in selected_meshes],
        "resolution": resolution,
    }


if __name__ == "__main__" and HAS_BPY:
    # Hỗ trợ chạy trực tiếp từ CLI: blender scene.blend --background --python native_bake.py -- [args]
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description="Blender Native PBR Bake CLI")
    parser.add_argument("--targets", type=str, default="", help="Comma-separated mesh names or keywords")
    parser.add_argument("--output_dir", type=str, default="", help="Directory to save textures")
    parser.add_argument("--maps", type=str, default="diffuse,roughness,normal", help="Comma-separated PBR maps")
    parser.add_argument("--uv", type=str, default="UVMap_Baked", help="Target UV layer name")
    parser.add_argument("--res", type=int, default=2048, help="Resolution (e.g. 1024, 2048, 4096)")
    parser.add_argument("--orm", action="store_true", help="Pack ORM texture")

    args = parser.parse_args(argv)

    targets_list = [t.strip() for t in args.targets.split(",") if t.strip()] if args.targets else None
    maps_list = [m.strip() for m in args.maps.split(",") if m.strip()]

    result = main(
        target_objects=targets_list,
        output_dir=args.output_dir,
        maps=maps_list,
        uv_name=args.uv,
        resolution=args.res,
        bake_orm=args.orm
    )
    print(f"[NativeBake CLI] Result: {result}")