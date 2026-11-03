# pyrefly: ignore [missing-import]
"""
Backward-compatible wrapper for batch_export_fbx.
Delegates directly to the unified export_fbx with export_mode='Batch'.
"""
import sys
import os

# Ensure same-directory import works cleanly whether imported as package or executed standalone
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from export_fbx import (
    main as _unified_export_main,
    clean_asset_name,
    find_matching_meshes,
    select_mesh_with_armature,
    render_mesh_thumbnail,
    MockOp,
    compute_sha256,
    normalize_name,
)


def main(
    export_map=None,
    output_dir: str = "",
    prefix: str = "",
    preset_path: str = "",
    **kwargs
):
    """
    Backward-compatible batch export entrypoint.
    Delegates to unified export_fbx in 'Batch' mode.
    """
    return _unified_export_main(
        output_path=output_dir,
        export_mode="Batch",
        target_objects=export_map,
        prefix=prefix,
        preset_path=preset_path,
        **kwargs
    )


batch_export_fbx = main
batch_export = main
