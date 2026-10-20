# pyrefly: ignore [missing-import]
import bpy
import os
from pathlib import Path


def _sanitize_filepath(raw_path: str) -> str:
    """
    Sanitize and normalize a file path to prevent Windows filesystem errors.

    Trims leading/trailing whitespace from each path segment to eliminate
    problematic trailing spaces (e.g. 'Characters/Test /Test.blend' -> 'Characters/Test/Test.blend').
    """
    cleaned = raw_path.strip().strip('"').strip("'")
    if not cleaned:
        raise ValueError("Provided output_path is empty.")

    normalized = os.path.normpath(cleaned)
    drive, tail = os.path.splitdrive(normalized)

    raw_segments = tail.replace("\\", "/").split("/")
    clean_segments = [seg.strip() for seg in raw_segments if seg.strip()]

    if not clean_segments:
        raise ValueError(f"Invalid output_path: '{raw_path}'. No valid path segments found.")

    if drive:
        sanitized = os.path.join(drive + os.sep, *clean_segments)
    else:
        sanitized = os.path.join(*clean_segments)

    sanitized = os.path.abspath(sanitized)

    # If path explicitly ends with a slash, it's a directory, which is invalid for saving a scene
    if cleaned.endswith("/") or cleaned.endswith("\\"):
        raise ValueError(
            f"Invalid output_path: '{raw_path}'. Path points to a directory. Please include a target filename."
        )

    # Validate or automatically append .blend extension if omitted
    _, ext = os.path.splitext(sanitized)
    if not ext:
        sanitized = f"{sanitized}.blend"
    elif ext.lower() != ".blend":
        raise ValueError(
            f"Invalid output_path: '{raw_path}'. Expected a .blend file, but received extension '{ext}'."
        )

    return sanitized


def main(output_path: str = "") -> dict:
    """
    Save the current Blender scene safely without heuristics or guessing.

    Behavior:
    - If output_path is provided: Validates, sanitizes directory segments, ensures .blend extension,
      creates destination folders if needed, and saves via save_as_mainfile(check_existing=False).
    - If output_path is omitted: Overwrites the currently open file if the scene has already been saved.
      If the scene is new and unsaved (bpy.data.filepath is empty), raises ValueError with a clear explanation.

    Args:
        output_path: Target .blend file path. If empty, saves over the active file.

    Returns:
        {"saved_path": str, "file_size": int, "is_overwrite": bool}
    """
    is_overwrite = False
    explicit_path = False

    cleaned_input = (output_path or "").strip()

    if not cleaned_input:
        current_filepath = (bpy.data.filepath or "").strip()
        if current_filepath and os.path.exists(current_filepath):
            output_path = os.path.abspath(current_filepath)
            is_overwrite = True
            print(f"[save_scene] No output_path provided. Overwriting current scene file: '{output_path}'", flush=True)
        else:
            raise ValueError(
                "[save_scene] No output_path was provided and the current scene has not been saved yet "
                "(bpy.data.filepath is empty). Please connect or specify a valid .blend output_path."
            )
    else:
        explicit_path = True
        output_path = _sanitize_filepath(cleaned_input)
        if os.path.exists(output_path):
            is_overwrite = True

    # Ensure parent directory exists
    dest_dir = os.path.dirname(output_path)
    if dest_dir:
        try:
            os.makedirs(dest_dir, exist_ok=True)
        except OSError as err:
            raise OSError(f"[save_scene] Failed to create destination directory '{dest_dir}': {err}") from err

    # Purge orphaned unused data blocks before saving
    for _ in range(3):
        try:
            if bpy.app.version >= (3, 0, 0):
                bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
            else:
                bpy.ops.outliner.orphans_purge()
        except Exception as purge_err:
            print(f"[save_scene] Warning: Could not purge orphans: {purge_err}", flush=True)
            break

    # Save the mainfile
    try:
        if not explicit_path:
            bpy.ops.wm.save_mainfile()
        else:
            bpy.ops.wm.save_as_mainfile(filepath=output_path, check_existing=False)
    except Exception as save_err:
        raise RuntimeError(
            f"[save_scene] Blender failed to save scene to '{output_path}': {save_err}"
        ) from save_err

    file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0
    action = "Overwrote" if is_overwrite else "Saved new scene to"
    print(f"[save_scene] {action} '{output_path}' ({file_size:,} bytes).", flush=True)

    return {
        "saved_path": output_path,
        "file_size": file_size,
        "is_overwrite": is_overwrite,
    }
