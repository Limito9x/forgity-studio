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
        "sockets": ["Base Color", "BaseColor", "Color", "Diffuse Color", "Diffuse", "Albedo"],
        "default": (1.0, 1.0, 1.0, 1.0),
    },
    "roughness": {
        "suffix": "Roughness",
        "technique": "EMIT",
        "colorspace": "Non-Color",
        "sockets": ["Roughness", "Glossy Roughness", "Roughness 1", "Specular Roughness"],
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

# ---------------------------------------------------------------------------
# Channel Packing Presets (Declarative Single Source of Truth)
# ---------------------------------------------------------------------------
CHANNEL_PACK_PRESETS: Dict[str, Dict[str, Any]] = {
    "none": {
        "suffix": "",
        "channels": {},
        "description": "No packing - export separate individual textures (BaseColor, Roughness, Normal)",
    },
    "ORM": {
        "suffix": "ORM",
        "channels": {
            "R": ("ao", 1.0),
            "G": ("roughness", 0.5),
            "B": ("metallic", 0.0),
            "A": 1.0,
        },
        "description": "Unreal Engine 5 PBR (R=AO, G=Roughness, B=Metallic)",
    },
    "ORMA": {
        "suffix": "ORMA",
        "channels": {
            "R": ("ao", 1.0),
            "G": ("roughness", 0.5),
            "B": ("metallic", 0.0),
            "A": ("alpha", 1.0),
        },
        "description": "Unreal Engine 5 with Opacity (R=AO, G=Roughness, B=Metallic, A=Alpha)",
    },
    "RMA": {
        "suffix": "RMA",
        "channels": {
            "R": ("roughness", 0.5),
            "G": ("metallic", 0.0),
            "B": ("ao", 1.0),
            "A": 1.0,
        },
        "description": "RMA Standard (R=Roughness, G=Metallic, B=AO)",
    },
    "MRA": {
        "suffix": "MRA",
        "channels": {
            "R": ("metallic", 0.0),
            "G": ("roughness", 0.5),
            "B": ("ao", 1.0),
            "A": 1.0,
        },
        "description": "MRA Standard (R=Metallic, G=Roughness, B=AO)",
    },
    "UNITY_MASK": {
        "suffix": "MaskMap",
        "channels": {
            "R": ("metallic", 0.0),
            "G": ("ao", 1.0),
            "B": ("specular", 0.0),
            "A": ("smoothness", 0.5),  # Inverted Roughness
        },
        "description": "Unity HDRP/URP Mask Map (R=Metallic, G=AO, B=Detail, A=Smoothness)",
    },
}

PackModeType = Literal["none", "ORM", "ORMA", "RMA", "MRA", "UNITY_MASK"]
NormalFormatType = Literal["directx", "opengl"]


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

    # Note: We do NOT force-inject 'ao' or 'metallic' unless explicitly requested by the user.
    # Channel packing presets (ORM, RMA, etc.) will cleanly fallback to default constants
    # (AO=1.0, Metallic=0.0) via _get_channel() without wasting minutes raytracing unrequested maps.
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


BAKE_NODE_PREFIX = "__ModernBake_"
BAKE_IMAGE_PREFIX = "Bake_"

# Last-resort filename hints (only used when the shader graph gives no usable link).
# DAZ vendor suffixes: D=diffuse, N=normal, R=roughness, S=specular, GR=glossy-roughness.
CHANNEL_IMAGE_HINTS: Dict[str, Tuple[str, ...]] = {
    "diffuse": ("basecolor", "base_color", "base color", "diffuse", "albedo", "_d_", "_d.", "d.png", "d.jpg"),
    "roughness": ("roughness", "_gr", " gr", "r.png", "r.jpg", "_r_", "_r."),
    "metallic": ("metallic", "metalness", "_m_", "_m."),
    "alpha": ("opacity", "alpha", "cutout"),
    "specular": ("specular", "s.png", "s.jpg"),
}


def _is_bake_artifact(node: Any) -> bool:
    """Never sample our own bake target / proxy nodes (prevents black self-feedback)."""
    if (getattr(node, "name", "") or "").startswith(BAKE_NODE_PREFIX):
        return True
    img = getattr(node, "image", None)
    return bool(img and (img.name or "").startswith(BAKE_IMAGE_PREFIX))


def _match_input(node: Any, socket_names: List[str]) -> Optional[Any]:
    """Exact (case-insensitive) socket name match, in MAP_DEFS priority order. No substring guessing."""
    by_name = {s.name.lower(): s for s in node.inputs if getattr(s, "enabled", True)}
    for name in socket_names:
        sock = by_name.get(name.lower())
        if sock is not None:
            return sock
    return None


def _find_principled_bsdf(tree: Any) -> Optional[Any]:
    """Prefer a ROOT-level Principled BSDF (Diffeomorphic wires textures there); dive into groups only as fallback."""
    if not tree or not hasattr(tree, "nodes"):
        return None
    roots = [n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED']
    if roots:
        return next((n for n in roots if n.outputs and n.outputs[0].is_linked), roots[0])
    for n in tree.nodes:
        if n.type == 'GROUP' and getattr(n, 'node_tree', None):
            nested = _find_principled_bsdf(n.node_tree)
            if nested:
                return nested
    return None


def _trace_to_texture(socket: Any, depth: int = 0) -> Optional[Any]:
    """Follow a link chain (incl. into node groups) until an Image Texture node is found."""
    if depth > 12 or not socket or not socket.is_linked:
        return None
    link = socket.links[0]
    node, out = link.from_node, link.from_socket
    if node.type == 'TEX_IMAGE':
        return None if _is_bake_artifact(node) else node
    if node.type == 'GROUP' and getattr(node, "node_tree", None):
        g_out = next((n for n in node.node_tree.nodes if n.type == 'GROUP_OUTPUT'), None)
        if g_out:
            inner = next((s for s in g_out.inputs if s.identifier == out.identifier or s.name == out.name), None)
            found = _trace_to_texture(inner, depth + 1)
            if found:
                return found
    for inp in node.inputs:
        if inp.is_linked:
            found = _trace_to_texture(inp, depth + 1)
            if found:
                return found
    return None


def _set_constant(emit_node: Any, val: Any) -> bool:
    if isinstance(val, (int, float)):
        emit_node.inputs['Color'].default_value = (float(val), float(val), float(val), 1.0)
        return True
    if hasattr(val, '__len__') and len(val) >= 3:
        emit_node.inputs['Color'].default_value = (val[0], val[1], val[2], 1.0)
        return True
    return False


def setup_emission_routing(mat: Any, map_type: str) -> Optional[Tuple[Any, Any, List[Any]]]:
    """
    Temporarily routes one PBR channel into an Emission shader on Material Output.Surface.

    Resolution order (stops at first success). Candidate sockets come from the Principled BSDF
    and from the group driving Material Output (DAZ Dual Lobe: "Roughness 1"); linked wins:
      1. Candidate LINKED in the same tree -> link that exact upstream socket
         (keeps DAZ Mix/Gamma/Math tints intact, e.g. GR texture -> Math -> Roughness).
      2. Linked but upstream lives in another node tree -> proxy Image Texture of the traced image.
      3. All UNLINKED -> constant (group value preferred; roughness <= 0.01 -> 0.5 guard).
      4. No Principled at all -> filename hint scan (bake artifacts excluded) -> MAP_DEFS default.
    Returns (emit_node, orig_surface_socket, proxy_nodes) for restore_emission_routing.
    """
    defs = MAP_DEFS.get(map_type)
    out_node = _find_material_output(mat)
    surface_in = out_node.inputs.get('Surface') if (defs and out_node) else None
    if not surface_in:
        return None

    tree = mat.node_tree
    nodes, links = tree.nodes, tree.links
    orig_socket = surface_in.links[0].from_socket if surface_in.is_linked else None

    emit_node = nodes.new(type='ShaderNodeEmission')
    emit_node.name = BAKE_NODE_PREFIX + "Emission__"
    emit_node.inputs['Strength'].default_value = 1.0
    color_in = emit_node.inputs['Color']
    proxy_nodes: List[Any] = []
    source = ""

    def _proxy_texture(tex_node: Any) -> None:
        proxy = nodes.new(type='ShaderNodeTexImage')
        proxy.name = BAKE_NODE_PREFIX + "ProxyTex__"
        proxy.image = tex_node.image
        proxy.interpolation = getattr(tex_node, "interpolation", "Linear")
        links.new(proxy.outputs['Color'], color_in)
        proxy_nodes.append(proxy)

    bsdf = _find_principled_bsdf(tree)
    s_names = defs.get("sockets", [])

    # DAZ "Dual Lobe PBR" / Diffeomorphic groups drive Material Output directly and carry the real
    # specular roughness on "Roughness 1/2", while the root Principled Roughness stays 0.0.
    surface_node = orig_socket.node if orig_socket is not None else None
    if surface_node is bsdf or getattr(surface_node, "type", "") not in ('GROUP', 'BSDF_PRINCIPLED'):
        surface_node = None

    p_sock = _match_input(bsdf, s_names) if bsdf else None
    g_sock = _match_input(surface_node, s_names) if surface_node else None
    linked = next((s for s in (p_sock, g_sock) if s is not None and s.is_linked), None)
    sock = linked or g_sock or p_sock

    if sock is not None and sock.is_linked:
        upstream = sock.links[0].from_socket
        # DAZ/Diffeomorphic Skin SSS Mix Pitfall:
        # Diffeomorphic connects Principled BSDF 'Base Color' to a Mix node (Factor=0.85)
        # where Input A is the real Diffuse texture and Input B is a heavily gamma-darkened (3.5) SSS map.
        # Baking this Mix node burns the skin to dark brown. We must extract the true diffuse upstream (Input A).
        if map_type == "diffuse" and upstream.node.type in ('MIX', 'MIX_RGB'):
            mix_node = upstream.node
            # Check inputs for the true diffuse texture
            found_diffuse_socket = None
            for inp_name in ('A', 'Color1', 'Color 1'):
                inp = mix_node.inputs.get(inp_name)
                if inp and inp.is_linked:
                    found_diffuse_socket = inp.links[0].from_socket
                    break
            if found_diffuse_socket is not None:
                upstream = found_diffuse_socket
                print(f"[bake_mesh:emit] {mat.name}: Bypassed Diffeomorphic SSS Mix node, using pure diffuse input '{upstream.node.name}'.", flush=True)

        if sock.node.id_data == tree and not _is_bake_artifact(upstream.node):
            links.new(upstream, color_in)
            source = f"linked {sock.node.name}.{sock.name} <- {upstream.node.name}"
        else:
            tex = _trace_to_texture(sock)
            if tex:
                _proxy_texture(tex)
                source = f"proxy texture '{tex.image.name}' (nested {sock.node.name}.{sock.name})"

    if not source and sock is not None and not sock.is_linked:
        val = getattr(sock, "default_value", None)
        if map_type == "roughness" and isinstance(val, (int, float)) and float(val) <= 0.01:
            val = 0.5  # 0.0 roughness is almost always an uninitialized socket -> mirror-like skin
        if _set_constant(emit_node, val):
            source = f"constant {sock.node.name}.{sock.name}={val if isinstance(val, (int, float)) else tuple(val)[:3]}"

    if not source and bsdf is None:
        hints = CHANNEL_IMAGE_HINTS.get(map_type, ())
        for n in nodes:
            if n.type == 'TEX_IMAGE' and n.image and not _is_bake_artifact(n):
                label = f"{n.image.name} {n.label} {n.name}".lower()
                if any(h in label for h in hints):
                    _proxy_texture(n)
                    source = f"filename hint '{n.image.name}'"
                    break

    if not source and defs.get("default") is not None:
        color_in.default_value = defs["default"]
        source = f"MAP_DEFS default {defs['default']}"

    print(f"[bake_mesh:emit] {mat.name} [{map_type}] <- {source or 'UNRESOLVED'}", flush=True)
    links.new(emit_node.outputs['Emission'], surface_in)
    return emit_node, orig_socket, proxy_nodes


def restore_emission_routing(mat: Any, route_info: Optional[Tuple[Any, ...]]) -> None:
    if not route_info or not mat or not mat.node_tree:
        return
    emit_node = route_info[0]
    orig_socket = route_info[1]
    proxy_nodes = route_info[2] if len(route_info) > 2 else []

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
    for p_n in proxy_nodes:
        if p_n and p_n.name in nodes:
            try:
                nodes.remove(p_n)
            except Exception:
                pass


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
# NumPy Channel Packing Engine (Data-Driven Preset Registry)
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
    Driven by declarative CHANNEL_PACK_PRESETS table.
    """
    mode = (pack_mode or "none").strip().upper()
    preset = CHANNEL_PACK_PRESETS.get(mode) or CHANNEL_PACK_PRESETS.get(pack_mode)
    if not preset or not preset.get("channels"):
        return None, None

    try:
        import numpy as np
    except ImportError:
        print("[bake_mesh:pack] Warning: numpy not available, skipping channel packing.", flush=True)
        return None, None

    n = resolution * resolution

    def _get_channel(spec: Any) -> np.ndarray:
        if isinstance(spec, (int, float)):
            return np.full(n, float(spec), dtype=np.float32)
        if isinstance(spec, tuple):
            map_key, default_val = spec
            if map_key == "smoothness":
                # Invert roughness for Unity MaskMap
                r_arr = _get_channel(("roughness", default_val))
                return 1.0 - r_arr
            if map_key in temp_images and temp_images[map_key]:
                px = np.empty(n * 4, dtype=np.float32)
                temp_images[map_key].pixels.foreach_get(px)
                if px.size == n * 4:
                    return px[0::4].copy()
            return np.full(n, default_val, dtype=np.float32)
        return np.full(n, 1.0, dtype=np.float32)

    channels = preset["channels"]
    packed_px = np.empty(n * 4, dtype=np.float32)
    packed_px[0::4] = _get_channel(channels.get("R", 1.0))
    packed_px[1::4] = _get_channel(channels.get("G", 1.0))
    packed_px[2::4] = _get_channel(channels.get("B", 1.0))
    packed_px[3::4] = _get_channel(channels.get("A", 1.0))

    suffix = preset.get("suffix", mode)
    filename = f"{stem}_{suffix}.png"
    out_filepath = os.path.join(output_dir, filename)

    packed_img = bpy.data.images.new(f"Bake_{stem}_{suffix}", width=resolution, height=resolution)
    packed_img.colorspace_settings.name = 'Non-Color'
    packed_img.pixels.foreach_set(packed_px)
    packed_img.filepath_raw = out_filepath
    packed_img.file_format = 'PNG'
    packed_img.save()
    bpy.data.images.remove(packed_img)
    print(f"[bake_mesh:pack] Packed {mode} ({preset.get('description', '')}) -> '{out_filepath}'", flush=True)
    return suffix.lower(), out_filepath

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
    pack_mode: PackModeType = "none",
    normal_format: NormalFormatType = "directx",
    output_dir: str = "",
    material_name: str = "",
    ao_samples: int = 32,
    ao_distance: float = 0.25,
    **kwargs
) -> dict:
    """
    Modern Headless Mesh Baker (UV unwrap/pack + Cycles EMIT/NORMAL/AO + Channel Packing + Clean Unified PBR).

    Args:
        target_objects: Target mesh names (empty = all meshes).
        uv_name: Intermediate baking UV layer name.
        margin: Island UV margin (0.01 = safe padding against bleeding).
        maps: List of maps to bake ('diffuse', 'roughness', 'normal', 'metallic', 'specular', 'alpha', 'ao').
        resolution: Texture resolution (1024, 2048, 4096).
        pack_mode: Channel packing preset ('none', 'ORM', 'ORMA', 'RMA', 'MRA', 'UNITY_MASK'). Defaults to 'none' for separate maps.
        normal_format: Target normal format ('directx' for Unreal Engine 5 Y-, 'opengl' for Unity/Blender Y+). Defaults to 'directx'.
        output_dir: Target texture directory.
        material_name: Unified output material name (default 'M_<Stem>').
        ao_samples: Monte Carlo raycast sample count for Ambient Occlusion.
        ao_distance: Maximum ray search radius in meters for Ambient Occlusion.
    """
    if not HAS_BPY:
        raise RuntimeError("Blender Python (bpy) is not available.")

    # Backward compatibility for legacy bake_orm parameter
    legacy_bake_orm = kwargs.get("bake_orm", False)
    if legacy_bake_orm and pack_mode == "none":
        pack_mode = "ORM"

    # Resolve DirectX vs OpenGL normal format with backward compatibility for flip_normal_y
    if "flip_normal_y" in kwargs:
        is_directx = bool(kwargs["flip_normal_y"])
    else:
        is_directx = (str(normal_format or "directx").lower() == "directx")

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

                # Optional DirectX Y- Invert (flips green channel via NumPy for UE5)
                if is_directx:
                    try:
                        import numpy as np
                        px = np.empty(resolution * resolution * 4, dtype=np.float32)
                        bake_img.pixels.foreach_get(px)
                        px[1::4] = 1.0 - px[1::4]  # Flip Green channel
                        bake_img.pixels.foreach_set(px)
                        print(f"[bake_mesh:bake] Converted normal Y- (DirectX / UE5 format)", flush=True)
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
