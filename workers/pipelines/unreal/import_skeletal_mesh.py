# pyrefly: ignore [missing-import]
"""
Unreal Engine Pipeline Script: Batch Skeletal Mesh Importer
Runs inside Unreal Engine via Python API (Unreal Engine 5.x) or Agent Worker Dry-Run.

Imports one or multiple FBX geometry files as Skeletal Meshes sharing a common Skeleton.
Returns a clean dictionary mapping each mesh name directly to its imported UAsset path.
"""

import os
import sys
from typing import Dict, Any, List, Optional, Union, Tuple

try:
    import unreal
    HAS_UNREAL = True
except ImportError:
    unreal = None
    HAS_UNREAL = False


def _clean_ue_path(path: str) -> str:
    """Ensure Unreal Engine package path starts with / and uses forward slashes."""
    if not path:
        return ""
    path = path.strip().replace("\\", "/")
    if not path.startswith("/"):
        path = "/" + path
    return path.rstrip("/")


def sanitize_asset_name(name: str) -> str:
    """Sanitize string for Unreal Engine asset naming convention."""
    for ch in [" ", "-", ".", ":", "/", "\\", "(", ")", "[", "]"]:
        name = name.replace(ch, "_")
    while "__" in name:
        name = name.replace("__", "_")
    return name.strip("_")


def extract_mesh_slot_names(mesh_asset) -> List[str]:
    """Extract list of material slot names from a SkeletalMesh asset."""
    if not HAS_UNREAL or not mesh_asset:
        return []

    slot_names = []
    materials_list = getattr(mesh_asset, "materials", None)
    if materials_list:
        for item in materials_list:
            name = str(item.material_slot_name) if hasattr(item, "material_slot_name") else ""
            if name:
                slot_names.append(name)

    return slot_names


def import_with_interchange(
    fbx_path: str,
    destination_path: str,
    mesh_name: str,
    pipeline_preset_path: str = ""
) -> Optional[str]:
    """Import asset using UE5 Interchange Manager with an optional Pipeline Preset Asset."""
    if not pipeline_preset_path or not hasattr(unreal, "InterchangeManager"):
        return None

    try:
        interchange_mgr = None
        if hasattr(unreal.InterchangeManager, "get_interchange_manager"):
            interchange_mgr = unreal.InterchangeManager.get_interchange_manager()
        elif hasattr(unreal, "get_editor_subsystem"):
            subsystem_cls = getattr(unreal, "InterchangeEditorManager", None) or getattr(unreal, "InterchangeManager", None)
            if subsystem_cls:
                interchange_mgr = unreal.get_editor_subsystem(subsystem_cls)

        if not interchange_mgr:
            return None

        source_data = None
        if hasattr(unreal, "InterchangeSourceData"):
            source_data = unreal.InterchangeSourceData()
            source_data.set_filename(os.path.abspath(fbx_path))

        if not source_data:
            return None

        import_params = unreal.ImportAssetParameters()
        import_params.is_automated = True

        pipeline_asset = unreal.EditorAssetLibrary.load_asset(pipeline_preset_path)
        if pipeline_asset:
            import_params.override_pipelines.append(pipeline_asset)
            print(f"[import_skeletal_mesh] Using Interchange Pipeline Preset: '{pipeline_preset_path}'", flush=True)

        success = interchange_mgr.import_asset(destination_path, source_data, import_params)
        if success:
            target_path = f"{destination_path}/{mesh_name}"
            if unreal.EditorAssetLibrary.does_asset_exist(target_path):
                return target_path
            base_name = os.path.splitext(os.path.basename(fbx_path))[0]
            alt_path = f"{destination_path}/{base_name}"
            if unreal.EditorAssetLibrary.does_asset_exist(alt_path):
                if alt_path != target_path:
                    unreal.EditorAssetLibrary.rename_asset(alt_path, target_path)
                return target_path
    except Exception as ex:
        print(f"[import_skeletal_mesh] Interchange import error: {ex}. Falling back to FBX importer.", flush=True)

    return None


def import_with_fbx_fallback(
    fbx_path: str,
    destination_path: str,
    mesh_name: str,
    skeleton_path: str = ""
) -> Optional[str]:
    """Fallback import using standard AssetImportTask and FbxImportUI."""
    try:
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", os.path.abspath(fbx_path))
        task.set_editor_property("destination_path", destination_path)
        task.set_editor_property("destination_name", mesh_name)
        task.set_editor_property("replace_existing", True)
        task.set_editor_property("automated", True)
        task.set_editor_property("save", True)

        fbx_options = unreal.FbxImportUI()
        fbx_options.set_editor_property("import_mesh", True)
        fbx_options.set_editor_property("import_as_skeletal", True)
        fbx_options.set_editor_property("import_materials", False)
        fbx_options.set_editor_property("import_textures", False)
        fbx_options.set_editor_property("create_physics_asset", False)

        if skeleton_path:
            if unreal.EditorAssetLibrary.does_asset_exist(skeleton_path):
                skeleton_obj = unreal.EditorAssetLibrary.load_asset(skeleton_path)
                fbx_options.skeleton = skeleton_obj
                print(f"[import_skeletal_mesh] Successfully associated Skeleton: '{skeleton_path}'", flush=True)
            else:
                print(f"[import_skeletal_mesh] Warning: Skeleton '{skeleton_path}' not found. New skeleton will be created.", flush=True)

        if hasattr(fbx_options, "skeletal_mesh_import_data") and fbx_options.skeletal_mesh_import_data:
            try:
                if hasattr(unreal, "FBXImportContentType"):
                    fbx_options.skeletal_mesh_import_data.set_editor_property(
                        "import_content_type", unreal.FBXImportContentType.FBXIT_GEOMETRY_AND_SKINNING
                    )
                if hasattr(unreal, "FBXNormalImportMethod"):
                    fbx_options.skeletal_mesh_import_data.set_editor_property(
                        "normal_import_method", unreal.FBXNormalImportMethod.FBXNIM_COMPUTE_NORMALS
                    )
            except Exception:
                pass

        task.set_editor_property("options", fbx_options)

        asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
        asset_tools.import_asset_tasks([task])

        target_path = f"{destination_path}/{mesh_name}"
        if unreal.EditorAssetLibrary.does_asset_exist(target_path):
            print(f"[import_skeletal_mesh] Successfully imported Skeletal Mesh to: '{target_path}'", flush=True)
            return target_path
        else:
            print(f"[import_skeletal_mesh] Warning: Asset does not exist at '{target_path}' after import task.", flush=True)
            return None
    except Exception as ex:
        print(f"[import_skeletal_mesh] FBX import error: {ex}", flush=True)
        return None


def _normalize_input_items(
    fbx_files: Optional[Union[str, List[str], Dict[str, str]]],
    fbx_path: Optional[str],
    mesh_name: str
) -> List[Tuple[str, str]]:
    """Normalize input representations into a list of (mesh_name, file_path)."""
    items: List[Tuple[str, str]] = []

    raw = fbx_files if fbx_files is not None else fbx_path
    if not raw:
        return items

    if isinstance(raw, dict):
        for k, v in raw.items():
            if v and isinstance(v, str):
                name = str(k).strip()
                items.append((name, v.strip()))
    elif isinstance(raw, list):
        for p in raw:
            if isinstance(p, str) and p.strip():
                p_clean = p.strip()
                name = os.path.splitext(os.path.basename(p_clean))[0]
                items.append((name, p_clean))
    elif isinstance(raw, str):
        raw_clean = raw.strip()
        if raw_clean:
            name = mesh_name.strip() if mesh_name else os.path.splitext(os.path.basename(raw_clean))[0]
            items.append((name, raw_clean))

    return items


def main(
    fbx_files: Optional[Union[str, List[str], Dict[str, str]]] = None,
    destination_path: str = "/Game/Meshes",
    skeleton_path: str = "",
    pipeline_preset_path: str = "",
    mesh_name: str = "",
    fbx_path: Optional[str] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Import one or multiple FBX files as Skeletal Meshes sharing a common Skeleton.

    Args:
        fbx_files: Single path, list of paths, or dict { "mesh_name": "file_path" }.
        destination_path: Unreal package destination path (e.g. /Game/Characters/Eva/Meshes).
        skeleton_path: Shared Skeleton asset path in Unreal Engine.
        pipeline_preset_path: Optional Interchange Pipeline Preset UAsset path.
        mesh_name: Optional override name if importing a single file.
        fbx_path: Backward compatibility alias for single file import.

    Returns:
        Dictionary with:
            - mesh_paths: Dict[mesh_name, uasset_path]
            - all_mesh_paths: List of all imported UAsset paths
            - material_slots: Dict[mesh_name, List[slot_names]]
            - mesh_uasset_path: First imported mesh path (for single-item backward compatibility)
            - material_slot_names: First imported mesh material slots (for backward compatibility)
    """
    destination_path = _clean_ue_path(destination_path or "/Game/Meshes")
    skeleton_path = _clean_ue_path(skeleton_path) if skeleton_path else ""
    pipeline_preset_path = _clean_ue_path(pipeline_preset_path) if pipeline_preset_path else ""
    items = _normalize_input_items(fbx_files, fbx_path, mesh_name)

    if not items:
        print("[import_skeletal_mesh] Warning: No FBX files provided for import.", flush=True)
        return {
            "mesh_paths": {},
            "all_mesh_paths": [],
            "material_slots": {},
            "mesh_uasset_path": "",
            "material_slot_names": []
        }

    print(f"[import_skeletal_mesh] Batch importing {len(items)} mesh(es) into '{destination_path}' (Skeleton: '{skeleton_path or 'Auto-Create'}')...", flush=True)

    mesh_paths: Dict[str, str] = {}
    material_slots: Dict[str, List[str]] = {}
    all_mesh_paths: List[str] = []

    for raw_item_name, file_path in items:
        clean_mesh_name = sanitize_asset_name(raw_item_name)
        target_uasset_path = f"{destination_path}/{clean_mesh_name}"

        if not os.path.isfile(file_path):
            print(f"[import_skeletal_mesh] Error: File not found: {file_path}", flush=True)
            continue

        if not HAS_UNREAL:
            # Dry-run simulation mode
            mesh_paths[raw_item_name] = target_uasset_path
            mesh_paths[clean_mesh_name] = target_uasset_path
            material_slots[raw_item_name] = [f"M_{clean_mesh_name}"]
            material_slots[clean_mesh_name] = [f"M_{clean_mesh_name}"]
            all_mesh_paths.append(target_uasset_path)
            print(f"[import_skeletal_mesh] [Dry-Run] Simulated import '{clean_mesh_name}' -> '{target_uasset_path}'", flush=True)
            continue

        # 1. Attempt Interchange import
        imported_path = import_with_interchange(file_path, destination_path, clean_mesh_name, pipeline_preset_path)

        # 2. Fallback to standard FBX import task
        if not imported_path:
            imported_path = import_with_fbx_fallback(file_path, destination_path, clean_mesh_name, skeleton_path)

        if imported_path and unreal.EditorAssetLibrary.does_asset_exist(imported_path):
            mesh_asset = unreal.EditorAssetLibrary.load_asset(imported_path)
            slots = extract_mesh_slot_names(mesh_asset)

            mesh_paths[raw_item_name] = imported_path
            mesh_paths[clean_mesh_name] = imported_path
            material_slots[raw_item_name] = slots
            material_slots[clean_mesh_name] = slots
            all_mesh_paths.append(imported_path)
            print(f"[import_skeletal_mesh] Successfully imported '{clean_mesh_name}' -> '{imported_path}' (Slots: {slots})", flush=True)
        else:
            print(f"[import_skeletal_mesh] Failed to import '{clean_mesh_name}' from '{file_path}'", flush=True)

    first_mesh = all_mesh_paths[0] if all_mesh_paths else ""
    first_slots = material_slots.get(items[0][0], []) if items else []

    return {
        "mesh_paths": mesh_paths,
        "all_mesh_paths": all_mesh_paths,
        "material_slots": material_slots,
        "mesh_uasset_path": first_mesh,
        "material_slot_names": first_slots
    }


if __name__ == "__main__":
    print("This script is designed to run via ue_stage_runner.py inside Unreal Engine.")
