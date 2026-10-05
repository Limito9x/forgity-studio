# pyrefly: ignore [missing-import]
import bpy
import os


class MockOp:
    """Mock operator object to capture preset options from FBX exporter presets."""
    def __init__(self):
        self.options = {}

    def __setattr__(self, name, val):
        if name == 'options':
            super().__setattr__(name, val)
        else:
            self.options[name] = val


def main(
    output_path: str,
    target_objects: list = None,
    preset_path: str = ""
) -> dict:
    """
    Export specified scene objects to FBX format.

    Args:
        output_path: Absolute destination path for the .fbx file.
        target_objects: Optional list of object names to filter for export.
        preset_path: Optional path to FBX export preset script.

    Returns:
        Dictionary with exported file path and exported objects count.
    """
    if not output_path:
        output_path = os.path.join(bpy.app.tempdir, "exported.fbx")

    # Ensure .fbx extension
    base, _ = os.path.splitext(output_path)
    output_path = base + ".fbx"
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # 1. Selection
    bpy.ops.object.select_all(action='DESELECT')
    selected_count = 0

    for obj in bpy.data.objects:
        # Match using name substring (case-insensitive) if target_objects specified
        if not target_objects or any(t.lower() in obj.name.lower() for t in target_objects):
            if obj.type in ['MESH', 'ARMATURE', 'EMPTY', 'CAMERA', 'LIGHT']:
                obj.select_set(True)
                selected_count += 1
                if obj.type in ['MESH', 'ARMATURE']:
                    bpy.context.view_layer.objects.active = obj

    if selected_count == 0:
        print("[export_fbx] Warning: No objects selected for export based on filter.", flush=True)

    # 2. Preset Options
    preset_options = {}
    if preset_path and os.path.exists(preset_path):
        mock = MockOp()
        with open(preset_path, 'r', encoding='utf-8') as f:
            clean_code = "".join([l for l in f if "active_operator" not in l])
            exec(clean_code, {'bpy': bpy, 'op': mock})
        preset_options = mock.options

    if target_objects:
        preset_options['use_selection'] = True

    preset_options.pop('filepath', None)

    # 3. Export FBX
    print(f"[export_fbx] Exporting FBX to '{output_path}' with {selected_count} objects...", flush=True)
    try:
        bpy.ops.export_scene.fbx(filepath=output_path, **preset_options)
        print(f"[export_fbx] Successfully exported to '{output_path}'.", flush=True)
    except Exception as e:
        raise RuntimeError(f"Failed to export FBX: {e}")

    file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0

    return {
        "exported_fbx_path": output_path,
        "objects_count": selected_count,
        "file_size": file_size
    }
