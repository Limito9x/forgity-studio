# pyrefly: ignore [missing-import]
import bpy
import os
from typing import Optional


def _clean_blend_path(raw: str) -> str:
    """Chuan hoa .blend: doi .duf/.dbz/.fbx/.obj/.gltf/.glb -> .blend, them duoi neu thieu."""
    root, ext = os.path.splitext(raw)
    if ext.lower() in [".duf", ".dbz", ".fbx", ".obj", ".gltf", ".glb"]:
        return root + ".blend"
    if not raw.lower().endswith(".blend"):
        return raw + ".blend"
    return raw


def main(output_path: str = "") -> dict:
    """
    Save scene thong minh (smart overwrite).

    - Co output_path -> clean .blend, makedirs, save de (ghi de neu ton tai).
    - Khong path + scene da co filepath (da save truoc do) -> save de vao do.
    - Khong path + scene moi chua save lan nao -> raise ValueError, Engine bao loi ro.
      Khong fallback temp silent nhu ban cu.

    Args:
        output_path: Duong dan .blend dich. Rong = save de file hien tai.

    Returns:
        {"saved_path": str, "file_size": int, "is_overwrite": bool}
    """
    cleaned = (output_path or "").strip()
    is_junk = (
        not cleaned
        or not cleaned.replace("/", "").replace("\\", "").replace(".blend", "").strip()
        or cleaned.startswith("///")
        or cleaned.startswith("\\\\\\")
    )

    is_overwrite = False
    explicit_path = False
    if is_junk:
        current = (bpy.data.filepath or "").strip()
        if current:
            output_path = current
            is_overwrite = True
            print(f"[save_scene] Overwriting current file '{output_path}'", flush=True)
        else:
            raise ValueError(
                "[save_scene] No output_path and scene has never been saved "
                "(bpy.data.filepath is empty). Provide output_path on first save."
            )
    else:
        explicit_path = True
        output_path = _clean_blend_path(cleaned)
        output_path = os.path.abspath(output_path)
        if os.path.exists(output_path):
            is_overwrite = True

    dest_dir = os.path.dirname(output_path)
    if dest_dir:
        os.makedirs(dest_dir, exist_ok=True)

    # Purge orphaned unused data blocks before saving
    for _ in range(3):
        if bpy.app.version >= (3, 0, 0):
            bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
        else:
            bpy.ops.outliner.orphans_purge()

    # Save the mainfile:
    # - Khong path + scene da co filepath -> save_mainfile() (de dung file do).
    # - Co path cu the -> LUON save_as_mainfile(filepath=...), ke ca file da ton tai
    #   (save_as tu ghi de). Dung goi save_mainfile() o nhanh nay vi scene co the
    #   chua co filepath (import .duf/.fbx xong save lan dau) -> Blender bao
    #   "Unable to save an unsaved file with an empty filepath property".
    if not explicit_path:
        bpy.ops.wm.save_mainfile()
    else:
        bpy.ops.wm.save_as_mainfile(filepath=output_path)
    file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0

    action = "Overwrote" if is_overwrite else "Saved new scene to"
    print(f"[save_scene] {action} '{output_path}' ({file_size} bytes).", flush=True)

    return {
        "saved_path": output_path,
        "file_size": file_size,
        "is_overwrite": is_overwrite,
    }
