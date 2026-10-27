# pyrefly: ignore [missing-import]
import bpy
import os
import shutil
import hashlib
from typing import Dict, Any, List, Optional, Set, Tuple


def get_material_signature(mat: Optional[bpy.types.Material]) -> str:
    """
    Generate a structural hash signature for a material based on its shader node tree,
    connected texture filepaths, and core parameters to identify identical materials.
    """
    if not mat:
        return "EMPTY_SLOT"

    if not mat.use_nodes or not mat.node_tree:
        return f"BASIC_{mat.name}_{tuple(mat.diffuse_color)}"

    tokens: List[str] = []
    for node in sorted(mat.node_tree.nodes, key=lambda n: (n.type, n.name)):
        if node.type == 'TEX_IMAGE' and node.image:
            img_path = bpy.path.abspath(node.image.filepath) if node.image.filepath and hasattr(bpy, "path") else node.image.name
            colorspace = getattr(node.image.colorspace_settings, 'name', 'sRGB')
            tokens.append(f"TEX:{os.path.basename(img_path)}:{colorspace}")
        elif node.type == 'BSDF_PRINCIPLED':
            for input_name in ['Base Color', 'Roughness', 'Metallic', 'Normal', 'Alpha']:
                sock = node.inputs.get(input_name)
                if sock:
                    if sock.is_linked:
                        tokens.append(f"LINK:{input_name}:{sock.links[0].from_node.type}")
                    elif hasattr(sock, 'default_value'):
                        val = sock.default_value
                        if hasattr(val, '__iter__'):
                            tokens.append(f"VAL:{input_name}:{tuple(round(v, 3) for v in val)}")
                        elif isinstance(val, (int, float)):
                            tokens.append(f"VAL:{input_name}:{round(val, 3)}")

    for link in sorted(mat.node_tree.links, key=lambda l: (l.from_node.name, l.to_node.name)):
        tokens.append(f"{link.from_node.type}->{link.to_node.type}:{link.to_socket.name}")

    sig_str = "|".join(tokens)
    return hashlib.md5(sig_str.encode('utf-8')).hexdigest() if tokens else f"NAMED_{mat.name}"


def clean_unused_material_slots(obj: bpy.types.Object) -> int:
    """
    Remove material slots that are not assigned to any polygon on the mesh.
    Returns the number of slots removed.
    """
    if obj.type != 'MESH' or not obj.data or not obj.data.polygons or len(obj.data.materials) <= 1:
        return 0

    mesh = obj.data
    initial_slot_count = len(mesh.materials)
    used_indices = sorted({poly.material_index for poly in mesh.polygons if 0 <= poly.material_index < initial_slot_count})

    if len(used_indices) == initial_slot_count:
        return 0

    old_to_new = {old_idx: new_idx for new_idx, old_idx in enumerate(used_indices)}
    new_materials = [mesh.materials[i] for i in used_indices]

    for poly in mesh.polygons:
        poly.material_index = old_to_new.get(poly.material_index, 0)

    mesh.materials.clear()
    for mat in new_materials:
        mesh.materials.append(mat)

    return initial_slot_count - len(mesh.materials)


def merge_identical_material_slots(obj: bpy.types.Object) -> int:
    """
    Detect duplicate or identical materials on the same object and merge them into a single slot.
    Returns the number of duplicate slots consolidated.
    """
    if obj.type != 'MESH' or not obj.data or len(obj.data.materials) <= 1:
        return 0

    mesh = obj.data
    initial_count = len(mesh.materials)

    sig_to_target_slot: Dict[str, int] = {}
    remap: Dict[int, int] = {}

    for slot_idx, mat in enumerate(mesh.materials):
        if not mat:
            remap[slot_idx] = slot_idx
            continue

        sig = get_material_signature(mat)
        if sig not in sig_to_target_slot:
            sig_to_target_slot[sig] = slot_idx
            remap[slot_idx] = slot_idx
        else:
            target_slot = sig_to_target_slot[sig]
            remap[slot_idx] = target_slot

    if len(sig_to_target_slot) < initial_count:
        for poly in mesh.polygons:
            poly.material_index = remap.get(poly.material_index, poly.material_index)
        clean_unused_material_slots(obj)

    return initial_count - len(mesh.materials)


def localize_scene_textures(meshes: List[bpy.types.Object], output_dir: str = "") -> Tuple[int, str]:
    """Copy all textures used in materials to a local textures/ directory."""
    if not output_dir:
        base_dir = os.path.dirname(bpy.data.filepath) if hasattr(bpy, "data") and bpy.data.filepath else (getattr(bpy.app, "tempdir", ".") if hasattr(bpy, "app") else ".")
        output_dir = os.path.join(base_dir, "textures")

    output_dir = os.path.abspath(output_dir).replace("\\", "/")
    os.makedirs(output_dir, exist_ok=True)

    images: Set[bpy.types.Image] = set()
    def scan_tree(tree):
        if not tree:
            return
        for node in tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                images.add(node.image)
            elif node.type == 'GROUP' and node.node_tree:
                scan_tree(node.node_tree)

    for obj in meshes:
        if obj.type == 'MESH' and obj.data and obj.data.materials:
            for mat in obj.data.materials:
                if mat and mat.use_nodes and mat.node_tree:
                    scan_tree(mat.node_tree)

    copied_count = 0
    for img in images:
        raw_path = img.filepath or ""
        abs_src = bpy.path.abspath(raw_path) if raw_path and hasattr(bpy, "path") else raw_path
        if not abs_src or not os.path.isfile(abs_src):
            continue

        base_name = os.path.basename(abs_src)
        target_path = os.path.join(output_dir, base_name).replace("\\", "/")

        if os.path.normcase(abs_src) != os.path.normcase(target_path):
            try:
                shutil.copy2(abs_src, target_path)
                img.filepath = target_path
                copied_count += 1
            except Exception as ex:
                print(f"[merge_materials] Warning copying texture '{base_name}': {ex}", flush=True)

    return copied_count, output_dir


def main(
    target_objects: Optional[List[str]] = None,
    merge_identical: bool = True,
    clean_unused: bool = True,
    save_textures: bool = True,
    texture_output_dir: str = "",
    use_diffeomorphic: bool = True
) -> Dict[str, Any]:
    """
    Clean, consolidate material slots, and optionally localize textures to prepare scene for FBX export.

    Args:
        target_objects: Optional list of object names to process. If empty, processes all meshes in scene.
        merge_identical: Compare shader nodes and textures to merge equivalent material slots.
        clean_unused: Strip away material slots that have no polygons assigned.
        save_textures: Automatically copy all linked material textures into a local textures/ directory.
        texture_output_dir: Destination directory for textures (defaults to <blend_dir>/textures).
        use_diffeomorphic: Attempt to run Diffeomorphic's material merger if available for DAZ characters.

    Returns:
        {
            "objects_processed": int,
            "slots_before": int,
            "slots_after": int,
            "slots_removed": int,
            "textures_saved": int,
            "texture_folder": str
        }
    """
    filter_names: List[str] = []
    if target_objects:
        if isinstance(target_objects, str):
            filter_names = [x.strip().lower() for x in target_objects.split(",") if x.strip()]
        elif isinstance(target_objects, (list, tuple, set)):
            filter_names = [str(x).strip().lower() for x in target_objects if str(x).strip()]

    meshes = [
        obj for obj in getattr(bpy.data, "objects", [])
        if obj.type == 'MESH' and (not filter_names or any(name in obj.name.lower() for name in filter_names))
    ] if hasattr(bpy, "data") else []

    if not meshes:
        print("[merge_materials] No matching mesh objects found to process.", flush=True)
        return {
            "objects_processed": 0,
            "slots_before": 0,
            "slots_after": 0,
            "slots_removed": 0,
            "textures_saved": 0,
            "texture_folder": ""
        }

    print(f"[merge_materials] Cleaning {len(meshes)} mesh object(s)...", flush=True)
    total_slots_before = sum(len(obj.material_slots) for obj in meshes)

    # 1. Diffeomorphic merge operator if available & interactive
    diffeomorphic_ran = False
    is_headless = getattr(bpy.app, 'background', False) if hasattr(bpy, "app") else True
    if use_diffeomorphic and not is_headless and hasattr(bpy, "ops") and hasattr(bpy.ops, 'daz') and hasattr(bpy.ops.daz, 'merge_materials'):
        try:
            bpy.ops.object.select_all(action='DESELECT')
            for obj in meshes:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = meshes[0]
            if bpy.context.window_manager and bpy.context.window_manager.windows:
                window = bpy.context.window_manager.windows[0]
                override = {'window': window, 'screen': window.screen, 'active_object': meshes[0], 'selected_objects': meshes}
                with bpy.context.temp_override(**override):
                    res = bpy.ops.daz.merge_materials('EXEC_DEFAULT')
                    if 'FINISHED' in res:
                        print("[merge_materials] Diffeomorphic merge_materials executed successfully.", flush=True)
                        diffeomorphic_ran = True
        except Exception as ex:
            print(f"[merge_materials] Diffeomorphic merge skipped ({ex}), proceeding with native consolidation.", flush=True)

    # 2. Native Consolidation & Cleanup
    slots_removed_native = 0
    for obj in meshes:
        if hasattr(bpy, "context"):
            bpy.context.view_layer.objects.active = obj
        if merge_identical:
            slots_removed_native += merge_identical_material_slots(obj)
        if clean_unused:
            slots_removed_native += clean_unused_material_slots(obj)

    total_slots_after = sum(len(obj.material_slots) for obj in meshes)
    total_removed = total_slots_before - total_slots_after

    # 3. Localize Textures
    textures_saved = 0
    texture_folder = ""
    if save_textures:
        textures_saved, texture_folder = localize_scene_textures(meshes, texture_output_dir)
        print(f"[merge_materials] Localized {textures_saved} texture(s) to '{texture_folder}'.", flush=True)

    print(f"[merge_materials] Complete. Material slots reduced from {total_slots_before} to {total_slots_after} ({total_removed} removed).", flush=True)

    return {
        "objects_processed": len(meshes),
        "slots_before": total_slots_before,
        "slots_after": total_slots_after,
        "slots_removed": total_removed,
        "textures_saved": textures_saved,
        "texture_folder": texture_folder,
        "diffeomorphic_used": diffeomorphic_ran
    }
