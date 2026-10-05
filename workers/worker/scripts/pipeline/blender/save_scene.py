# pyrefly: ignore [missing-import]
import bpy
import os


def main(output_path: str) -> dict:
    """
    Save the current Blender scene as a .blend file.

    Args:
        output_path: Absolute destination path for the .blend file.

    Returns:
        Dictionary with saved_path and file_size.
    """
    # Kiểm tra nếu output_path rỗng hoặc chỉ chứa các ký tự phân cách rác như ///, \\\, ///.blend
    clean_check = (output_path or "").strip().replace("/", "").replace("\\", "").replace(".blend", "").strip()
    if not clean_check or output_path.strip().startswith("///") or output_path.strip().startswith("\\\\\\"):
        output_path = os.path.join(bpy.app.tempdir, "saved_scene.blend")

    # Ensure .blend extension (replace extensions like .duf, .dbz if present)
    root, ext = os.path.splitext(output_path)
    if ext.lower() in [".duf", ".dbz", ".fbx", ".obj", ".gltf", ".glb"]:
        output_path = root + ".blend"
    elif not output_path.lower().endswith(".blend"):
        output_path += ".blend"

    output_path = os.path.abspath(output_path)
    try:
        dest_dir = os.path.dirname(output_path)
        if dest_dir:
            os.makedirs(dest_dir, exist_ok=True)
    except Exception as e:
        print(f"[save_scene] Warning: Invalid path '{output_path}', falling back to Temp dir: {e}", flush=True)
        output_path = os.path.join(bpy.app.tempdir, "saved_scene.blend")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Purge orphaned unused data blocks before saving
    for _ in range(3):
        if bpy.app.version >= (3, 0, 0):
            bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
        else:
            bpy.ops.outliner.orphans_purge()

    # Save the mainfile
    bpy.ops.wm.save_as_mainfile(filepath=output_path)
    file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0

    print(f"[save_scene] Scene successfully saved to '{output_path}' ({file_size} bytes).", flush=True)

    return {
        "saved_path": output_path,
        "file_size": file_size
    }
