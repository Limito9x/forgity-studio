# pyrefly: ignore [missing-import]
import bpy
import os
import shutil
import hashlib
from typing import Dict, Any, List, Optional, Set


def get_all_material_images(objects: List[bpy.types.Object]) -> Set[bpy.types.Image]:
    """Quét toàn bộ Image Textures kể cả nằm sâu trong các Node Group."""
    images: Set[bpy.types.Image] = set()

    def scan_tree(tree):
        if not tree:
            return
        for node in tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                images.add(node.image)
            elif node.type == 'GROUP' and node.node_tree:
                scan_tree(node.node_tree)

    for obj in objects:
        if obj.type == 'MESH' and obj.data.materials:
            for mat in obj.data.materials:
                if mat and mat.use_nodes and mat.node_tree:
                    scan_tree(mat.node_tree)
    return images


def resolve_unique_filename(src_path: str, output_dir: str, existing_mappings: Dict[str, str]) -> str:
    """
    Tạo tên file đích không bị trùng lặp.
    Nếu có 2 file cùng tên từ 2 folder khác nhau, tự động gán hash ngắn để phân biệt.
    Nếu file đã nằm sẵn trong thư mục đích hoặc trùng nội dung thì giữ nguyên tên gốc.
    """
    if src_path in existing_mappings:
        return existing_mappings[src_path]

    abs_src = os.path.abspath(src_path)
    base_name = os.path.basename(src_path)
    target_path = os.path.abspath(os.path.join(output_dir, base_name))

    # 1. Nếu file nguồn ĐÃ NẰM SẴN trong thư mục đích -> giữ nguyên, không đổi tên
    if os.path.normcase(abs_src) == os.path.normcase(target_path):
        existing_mappings[src_path] = target_path
        return target_path

    # 2. Nếu tại thư mục đích đã có sẵn file cùng tên
    if os.path.exists(target_path):
        # Kiểm tra nếu file nguồn và file đích có nội dung giống nhau -> tái sử dụng, không nhân bản
        try:
            if os.path.getsize(abs_src) == os.path.getsize(target_path):
                import filecmp
                if filecmp.cmp(abs_src, target_path, shallow=False):
                    existing_mappings[src_path] = target_path
                    return target_path
        except Exception:
            pass

        # Thực sự là 2 file khác nhau từ 2 folder khác nhau -> gán hash thư mục cha nguồn
        name_part, ext = os.path.splitext(base_name)
        dir_hash = hashlib.md5(os.path.dirname(abs_src).encode('utf-8')).hexdigest()[:6]
        target_path = os.path.join(output_dir, f"{name_part}_{dir_hash}{ext}")

    existing_mappings[src_path] = target_path
    return target_path


def main(
    output_dir: str = "",
    target_objects: Optional[List[str]] = None,
    make_relative: bool = True,
    unpack_packed: bool = True
) -> Dict[str, Any]:
    """
    Gom và lưu toàn bộ texture của scene/objects vào một thư mục local,
    tự động xử lý UDIM, Packed Images, tránh đè tên và remap lại đường dẫn.

    Args:
        output_dir: Thư mục đích chứa textures (nếu trống sẽ lấy <blend_dir>/textures).
        target_objects: Bộ lọc tên objects (nếu rỗng sẽ quét toàn bộ Meshes trong scene).
        make_relative: Chuyển đường dẫn trong Blender thành đường dẫn tương đối (//textures/...).
        unpack_packed: Tự động trích xuất các ảnh đang bị đóng gói (packed) trong file blend ra đĩa.

    Returns:
        Dictionary chứa thông tin output_dir, tổng số textures, số lượng copy thành công.
    """
    # 1. Xác định thư mục đích
    if not output_dir:
        base_dir = os.path.dirname(bpy.data.filepath) if bpy.data.filepath else bpy.app.tempdir
        output_dir = os.path.join(base_dir, "textures")

    output_dir = os.path.abspath(output_dir)
    os.makedirs(output_dir, exist_ok=True)
    print(f"[save_textures_local] Target directory: '{output_dir}'", flush=True)

    # 2. Lọc Objects
    meshes = [
        obj for obj in bpy.data.objects
        if obj.type == 'MESH' and (not target_objects or any(t.lower() in obj.name.lower() for t in target_objects))
    ]

    images = get_all_material_images(meshes)
    print(f"[save_textures_local] Found {len(images)} unique image datablock(s) across {len(meshes)} mesh(es).", flush=True)

    copied_count = 0
    path_cache: Dict[str, str] = {}
    skipped_files: List[str] = []

    # 3. Xử lý từng Image
    for img in images:
        # Bỏ qua ảnh ảo không có dữ liệu file
        if img.source not in {'FILE', 'TILED'} and not img.packed_file:
            continue

        colorspace = getattr(img.colorspace_settings, 'name', 'sRGB')

        # A. Xử lý ảnh Packed
        if img.packed_file:
            if unpack_packed:
                target_filename = f"{img.name}.png" if not os.path.splitext(img.name)[1] else img.name
                target_path = os.path.join(output_dir, target_filename)
                
                # Lưu ảnh ra đĩa
                old_filepath = img.filepath_raw
                img.filepath_raw = target_path
                img.save()
                img.unpack(method='USE_ORIGINAL')
                copied_count += 1
                
                if make_relative and bpy.data.filepath:
                    img.filepath = bpy.path.relpath(target_path)
                else:
                    img.filepath = target_path
                img.colorspace_settings.name = colorspace
                print(f"[save_textures_local] Unpacked image: '{img.name}' -> '{target_path}'", flush=True)
            continue

        # B. Xử lý ảnh UDIM (Tiled)
        if img.source == 'TILED':
            raw_pattern = bpy.path.abspath(img.filepath)
            first_tile_new_path = ""

            for tile in img.tiles:
                tile_number = tile.number
                # Thay thế token <UDIM> bằng số hiệu tile (vd: 1001)
                tile_src_path = raw_pattern.replace("<UDIM>", str(tile_number))
                if os.path.exists(tile_src_path):
                    target_tile_path = resolve_unique_filename(tile_src_path, output_dir, path_cache)
                    if os.path.abspath(tile_src_path) != os.path.abspath(target_tile_path):
                        shutil.copy2(tile_src_path, target_tile_path)
                        copied_count += 1
                    if not first_tile_new_path:
                        first_tile_new_path = target_tile_path.replace(str(tile_number), "<UDIM>")
                else:
                    skipped_files.append(tile_src_path)

            if first_tile_new_path:
                img.filepath = bpy.path.relpath(first_tile_new_path) if (make_relative and bpy.data.filepath) else first_tile_new_path
                img.colorspace_settings.name = colorspace
                img.reload()
            continue

        # C. Xử lý ảnh thường (Single File)
        raw_path = bpy.path.abspath(img.filepath)
        if not raw_path or not os.path.exists(raw_path):
            print(f"[save_textures_local] Warning: Source texture not found: '{raw_path}'", flush=True)
            skipped_files.append(raw_path or img.name)
            continue

        target_path = resolve_unique_filename(raw_path, output_dir, path_cache)

        # Copy OS nhị phân tốc độ cao
        if os.path.abspath(raw_path) != os.path.abspath(target_path):
            shutil.copy2(raw_path, target_path)
            copied_count += 1

        # Remap đường dẫn
        if make_relative and bpy.data.filepath:
            img.filepath = bpy.path.relpath(target_path)
        else:
            img.filepath = target_path

        img.colorspace_settings.name = colorspace
        img.reload()

    print(f"[save_textures_local] Successfully processed. Copied: {copied_count}, Skipped/Missing: {len(skipped_files)}", flush=True)

    return {
        "output_dir": output_dir,
        "textures_found": len(images),
        "textures_copied": copied_count,
        "missing_count": len(skipped_files)
    }
