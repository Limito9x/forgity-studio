# pyrefly: ignore [missing-import]
"""
Pipeline Tool: Bake Mesh (UV + Native Bake + Apply, one-shot).
Gop 3 buoc generate_uv -> native_bake -> apply_baked_textures trong 1 main duy nhat.

READ-ONLY o dau? Khong - day la node MUTATE (doi scene + ghi file).
- B1 ensure UV: tao/pack UVMap_Baked (giua nguyen island DAZ).
- B2 bake: Cycles emission-routing, 1 sample cho mau, 8 cho normal, 16 cho AO.
- B3 apply: dung 1 material/mesh (M_<obj>), don UV cu ve UVMap.

Batch-first: target_objects la Array<Text>, rong = toan bo mesh trong scene.
khong bake chung 1 anh nhu native_bake cu.
"""

import os
import re
from typing import Any, Dict, List, Optional, Tuple

try:
    import bpy
    HAS_BPY = True
except ImportError:
    bpy = None
    HAS_BPY = False


# ---------------------------------------------------------------------------
# MAP_DEFS: dinh nghia san toan bo map ho tro. On dinh, khong doan mo.
# ---------------------------------------------------------------------------
# - suffix: hau to ten file <Obj>_<Suffix>.png
# - bake: kieu bake Cycles (EMIT via emission-routing | NORMAL | AO)
# - colorspace: sRGB chi cho diffuse, con lai Non-Color
# - sockets: socket Principled BSDF de emission-routing doc tu (AO/normal khong can)
MAP_DEFS: Dict[str, Dict[str, Any]] = {
    "diffuse": {
        "suffix": "BaseColor",
        "bake": "EMIT",
        "colorspace": "sRGB",
        "sockets": ["Base Color", "BaseColor", "Color"],
        "default": (1.0, 1.0, 1.0, 1.0),
    },
    "roughness": {
        "suffix": "Roughness",
        "bake": "EMIT",
        "colorspace": "Non-Color",
        "sockets": ["Roughness"],
        "default": (0.5, 0.5, 0.5, 1.0),
    },
    "normal": {
        "suffix": "Normal",
        "bake": "NORMAL",
        "colorspace": "Non-Color",
        "sockets": [],
        "default": None,
    },
    "metallic": {
        "suffix": "Metallic",
        "bake": "EMIT",
        "colorspace": "Non-Color",
        "sockets": ["Metallic"],
        "default": (0.0, 0.0, 0.0, 1.0),
    },
    "specular": {
        "suffix": "Specular",
        "bake": "EMIT",
        "colorspace": "Non-Color",
        "sockets": ["Specular IOR Level", "Specular", "Specular Tint"],
        "default": (0.5, 0.5, 0.5, 1.0),
    },
    "alpha": {
        "suffix": "Alpha",
        "bake": "EMIT",
        "colorspace": "Non-Color",
        "sockets": ["Alpha", "Opacity"],
        "default": (1.0, 1.0, 1.0, 1.0),
    },
    "ao": {
        "suffix": "AO",
        "bake": "AO",
        "colorspace": "Non-Color",
        "sockets": [],
        "default": None,
    },
}

# Alias gom ve ten chuan (giong native_bake cu)
MAP_ALIASES = {
    "basecolor": "diffuse",
    "base_color": "diffuse",
    "albedo": "diffuse",
    "diff": "diffuse",
    "rough": "roughness",
    "nor": "normal",
    "nrm": "normal",
    "metal": "metallic",
    "spec": "specular",
    "opacity": "alpha",
    "occlusion": "ao",
    "ambientocclusion": "ao",
}

DEFAULT_MAPS = ["diffuse", "roughness", "normal"]


def _normalize_targets(raw: Optional[List[str]]) -> List[str]:
    """Batch-first: chi List[str]. Chap nhan str don (warning) de khoi gay pipeline cu."""
    if not raw:
        return []
    if isinstance(raw, str):  # type: ignore[unreachable]
        print("[bake_mesh] WARNING: target_objects as string is deprecated, use Array<Text>.", flush=True)
        return [x.strip() for x in str(raw).split(",") if x.strip()]
    out: List[str] = []
    for x in raw:
        if x and str(x).strip():
            out.append(str(x).strip())
    return out


def _normalize_maps(raw: Optional[List[str]]) -> List[str]:
    """Chuan hoa maps ve ten chuan MAP_DEFS, giu thu tu, loai trung + la."""
    if not raw:
        return list(DEFAULT_MAPS)
    items: List[str] = []
    if isinstance(raw, str):  # type: ignore[unreachable]
        print("[bake_mesh] WARNING: maps as string is deprecated, use Array<Text>.", flush=True)
        items = [x.strip().lower() for x in str(raw).split(",") if x.strip()]
    else:
        items = [str(m).strip().lower() for m in raw if str(m).strip()]
    selected: List[str] = []
    for m in items:
        norm = MAP_ALIASES.get(m, m)
        if norm in MAP_DEFS and norm not in selected:
            selected.append(norm)
        elif norm == "orm":
            # orm khong phai map bake truc tiep - bat qua bake_orm=True
            print("[bake_mesh] NOTE: 'orm' is packed from roughness+metallic, set bake_orm=True instead.", flush=True)
        else:
            print(f"[bake_mesh] WARNING: unknown map '{m}' skipped.", flush=True)
    return selected or list(DEFAULT_MAPS)


def _safe_stem(name: str) -> str:
    """Ten file an toan tu ten object (giua chu/s so/-/_/., con lai -> _)."""
    cleaned = re.sub(r"[^0-9A-Za-z\-_.]+", "_", name.strip())
    return cleaned.strip("_") or "Mesh"


def setup_cycles_engine(resolution: int = 2048, margin: int = 16) -> None:
    """Ep Cycles ve mode bake sieu toc: GPU neu co, samples thap, bounces=0."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    cycles = scene.cycles

    prefs = bpy.context.preferences
    if 'cycles' in prefs.addons:
        try:
            cprefs = prefs.addons['cycles'].preferences
            devices_optix = cprefs.get_devices_for_type('OPTIX')
            devices_cuda = cprefs.get_devices_for_type('CUDA')
            if devices_optix:
                cprefs.compute_device_type = 'OPTIX'
                for d in cprefs.devices:
                    d.use = (d.type == 'OPTIX')
                cycles.device = 'GPU'
            elif devices_cuda:
                cprefs.compute_device_type = 'CUDA'
                for d in cprefs.devices:
                    d.use = (d.type == 'CUDA')
                cycles.device = 'GPU'
            else:
                cycles.device = 'CPU'
        except Exception:
            cycles.device = 'CPU'

    cycles.samples = 1
    cycles.preview_samples = 1
    cycles.use_adaptive_sampling = False
    cycles.use_denoising = False
    cycles.max_bounces = 0
    cycles.diffuse_bounces = 0
    cycles.glossy_bounces = 0
    cycles.transmission_bounces = 0
    cycles.volume_bounces = 0
    cycles.transparent_max_bounces = 0
    try:
        cycles.tile_size = resolution
    except Exception:
        pass
    scene.render.bake.margin = margin
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_selected_to_active = False


def ensure_bake_uv(obj: Any, uv_name: str, margin: float) -> str:
    """
    B1: dam bao mesh co UV layer dich de bake vao.
    - Giu UV goc lam active_render (doc texture goc tu day).
    - Copy UV goc -> UVMap_Baked (uvs.new() ra layer trang tinh, phai copy tay).
    - Pack thuan (KHONG average scale, KHONG rotate) de giu nguyen ti le island goc DAZ;
      rotate=False tranh loi normal map bi lech huong sau pack.
    """
    mesh = obj.data
    uvs = mesh.uv_layers

    # Ve OBJECT mode + co lap 1 minh obj de ops UV khong lan sang mesh khac
    try:
        if bpy.context.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass
    try:
        bpy.ops.object.select_all(action='DESELECT')
    except Exception:
        pass
    try:
        obj.select_set(True)
    except Exception:
        pass
    bpy.context.view_layer.objects.active = obj

    # Tranh doc nham UV dich cua lan chay truoc lam "goc"
    candidates = [u for u in uvs if u.name != uv_name]
    original_uv_name: Optional[str] = None
    if uvs.active and uvs.active.name != uv_name:
        original_uv_name = str(uvs.active.name)
    elif candidates:
        original_uv_name = str(candidates[0].name)
        try:
            uvs.active = uvs[original_uv_name]
        except Exception:
            pass

    if not candidates:
        print(f"[bake_mesh:uv] {obj.name}: no UV layers, smart-projecting...", flush=True)
        try:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            try:
                bpy.ops.uv.select_all(action='SELECT')
            except Exception:
                pass
            bpy.ops.uv.smart_project(
                angle_limit=1.15192,
                margin_method='SCALED',
                island_margin=max(float(margin or 0.01), 0.01),
            )
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception as ex:
            print(f"[bake_mesh:uv] WARNING smart-project failed for {obj.name}: {ex}", flush=True)
            try:
                bpy.ops.object.mode_set(mode='OBJECT')
            except Exception:
                pass
        if len(uvs) == 0:
            uvs.new(name="UVMap")
        candidates = [u for u in uvs if u.name != uv_name]
        original_uv_name = str(uvs.active.name) if uvs.active and uvs.active.name != uv_name else (str(candidates[0].name) if candidates else uv_name)

    # Xoa layer dich cu (neu co) roi tao moi + copy coords tu layer goc
    if uv_name in uvs:
        try:
            uvs.remove(uvs[uv_name])
        except Exception:
            pass
    try:
        uvs.active = uvs[original_uv_name]
    except Exception:
        pass
    new_layer = uvs.new(name=uv_name)
    try:
        src = uvs[original_uv_name].data
        dst = new_layer.data
        for i in range(len(src)):
            try:
                dst[i].uv = src[i].uv
            except Exception:
                break
    except Exception as ex:
        print(f"[bake_mesh:uv] WARNING copy UV failed for {obj.name}: {ex}", flush=True)
    uvs.active = new_layer

    # Pack thuan tren layer dich:
    # - KHONG average_islands_scale: giu nguyen ti le island goc DAZ (body > face > finger...)
    # - rotate=False: tranh lect huong normal map sau pack
    # - shape_method='AABB': nhanh hon CONCAVE, du chinh xac cho character
    pack_margin = max(float(margin or 0.01), 0.01)
    try:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        try:
            bpy.ops.uv.select_all(action='SELECT')
        except Exception:
            pass
        try:
            bpy.ops.uv.pack_islands(margin=pack_margin, shape_method='AABB', rotate=False)
        except TypeError:
            # Blender cu khong co shape_method/rotate
            bpy.ops.uv.pack_islands(margin=pack_margin)
        bpy.ops.object.mode_set(mode='OBJECT')
    except Exception as ex:
        print(f"[bake_mesh:uv] WARNING pack failed for {obj.name}: {ex}", flush=True)
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass

    if original_uv_name and original_uv_name in uvs:
        try:
            uvs[original_uv_name].active_render = True
        except Exception:
            pass
    if uv_name in uvs:
        uvs.active = uvs[uv_name]

    print(f"[bake_mesh:uv] {obj.name}: active='{uv_name}', render='{original_uv_name}', pack_margin={pack_margin}", flush=True)
    return original_uv_name or uv_name


def find_principled_and_output(mat: Any):
    """Tim Principled BSDF + Output Material trong 1 material."""
    if not mat or not mat.use_nodes or not mat.node_tree:
        return None, None
    nodes = mat.node_tree.nodes
    out_node = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
    if not out_node:
        out_node = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
    bsdf_node = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    return bsdf_node, out_node


def _ungroup_node_if_group(node: Any, node_tree: Any = None) -> None:
    if not (node and getattr(node, 'type', None) == 'GROUP' and getattr(node, 'node_tree', None)):
        return
    tree = node_tree or getattr(node, 'id_data', None)
    if not tree:
        return

    wm = bpy.context.window_manager
    if not wm or not wm.windows:
        print(f"[bake_mesh:ungroup] Skipping ungroup for '{node.name}': no window manager found")
        return

    win = wm.windows[0]
    screen = win.screen or (bpy.data.screens[0] if bpy.data.screens else None)
    if not screen or not screen.areas:
        print(f"[bake_mesh:ungroup] Skipping ungroup for '{node.name}': no screen areas found")
        return

    for nd in tree.nodes:
        nd.select = False
    node.select = True
    tree.nodes.active = node

    area = next((a for a in screen.areas if a.type == 'NODE_EDITOR'), screen.areas[0])
    orig_type = area.type
    area.type = 'NODE_EDITOR'
    space = area.spaces.active
    orig_space_tree = getattr(space, 'node_tree', None)
    space.node_tree = tree
    region = next((r for r in area.regions if r.type == 'WINDOW'), area.regions[0] if area.regions else None)

    override = {
        'window': win,
        'screen': screen,
        'area': area,
        'region': region,
        'space_data': space,
        'edit_tree': tree,
    }

    try:
        with bpy.context.temp_override(**override):
            bpy.ops.node.group_ungroup()
        print(f"[bake_mesh:ungroup] Ungrouped shader node group '{node.name}'")
    except Exception as ex:
        print(f"[bake_mesh:ungroup] WARNING: Failed to ungroup '{node.name}': {ex}")
    finally:
        area.type = orig_type
        if hasattr(space, 'node_tree'):
            space.node_tree = orig_space_tree

def _bypass_muted_mix_shaders(nodes: Any, links: Any) -> None:
    # Let's bypass all the muted mix shader nodes (SimpleBake pattern)
    for n in list(nodes):
        if n.bl_idname == "ShaderNodeMixShader" and n.mute:
            from_socket = None
            if len(n.inputs[1].links) > 0:
                from_socket = n.inputs[1].links[0].from_socket
            
            to_socket = None
            if len(n.outputs[0].links) > 0:
                to_socket = n.outputs[0].links[0].to_socket
            
            if from_socket and to_socket:
                links.new(from_socket, to_socket)
                nodes.remove(n)
                print(f"[bake_mesh:mix] Bypassed muted Mix Shader '{n.name}'")

def _setup_mix_shader_proxy(mat: Any, original_from_socket: Any, map_type: str) -> Any:
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    defs = MAP_DEFS.get(map_type, {})

    if original_from_socket.node.bl_idname == "ShaderNodeMixShader":
        mix_node = original_from_socket.node

        # Create RGB mix for every mix shader node
        rgbmix_node = nodes.new("ShaderNodeMixRGB")
        rgbmix_node.location = (mix_node.location.x, mix_node.location.y + 200)
        rgbmix_node.label = "__BakeMesh_MixRGB_Proxy__"
        
        # Connect factor
        if mix_node.inputs[0].is_linked:
            links.new(mix_node.inputs[0].links[0].from_socket, rgbmix_node.inputs[0])
        else:
            rgbmix_node.inputs[0].default_value = mix_node.inputs[0].default_value

        # Recursively handle shader inputs
        # Input 1
        if mix_node.inputs[1].is_linked:
            from_socket1 = _setup_mix_shader_proxy(mat, mix_node.inputs[1].links[0].from_socket, map_type)
            if from_socket1:
                links.new(from_socket1, rgbmix_node.inputs[1])
        else:
            rgbmix_node.inputs[1].default_value = (0.0, 0.0, 0.0, 1.0) # Default to black

        # Input 2
        if mix_node.inputs[2].is_linked:
            from_socket2 = _setup_mix_shader_proxy(mat, mix_node.inputs[2].links[0].from_socket, map_type)
            if from_socket2:
                links.new(from_socket2, rgbmix_node.inputs[2])
        else:
            rgbmix_node.inputs[2].default_value = (0.0, 0.0, 0.0, 1.0) # Default to black
        
        return rgbmix_node.outputs[0]

    elif original_from_socket.node.bl_idname == "ShaderNodeBsdfPrincipled":
        bsdf_node = original_from_socket.node
        target_socket = None
        for s_name in defs.get("sockets", []):
            if s_name in bsdf_node.inputs:
                target_socket = bsdf_node.inputs[s_name]
                break
        if target_socket and target_socket.is_linked:
            return target_socket.links[0].from_socket
        elif target_socket:
            # Create dummy node for unlinked input
            val = target_socket.default_value
            if isinstance(val, (int, float)):
                rgb_node = nodes.new("ShaderNodeRGB")
                rgb_node.outputs[0].default_value = (float(val), float(val), float(val), 1.0)
                return rgb_node.outputs[0]
            elif hasattr(val, '__len__') and len(val) >= 3:
                rgb_node = nodes.new("ShaderNodeRGB")
                rgb_node.outputs[0].default_value = (val[0], val[1], val[2], 1.0)
                return rgb_node.outputs[0]
            else:
                default = defs.get("default")
                if default is not None:
                    rgb_node = nodes.new("ShaderNodeRGB")
                    rgb_node.outputs[0].default_value = default
                    return rgb_node.outputs[0]
        else:
            default = defs.get("default")
            if default is not None:
                rgb_node = nodes.new("ShaderNodeRGB")
                rgb_node.outputs[0].default_value = default
                return rgb_node.outputs[0]
    elif original_from_socket.node.bl_idname == "ShaderNodeTexImage":
        return original_from_socket.node.outputs['Color'] # Directly return if it's an image texture

    # Fallback for other node types or unhandled cases
    default = defs.get("default")
    if default is not None:
        rgb_node = nodes.new("ShaderNodeRGB")
        rgb_node.outputs[0].default_value = default
        return rgb_node.outputs[0]
    
    return None


def setup_emission_routing(mat: Any, map_type: str):
    """
    Noi tam socket can bake vao Emission de bake EMIT 1 sample (SimpleBake pattern).
    Tra ve (emit_node, orig_socket) de khoi phuc sau bake.

    FIX geoshell: DAZ geoshell thuong dung shader khong co Principled BSDF
    (MixShader + Transparent, hoac node group DAZ Iray). Neu khong tim duoc Principled,
    fallback: tim Image Texture da noi vao Surface output (cap 1 hop) hoac dung default.
    """
    defs = MAP_DEFS.get(map_type, {})
    bsdf_node, out_node = find_principled_and_output(mat)
    if not out_node:
        return None

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    _bypass_muted_mix_shaders(nodes, links) # Bypass muted mix shaders

    orig_socket = None
    if out_node.inputs['Surface'].is_linked:
        orig_socket = out_node.inputs['Surface'].links[0].from_socket
        if orig_socket.node.type == 'GROUP':
            _ungroup_node_if_group(orig_socket.node, mat.node_tree)
            if out_node.inputs['Surface'].is_linked:
                orig_socket = out_node.inputs['Surface'].links[0].from_socket
            if bsdf_node is None:
                bsdf_node, _ = find_principled_and_output(mat)

    emit_node = nodes.new(type='ShaderNodeEmission')
    emit_node.name = "__Temp_Bake_Emission__"
    emit_node.inputs['Strength'].default_value = 1.0

    if bsdf_node is not None:
        # --- Con duong binh thuong: co Principled BSDF ---
        target_socket = None
        for s_name in defs.get("sockets", []):
            if s_name in bsdf_node.inputs:
                target_socket = bsdf_node.inputs[s_name]
                break

        if target_socket is not None:
            if target_socket.is_linked:
                from_sock = target_socket.links[0].from_socket
                links.new(from_sock, emit_node.inputs['Color'])
            else:
                val = target_socket.default_value
                if isinstance(val, (int, float)):
                    emit_node.inputs['Color'].default_value = (float(val), float(val), float(val), 1.0)
                elif hasattr(val, '__len__') and len(val) >= 3:
                    emit_node.inputs['Color'].default_value = (val[0], val[1], val[2], 1.0)
        else:
            default = defs.get("default")
            if default is not None:
                emit_node.inputs['Color'].default_value = default
    else:
        # --- FIX: Geoshell / shader khong co Principled BSDF ---
        # Use the mix shader proxy if the original socket is a shader or group
        if orig_socket is not None:
            proxy_output_socket = _setup_mix_shader_proxy(mat, orig_socket, map_type)
            if proxy_output_socket:
                links.new(proxy_output_socket, emit_node.inputs['Color'])
            else:
                default = defs.get("default")
                if default is not None:
                    emit_node.inputs['Color'].default_value = default
                print(f"[bake_mesh:emit] WARNING: Failed to setup mix shader proxy for '{mat.name}', using default.", flush=True)
        else:
            default = defs.get("default")
            if default is not None:
                emit_node.inputs['Color'].default_value = default
            print(f"[bake_mesh:emit] WARNING: No original surface socket for '{mat.name}', using default.", flush=True)

    links.new(emit_node.outputs['Emission'], out_node.inputs['Surface'])
    return emit_node, orig_socket


def restore_emission_routing(mat: Any, emit_info) -> None:
    """Khoi phuc shader goc + xoa Emission tam."""
    if not emit_info or not mat or not mat.node_tree:
        return
    emit_node, orig_socket = emit_info
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    _, out_node = find_principled_and_output(mat)
    if out_node is not None and orig_socket is not None:
        try:
            links.new(orig_socket, out_node.inputs['Surface'])
        except Exception:
            pass
    if emit_node is not None and emit_node.name in nodes:
        nodes.remove(emit_node)


def apply_geo_nodes_for_bake(obj: Any) -> bool:
    """
    FIX geoshell: DAZ import_daz build geoshell bang GeoNodes modifier (GeoshellGroup).
    Khi bake EMIT, Cycles can thay evaluated geometry — neu modifier chua apply,
    mesh go la rong (0 faces) nen bake cho ra anh trang/nhat.

    Ham nay detect va apply moi GeoNodes modifier tren obj truoc khi bake.
    Tra ve True neu da apply it nhat 1 modifier.

    LUU Y: ham nay MUTATE obj.data — chi goi sau khi da backup material neu can.
    """
    has_geonodes = any(m.type == 'NODES' for m in obj.modifiers)
    if not has_geonodes:
        return False

    print(f"[bake_mesh:geonodes] '{obj.name}' has GeoNodes modifier — applying for bake.", flush=True)
    try:
        if bpy.context.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
    except Exception as ex:
        print(f"[bake_mesh:geonodes] WARNING: mode switch failed: {ex}", flush=True)

    applied = False
    for mod in list(obj.modifiers):
        if mod.type != 'NODES':
            continue
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
            print(f"[bake_mesh:geonodes] Applied modifier '{mod.name}'", flush=True)
            applied = True
        except Exception as ex:
            print(f"[bake_mesh:geonodes] WARNING: apply '{mod.name}' failed: {ex}", flush=True)

    return applied


def create_separate_color_node(nodes: Any):
    """Separate Color tuong thich Blender 3.x/4.x/5.x."""
    if hasattr(bpy.types, "ShaderNodeSeparateColor"):
        return nodes.new("ShaderNodeSeparateColor")
    if hasattr(bpy.types, "ShaderNodeSeparateRGB"):
        return nodes.new("ShaderNodeSeparateRGB")
    return None


def build_single_baked_material(material_name: str, textures: Dict[str, str]) -> Any:
    """
    B3a: tao material sach 1 PBR (nodes.clear) + cam map da bake.
    textures: {map_type: filepath} cua RIENG 1 mesh (khong share giua cac mesh).
    Wire day du: diffuse(sRGB) / normal+NormalMap / orm(G->Rough,B->Metal)
    hoac le roughness/metallic / specular / alpha. AO giu file, khong co socket noi.
    """
    mat = bpy.data.materials.get(material_name)
    if not mat:
        mat = bpy.data.materials.new(name=material_name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out_node = nodes.new("ShaderNodeOutputMaterial")
    out_node.location = (400, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])

    def _load(map_type: str):
        path = textures.get(map_type, "")
        if not path or not os.path.isfile(path):
            return None
        img = bpy.data.images.load(path, check_existing=True)
        img.colorspace_settings.name = MAP_DEFS.get(map_type, {}).get("colorspace", "Non-Color")
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = img
        return tex

    # Diffuse / BaseColor
    bc = _load("diffuse")
    if bc is not None:
        bc.label = "Baked_BaseColor"
        bc.name = "Baked_BaseColor"
        bc.location = (-600, 200)
        if "Base Color" in bsdf.inputs:
            links.new(bc.outputs["Color"], bsdf.inputs["Base Color"])

    # Normal
    nm = _load("normal")
    if nm is not None:
        nm.label = "Baked_Normal"
        nm.name = "Baked_Normal"
        nm.location = (-600, -350)
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.location = (-250, -350)
        nmap.space = 'TANGENT'
        links.new(nm.outputs["Color"], nmap.inputs["Color"])
        if "Normal" in bsdf.inputs:
            links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    # ORM pack (R=AO, G=Rough, B=Metal) uu tien hon map le
    if textures.get("orm") and os.path.isfile(textures["orm"]):
        orm = _load("orm")
        if orm is not None:
            orm.label = "Baked_ORM"
            orm.name = "Baked_ORM"
            orm.location = (-600, -100)
            sep = create_separate_color_node(nodes)
            if sep is not None:
                sep.location = (-280, -100)
                links.new(orm.outputs["Color"], sep.inputs[0])
                g_out = sep.outputs.get("Green") or sep.outputs.get("G")
                b_out = sep.outputs.get("Blue") or sep.outputs.get("B")
                if g_out is not None and "Roughness" in bsdf.inputs:
                    links.new(g_out, bsdf.inputs["Roughness"])
                if b_out is not None and "Metallic" in bsdf.inputs:
                    links.new(b_out, bsdf.inputs["Metallic"])
    else:
        rgh = _load("roughness")
        if rgh is not None:
            rgh.label = "Baked_Roughness"
            rgh.location = (-600, -50)
            if "Roughness" in bsdf.inputs:
                links.new(rgh.outputs["Color"], bsdf.inputs["Roughness"])
        met = _load("metallic")
        if met is not None:
            met.label = "Baked_Metallic"
            met.location = (-600, -200)
            if "Metallic" in bsdf.inputs:
                links.new(met.outputs["Color"], bsdf.inputs["Metallic"])

    # Specular (socket doi theo version Blender - tim socket dau tien ton tai)
    spec = _load("specular")
    if spec is not None:
        spec.label = "Baked_Specular"
        spec.location = (-600, -280)
        for s_name in MAP_DEFS["specular"]["sockets"]:
            if s_name in bsdf.inputs:
                links.new(spec.outputs["Color"], bsdf.inputs[s_name])
                break

    # Alpha
    alp = _load("alpha")
    if alp is not None:
        alp.label = "Baked_Alpha"
        alp.location = (-600, 450)
        if "Alpha" in bsdf.inputs:
            links.new(alp.outputs["Color"], bsdf.inputs["Alpha"])

    if textures.get("ao"):
        print(f"[bake_mesh:apply] AO kept as file (no BSDF socket): '{textures['ao']}'", flush=True)

    return mat


def apply_single_material(obj: Any, material: Any, uv_name: str) -> None:
    """B3b: don moi slot cu ve slot 0 + active UV baked + xoa UV cu ve 'UVMap'."""
    mesh = obj.data
    mesh.materials.clear()
    mesh.materials.append(material)
    for poly in mesh.polygons:
        poly.material_index = 0

    uvs = mesh.uv_layers
    if not uvs:
        return
    target_uv = uvs.get(uv_name)
    if not target_uv:
        for u in uvs:
            if u.name.lower() == uv_name.lower():
                target_uv = u
                break
    if not target_uv:
        print(f"[bake_mesh:apply] WARNING: {obj.name} missing UV '{uv_name}'", flush=True)
        return
    target_uv.active = True
    target_uv.active_render = True
    for old_u in [u for u in uvs if u != target_uv]:
        uvs.remove(old_u)
    target_uv.name = "UVMap"


def _resolve_target_meshes(targets: List[str]) -> List[Any]:
    """
    Tim va giai quyet chinh xac mesh can bake tu danh sach targets.
    - Uu tien Exact match.
    - Neu target la 'Genesis 9', uu tien match 'Genesis 9 Mesh' (Body mesh chinh),
      tranh match nham sang cac mesh con phu nhu eyes, mouth, eyelashes.
    """
    if not targets:
        return [o for o in bpy.data.objects if o.type == 'MESH']

    all_meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    resolved: List[Any] = []
    sub_part_keywords = ['eye', 'mouth', 'eyelash', 'lash', 'tear', 'cornea', 'teeth', 'tongue', 'brow']

    for t in targets:
        t_clean = t.strip()
        t_lower = t_clean.lower()
        if not t_lower:
            continue

        matched_for_t: List[Any] = []

        # 1. Exact name match
        exact = [m for m in all_meshes if m.name.lower() == t_lower]
        if exact:
            matched_for_t.extend(exact)

        # 2. Khop dang base mesh: "<name> mesh", "<name>_mesh", "<name> body", "<name>_body"
        if not matched_for_t:
            base_names = [f"{t_lower} mesh", f"{t_lower}_mesh", f"{t_lower} body", f"{t_lower}_body"]
            base_matches = [m for m in all_meshes if m.name.lower() in base_names]
            if base_matches:
                matched_for_t.extend(base_matches)

        # 3. Kiem tra neu t la Armature / Parent Object (vd Armature 'Genesis 9')
        if not matched_for_t:
            parent_obj = bpy.data.objects.get(t_clean)
            if not parent_obj:
                parent_obj = next((o for o in bpy.data.objects if o.name.lower() == t_lower), None)

            if parent_obj and parent_obj.type in ('ARMATURE', 'EMPTY'):
                child_meshes = [c for c in parent_obj.children if c.type == 'MESH']
                if child_meshes:
                    main_child = next((c for c in child_meshes if c.name.lower() in (f"{t_lower} mesh", f"{t_lower}_mesh")), None)
                    if main_child:
                        matched_for_t.append(main_child)
                    else:
                        sorted_by_poly = sorted(child_meshes, key=lambda m: len(m.data.polygons), reverse=True)
                        if sorted_by_poly:
                            matched_for_t.append(sorted_by_poly[0])

        # 4. Fallback substring matching
        if not matched_for_t:
            has_sub_keyword = any(kw in t_lower for kw in sub_part_keywords)
            candidates = [m for m in all_meshes if t_lower in m.name.lower()]
            if candidates:
                if not has_sub_keyword:
                    main_candidates = [
                        m for m in candidates
                        if not any(kw in m.name.lower() for kw in sub_part_keywords)
                    ]
                    if main_candidates:
                        sorted_cands = sorted(main_candidates, key=lambda m: (len(m.name), -len(m.data.polygons)))
                        matched_for_t.append(sorted_cands[0])
                    else:
                        matched_for_t.extend(candidates)
                else:
                    matched_for_t.extend(candidates)

        for m in matched_for_t:
            if m not in resolved:
                resolved.append(m)

    return resolved


def _activate_bake_targets(bake_nodes: List[Tuple[Any, Any]], bake_image: Any) -> None:
    """
    Dam bao tat ca cac material (ke ca cac slot Geoshell bi ungroup)
    deu co active and selected Image Texture node tro toi bake_image.
    Tranh loi Blender bo qua material khi bake.
    """
    for mat, bnode in bake_nodes:
        if not mat or not mat.node_tree:
            continue
        nodes = mat.node_tree.nodes
        target = nodes.get("__BakeMesh_Target__") or bnode
        if target.name not in nodes:
            target = nodes.new(type='ShaderNodeTexImage')
            target.name = "__BakeMesh_Target__"
        target.image = bake_image
        for nd in nodes:
            nd.select = False
        target.select = True
        nodes.active = target


def main(
    target_objects: Optional[List[str]] = None,
    uv_name: str = "UVMap_Baked",
    margin: float = 0.01,
    maps: Optional[List[str]] = None,
    resolution: int = 2048,
    bake_orm: bool = False,
    output_dir: str = "",
    material_name: str = "",
    ao_samples: int = 64,
) -> dict:
    """
    Bake 1 luot: UV + Bake + Apply (per-mesh).

    Args:
        target_objects: Array<Text> ten mesh, e.g. ["Body_GND"] hay ["Top_GND","Panty_GND"]. Rong = ca scene.
        uv_name: Layer UV dich tam de bake (default 'UVMap_Baked', xong apply doi ve 'UVMap').
        margin: Khe island UV ti le 0-1 (default 0.01 ~ 20px tren 2048, du che bleed 16px).
        maps: Array<Text> map can bake, e.g. ["diffuse","roughness","normal","metallic","specular","alpha","ao"].
            Default ["diffuse","roughness","normal"]. Alias basecolor/albedo/rough/nor tu dong gop.
        resolution: 1024/2048/4096 (default 2048).
        bake_orm: True = pack them file _ORM (R=AO, G=Rough, B=Metal) chuan Unreal.
        output_dir: Thu muc luu texture. Rong = canh file .blend (co 'baked_textures') hoac tempdir.
        material_name: Ten material dich. Rong = auto 'M_<Obj>'. 1 mesh + ten cho san = dung ten do.

    Returns:
        {
            "status": "SUCCESS",
            "applied_objects": [...],           # feed batch_export/export_fbx.target_objects
            "baked_maps": {obj: {map: path}},   # debug, khong can noi tiep
            "baked_files": [...],               # flat list
            "updated_materials": [...],
            "uv_name": "UVMap",
            "count": int
        }
    """
    if not HAS_BPY:
        raise RuntimeError("Blender python (bpy) is not available.")

    targets = _normalize_targets(target_objects)
    selected_maps = _normalize_maps(maps)

    try:
        margin = float(margin) if margin is not None else 0.01
    except (ValueError, TypeError):
        margin = 0.01
    if margin < 0.008:
        print(f"[bake_mesh] WARNING: margin {margin} < 0.008 se lem bleed 16px/2048, nang len 0.01.", flush=True)
        margin = 0.01
    try:
        resolution = int(resolution) if resolution else 2048
    except (ValueError, TypeError):
        resolution = 2048
    if isinstance(bake_orm, str):
        bake_orm = str(bake_orm).lower() in ("true", "1", "yes")
    else:
        bake_orm = bool(bake_orm)

    # Mesh dich: rong = ca scene, co targets = resolve chinh xac
    meshes = _resolve_target_meshes(targets)

    if not meshes:
        print(f"[bake_mesh] WARNING: no meshes matched {targets}, skipping.", flush=True)
        return {
            "status": "SKIPPED",
            "applied_objects": [],
            "baked_maps": {},
            "baked_files": [],
            "updated_materials": [],
            "uv_name": "UVMap",
            "count": 0,
        }

    if not output_dir:
        blend_file = bpy.data.filepath
        if blend_file and os.path.isdir(os.path.dirname(blend_file)):
            output_dir = os.path.join(os.path.dirname(blend_file), "baked_textures")
        else:
            output_dir = os.path.join(bpy.app.tempdir, "baked_textures")
    os.makedirs(output_dir, exist_ok=True)

    setup_cycles_engine(resolution=resolution)
    scene = bpy.context.scene

    baked_maps: Dict[str, Dict[str, str]] = {}
    baked_files: List[str] = []
    updated_materials: List[str] = []
    applied_objects: List[str] = []

    for obj in meshes:
        stem = _safe_stem(obj.name)
        print(f"[bake_mesh] Processing '{obj.name}' maps={selected_maps} res={resolution} orm={bake_orm}", flush=True)

        # B0. FIX geoshell: apply GeoNodes modifier truoc khi bake
        # (geoshell DAZ la mesh rong + GeoNodes evaluate geometry luc runtime;
        #  Cycles bake can static geometry nen phai apply truoc)
        apply_geo_nodes_for_bake(obj)

        # B1. UV
        ensure_bake_uv(obj, uv_name, margin)
        uvs = obj.data.uv_layers
        target_uv = uvs.get(uv_name)
        if target_uv:
            uvs.active = target_uv

        # B2. Bake rieng 1 mesh (chon 1 minh no de Cycles khoi lan)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        unique_mats = []
        for slot in obj.material_slots:
            mat = slot.material
            if mat and mat.use_nodes and mat.node_tree and mat not in unique_mats:
                unique_mats.append(mat)

        if not unique_mats:
            print(f"[bake_mesh:bake] WARNING: {obj.name} has no node materials, skipping bake.", flush=True)
            continue

        bake_nodes = []
        for mat in unique_mats:
            nodes = mat.node_tree.nodes
            bnode = nodes.get("__BakeMesh_Target__") or nodes.new(type='ShaderNodeTexImage')
            bnode.name = "__BakeMesh_Target__"
            nodes.active = bnode
            bake_nodes.append((mat, bnode))

        obj_maps: Dict[str, str] = {}
        temp_images: Dict[str, Any] = {}
        cb = scene.render.bake

        for map_type in selected_maps:
            defs = MAP_DEFS[map_type]
            suffix = defs["suffix"]
            out_filename = f"{stem}_{suffix}.png"
            out_filepath = os.path.join(output_dir, out_filename)
            is_color = map_type == "diffuse"

            bake_image = bpy.data.images.new(
                name=f"Bake_{stem}_{suffix}",
                width=resolution,
                height=resolution,
                alpha=True,
                float_buffer=(map_type == "normal"),
            )
            if not is_color:
                bake_image.colorspace_settings.name = 'Non-Color'

            _activate_bake_targets(bake_nodes, bake_image)

            if defs["bake"] == "NORMAL":
                # NORMAL la deterministic — 1 sample cho ket qua y het 8 sample, khong can hon
                scene.cycles.samples = 1
                print(f"[bake_mesh:bake] {obj.name} normal -> '{out_filename}' (1spp, deterministic)", flush=True)
                bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', save_mode='INTERNAL')
            elif defs["bake"] == "AO":
                # AO dung Monte Carlo ray casting — nhieu sample = it noise hon
                # Khong co tac dung voi EMIT (diffuse/rough/metal...) nen chi nang o day
                _ao_spp = max(int(ao_samples) if ao_samples else 64, 16)
                scene.cycles.samples = _ao_spp
                print(f"[bake_mesh:bake] {obj.name} ao -> '{out_filename}' ({_ao_spp}spp)", flush=True)
                bpy.ops.object.bake(type='AO', save_mode='INTERNAL')
            else:
                # EMIT: sample shader color truc tiep, 1 sample = 1000 sample, tang them vo nghia
                scene.cycles.samples = 1
                print(f"[bake_mesh:bake] {obj.name} {suffix} via EMIT -> '{out_filename}' (1spp)", flush=True)
                tracker = {}
                for mat, _ in bake_nodes:
                    info = setup_emission_routing(mat, map_type)
                    if info:
                        tracker[mat] = info
                # QUAN TRONG: Tai-kich-hoat active node sau khi ungroup shader groups / routing
                _activate_bake_targets(bake_nodes, bake_image)
                bpy.ops.object.bake(type='EMIT', save_mode='INTERNAL')
                for mat, info in tracker.items():
                    restore_emission_routing(mat, info)

            bake_image.filepath_raw = out_filepath
            bake_image.file_format = 'PNG'
            bake_image.save()
            obj_maps[map_type] = out_filepath
            baked_files.append(out_filepath)

            if map_type in ("roughness", "metallic", "ao"):
                temp_images[map_type] = bake_image
            else:
                try:
                    bpy.data.images.remove(bake_image)
                except Exception:
                    pass

        # ORM pack: R=AO (neu co bake ao) else 1.0, G=Rough, B=Metal
        if bake_orm and "roughness" in temp_images:
            try:
                import numpy as np
                n = resolution * resolution
                rough_px = np.empty(n * 4, dtype=np.float32)
                temp_images["roughness"].pixels.foreach_get(rough_px)
                g_ch = rough_px[1::4].copy() if rough_px.size == n * 4 else rough_px[0::4].copy()

                if "metallic" in temp_images:
                    metal_px = np.empty(n * 4, dtype=np.float32)
                    temp_images["metallic"].pixels.foreach_get(metal_px)
                    b_ch = metal_px[0::4].copy()
                else:
                    b_ch = np.zeros(n, dtype=np.float32)

                if "ao" in temp_images:
                    ao_px = np.empty(n * 4, dtype=np.float32)
                    temp_images["ao"].pixels.foreach_get(ao_px)
                    r_ch = ao_px[0::4].copy()
                else:
                    r_ch = np.ones(n, dtype=np.float32)

                orm_px = np.empty(n * 4, dtype=np.float32)
                orm_px[0::4] = r_ch
                orm_px[1::4] = g_ch
                orm_px[2::4] = b_ch
                orm_px[3::4] = 1.0

                orm_path = os.path.join(output_dir, f"{stem}_ORM.png")
                orm_img = bpy.data.images.new(f"Bake_{stem}_ORM", width=resolution, height=resolution)
                orm_img.colorspace_settings.name = 'Non-Color'
                orm_img.pixels.foreach_set(orm_px)
                orm_img.filepath_raw = orm_path
                orm_img.file_format = 'PNG'
                orm_img.save()
                obj_maps["orm"] = orm_path
                baked_files.append(orm_path)
                bpy.data.images.remove(orm_img)
                print(f"[bake_mesh:bake] {obj.name} ORM packed -> '{orm_path}'", flush=True)
            except Exception as ex:
                print(f"[bake_mesh:bake] WARNING: ORM pack failed for {obj.name}: {ex}", flush=True)

        for img in temp_images.values():
            try:
                bpy.data.images.remove(img)
            except Exception:
                pass

        for mat, bnode in bake_nodes:
            try:
                if bnode.name in mat.node_tree.nodes:
                    mat.node_tree.nodes.remove(bnode)
            except Exception:
                pass

        # B3. Apply: 1 mesh 1 material sach
        if material_name and len(meshes) == 1:
            mat_name = material_name
        elif material_name:
            mat_name = f"{material_name}_{stem}"
        else:
            mat_name = f"M_{stem}"
        baked_mat = build_single_baked_material(mat_name, obj_maps)
        apply_single_material(obj, baked_mat, uv_name)

        baked_maps[obj.name] = obj_maps
        applied_objects.append(obj.name)
        if baked_mat.name not in updated_materials:
            updated_materials.append(baked_mat.name)
        print(f"[bake_mesh] Done '{obj.name}' -> material '{baked_mat.name}' ({len(obj_maps)} maps)", flush=True)

    print(f"[bake_mesh] Completed {len(applied_objects)} mesh(es). Output: {output_dir}", flush=True)
    return {
        "status": "SUCCESS",
        "applied_objects": applied_objects,
        "baked_maps": baked_maps,
        "baked_files": baked_files,
        "updated_materials": updated_materials,
        "uv_name": "UVMap",
        "output_dir": output_dir,
        "count": len(applied_objects),
    }
