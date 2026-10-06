# pyrefly: ignore [missing-import]
import bpy
import json
import os
from typing import Dict, List, Optional, Any


class MockOp:
    """Mock operator object to capture preset options from FBX exporter presets."""
    def __init__(self):
        self.options = {}

    def __setattr__(self, name, val):
        if name == 'options':
            super().__setattr__(name, val)
        else:
            self.options[name] = val


def _normalize_target_list(raw: Optional[List[str]]) -> List[str]:
    """Batch-first: only List[str]. No comma-split string parsing."""
    if not raw:
        return []
    return [str(x).strip() for x in raw if str(x).strip()]


def _unwrap_manifest(source: Any) -> Dict[str, Any]:
    """Accept manifest dict directly or wrapped {manifest: {...}}. Always return dict."""
    if not isinstance(source, dict):
        return {}
    # Wired as inspect_unified.manifest -> source_manifest: already the manifest
    if "asset_name" in source or "objects" in source:
        return source
    # Wired as whole inspect output {manifest, asset_name, ...}
    inner = source.get("manifest")
    if isinstance(inner, dict):
        return inner
    return {}


def main(
    output_path: str,
    target_objects: Optional[List[str]] = None,
    preset_path: str = "",
    source_manifest: Optional[Dict[str, Any]] = None
) -> dict:
    """
    Export specified scene objects to FBX format (single-file, unified mode).

    Batch-first: target_objects is Array<Text>. Empty means export all supported objects.
    source_manifest is Map from inspect_unified_mesh.manifest (1 combo -> 1 FBX).

    Args:
        output_path: Absolute destination path for the .fbx file.
        target_objects: List of object names to filter for export, e.g. ["Body_GND"]. Empty = all.
        preset_path: Optional path to FBX export preset script.
        source_manifest: Manifest dict from inspect_unified_mesh, e.g. {"asset_name": ..., "objects": {...}}.

    Returns:
        {
            "exported_fbx_path": str,
            "objects_count": int,
            "file_size": int,
            "metadata_update_map": {rel_fbx: metadata_json},  # 1 entry, feeds UpdateResourceMetadataTool.MetadataMap
            "exported_files": [str]
        }
    """
    targets = _normalize_target_list(target_objects)

    if not output_path:
        output_path = os.path.join(bpy.app.tempdir, "exported.fbx")

    # Ensure .fbx extension
    base, _ = os.path.splitext(output_path)
    output_path = base + ".fbx"
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # 1. Selection
    bpy.ops.object.select_all(action='DESELECT')
    selected_count = 0
    lowered = [t.lower() for t in targets]

    for obj in bpy.data.objects:
        # Match using name substring (case-insensitive) if target_objects specified
        if not lowered or any(t in obj.name.lower() for t in lowered):
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

    if targets:
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

    # 4. Build metadata_update_map (1 entry) for UpdateResourceMetadataTool
    # Key = rel_fbx posix (basename), value = enriched manifest JSON string.
    manifest = _unwrap_manifest(source_manifest)
    metadata_update_map: Dict[str, str] = {}
    if manifest:
        file_name = os.path.basename(output_path).replace("\\", "/")
        enriched = dict(manifest)
        enriched["export"] = {
            "file_name": file_name,
            "local_path": output_path,
            "file_size": file_size,
            "objects_count": selected_count,
        }
        try:
            metadata_update_map[file_name] = json.dumps(enriched, indent=2, ensure_ascii=False)
            print(f"[export_fbx] Built metadata_update_map with 1 entry ('{file_name}')", flush=True)
        except Exception as ex:
            print(f"[export_fbx] Warning: failed to serialize manifest: {ex}", flush=True)
    else:
        print("[export_fbx] No source_manifest provided, skipping metadata_update_map.", flush=True)

    return {
        "exported_fbx_path": output_path,
        "objects_count": selected_count,
        "file_size": file_size,
        "metadata_update_map": metadata_update_map,
        "exported_files": [output_path]
    }
