# pyrefly: ignore [missing-import]
import bpy
import os


class MockOp:
    """Mock operator object to capture preset options executed from DAZ preset files."""
    def __init__(self):
        self.options = {}
        self.files = self

    def add(self):
        return self

    def clear(self):
        pass

    def __setattr__(self, name, val):
        if name in ['options', 'files']:
            super().__setattr__(name, val)
        elif name in ['name', 'filepath', 'directory', 'files']:
            pass
        else:
            self.options[name] = val


def main(
    input_path: str,
    preset_path: str = "",
    armature_name: str = "root"
) -> dict:
    """
    Import DAZ 3D character (.duf, .dbz) into the current Blender scene using Diffeomorphic.
    Renames the imported Armature object to 'root'.

    Args:
        input_path: Absolute path to the character file (.duf, .dbz, .hd).
        preset_path: Optional path to a Diffeomorphic preset script.
        armature_name: Name for the Armature object (defaults to 'root').

    Returns:
        Dictionary with imported file path, status, and armature object name.
    """
    if not input_path:
        raise ValueError("Missing required parameter 'input_path'")

    input_path = os.path.abspath(input_path)
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    # 1. Clear any existing default scene objects
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    # 2. Set silent mode in Diffeomorphic to avoid modal popup dialogs
    for prefix in ["bl_ext.user_default.", ""]:
        try:
            exec(f"from {prefix}import_daz.api import set_silent_mode; set_silent_mode(True)")
            break
        except Exception:
            pass

    # 3. Resolve and load preset options if provided
    preset_options = {}
    if preset_path and str(preset_path).strip():
        preset_str = str(preset_path).strip()
        resolved_preset = None
        candidates = [
            preset_str,
            os.path.abspath(preset_str),
            os.path.join(os.path.dirname(input_path), preset_str),
            os.path.join(os.path.dirname(input_path), f"{preset_str}.py"),
            os.path.expanduser(f"~/Documents/DAZ Importer/Presets/{preset_str}"),
            os.path.expanduser(f"~/Documents/DAZ Importer/Presets/{preset_str}.py"),
            os.path.expanduser(f"~/Documents/DAZ Importer/{preset_str}"),
            os.path.expanduser(f"~/Documents/DAZ Importer/{preset_str}.py"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "presets", preset_str),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "presets", f"{preset_str}.py"),
        ]
        for c in candidates:
            if os.path.exists(c) and os.path.isfile(c):
                resolved_preset = os.path.abspath(c)
                break

        if resolved_preset:
            print(f"[diffeomorphic_import] Loading preset from: '{resolved_preset}'", flush=True)
            mock = MockOp()
            with open(resolved_preset, 'r', encoding='utf-8') as f:
                clean_code = "".join([line for line in f if "active_operator" not in line])
                exec(clean_code, {'bpy': bpy, 'op': mock})
            preset_options = mock.options
            print(f"[diffeomorphic_import] Loaded {len(preset_options)} option(s) from preset: {list(preset_options.keys())}", flush=True)

            # Filter preset_options to only include properties recognized by this Diffeomorphic version
            try:
                op_rna = bpy.ops.daz.easy_import_daz.get_rna_type()
                valid_props = {prop.identifier for prop in op_rna.properties}
                filtered_options = {k: v for k, v in preset_options.items() if k in valid_props}
                ignored_props = set(preset_options.keys()) - set(filtered_options.keys())
                if ignored_props:
                    print(f"[diffeomorphic_import] Note: Ignored {len(ignored_props)} option(s) not supported by this DAZ Importer version: {list(ignored_props)}", flush=True)
                preset_options = filtered_options
            except Exception as e:
                print(f"[diffeomorphic_import] Warning inspecting operator RNA properties ({e}), proceeding with raw options.", flush=True)
        else:
            print(f"[diffeomorphic_import] WARNING: Preset '{preset_str}' not found in candidate paths. Proceeding with default settings.", flush=True)

    # 4. Execute Easy Import DAZ
    folder = os.path.dirname(input_path)
    filename = os.path.basename(input_path)

    print(f"[diffeomorphic_import] Importing '{filename}' from '{folder}'...", flush=True)

    window = bpy.context.window_manager.windows[0]
    override = {'window': window, 'screen': window.screen}

    with bpy.context.temp_override(**override):
        res = bpy.ops.daz.easy_import_daz(
            'EXEC_DEFAULT',
            directory=folder,
            files=[{"name": filename}],
            **preset_options
        )

    if 'FINISHED' not in res:
        raise RuntimeError(f"Diffeomorphic import failed with status: {res}")

    if len(bpy.data.objects) == 0:
        raise RuntimeError("Diffeomorphic reported FINISHED but scene is empty")

    # 5. Đổi tên Armature object thành 'root'
    armature = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break

    if armature:
        old_name = armature.name
        armature.name = armature_name
        if armature.data:
            armature.data.name = f"{armature_name}_Data"
        print(f"[diffeomorphic_import] Renamed Armature object '{old_name}' -> '{armature.name}'", flush=True)

    print(f"[diffeomorphic_import] Successfully imported '{filename}' ({len(bpy.data.objects)} objects in scene).", flush=True)

    return {
        "imported_file": input_path,
        "objects_count": len(bpy.data.objects),
        "armature_name": armature.name if armature else None
    }

