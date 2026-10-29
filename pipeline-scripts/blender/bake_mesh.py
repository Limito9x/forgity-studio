# pyrefly: ignore [missing-import]
"""
Pipeline Tool: Modern Headless Mesh Baker (UV + Value/Geometry/AO Transfer + Channel Packing + Unified PBR).
Designed from the ground up for Headless CLI execution (blender -b) with zero UI dependencies.

Key Features:
- Pure-Python Shader Graph Traversal: Recursively resolves PBR sources across Principled BSDF,
  MixShaders, and Nested ShaderNodeGroups (Diffeomorphic EXTENDED_PRINCIPLED, OpaqueShellPbrGroup)
  without calling UI-dependent bpy.ops.node.group_ungroup().
- Explicit UV Target Pinning: Inserts dedicated ShaderNodeUVMap nodes wired directly to the bake
  target Vector input, eliminating UV coordinate collisions and black-frame circular dependencies.
- Isolated Raytraced Occlusion: Automatically isolates target meshes during AO passes, preventing
  clothes/hair/accessories from occluding skin geometry.
- Green-Channel Invert: Deterministic NumPy DirectX Y- normal map conversion for Unreal Engine 5.
- Multi-Engine Channel Packing: Native support for ORM, ORMA, RMA, MRA, and UNITY_MASK presets
  with Literal type hinting for automated Pipeline Canvas dropdown mapping.
- Clean Material Assignment: Consolidates multi-material meshes into a single unified PBR material (M_<Obj>).
"""

import os
import re
from typing import Any, Dict, List, Literal, Optional, Tuple

try:
    import bpy
    HAS_BPY = True
except ImportError:
    bpy = None
    HAS_BPY = False


# ---------------------------------------------------------------------------
# Channel Definitions & Canonical Presets
# ---------------------------------------------------------------------------
MAP_DEFS: Dict[str, Dict[str, Any]] = {
    "diffuse": {
        "suffix": "BaseColor",
        "technique": "EMIT",
        "colorspace": "sRGB",
        "sockets": ["Base Color", "BaseColor", "Color", "Diffuse Color"],
        "default": (1.0, 1.0, 1.0, 1.0),
    },
    "roughness": {
        "suffix": "Roughness",
        "technique": "EMIT",
        "colorspace": "Non-Color",
        "sockets": ["Roughness"],
        "default": (0.5, 0.5, 0.5, 1.0),
    },
    "metallic": {
        "suffix": "Metallic",
        "technique": "EMIT",
        "colorspace": "Non-Color",
        "sockets": ["Metallic", "Metallicity"],
        "default": (0.0, 0.0, 0.0, 1.0),
    },
    "specular": {
        "suffix": "Specular",
        "technique": "EMIT",
        "colorspace": "Non-Color",
        "sockets": ["Specular IOR Level", "Specular", "Specular Tint"],
        "default": (0.5, 0.5, 0.5, 1.0),
    },
    "alpha": {
        "suffix": "Alpha",
        "technique": "EMIT",
        "colorspace": "Non-Color",
        "sockets": ["Alpha", "Opacity", "Cutout Opacity"],
        "default": (1.0, 1.0, 1.0, 1.0),
    },
    "normal": {
        "suffix": "Normal",
        "technique": "NORMAL",
        "colorspace": "Non-Color",
        "sockets": ["Normal"],
        "default": None,
    },
    "ao": {
        "suffix": "AO",
        "technique": "AO",
        "colorspace": "Non-Color",
        "sockets": [],
        "default": None,
    },
}

MAP_ALIASES: Dict[str, str] = {
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

PackModeType = Literal["none", "ORM", "ORMA", "RMA", "MRA", "UNITY_MASK"]


# ---------------------------------------------------------------------------
# Utility Helpers
# ---------------------------------------------------------------------------
def _safe_stem(name: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z\-_.]+", "_", name.strip())
    return cleaned.strip("_") or "Mesh"


def _normalize_targets(raw: Optional[List[str]]) -> List[str]:
    if not raw:
        return []
    if isinstance(raw, str):
        return [x.strip() for x in str(raw).split(",") if x.strip()]
    return [str(x).strip() for x in raw if str(x).strip()]


def _normalize_maps(raw: Optional[List[str]], pack_mode: str) -> List[str]:
    if not raw:
        selected = list(DEFAULT_MAPS)
    elif isinstance(raw, str):
        selected = [x.strip().lower() for x in str(raw).split(",") if x.strip()]
    else:
        selected = [str(m).strip().lower() for m in raw if str(m).strip()]

    canonical: List[str] = []
    for m in selected:
        norm = MAP_ALIASES.get(m, m)
        if norm in MAP_DEFS and norm not in canonical:
            canonical.append(norm)

    # Automatically ensure underlying maps needed for packing presets are included
    pack_upper = (pack_mode or "none").strip().upper()
    if pack_upper in ("ORM", "ORMA", "RMA", "MRA", "UNITY_MASK"):
        for req in ("roughness", "metallic"):
            if req not in canonical:
                canonical.append(req)
        if req == "ao" or pack_upper != "none":
            if "ao" not in canonical:
                canonical.append("ao")
    if pack_upper == "ORMA" and "alpha" not in canonical:
        canonical.append("alpha")

    return canonical or list(DEFAULT_MAPS)


def _resolve_target_meshes(targets: List[str]) -> List[Any]:
    all_meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not targets:
        return all_meshes

    resolved: List[Any] = []
    sub_keywords = ['eye', 'mouth', 'eyelash', 'lash', 'tear', 'cornea', 'teeth', 'tongue', 'brow']

    for t in targets:
        t_clean = t.strip()
        t_lower = t_clean.lower()
        if not t_lower:
            continue

        matched: List[Any] = []
        # 1. Exact match
        exact = [m for m in all_meshes if m.name.lower() == t_lower]
        if exact:
            matched.extend(exact)

        # 2. Base mesh name match: "<t> mesh", "<t>_mesh", "<t> body"
        if not matched:
            base_names = [f"{t_lower} mesh", f"{t_lower}_mesh", f"{t_lower} body", f"{t_lower}_body"]
            base_matches = [m for m in all_meshes if m.name.lower() in base_names]
            if base_matches:
                matched.extend(base_matches)

        # 3. Check if target is parent Armature
        if not matched:
            parent_obj = bpy.data.objects.get(t_clean) or next((o for o in bpy.data.objects if o.name.lower() == t_lower), None)
            if parent_obj and parent_obj.type in ('ARMATURE', 'EMPTY'):
                child_meshes = [c for c in parent_obj.children if c.type == 'MESH']
                if child_meshes:
                    main_child = next((c for c in child_meshes if c.name.lower() in (f"{t_lower} mesh", f"{t_lower}_mesh")), None)
                    if main_child:
                        matched.append(main_child)
                    else:
                        sorted_child = sorted(child_meshes, key=lambda m: len(m.data.polygons), reverse=True)
                        matched.append(sorted_child[0])

        # 4. Fallback substring
        if not matched:
            has_sub = any(kw in t_lower for kw in sub_keywords)
            candidates = [m for m in all_meshes if t_lower in m.name.lower()]
            if candidates:
                if not has_sub:
                    filtered = [m for m in candidates if not any(kw in m.name.lower() for kw in sub_keywords)]
                    matched.append(filtered[0] if filtered else candidates[0])
                else:
                    matched.extend(candidates)

        for m in matched:
            if m not in resolved:
                resolved.append(m)

    return resolved


# ---------------------------------------------------------------------------
# Cycles Engine Setup & Teardown
# ---------------------------------------------------------------------------
def setup_cycles_engine(resolution: int = 2048, margin: int = 32, ao_distance: float = 0.25) -> Dict[str, Any]:
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    cycles = scene.cycles

    orig_settings: Dict[str, Any] = {
        "view_transform": getattr(scene.view_settings, "view_transform", "Standard"),
        "look": getattr(scene.view_settings, "look", "None"),
        "exposure": getattr(scene.view_settings, "exposure", 0.0),
        "gamma": getattr(scene.view_settings, "gamma", 1.0),
        "device": getattr(cycles, "device", "CPU"),
        "samples": getattr(cycles, "samples", 1),
    }

    # Standard color management preserves PBR physical values without AgX/Filmic curves
    try:
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
        scene.view_settings.exposure = 0.0
        scene.view_settings.gamma = 1.0
    except Exception:
        pass

    # Constrain AO distance to prevent deep-crevice black bleed
    if ao_distance and ao_distance > 0 and scene.world and hasattr(scene.world, "light_settings"):
        orig_settings["ao_distance"] = scene.world.light_settings.distance
        scene.world.light_settings.distance = float(ao_distance)

    # Hardware acceleration (OptiX / CUDA)
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

    cycles.use_adaptive_sampling = False
    cycles.use_denoising = False
    cycles.max_bounces = 0
    cycles.diffuse_bounces = 0
    cycles.glossy_bounces = 0
    cycles.transmission_bounces = 0
    cycles.volume_bounces = 0
    cycles.transparent_max_bounces = 0

    scene.render.bake.margin = max(int(margin), 32)
    scene.render.bake.margin_type = 'EXTEND'
    scene.render.bake.use_selected_to_active = False

    return orig_settings


def restore_cycles_settings(orig: Dict[str, Any]) -> None:
    if not orig:
        return
    scene = bpy.context.scene
    try:
        if "view_transform" in orig:
            scene.view_settings.view_transform = orig["view_transform"]
        if "look" in orig:
            scene.view_settings.look = orig["look"]
        if "exposure" in orig:
            scene.view_settings.exposure = orig["exposure"]
        if "gamma" in orig:
            scene.view_settings.gamma = orig["gamma"]
        if "device" in orig and hasattr(scene.cycles, "device"):
            scene.cycles.device = orig["device"]
        if "samples" in orig:
            scene.cycles.samples = orig["samples"]
        if "ao_distance" in orig and scene.world and hasattr(scene.world, "light_settings"):
            scene.world.light_settings.distance = orig["ao_distance"]
    except Exception:
        pass


# ---------------------------------------------------------------------------
# UV Preparation (Isolated UV Layer Generation)
# ---------------------------------------------------------------------------
def ensure_bake_uv(obj: Any, uv_name: str, margin: float) -> str:
    mesh = obj.data
    uvs = mesh.uv_layers

    if bpy.context.mode != 'OBJECT':
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass

    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    candidates = [u for u in uvs if u.name != uv_name]
    original_uv_name = str(uvs.active.name) if uvs.active and uvs.active.name != uv_name else (str(candidates[0].name) if candidates else None)

    if not original_uv_name:
        try:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=1.15192, island_margin=max(float(margin or 0.01), 0.01))
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass
        if len(uvs) == 0:
            uvs.new(name="UVMap")
        candidates = [u for u in uvs if u.name != uv_name]
        original_uv_name = str(uvs.active.name) if uvs.active and uvs.active.name != uv_name else (str(candidates[0].name) if candidates else "UVMap")

    # Recreate bake target UV layer and duplicate source coordinates
    if uv_name in uvs:
        try:
            uvs.remove(uvs[uv_name])
        except Exception:
            pass

    uvs.active = uvs[original_uv_name]
    new_layer = uvs.new(name=uv_name)
    try:
        src = uvs[original_uv_name].data
        dst = new_layer.data
        for i in range(len(src)):
            dst[i].uv = src[i].uv
    except Exception as ex:
        print(f"[bake_mesh:uv] Notice: manual copy UV coordinates: {ex}", flush=True)

    uvs.active = new_layer
    pack_margin = max(float(margin or 0.01), 0.01)

    try:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        try:
            bpy.ops.uv.pack_islands(margin=pack_margin, shape_method='AABB', rotate=False)
        except TypeError:
            bpy.ops.uv.pack_islands(margin=pack_margin)
        bpy.ops.object.mode_set(mode='OBJECT')
    except Exception as ex:
        print(f"[bake_mesh:uv] Warning: pack_islands: {ex}", flush=True)
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass

    # Re-acquire fresh RNA references after EDIT mode to avoid dead pointers
    fresh_uvs = obj.data.uv_layers
    if uv_name in fresh_uvs:
        uv_idx = fresh_uvs.find(uv_name)
        if uv_idx >= 0:
            fresh_uvs.active_index = uv_idx
            fresh_uvs.active = fresh_uvs[uv_name]

    # Source UV must remain active_render for procedural textures/reading
    if original_uv_name and original_uv_name in fresh_uvs:
        fresh_uvs[original_uv_name].active_render = True

    return original_uv_name


# ---------------------------------------------------------------------------
# Pure-Python Shader Graph Traversal (No UI Ungroup Needed)
# ---------------------------------------------------------------------------
def _find_material_output(mat: Any) -> Optional[Any]:
    if not mat or not mat.use_nodes or not mat.node_tree:
        return None
    nodes = mat.node_tree.nodes
    active = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL' and getattr(n, 'is_active_output', False)), None)
    return active or next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)


def _resolve_socket_source(socket: Any, visited_nodes: Optional[set] = None) -> Tuple[Optional[Any], Any]:
    """
    Recursively traces backwards through links, transparently unrolling MixShaders
    and ShaderNodeGroups without altering the graph or needing UI windows.
    Returns: (from_socket, default_val)
    """
    if visited_nodes is None:
        visited_nodes = set()

    if not socket:
        return None, None

    if not socket.is_linked:
        return None, getattr(socket, "default_value", None)

    link = socket.links[0]
    from_sock = link.from_socket
    from_node = link.from_node

    if from_node in visited_nodes:
        return None, None
    visited_nodes.add(from_node)

    # 1. Direct Image Texture
    if from_node.type == 'TEX_IMAGE':
        return from_sock, None

    # 2. Passthrough Nodes (Reroute, Gamma, RGB to BW, Math/MixRGB if primary)
    if from_node.type == 'REROUTE' and from_node.inputs:
        return _resolve_socket_source(from_node.inputs[0], visited_nodes)

    # 3. ShaderNodeGroup: Dive into group internal nodes without ungrouping
    if from_node.type == 'GROUP' and getattr(from_node, 'node_tree', None):
        group_tree = from_node.node_tree
        group_out = next((n for n in group_tree.nodes if n.type == 'GROUP_OUTPUT' and getattr(n, 'is_active_output', False)), None)
        if not group_out:
            group_out = next((n for n in group_tree.nodes if n.type == 'GROUP_OUTPUT'), None)

        if group_out:
            # Match matching group output socket
            target_in_sock = next((s for s in group_out.inputs if s.identifier == from_sock.identifier or s.name == from_sock.name), None)
            if target_in_sock and target_in_sock.is_linked:
                internal_sock, internal_val = _resolve_socket_source(target_in_sock, visited_nodes.copy())
                if internal_sock is not None:
                    return internal_sock, None

        # Fallback: check if the group node exposes an outer input with the same concept
        return from_sock, getattr(from_sock, "default_value", None)

    # 4. MixShader: Inspect primary non-transparent shader branch
    if from_node.type == 'MIX_SHADER':
        # inputs[1] and inputs[2] are shaders
        s1 = from_node.inputs[1]
        s2 = from_node.inputs[2]
        if s2.is_linked and getattr(s2.links[0].from_node, 'type', '') != 'BSDF_TRANSPARENT':
            return _resolve_socket_source(s2, visited_nodes)
        elif s1.is_linked:
            return _resolve_socket_source(s1, visited_nodes)

    # 5. Direct socket output
    return from_sock, getattr(from_sock, "default_value", None)


def _find_principled_bsdf(tree: Any) -> Optional[Any]:
    if not tree or not hasattr(tree, "nodes"):
        return None
    for n in tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    for n in tree.nodes:
        if n.type == 'GROUP' and getattr(n, 'node_tree', None):
            nested = _find_principled_bsdf(n.node_tree)
            if nested:
                return nested
    return None


def setup_emission_routing(mat: Any, map_type: str) -> Optional[Tuple[Any, Any]]:
    """
    Temporarily wires the target PBR channel into a temporary ShaderNodeEmission
    connected directly to Material Output Surface.
    Returns (emit_node, orig_surface_socket) for restoring after the bake pass.
    """
    defs = MAP_DEFS.get(map_type)
    if not defs:
        return None

    out_node = _find_material_output(mat)
    if not out_node:
        return None

    surface_in = out_node.inputs.get('Surface')
    if not surface_in:
        return None

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    orig_socket = surface_in.links[0].from_socket if surface_in.is_linked else None

    # Resolve target PBR channel socket
    target_socket = None
    default_val = defs.get("default")

    # Search for Principled BSDF in material
    bsdf = _find_principled_bsdf(mat.node_tree)
    if bsdf:
        for s_name in defs.get("sockets", []):
            if s_name in bsdf.inputs:
                target_socket = bsdf.inputs[s_name]
                break

    # If no Principled socket was found, inspect surface source node inputs
    if not target_socket and orig_socket:
        from_node = orig_socket.node
        for s_name in defs.get("sockets", []):
            if s_name in from_node.inputs:
                target_socket = from_node.inputs[s_name]
                break

    # Build emission proxy
    emit_node = nodes.new(type='ShaderNodeEmission')
    emit_node.name = "__ModernBake_Emission__"
    emit_node.inputs['Strength'].default_value = 1.0

    wired = False
    if target_socket:
        resolved_sock, val = _resolve_socket_source(target_socket)
        if resolved_sock:
            try:
                links.new(resolved_sock, emit_node.inputs['Color'])
                wired = True
            except Exception:
                wired = False
        elif val is not None:
            if isinstance(val, (int, float)):
                emit_node.inputs['Color'].default_value = (float(val), float(val), float(val), 1.0)
            elif hasattr(val, '__len__') and len(val) >= 3:
                emit_node.inputs['Color'].default_value = (val[0], val[1], val[2], 1.0)
            wired = True

    if not wired and default_val is not None:
        emit_node.inputs['Color'].default_value = default_val

    links.new(emit_node.outputs['Emission'], surface_in)
    return emit_node, orig_socket


def restore_emission_routing(mat: Any, route_info: Optional[Tuple[Any, Any]]) -> None:
    if not route_info or not mat or not mat.node_tree:
        return
    emit_node, orig_socket = route_info
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    out_node = _find_material_output(mat)

    if out_node and orig_socket:
        try:
            links.new(orig_socket, out_node.inputs['Surface'])
        except Exception:
            pass
    if emit_node and emit_node.name in nodes:
        nodes.remove(emit_node)


# ---------------------------------------------------------------------------
# Explicit UV Pinning for Bake Target
# ---------------------------------------------------------------------------
def prepare_bake_targets(unique_mats: List[Any], uv_name: str, bake_image: Any) -> List[Tuple[Any, Any, Any]]:
    """
    Ensures every material has a dedicated Image Texture target node explicitly
    pinned with a ShaderNodeUVMap node pointing to uv_name.
    Returns list of (mat, tex_node, uv_node).
    """
    targets = []
    for mat in unique_mats:
        if not mat or not mat.node_tree:
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links

        # 1. Target Texture Node
        tex_node = nodes.get("__ModernBake_Target__")
        if not tex_node:
            tex_node = nodes.new(type='ShaderNodeTexImage')
            tex_node.name = "__ModernBake_Target__"
        tex_node.image = bake_image

        # 2. Target UVMap Node (explicit pinning prevents UV coordinate feedback loops)
        uv_node = nodes.get("__ModernBake_UV__")
        if not uv_node:
            uv_node = nodes.new(type='ShaderNodeUVMap')
            uv_node.name = "__ModernBake_UV__"
        uv_node.uv_map = uv_name

        links.new(uv_node.outputs['UV'], tex_node.inputs['Vector'])

        # Set active and selected for Cycles bake targeting
        for n in nodes:
            n.select = False
        tex_node.select = True
        nodes.active = tex_node

        targets.append((mat, tex_node, uv_node))

    return targets


def cleanup_bake_targets(targets: List[Tuple[Any, Any, Any]]) -> None:
    for mat, tex_node, uv_node in targets:
        if not mat or not mat.node_tree:
            continue
        nodes = mat.node_tree.nodes
        if tex_node and tex_node.name in nodes:
            nodes.remove(tex_node)
        if uv_node and uv_node.name in nodes:
            nodes.remove(uv_node)


# ---------------------------------------------------------------------------
# NumPy Channel Packing Engine
# ---------------------------------------------------------------------------
def execute_channel_packing(
    pack_mode: str,
    output_dir: str,
    stem: str,
    resolution: int,
    temp_images: Dict[str, Any]
) -> Tuple[Optional[str], Optional[str]]:
    """
    Packs separate texture channels into industry-standard composite textures using fast NumPy memory views.
    Returns (packed_type, packed_filepath) or (None, None).
    """
    mode = (pack_mode or "none").strip().upper()
    if mode == "NONE":
        return None, None

    try:
        import numpy as np
    except ImportError:
        print("[bake_mesh:pack] Warning: numpy not available, skipping channel packing.", flush=True)
        return None, None

    n = resolution * resolution

    def _get_channel(map_key: str, channel_idx: int, default_val: float) -> np.ndarray:
        if map_key in temp_images and temp_images[map_key]:
            px = np.empty(n * 4, dtype=np.float32)
            temp_images[map_key].pixels.foreach_get(px)
            if px.size == n * 4:
                return px[channel_idx::4].copy()
        return np.full(n, default_val, dtype=np.float32)

    packed_px = np.empty(n * 4, dtype=np.float32)
    suffix = "ORM"
    filename = f"{stem}_ORM.png"

    if mode in ("ORM", "ORMA"):
        # R=AO, G=Roughness, B=Metallic, A=Alpha/1.0
        packed_px[0::4] = _get_channel("ao", 0, 1.0)
        packed_px[1::4] = _get_channel("roughness", 0, 0.5)
        packed_px[2::4] = _get_channel("metallic", 0, 0.0)
        if mode == "ORMA":
            packed_px[3::4] = _get_channel("alpha", 0, 1.0)
            suffix = "ORMA"
            filename = f"{stem}_ORMA.png"
        else:
            packed_px[3::4] = 1.0

    elif mode == "RMA":
        # R=Roughness, G=Metallic, B=AO, A=1.0
        packed_px[0::4] = _get_channel("roughness", 0, 0.5)
        packed_px[1::4] = _get_channel("metallic", 0, 0.0)
        packed_px[2::4] = _get_channel("ao", 0, 1.0)
        packed_px[3::4] = 1.0
        suffix = "RMA"
        filename = f"{stem}_RMA.png"

    elif mode == "MRA":
        # R=Metallic, G=Roughness, B=AO, A=1.0
        packed_px[0::4] = _get_channel("metallic", 0, 0.0)
        packed_px[1::4] = _get_channel("roughness", 0, 0.5)
        packed_px[2::4] = _get_channel("ao", 0, 1.0)
        packed_px[3::4] = 1.0
        suffix = "MRA"
        filename = f"{stem}_MRA.png"

    elif mode == "UNITY_MASK":
        # Unity HDRP / URP Mask Map (MODS):
        # R = Metallic, G = AO, B = Specular/Detail (default 0), A = Smoothness (1.0 - Roughness)
        rough = _get_channel("roughness", 0, 0.5)
        packed_px[0::4] = _get_channel("metallic", 0, 0.0)
        packed_px[1::4] = _get_channel("ao", 0, 1.0)
        packed_px[2::4] = _get_channel("specular", 0, 0.0)
        packed_px[3::4] = 1.0 - rough  # Smoothness inversion
        suffix = "MaskMap"
        filename = f"{stem}_MaskMap.png"

    out_filepath = os.path.join(output_dir, filename)
    packed_img = bpy.data.images.new(f"Bake_{stem}_{suffix}", width=resolution, height=resolution)
    packed_img.colorspace_settings.name = 'Non-Color'
    packed_img.pixels.foreach_set(packed_px)
    packed_img.filepath_raw = out_filepath
    packed_img.file_format = 'PNG'
    packed_img.save()
    bpy.data.images.remove(packed_img)

    print(f"[bake_mesh:pack] Packed {mode} -> '{out_filepath}'", flush=True)
    return suffix.lower(), out_filepath


# ---------------------------------------------------------------------------
# Clean Single Material Creation & Re-assignment
# ---------------------------------------------------------------------------
def build_single_baked_material(material_name: str, textures: Dict[str, str], pack_mode: str) -> Any:
    mat = bpy.data.materials.get(material_name) or bpy.data.materials.new(name=material_name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out_node = nodes.new("ShaderNodeOutputMaterial")
    out_node.location = (400, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])

    def _load_tex(map_type: str, label: str, loc: Tuple[int, int], colorspace: str):
        path = textures.get(map_type, "")
        if not path or not os.path.isfile(path):
            return None
        img = bpy.data.images.load(path, check_existing=True)
        img.colorspace_settings.name = colorspace
        tex = nodes.new("ShaderNodeTexImage")
        tex.label = label
        tex.location = loc
        tex.image = img
        return tex

    # Diffuse / BaseColor
    bc = _load_tex("diffuse", "Baked_BaseColor", (-600, 250), "sRGB")
    if bc and "Base Color" in bsdf.inputs:
        links.new(bc.outputs["Color"], bsdf.inputs["Base Color"])

    # Normal Map (Tangent Space)
    nm = _load_tex("normal", "Baked_Normal", (-600, -350), "Non-Color")
    if nm and "Normal" in bsdf.inputs:
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.location = (-250, -350)
        nmap.space = 'TANGENT'
        links.new(nm.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    # Channel Packed Texture Wiring (ORM, ORMA, MaskMap, etc.)
    packed_key = next((k for k in ("orm", "orma", "rma", "mra", "maskmap") if k in textures), None)
    if packed_key:
        pk = _load_tex(packed_key, f"Baked_{packed_key.upper()}", (-600, -100), "Non-Color")
        sep = nodes.new("ShaderNodeSeparateColor" if hasattr(bpy.types, "ShaderNodeSeparateColor") else "ShaderNodeSeparateRGB")
        sep.location = (-280, -100)
        links.new(pk.outputs["Color"], sep.inputs[0])

        r_ch = sep.outputs.get("Red") or sep.outputs.get("R")
        g_ch = sep.outputs.get("Green") or sep.outputs.get("G")
        b_ch = sep.outputs.get("Blue") or sep.outputs.get("B")

        if packed_key in ("orm", "orma"):
            # R=AO, G=Roughness, B=Metallic
            if g_ch and "Roughness" in bsdf.inputs:
                links.new(g_ch, bsdf.inputs["Roughness"])
            if b_ch and "Metallic" in bsdf.inputs:
                links.new(b_ch, bsdf.inputs["Metallic"])
            if packed_key == "orma" and "Alpha" in bsdf.inputs:
                links.new(pk.outputs["Alpha"], bsdf.inputs["Alpha"])
        elif packed_key == "rma":
            # R=Roughness, G=Metallic, B=AO
            if r_ch and "Roughness" in bsdf.inputs:
                links.new(r_ch, bsdf.inputs["Roughness"])
            if g_ch and "Metallic" in bsdf.inputs:
                links.new(g_ch, bsdf.inputs["Metallic"])
        elif packed_key == "maskmap":
            # R=Metallic, G=AO, B=Detail, A=Smoothness -> Roughness needs Invert or direct
            if r_ch and "Metallic" in bsdf.inputs:
                links.new(r_ch, bsdf.inputs["Metallic"])
            if "Roughness" in bsdf.inputs:
                inv = nodes.new("ShaderNodeInvert")
                inv.location = (-100, -150)
                links.new(pk.outputs["Alpha"], inv.inputs["Color"])
                links.new(inv.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        # Separate Roughness & Metallic
        rgh = _load_tex("roughness", "Baked_Roughness", (-600, -50), "Non-Color")
        if rgh and "Roughness" in bsdf.inputs:
            links.new(rgh.outputs["Color"], bsdf.inputs["Roughness"])
        met = _load_tex("metallic", "Baked_Metallic", (-600, -200), "Non-Color")
        if met and "Metallic" in bsdf.inputs:
            links.new(met.outputs["Color"], bsdf.inputs["Metallic"])

    # Alpha (if not handled by packed texture)
    if "alpha" in textures and not packed_key == "orma":
        alp = _load_tex("alpha", "Baked_Alpha", (-600, 450), "Non-Color")
        if alp and "Alpha" in bsdf.inputs:
            links.new(alp.outputs["Color"], bsdf.inputs["Alpha"])

    return mat


def apply_unified_material(obj: Any, material: Any, uv_name: str) -> None:
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

    if target_uv:
        target_uv.active = True
        target_uv.active_render = True
        for old_u in [u for u in uvs if u != target_uv]:
            uvs.remove(old_u)
        target_uv.name = "UVMap"


# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------
def main(
    target_objects: Optional[List[str]] = None,
    uv_name: str = "UVMap_Baked",
    margin: float = 0.01,
    maps: Optional[List[str]] = None,
    resolution: int = 2048,
    pack_mode: PackModeType = "ORM",
    bake_orm: bool = False,
    output_dir: str = "",
    material_name: str = "",
    ao_samples: int = 32,
    flip_normal_y: bool = True,
    ao_distance: float = 0.25,
) -> dict:
    """
    Modern Headless Mesh Baker (UV unwrap/pack + Cycles EMIT/NORMAL/AO + Channel Packing + Clean Unified PBR).

    Args:
        target_objects: Target mesh names (empty = all meshes).
        uv_name: Intermediate baking UV layer name.
        margin: Island UV margin (0.01 = safe padding against bleeding).
        maps: List of maps to bake ('diffuse', 'roughness', 'normal', 'metallic', 'specular', 'alpha', 'ao').
        resolution: Texture resolution (1024, 2048, 4096).
        pack_mode: Channel packing preset ('none', 'ORM', 'ORMA', 'RMA', 'MRA', 'UNITY_MASK').
        bake_orm: Legacy flag backward compatibility (auto sets pack_mode to 'ORM').
        output_dir: Target texture directory.
        material_name: Unified output material name (default 'M_<Stem>').
        ao_samples: Monte Carlo raycast sample count for Ambient Occlusion.
        flip_normal_y: Flip Green channel for DirectX / Unreal Engine 5 tangent normal.
        ao_distance: Maximum ray search radius in meters for Ambient Occlusion.
    """
    if not HAS_BPY:
        raise RuntimeError("Blender Python (bpy) is not available.")

    # Backward compatibility for legacy bake_orm parameter
    if bake_orm and pack_mode == "none":
        pack_mode = "ORM"

    targets = _normalize_targets(target_objects)
    selected_maps = _normalize_maps(maps, pack_mode)

    try:
        resolution = int(resolution) if resolution else 2048
    except (ValueError, TypeError):
        resolution = 2048

    try:
        margin = max(float(margin), 0.008) if margin is not None else 0.01
    except (ValueError, TypeError):
        margin = 0.01

    meshes = _resolve_target_meshes(targets)
    if not meshes:
        print(f"[bake_mesh] No meshes matched targets {targets}, skipping.", flush=True)
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

    orig_cycles = setup_cycles_engine(resolution=resolution, margin=32, ao_distance=ao_distance)

    baked_maps: Dict[str, Dict[str, str]] = {}
    baked_files: List[str] = []
    updated_materials: List[str] = []
    applied_objects: List[str] = []

    for obj in meshes:
        stem = _safe_stem(obj.name)
        print(f"[bake_mesh] Processing '{obj.name}' maps={selected_maps} pack_mode={pack_mode} res={resolution}", flush=True)

        # 1. Ensure isolated destination UV layer
        ensure_bake_uv(obj, uv_name, margin)

        # 2. Select object exclusively
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        unique_mats = [s.material for s in obj.material_slots if s.material and s.material.use_nodes and s.material.node_tree]
        if not unique_mats:
            print(f"[bake_mesh] Warning: {obj.name} has no node materials, skipping.", flush=True)
            continue

        obj_maps: Dict[str, str] = {}
        temp_images_for_pack: Dict[str, Any] = {}

        for map_type in selected_maps:
            defs = MAP_DEFS[map_type]
            suffix = defs["suffix"]
            out_filename = f"{stem}_{suffix}.png"
            out_filepath = os.path.join(output_dir, out_filename)
            technique = defs["technique"]

            bake_img = bpy.data.images.new(
                name=f"Bake_{stem}_{suffix}",
                width=resolution,
                height=resolution,
                alpha=True,
                float_buffer=(technique == "NORMAL"),
            )
            if defs["colorspace"] != "sRGB":
                bake_img.colorspace_settings.name = 'Non-Color'

            # Ensure target UV layer is active for baking
            if uv_name in obj.data.uv_layers:
                u_idx = obj.data.uv_layers.find(uv_name)
                if u_idx >= 0:
                    obj.data.uv_layers.active_index = u_idx
                    obj.data.uv_layers.active = obj.data.uv_layers[uv_name]

            # Pinned UV targets prevent feedback loops
            targets_info = prepare_bake_targets(unique_mats, uv_name, bake_img)

            if technique == "NORMAL":
                bpy.context.scene.cycles.samples = 1
                print(f"[bake_mesh:bake] {obj.name} normal -> '{out_filename}' (1spp)", flush=True)
                bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', save_mode='INTERNAL')

                # Optional DirectX Y- Invert (flips green channel via NumPy)
                if flip_normal_y:
                    try:
                        import numpy as np
                        px = np.empty(resolution * resolution * 4, dtype=np.float32)
                        bake_img.pixels.foreach_get(px)
                        px[1::4] = 1.0 - px[1::4]  # Flip Green channel
                        bake_img.pixels.foreach_set(px)
                        print(f"[bake_mesh:bake] Flipped normal Y- (DirectX / UE5 format)", flush=True)
                    except Exception as ex:
                        print(f"[bake_mesh:bake] Warning: DirectX flip: {ex}", flush=True)

            elif technique == "AO":
                # Isolate target mesh from other scene objects to prevent false occlusion (e.g. skin blocked by cloth)
                other_objs_vis = {}
                for other_o in bpy.data.objects:
                    if other_o != obj and other_o.type == 'MESH':
                        other_objs_vis[other_o] = other_o.hide_render
                        other_o.hide_render = True

                ao_spp = max(int(ao_samples) if ao_samples else 32, 8)
                bpy.context.scene.cycles.samples = ao_spp
                print(f"[bake_mesh:bake] {obj.name} ao -> '{out_filename}' ({ao_spp}spp, isolated)", flush=True)

                try:
                    bpy.ops.object.bake(type='AO', save_mode='INTERNAL')
                finally:
                    # Restore other objects visibility
                    for other_o, prev_vis in other_objs_vis.items():
                        other_o.hide_render = prev_vis

            else:
                # Value transfer via Emission routing (1 sample, deterministic)
                bpy.context.scene.cycles.samples = 1
                print(f"[bake_mesh:bake] {obj.name} {suffix} via EMIT -> '{out_filename}' (1spp)", flush=True)
                routes = {}
                for m in unique_mats:
                    r_info = setup_emission_routing(m, map_type)
                    if r_info:
                        routes[m] = r_info

                # Ensure target texture node remains active after emission node creation
                for m, tex_n, _ in targets_info:
                    if m and m.node_tree and tex_n:
                        for n in m.node_tree.nodes:
                            n.select = False
                        tex_n.select = True
                        m.node_tree.nodes.active = tex_n

                bpy.ops.object.bake(type='EMIT', save_mode='INTERNAL')

                for m, r_info in routes.items():
                    restore_emission_routing(m, r_info)

            cleanup_bake_targets(targets_info)

            bake_img.filepath_raw = out_filepath
            bake_img.file_format = 'PNG'
            bake_img.save()
            obj_maps[map_type] = out_filepath
            baked_files.append(out_filepath)

            if map_type in ("roughness", "metallic", "ao", "alpha", "specular"):
                temp_images_for_pack[map_type] = bake_img
            else:
                try:
                    bpy.data.images.remove(bake_img)
                except Exception:
                    pass

        # 3. Channel Packing Pass
        if pack_mode != "none":
            pack_key, pack_path = execute_channel_packing(pack_mode, output_dir, stem, resolution, temp_images_for_pack)
            if pack_key and pack_path:
                obj_maps[pack_key] = pack_path
                baked_files.append(pack_path)

        for img in temp_images_for_pack.values():
            try:
                bpy.data.images.remove(img)
            except Exception:
                pass

        # 4. Apply clean unified PBR material
        mat_title = material_name if (material_name and len(meshes) == 1) else (f"{material_name}_{stem}" if material_name else f"M_{stem}")
        baked_mat = build_single_baked_material(mat_title, obj_maps, pack_mode)
        apply_unified_material(obj, baked_mat, uv_name)

        baked_maps[obj.name] = obj_maps
        applied_objects.append(obj.name)
        if baked_mat.name not in updated_materials:
            updated_materials.append(baked_mat.name)

        print(f"[bake_mesh] Completed '{obj.name}' -> material '{baked_mat.name}' ({len(obj_maps)} maps)", flush=True)

    restore_cycles_settings(orig_cycles)
    print(f"[bake_mesh] Successfully finished {len(applied_objects)} mesh(es). Output: '{output_dir}'", flush=True)

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
