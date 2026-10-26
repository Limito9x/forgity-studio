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


def import_fbx_skeletal_mesh(
    fbx_path: str,
    destination_path: str,
    mesh_name: str,
    skeleton_path: str = ""
) -> Optional[str]:
    """Standard FBX Skeletal Mesh import using Unreal AssetImportTask and FbxImportUI."""
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
    fbx_files: Union[List[str], str, Dict[str, Any]],
    folder_path: str = "",
    mesh_name: str = ""
) -> List[Tuple[str, str]]:
    """Normalize input representations into a clean list of (mesh_name, file_path)."""
    items: List[Tuple[str, str]] = []
    if not fbx_files:
        return items

    def _resolve_path(p: str) -> str:
        p_clean = p.strip()
        if folder_path and not os.path.isabs(p_clean):
            candidate = os.path.normpath(os.path.join(folder_path, p_clean)).replace("\\", "/")
            if os.path.isfile(candidate):
                return candidate
            return candidate
        return p_clean

    if isinstance(fbx_files, list):
        for p in fbx_files:
            if isinstance(p, str) and p.strip():
                p_clean = _resolve_path(p)
                name = os.path.splitext(os.path.basename(p_clean))[0]
                items.append((name, p_clean))
            elif isinstance(p, dict):
                path_val = p.get("file_path") or p.get("relative_path") or p.get("path")
                if path_val and isinstance(path_val, str):
                    name = p.get("asset_name") or os.path.splitext(os.path.basename(path_val))[0]
                    items.append((str(name).strip(), _resolve_path(path_val)))
    elif isinstance(fbx_files, dict):
        for k, v in fbx_files.items():
            if isinstance(v, str) and v.strip():
                name = str(k).strip()
                items.append((name, _resolve_path(v)))
            elif isinstance(v, dict):
                p = v.get("file_path") or v.get("relative_path") or v.get("path")
                if p and isinstance(p, str):
                    name = v.get("asset_name") or str(k).strip()
                    items.append((str(name).strip(), _resolve_path(p)))
    elif isinstance(fbx_files, str):
        raw_clean = _resolve_path(fbx_files)
        if raw_clean:
            name = mesh_name.strip() if mesh_name else os.path.splitext(os.path.basename(raw_clean))[0]
            items.append((name, raw_clean))

    return items


def main(
    fbx_files: List[str],
    destination_path: str = "/Game/Meshes",
    skeleton_path: str = "",
    **kwargs
) -> Dict[str, Any]:
    """
    Batch import FBX geometry files as Skeletal Meshes sharing an optional common Skeleton.

    Args:
        fbx_files: List of absolute file paths to FBX assets (e.g. ["D:/Exports/Top.fbx", "D:/Exports/Pants.fbx"]).
        destination_path: Unreal package destination path (e.g. /Game/Characters/Eva/Meshes).
        skeleton_path: Optional shared Skeleton asset path in Unreal Engine (e.g. /Game/Characters/Common/SK_Skeleton).

    Returns:
        Dictionary with:
            - mesh_paths: List[str] of imported UAsset paths (e.g. ["/Game/.../Top", "/Game/.../Pants"]).
            - material_slots: Dict[str, List[str]] mapping each mesh name to its material slot names.
    """
    destination_path = _clean_ue_path(destination_path or "/Game/Meshes")
    skeleton_path = _clean_ue_path(skeleton_path) if skeleton_path else ""
    folder_path = kwargs.get("folder_path") or kwargs.get("root_path") or ""
    mesh_name = kwargs.get("mesh_name", "")
    raw_input = fbx_files if fbx_files is not None else kwargs.get("fbx_path")
    items = _normalize_input_items(raw_input, folder_path, mesh_name)

    if not items:
        print("[import_skeletal_mesh] Warning: No FBX files provided for import.", flush=True)
        return {
            "mesh_paths": [],
            "material_slots": {}
        }

    print(f"[import_skeletal_mesh] Batch importing {len(items)} mesh(es) into '{destination_path}' (Skeleton: '{skeleton_path or 'Auto-Create'}')...", flush=True)

    mesh_map: Dict[str, str] = {}
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
            mesh_map[raw_item_name] = target_uasset_path
            mesh_map[clean_mesh_name] = target_uasset_path
            material_slots[raw_item_name] = [f"M_{clean_mesh_name}"]
            material_slots[clean_mesh_name] = [f"M_{clean_mesh_name}"]
            all_mesh_paths.append(target_uasset_path)
            print(f"[import_skeletal_mesh] [Dry-Run] Simulated import '{clean_mesh_name}' -> '{target_uasset_path}'", flush=True)
            continue

        imported_path = import_fbx_skeletal_mesh(file_path, destination_path, clean_mesh_name, skeleton_path)

        if imported_path and unreal.EditorAssetLibrary.does_asset_exist(imported_path):
            mesh_asset = unreal.EditorAssetLibrary.load_asset(imported_path)
            slots = extract_mesh_slot_names(mesh_asset)

            mesh_map[raw_item_name] = imported_path
            mesh_map[clean_mesh_name] = imported_path
            material_slots[raw_item_name] = slots
            material_slots[clean_mesh_name] = slots
            all_mesh_paths.append(imported_path)
            print(f"[import_skeletal_mesh] Successfully imported '{clean_mesh_name}' -> '{imported_path}' (Slots: {slots})", flush=True)
        else:
            print(f"[import_skeletal_mesh] Failed to import '{clean_mesh_name}' from '{file_path}'", flush=True)

    first_mesh = all_mesh_paths[0] if all_mesh_paths else ""
    first_slots = material_slots.get(items[0][0], []) if items else []

    return {
        "mesh_paths": all_mesh_paths,
        "material_slots": material_slots
    }


if __name__ == "__main__":
    print("This script is designed to run via ue_stage_runner.py inside Unreal Engine.")
