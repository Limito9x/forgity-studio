# pyrefly: ignore [missing-import]
"""
Streamlined Headless Mesh Baker for DAZ Studio & Blender (FBX_COMPATIBLE Standard)
Runs inside Blender 4.x / 5.x Python or Agent Worker Dry-Run.

Optimized for FBX_COMPATIBLE Diffeomorphic Materials (Principled BSDF Core):
  - Eliminates 800+ lines of legacy Diffeomorphic group node traversal.
  - Supports 'body_only' bake mode: preserves Head 4K texture/UV, bakes only Body (Torso+Arms+Legs).
  - High-speed 1-sample Cycles Emission routing for BaseColor and Roughness.
  - Native Cycles Tangent-Space Normal baking with optional DirectX Y- inversion.
  - Optional zero-overhead ORM channel packing.
  - Restores preserved slots (Head, Eyes, Mouth, Teeth) untouched.
"""

import os
import sys
import math
from typing import Dict, Any, List, Optional, Tuple, Literal

BakeModeType = Literal["body_only", "head_and_body", "all_in_one"]
PackModeType = Literal["none", "ORM"]
NormalFormatType = Literal["opengl", "directx"]

try:
    import bpy
    HAS_BPY = True
except ImportError:
    bpy = None
    HAS_BPY = False

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    np = None
    HAS_NUMPY = False


# Slot classification keywords
HEAD_KW = ["head", "face", "ear", "lip", "neck"]
BODY_KW = ["body", "torso", "arm", "leg", "limb", "skin", "nail", "hand", "foot"]
EXCLUDE_KW = ["eye", "cornea", "sclera", "iris", "tear", "lash", "eyelash", "mouth", "teeth", "tooth", "tongue"]


def _safe_stem(name: str) -> str:
    for ch in [" ", "-", ".", ":", "/", "\\", "(", ")", "[", "]"]:
        name = name.replace(ch, "_")
    while "__" in name:
        name = name.replace("__", "_")
    return name.strip("_")


def categorize_mesh_slots(obj: Any, bake_mode: str) -> Tuple[List[Dict[str, Any]], List[Tuple[int, Any]]]:
    """
    Categorizes object's material slots into bake groups and preserved slots.
    """
    mesh = obj.data
    head_slots: List[Tuple[int, Any]] = []
    body_slots: List[Tuple[int, Any]] = []
    preserved_slots: List[Tuple[int, Any]] = []

    for idx, slot in enumerate(obj.material_slots):
        mat = slot.material
        if not mat or not mat.use_nodes or not mat.node_tree:
            continue
        m_lower = mat.name.lower()

        if any(k in m_lower for k in EXCLUDE_KW):
            preserved_slots.append((idx, mat))
        elif any(k in m_lower for k in HEAD_KW):
            head_slots.append((idx, mat))
        elif any(k in m_lower for k in BODY_KW):
            body_slots.append((idx, mat))
        else:
            body_slots.append((idx, mat))

    head_slot_set = {s[0] for s in head_slots}
    body_slot_set = {s[0] for s in body_slots}
    head_polys = [p.index for p in mesh.polygons if p.material_index in head_slot_set]
    body_polys = [p.index for p in mesh.polygons if p.material_index in body_slot_set]

    bake_groups: List[Dict[str, Any]] = []

    if bake_mode == "body_only":
        # Preserve Head completely (native DAZ texture/UV), bake only Body
        for s in head_slots:
            preserved_slots.append(s)
        if body_slots:
            bake_groups.append({
                "name": "Body",
                "mats": [s[1] for s in body_slots],
                "slot_indices": [s[0] for s in body_slots],
                "poly_indices": body_polys,
                "should_pack": True,
            })
    elif bake_mode == "head_and_body" and head_slots and body_slots:
        bake_groups.append({
            "name": "Head",
            "mats": [s[1] for s in head_slots],
            "slot_indices": [s[0] for s in head_slots],
            "poly_indices": head_polys,
            "should_pack": len(head_slots) > 1,
        })
        bake_groups.append({
            "name": "Body",
            "mats": [s[1] for s in body_slots],
            "slot_indices": [s[0] for s in body_slots],
            "poly_indices": body_polys,
            "should_pack": True,
        })
    else:
        combined_slots = head_slots + body_slots
        combined_polys = head_polys + body_polys
        if combined_slots:
            bake_groups.append({
                "name": "",
                "mats": [s[1] for s in combined_slots],
                "slot_indices": [s[0] for s in combined_slots],
                "poly_indices": combined_polys,
                "should_pack": len(combined_slots) > 1,
            })

    return bake_groups, preserved_slots


def ensure_bake_uv(obj: Any, uv_name: str, margin: float, bake_groups: List[Dict[str, Any]]) -> str:
    """Creates intermediate bake UV layer and packs islands for multi-slot groups."""
    mesh = obj.data
    uvs = mesh.uv_layers

    if bpy.context.mode != 'OBJECT':
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass

    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    orig_uv_name = uvs.active.name if uvs.active else "UVMap"

    if uv_name in uvs:
        try:
            uvs.remove(uvs[uv_name])
        except Exception:
            pass

    src_layer = uvs[orig_uv_name]
    new_layer = uvs.new(name=uv_name)
    try:
        src = src_layer.data
        dst = new_layer.data
        for i in range(len(src)):
            u, v = src[i].uv
            dst[i].uv = (u - math.floor(u), v - math.floor(v))
    except Exception as ex:
        print(f"[bake_mesh:uv] Notice copying UV: {ex}", flush=True)

    uvs.active = new_layer
    pack_margin = max(float(margin or 0.01), 0.01)

    for grp in bake_groups:
        if not grp.get("should_pack"):
            continue
        poly_indices = grp.get("poly_indices", [])
        if not poly_indices:
            continue

        try:
            if bpy.context.mode != 'OBJECT':
                bpy.ops.object.mode_set(mode='OBJECT')
            for p in mesh.polygons:
                p.select = (p.index in poly_indices)
            bpy.ops.object.mode_set(mode='EDIT')
            try:
                bpy.ops.uv.pack_islands(margin=pack_margin, shape_method='AABB', rotate=False)
            except TypeError:
                bpy.ops.uv.pack_islands(margin=pack_margin)
        except Exception as ex:
            print(f"[bake_mesh:uv] Warning packing group '{grp.get('name')}': {ex}", flush=True)
        finally:
            if bpy.context.mode != 'OBJECT':
                try:
                    bpy.ops.object.mode_set(mode='OBJECT')
                except Exception:
                    pass

    for p in mesh.polygons:
        p.select = False

    return orig_uv_name


def setup_cycles():
    """Configures Cycles for ultra-fast, zero-overhead 1 spp baking."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    cycles = scene.cycles
    cycles.samples = 1
    cycles.use_adaptive_sampling = False
    cycles.use_denoising = False
    cycles.max_bounces = 0
    cycles.diffuse_bounces = 0
    cycles.glossy_bounces = 0
    cycles.transmission_bounces = 0
    cycles.volume_bounces = 0
    cycles.transparent_max_bounces = 0
    scene.render.bake.margin = 32
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_selected_to_active = False


def bake_channel(
    materials: List[Any],
    map_type: str,
    target_image: Any,
    uv_name: str
):
    """
    Bakes a single map ('diffuse', 'roughness', 'normal') using standard Principled BSDF.
    """
    temp_nodes = []

    for mat in materials:
        if not mat or not mat.use_nodes or not mat.node_tree:
            continue
        tree = mat.node_tree
        nodes, links = tree.nodes, tree.links

        # Find Principled BSDF
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        out_node = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if not bsdf or not out_node:
            continue

        # Target image node for baking
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.name = "__BakeTarget__"
        tex_node.image = target_image

        uv_node = nodes.new(type='ShaderNodeUVMap')
        uv_node.name = "__BakeUV__"
        uv_node.uv_map = uv_name
        links.new(uv_node.outputs['UV'], tex_node.inputs['Vector'])

        # Active & selected for Cycles bake target
        for n in nodes:
            n.select = False
        tex_node.select = True
        nodes.active = tex_node

        routing_state = None

        if map_type in ("diffuse", "roughness"):
            socket_name = "Base Color" if map_type == "diffuse" else "Roughness"
            in_sock = bsdf.inputs.get(socket_name)
            surface_in = out_node.inputs.get('Surface')

            if in_sock and surface_in:
                orig_link = surface_in.links[0].from_socket if surface_in.is_linked else None
                emit_node = nodes.new(type='ShaderNodeEmission')
                emit_node.name = "__BakeEmit__"
                emit_node.inputs['Strength'].default_value = 1.0

                if in_sock.is_linked:
                    links.new(in_sock.links[0].from_socket, emit_node.inputs['Color'])
                else:
                    def_val = in_sock.default_value
                    if isinstance(def_val, (int, float)):
                        emit_node.inputs['Color'].default_value = (float(def_val), float(def_val), float(def_val), 1.0)
                    elif hasattr(def_val, '__len__') and len(def_val) >= 3:
                        emit_node.inputs['Color'].default_value = (def_val[0], def_val[1], def_val[2], 1.0)

                links.new(emit_node.outputs['Emission'], surface_in)
                routing_state = (emit_node, orig_link, surface_in)

        temp_nodes.append((mat, tex_node, uv_node, routing_state))

    # Execute bake
    if map_type == "normal":
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    else:
        bpy.ops.object.bake(type='EMIT')

    # Cleanup temp nodes and restore original shader wiring
    for mat, tex_node, uv_node, routing_state in temp_nodes:
        tree = mat.node_tree
        nodes, links = tree.nodes, tree.links
        if tex_node and tex_node.name in nodes:
            nodes.remove(tex_node)
        if uv_node and uv_node.name in nodes:
            nodes.remove(uv_node)

        if routing_state:
            emit_node, orig_link, surface_in = routing_state
            if emit_node and emit_node.name in nodes:
                nodes.remove(emit_node)
            if orig_link and orig_link.node in nodes.values():
                links.new(orig_link, surface_in)


def flip_normal_green_inplace(img: Any):
    """Inverts Green channel (Y-) for DirectX normal map standard using NumPy."""
    if not HAS_NUMPY or not img:
        return
    pixels = np.array(img.pixels[:], dtype=np.float32)
    pixels[1::4] = 1.0 - pixels[1::4]
    img.pixels = pixels.tolist()


def pack_orm_texture(output_path: str, rough_img: Any, resolution: int):
    """Packs discrete Roughness into ORM texture (R=AO:1.0, G=Roughness, B=Metallic:0.0)."""
    if not HAS_NUMPY or not rough_img:
        return
    r_pixels = np.array(rough_img.pixels[:], dtype=np.float32)
    orm = np.ones((resolution * resolution, 4), dtype=np.float32)
    # Red: AO = 1.0 (already 1.0)
    # Green: Roughness
    orm[:, 1] = r_pixels[0::4]
    # Blue: Metallic = 0.0
    orm[:, 2] = 0.0
    # Alpha: 1.0
    orm[:, 3] = 1.0

    orm_img = bpy.data.images.new(name="Temp_ORM", width=resolution, height=resolution, alpha=False, float_buffer=False)
    orm_img.colorspace_settings.name = 'Non-Color'
    orm_img.pixels = orm.flatten().tolist()
    orm_img.filepath_raw = output_path
    orm_img.file_format = 'PNG'
    orm_img.save()
    bpy.data.images.remove(orm_img)


def create_baked_material(mat_name: str, grp_maps: Dict[str, str], uv_name: str) -> Any:
    """Constructs a single baked Principled BSDF material."""
    mat = bpy.data.materials.new(name=mat_name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()

    out_node = nodes.new(type='ShaderNodeOutputMaterial')
    out_node.location = (300, 0)
    bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    links.new(bsdf.outputs['BSDF'], out_node.inputs['Surface'])

    uv_node = nodes.new(type='ShaderNodeUVMap')
    uv_node.location = (-700, -150)
    uv_node.uv_map = uv_name

    x_offset = -400
    for map_type, file_path in grp_maps.items():
        if not file_path or not os.path.isfile(file_path):
            continue
        img = bpy.data.images.load(file_path)
        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.image = img
        links.new(uv_node.outputs['UV'], tex_node.inputs['Vector'])

        if map_type == "diffuse":
            img.colorspace_settings.name = 'sRGB'
            tex_node.location = (x_offset, 250)
            links.new(tex_node.outputs['Color'], bsdf.inputs['Base Color'])
        elif map_type == "roughness":
            img.colorspace_settings.name = 'Non-Color'
            tex_node.location = (x_offset, -150)
            links.new(tex_node.outputs['Color'], bsdf.inputs['Roughness'])
        elif map_type == "normal":
            img.colorspace_settings.name = 'Non-Color'
            tex_node.location = (x_offset - 250, -500)
            norm_node = nodes.new(type='ShaderNodeNormalMap')
            norm_node.location = (x_offset, -500)
            links.new(tex_node.outputs['Color'], norm_node.inputs['Color'])
            links.new(norm_node.outputs['Normal'], bsdf.inputs['Normal'])

    return mat


def apply_baked_materials(
    obj: Any,
    bake_groups: List[Dict[str, Any]],
    all_baked_maps: Dict[str, Dict[str, str]],
    preserved_slots: List[Tuple[int, Any]],
    uv_name: str
) -> List[str]:
    """
    Applies all baked materials and preserves existing materials in a single atomic pass.
    Prevents subsequent bake groups from wiping out earlier material slots.
    """
    mesh = obj.data
    new_materials = []
    poly_map: Dict[int, int] = {}
    updated_mat_names = []

    # 1. Assign all baked groups
    for grp in bake_groups:
        grp_name = grp["name"] or "Main"
        grp_stem = f"{_safe_stem(obj.name)}_{grp_name}" if grp_name != "Main" else _safe_stem(obj.name)
        grp_maps = all_baked_maps.get(grp_stem, {})
        mat_name = f"M_{grp_stem}"

        mat = create_baked_material(mat_name, grp_maps, uv_name)
        new_slot_idx = len(new_materials)
        new_materials.append(mat)
        updated_mat_names.append(mat_name)

        for p_idx in grp.get("poly_indices", []):
            poly_map[p_idx] = new_slot_idx

    # 2. Preserve unbaked slots (e.g. Head in body_only mode)
    for old_slot_idx, orig_mat in preserved_slots:
        new_slot_idx = len(new_materials)
        new_materials.append(orig_mat)
        for p in mesh.polygons:
            if p.material_index == old_slot_idx:
                poly_map[p.index] = new_slot_idx

    # 3. Atomically replace mesh materials
    mesh.materials.clear()
    for m in new_materials:
        mesh.materials.append(m)

    for p in mesh.polygons:
        if p.index in poly_map:
            p.material_index = poly_map[p.index]

    return updated_mat_names


def main(
    target_objects: Optional[List[str]] = None,
    bake_mode: BakeModeType = "body_only",
    resolution: int = 4096,
    pack_mode: PackModeType = "none",
    normal_format: NormalFormatType = "opengl",
    uv_name: str = "UVMap_Baked",
    margin: float = 0.01,
    output_dir: str = "",
    dry_run: bool = False,
    **kwargs
) -> Dict[str, Any]:
    """
    Main orchestration entry point for Mesh Baking.

    Inputs:
      - target_objects: Target mesh names (auto-select figure if omitted).
      - bake_mode: 'body_only' (preserves Head, bakes Body), 'head_and_body', or 'all_in_one'.
      - resolution: Bake texture resolution (default 4096).
      - pack_mode: 'none' (discrete maps) or 'ORM'.
      - normal_format: 'opengl' (Y+) or 'directx' (Y-).
      - uv_name: Intermediate UV layer name (default 'UVMap_Baked').
      - margin: UV island pack padding margin.
      - output_dir: Destination folder for baked textures.
      - dry_run: Simulate baking without modifying Blender scene.

    Outputs:
      - status: "SUCCESS" or "SKIPPED".
      - applied_objects: List of processed mesh names.
      - baked_files: List of generated texture image paths.
      - baked_maps: Grouped dictionary of baked texture paths.
      - updated_materials: List of newly created baked materials.
      - count: Total processed meshes.
      - summary: Human-readable execution summary.
    """
    if dry_run or not HAS_BPY:
        summary = f"[DryRun] Simulated baking mode '{bake_mode}' (resolution={resolution}, pack={pack_mode})."
        print(summary, flush=True)
        return {
            "status": "SUCCESS",
            "applied_objects": target_objects or ["Character_Mesh"],
            "baked_files": [f"Body_BaseColor.png", f"Body_Roughness.png", f"Body_Normal.png"],
            "baked_maps": {"Body": {"diffuse": "Body_BaseColor.png", "roughness": "Body_Roughness.png", "normal": "Body_Normal.png"}},
            "updated_materials": ["M_Body"],
            "count": 1,
            "summary": summary
        }

    # Resolve target meshes
    meshes = []
    if target_objects:
        for t_name in target_objects:
            obj = bpy.data.objects.get(t_name)
            if obj and obj.type == 'MESH':
                meshes.append(obj)
    if not meshes:
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.visible_get() and not o.name.startswith("Armature")]

    if not meshes:
        return {
            "status": "SKIPPED",
            "applied_objects": [],
            "baked_files": [],
            "baked_maps": {},
            "updated_materials": [],
            "count": 0,
            "summary": "No target meshes found."
        }

    if not output_dir:
        blend_file = bpy.data.filepath
        base_dir = os.path.dirname(blend_file) if blend_file else bpy.app.tempdir
        output_dir = os.path.join(base_dir, "baked_textures")
    os.makedirs(output_dir, exist_ok=True)

    setup_cycles()

    applied_objects = []
    all_baked_files = []
    all_baked_maps = {}
    updated_materials = []

    for obj in meshes:
        bake_groups, preserved_slots = categorize_mesh_slots(obj, bake_mode)
        if not bake_groups:
            continue

        print(f"[bake_mesh] '{obj.name}' -> {len(bake_groups)} group(s), {len(preserved_slots)} preserved slot(s)", flush=True)
        orig_uv_name = ensure_bake_uv(obj, uv_name, margin, bake_groups)

        if bpy.context.mode != 'OBJECT':
            try:
                bpy.ops.object.mode_set(mode='OBJECT')
            except Exception:
                pass
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        for grp in bake_groups:
            grp_name = grp["name"] or "Main"
            grp_stem = f"{_safe_stem(obj.name)}_{grp_name}" if grp_name != "Main" else _safe_stem(obj.name)
            grp_maps = {}

            # Bake Diffuse (BaseColor)
            diff_img = bpy.data.images.new(f"Bake_{grp_stem}_BaseColor", resolution, resolution, alpha=True)
            bake_channel(grp["mats"], "diffuse", diff_img, uv_name)
            diff_path = os.path.join(output_dir, f"{grp_stem}_BaseColor.png")
            diff_img.filepath_raw = diff_path
            diff_img.file_format = 'PNG'
            diff_img.save()
            grp_maps["diffuse"] = diff_path
            all_baked_files.append(diff_path)

            # Bake Roughness
            rough_img = bpy.data.images.new(f"Bake_{grp_stem}_Roughness", resolution, resolution, alpha=False)
            rough_img.colorspace_settings.name = 'Non-Color'
            bake_channel(grp["mats"], "roughness", rough_img, uv_name)
            rough_path = os.path.join(output_dir, f"{grp_stem}_Roughness.png")
            rough_img.filepath_raw = rough_path
            rough_img.file_format = 'PNG'
            rough_img.save()
            grp_maps["roughness"] = rough_path
            all_baked_files.append(rough_path)

            # Bake Normal
            norm_img = bpy.data.images.new(f"Bake_{grp_stem}_Normal", resolution, resolution, alpha=False)
            norm_img.colorspace_settings.name = 'Non-Color'
            bake_channel(grp["mats"], "normal", norm_img, uv_name)
            if normal_format == "directx":
                flip_normal_green_inplace(norm_img)
            norm_path = os.path.join(output_dir, f"{grp_stem}_Normal.png")
            norm_img.filepath_raw = norm_path
            norm_img.file_format = 'PNG'
            norm_img.save()
            grp_maps["normal"] = norm_path
            all_baked_files.append(norm_path)

            # Optional ORM Packing
            if pack_mode == "ORM":
                orm_path = os.path.join(output_dir, f"{grp_stem}_ORM.png")
                pack_orm_texture(orm_path, rough_img, resolution)
                grp_maps["ORM"] = orm_path
                all_baked_files.append(orm_path)

            # Cleanup images from Blender data
            bpy.data.images.remove(diff_img)
            bpy.data.images.remove(rough_img)
            bpy.data.images.remove(norm_img)

            all_baked_maps[grp_stem] = grp_maps

        # Clean up UV layers: remove old original UV layer, rename baked UV layer to standard "UVMap"
        fresh_uvs = obj.data.uv_layers
        if orig_uv_name in fresh_uvs and orig_uv_name != uv_name:
            try:
                fresh_uvs.remove(fresh_uvs[orig_uv_name])
            except Exception as ex:
                print(f"[bake_mesh:uv] Notice removing old UV layer '{orig_uv_name}': {ex}", flush=True)

        final_uv_name = "UVMap"
        if uv_name in fresh_uvs:
            try:
                fresh_uvs[uv_name].name = final_uv_name
            except Exception:
                final_uv_name = uv_name

        if final_uv_name in fresh_uvs:
            fresh_uvs[final_uv_name].active_render = True
            obj.data.uv_layers.active = fresh_uvs[final_uv_name]

        # Apply all baked materials and preserved slots atomically in a single pass
        assigned_mats = apply_baked_materials(obj, bake_groups, all_baked_maps, preserved_slots, final_uv_name)
        updated_materials.extend(assigned_mats)

        applied_objects.append(obj.name)

    summary = f"Baked {len(applied_objects)} mesh(es), generated {len(all_baked_files)} map(s) in mode '{bake_mode}'."
    print(f"[bake_mesh] {summary}", flush=True)

    return {
        "status": "SUCCESS",
        "applied_objects": applied_objects,
        "baked_files": all_baked_files,
        "baked_maps": all_baked_maps,
        "updated_materials": updated_materials,
        "count": len(applied_objects),
        "summary": summary
    }


if __name__ == "__main__":
    print("Testing bake_mesh.py in Dry-Run mode...")
    res = main(bake_mode="body_only", resolution=2048, dry_run=True)
    print("Result:", res)
