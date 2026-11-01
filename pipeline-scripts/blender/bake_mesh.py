# pyrefly: ignore [missing-import]
"""
Pipeline Tool: Modern Headless Mesh Baker (UV + Value/Geometry/AO Transfer + Channel Packing + Clean Unified PBR).
Designed from the ground up for Headless CLI execution (blender -b) with zero UI dependencies.
Optimized for DAZ characters (FBX Compatible / PBR) and Game Engine pipelines (Unreal Engine 5).

Key Features:
- Dual Character Baking Modes:
  * 'head_and_body' (Default): Separates Head (Face/Ears/Neck) and Body (Torso/Arms/Legs/Nails)
    into 2 dedicated 4K/2K material slots for maximum Texel Density on closeups without blurry faces.
  * 'all_in_one': Consolidates the entire character into a single unified material slot for Mobile/NPCs.
- Automatic Exclusion of Auxiliary Slots: Eyes, Cornea, Sclera, Iris, Eyelashes, Tear, Mouth, and Teeth
  are automatically excluded from baking and kept intact with their original transparent/refractive shaders.
- Pure-Python Shader Graph Traversal: Seamlessly extracts PBR maps from standard Principled BSDF
  as well as legacy Diffeomorphic networks without calling UI-dependent operators.
- Explicit UV Target Pinning & UDIM Island Normalization: Resolves UDIM tiles (1001-1005) into clean
  [0, 1] atlases with automatic island packing.
- Native Channel Packing: High-performance NumPy composite packing for ORM (UE5), ORMA, RMA, and UNITY_MASK.
- Standard Normal Format: Defaults to OpenGL (Y+) with Unreal Engine 5 auto-flip support.
"""

import math
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

BakeModeType = Literal["head_and_body", "all_in_one"]
PackModeType = Literal["ORM", "ORMA", "none", "RMA", "MRA", "UNITY_MASK"]
NormalFormatType = Literal["opengl", "directx"]

# DAZ Character Slot Classification Keywords
HEAD_KW = ["head", "face", "ear", "lip", "neck"]
BODY_KW = ["body", "torso", "arm", "leg", "limb", "skin", "nail", "hand", "foot"]
EXCLUDE_KW = ["eye", "cornea", "sclera", "iris", "tear", "lash", "eyelash", "mouth", "teeth", "tooth", "tongue"]


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

    return canonical or list(DEFAULT_MAPS)


def _resolve_target_meshes(targets: List[str]) -> List[Any]:
    all_meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    sub_keywords = ['eye', 'mouth', 'eyelash', 'lash', 'tear', 'cornea', 'teeth', 'tongue', 'brow']

    if not targets:
        # Default: auto-select all main figure and clothing meshes, skipping auxiliary meshes (eyes, mouth, eyelashes)
        return [m for m in all_meshes if not any(kw in m.name.lower() for kw in sub_keywords)]

    resolved: List[Any] = []
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
# Slot Categorization for DAZ Characters
# ---------------------------------------------------------------------------
def categorize_mesh_slots(obj: Any, bake_mode: str) -> Tuple[List[Dict[str, Any]], List[Tuple[int, Any]]]:
    """
    Categorizes object's material slots into bake groups and preserved slots.
    Returns:
        bake_groups: List of group dicts: {
            "name": "Head" | "Body" | "",
            "mats": List[Material],
            "slot_indices": List[int],
            "poly_indices": List[int],
            "should_pack": bool
        }
        preserved_slots: List of (slot_index, material) to keep untouched.
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

        # Check for excluded auxiliary slots (eyes, mouth, teeth, eyelashes)
        if any(k in m_lower for k in EXCLUDE_KW):
            preserved_slots.append((idx, mat))
        elif any(k in m_lower for k in HEAD_KW):
            head_slots.append((idx, mat))
        elif any(k in m_lower for k in BODY_KW):
            body_slots.append((idx, mat))
        else:
            # Default unclassified slots go into body group
            body_slots.append((idx, mat))

    head_slot_set = {s[0] for s in head_slots}
    body_slot_set = {s[0] for s in body_slots}

    head_polys = [p.index for p in mesh.polygons if p.material_index in head_slot_set]
    body_polys = [p.index for p in mesh.polygons if p.material_index in body_slot_set]

    bake_groups: List[Dict[str, Any]] = []

    if bake_mode == "head_and_body" and head_slots and body_slots:
        # Dual-group mode for main character figures
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
        # Single-group mode (either all_in_one requested, or mesh is clothing/prop)
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


# ---------------------------------------------------------------------------
# Cycles Engine Setup & Teardown
# ---------------------------------------------------------------------------
def setup_cycles_engine(resolution: int = 4096, margin: int = 32, ao_distance: float = 0.25) -> Dict[str, Any]:
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

    try:
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
        scene.view_settings.exposure = 0.0
        scene.view_settings.gamma = 1.0
    except Exception:
        pass

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
# UV Preparation (UDIM Normalization & Selective Island Packing)
# ---------------------------------------------------------------------------
def ensure_bake_uv(obj: Any, uv_name: str, margin: float, bake_groups: List[Dict[str, Any]]) -> str:
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

    # Recreate bake target UV layer and duplicate source coordinates with UDIM normalization
    if uv_name in uvs:
        try:
            uvs.remove(uvs[uv_name])
        except Exception:
            pass

    src_layer = uvs[original_uv_name]
    new_layer = uvs.new(name=uv_name)
    try:
        src = src_layer.data
        dst = new_layer.data
        for i in range(len(src)):
            u, v = src[i].uv
            # Shift UDIM tiles (e.g. 1001-1005) into canonical [0, 1] range
            dst[i].uv = (u - math.floor(u), v - math.floor(v))
    except Exception as ex:
        print(f"[bake_mesh:uv] Notice: manual copy UV coordinates: {ex}", flush=True)

    uvs.active = new_layer
    pack_margin = max(float(margin or 0.01), 0.01)

    # Selective island packing per group
    for grp in bake_groups:
        if not grp.get("should_pack"):
            continue
        poly_indices = grp.get("poly_indices", [])
        if not poly_indices:
            continue

        try:
            bpy.ops.object.mode_set(mode='OBJECT')
            for p in mesh.polygons:
                p.select = (p.index in poly_indices)

            bpy.ops.object.mode_set(mode='EDIT')
            try:
                bpy.ops.uv.pack_islands(margin=pack_margin, shape_method='AABB', rotate=False)
            except TypeError:
                bpy.ops.uv.pack_islands(margin=pack_margin)
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception as ex:
            print(f"[bake_mesh:uv] Warning: pack_islands for group '{grp.get('name')}': {ex}", flush=True)
            try:
                bpy.ops.object.mode_set(mode='OBJECT')
            except Exception:
                pass

    # Ensure all polygons are deselected after packing
    for p in mesh.polygons:
        p.select = False

    # Re-acquire fresh RNA references
    fresh_uvs = obj.data.uv_layers
    if uv_name in fresh_uvs:
        uv_idx = fresh_uvs.find(uv_name)
        if uv_idx >= 0:
            fresh_uvs.active_index = uv_idx
            fresh_uvs.active = fresh_uvs[uv_name]

    if original_uv_name and original_uv_name in fresh_uvs:
        fresh_uvs[original_uv_name].active_render = True

    return original_uv_name


# ---------------------------------------------------------------------------
# Pure-Python Shader Graph Traversal
# ---------------------------------------------------------------------------
def _find_material_output(mat: Any) -> Optional[Any]:
    if not mat or not mat.use_nodes or not mat.node_tree:
        return None
    nodes = mat.node_tree.nodes
    active = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL' and getattr(n, 'is_active_output', False)), None)
    return active or next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)


BAKE_NODE_PREFIX = "__ModernBake_"
BAKE_IMAGE_PREFIX = "Bake_"


def _is_bake_artifact(node: Any) -> bool:
    if not node:
        return False
    name = getattr(node, "name", "")
    if name.startswith(BAKE_NODE_PREFIX):
        return True
    if getattr(node, "type", "") == 'TEX_IMAGE' and getattr(node, "image", None):
        img_name = getattr(node.image, "name", "")
        if img_name.startswith(BAKE_IMAGE_PREFIX) or img_name.startswith("ModernBake_"):
            return True
    return False


def _find_principled_bsdf(tree: Any) -> Optional[Any]:
    if not tree or not hasattr(tree, "nodes"):
        return None
    active_bsdf = next((n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED' and not _is_bake_artifact(n)), None)
    return active_bsdf


def _match_input(node: Any, names: List[str]) -> Optional[Any]:
    if not node or not hasattr(node, "inputs"):
        return None
    for name in names:
        inp = node.inputs.get(name)
        if inp is not None:
            return inp
    for inp in node.inputs:
        clean = inp.name.replace(" ", "").lower()
        for name in names:
            if clean == name.replace(" ", "").lower():
                return inp
    return None


def setup_emission_routing(mat: Any, map_type: str) -> Optional[Tuple[Any, Any, List[Any]]]:
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

    bsdf = _find_principled_bsdf(tree)
    s_names = defs.get("sockets", [])

    surface_node = orig_socket.node if orig_socket is not None else None
    if surface_node is bsdf or getattr(surface_node, "type", "") not in ('GROUP', 'BSDF_PRINCIPLED'):
        surface_node = None

    p_sock = _match_input(bsdf, s_names) if bsdf else None
    g_sock = _match_input(surface_node, s_names) if surface_node else None
    linked = next((s for s in (p_sock, g_sock) if s is not None and s.is_linked), None)
    sock = linked or g_sock or p_sock

    if sock is not None and sock.is_linked:
        upstream = sock.links[0].from_socket
        # Diffeomorphic Skin SSS Mix Pitfall: bypass Input B gamma 3.5
        if map_type == "diffuse" and upstream.node.type in ('MIX', 'MIX_RGB'):
            mix_node = upstream.node
            for inp_name in ('A', 'Color1', 'Color 1'):
                inp = mix_node.inputs.get(inp_name)
                if inp and inp.is_linked:
                    upstream = inp.links[0].from_socket
                    break

        if sock.node.id_data == tree and not _is_bake_artifact(upstream.node):
            links.new(upstream, color_in)
    elif sock is not None:
        def_val = getattr(sock, "default_value", None)
        if def_val is not None:
            if isinstance(def_val, (int, float)):
                color_in.default_value = (float(def_val), float(def_val), float(def_val), 1.0)
            elif hasattr(def_val, '__len__') and len(def_val) >= 3:
                color_in.default_value = (def_val[0], def_val[1], def_val[2], 1.0)

    links.new(emit_node.outputs['Emission'], surface_in)
    return (emit_node, orig_socket, proxy_nodes)


def restore_emission_routing(mat: Any, routing_info: Optional[Tuple[Any, Any, List[Any]]]) -> None:
    if not routing_info or not mat or not mat.node_tree:
        return
    emit_node, orig_socket, proxy_nodes = routing_info
    tree = mat.node_tree
    nodes, links = tree.nodes, tree.links

    out_node = _find_material_output(mat)
    if out_node and out_node.inputs.get('Surface'):
        surface_in = out_node.inputs['Surface']
        if orig_socket is not None and orig_socket.node in nodes.values():
            links.new(orig_socket, surface_in)
        else:
            for l in list(surface_in.links):
                links.remove(l)

    if emit_node and emit_node.name in nodes:
        nodes.remove(emit_node)
    for p in proxy_nodes:
        if p and p.name in nodes:
            nodes.remove(p)


# ---------------------------------------------------------------------------
# Target Pinning for Cycles Bake
# ---------------------------------------------------------------------------
def prepare_bake_targets(materials: List[Any], uv_name: str, target_image: Any) -> List[Tuple[Any, Any, Any]]:
    targets = []
    for mat in materials:
        if not mat or not mat.use_nodes or not mat.node_tree:
            continue
        tree = mat.node_tree
        nodes, links = tree.nodes, tree.links

        tex_node = nodes.new(type='ShaderNodeTexImage')
        tex_node.name = BAKE_NODE_PREFIX + "TargetTex__"
        tex_node.image = target_image

        uv_node = nodes.new(type='ShaderNodeUVMap')
        uv_node.name = BAKE_NODE_PREFIX + "TargetUV__"
        uv_node.uv_map = uv_name

        links.new(uv_node.outputs['UV'], tex_node.inputs['Vector'])

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


# ---------------------------------------------------------------------------
# Baked Material Builder
# ---------------------------------------------------------------------------
def build_single_baked_material(material_name: str, textures: Dict[str, str], pack_mode: str) -> Any:
    mat = bpy.data.materials.new(name=material_name)
    mat.use_nodes = True
    tree = mat.node_tree
    nodes, links = tree.nodes, tree.links
    nodes.clear()

    out_node = nodes.new("ShaderNodeOutputMaterial")
    out_node.location = (300, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])

    def _load_tex(map_key: str, node_name: str, loc: tuple, colorspace: str) -> Optional[Any]:
        fpath = textures.get(map_key)
        if not fpath or not os.path.isfile(fpath):
            return None
        img = bpy.data.images.load(fpath, check_existing=True)
        img.colorspace_settings.name = colorspace
        tex = nodes.new("ShaderNodeTexImage")
        tex.name = node_name
        tex.image = img
        tex.location = loc
        return tex

    # Diffuse / BaseColor
    bc = _load_tex("diffuse", "Baked_BaseColor", (-600, 200), "sRGB")
    if bc and "Base Color" in bsdf.inputs:
        links.new(bc.outputs["Color"], bsdf.inputs["Base Color"])

    # Normal Map
    nm = _load_tex("normal", "Baked_Normal", (-600, -350), "Non-Color")
    if nm and "Normal" in bsdf.inputs:
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.location = (-250, -350)
        nmap.space = 'TANGENT'
        mat_lower = material_name.lower()
        is_skin = any(k in mat_lower for k in ("genesis", "skin", "body", "head", "face", "arm", "leg"))
        nmap.inputs["Strength"].default_value = 0.5 if is_skin else 1.0
        links.new(nm.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    # Subsurface Scattering for human skin materials
    mat_lower = material_name.lower()
    is_skin = any(k in mat_lower for k in ("genesis", "skin", "body", "head", "face", "arm", "leg"))
    if is_skin:
        if "Subsurface Weight" in bsdf.inputs:
            bsdf.inputs["Subsurface Weight"].default_value = 0.5
        elif "Subsurface" in bsdf.inputs:
            bsdf.inputs["Subsurface"].default_value = 0.5
        if "Subsurface Scale" in bsdf.inputs:
            bsdf.inputs["Subsurface Scale"].default_value = 0.05
        if "Subsurface Radius" in bsdf.inputs:
            try:
                bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.2, 0.1)
            except Exception:
                pass

    # Channel Packed Texture Wiring (ORM, ORMA, RMA, etc.)
    packed_key = next((k for k in ("orm", "orma", "rma", "mra", "maskmap") if k in textures), None)
    if packed_key:
        pk = _load_tex(packed_key, f"Baked_{packed_key.upper()}", (-600, -100), "Non-Color")
        if pk:
            sep = nodes.new("ShaderNodeSeparateColor")
            sep.location = (-250, -100)
            links.new(pk.outputs["Color"], sep.inputs["Color"])
            p_upper = packed_key.upper()
            if p_upper in ("ORM", "ORMA"):
                if "Roughness" in bsdf.inputs:
                    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
                if "Metallic" in bsdf.inputs:
                    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
                if p_upper == "ORMA" and "Alpha" in bsdf.inputs:
                    links.new(pk.outputs["Alpha"], bsdf.inputs["Alpha"])
            elif p_upper == "RMA":
                if "Roughness" in bsdf.inputs:
                    links.new(sep.outputs["Red"], bsdf.inputs["Roughness"])
                if "Metallic" in bsdf.inputs:
                    links.new(sep.outputs["Green"], bsdf.inputs["Metallic"])
            elif p_upper == "MRA":
                if "Metallic" in bsdf.inputs:
                    links.new(sep.outputs["Red"], bsdf.inputs["Metallic"])
                if "Roughness" in bsdf.inputs:
                    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    else:
        # Separate individual channel wiring
        rgh = _load_tex("roughness", "Baked_Roughness", (-600, -50), "Non-Color")
        if rgh and "Roughness" in bsdf.inputs:
            links.new(rgh.outputs["Color"], bsdf.inputs["Roughness"])
        met = _load_tex("metallic", "Baked_Metallic", (-600, -200), "Non-Color")
        if met and "Metallic" in bsdf.inputs:
            links.new(met.outputs["Color"], bsdf.inputs["Metallic"])

    if "alpha" in textures and packed_key != "orma":
        alp = _load_tex("alpha", "Baked_Alpha", (-600, 450), "Non-Color")
        if alp and "Alpha" in bsdf.inputs:
            links.new(alp.outputs["Color"], bsdf.inputs["Alpha"])

    return mat


def apply_group_materials(
    obj: Any,
    group_materials: List[Tuple[Any, List[int]]],
    preserved_slots: List[Tuple[int, Any]],
    uv_name: str
) -> None:
    mesh = obj.data
    new_materials: List[Any] = []
    poly_to_new_mat_idx: Dict[int, int] = {}

    for baked_mat, poly_indices in group_materials:
        new_idx = len(new_materials)
        new_materials.append(baked_mat)
        for p_idx in poly_indices:
            poly_to_new_mat_idx[p_idx] = new_idx

    for old_slot_idx, orig_mat in preserved_slots:
        new_idx = len(new_materials)
        new_materials.append(orig_mat)
        for p in mesh.polygons:
            if p.material_index == old_slot_idx:
                poly_to_new_mat_idx[p.index] = new_idx

    mesh.materials.clear()
    for m in new_materials:
        mesh.materials.append(m)

    for p in mesh.polygons:
        if p.index in poly_to_new_mat_idx:
            p.material_index = poly_to_new_mat_idx[p.index]

    uvs = mesh.uv_layers
    target_uv = uvs.get(uv_name)
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
    bake_mode: BakeModeType = "head_and_body",
    resolution: int = 4096,
    pack_mode: PackModeType = "ORM",
    normal_format: NormalFormatType = "opengl",
    uv_name: str = "UVMap_Baked",
    margin: float = 0.01,
    maps: Optional[List[str]] = None,
    output_dir: str = "",
    material_name: str = "",
    ao_samples: int = 32,
    ao_distance: float = 0.25,
    **kwargs
) -> dict:
    """
    Modern Headless Mesh Baker for DAZ characters and Game Engines.

    Args:
        target_objects: Target mesh names (empty = auto-select main figure/clothing meshes, skipping auxiliary eyes/mouth).
        bake_mode: DAZ character bake mode: 'head_and_body' (separate 4K maps for Head and Body) or 'all_in_one' (single map).
        resolution: Texture resolution (1024, 2048, 4096). Defaults to 4096 for crisp AAA quality.
        pack_mode: Channel packing preset ('ORM', 'ORMA', 'none', 'RMA', 'MRA', 'UNITY_MASK'). Defaults to 'ORM'.
        normal_format: Target normal format ('opengl' for Unity/Blender Y+ [default], 'directx' for pre-inverted Y-).
        uv_name: Intermediate baking UV layer name.
        margin: Island UV margin (0.01 = safe padding against bleeding).
        maps: List of maps to bake ('diffuse', 'roughness', 'normal', 'metallic', 'specular', 'alpha', 'ao').
        output_dir: Target texture directory.
        material_name: Unified output material name prefix (default 'M_<Stem>').
        ao_samples: Monte Carlo raycast sample count for Ambient Occlusion.
        ao_distance: Maximum ray search radius in meters for Ambient Occlusion.
    """
    if not HAS_BPY:
        raise RuntimeError("Blender Python (bpy) is not available.")

    legacy_bake_orm = kwargs.get("bake_orm", False)
    if legacy_bake_orm and pack_mode == "none":
        pack_mode = "ORM"

    if "flip_normal_y" in kwargs:
        is_directx = bool(kwargs["flip_normal_y"])
    else:
        is_directx = (str(normal_format or "opengl").lower() == "directx")

    targets = _normalize_targets(target_objects)
    selected_maps = _normalize_maps(maps, pack_mode)

    try:
        resolution = int(resolution) if resolution else 4096
    except (ValueError, TypeError):
        resolution = 4096

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
        print(f"[bake_mesh] Processing '{obj.name}' mode={bake_mode} maps={selected_maps} pack={pack_mode} res={resolution}", flush=True)

        bake_groups, preserved_slots = categorize_mesh_slots(obj, bake_mode)
        if not bake_groups:
            print(f"[bake_mesh] Warning: '{obj.name}' has no bakeable slots, skipping.", flush=True)
            continue

        print(f"[bake_mesh] '{obj.name}' -> {len(bake_groups)} bake group(s): {[g['name'] or 'Main' for g in bake_groups]}, {len(preserved_slots)} preserved slot(s)", flush=True)

        ensure_bake_uv(obj, uv_name, margin, bake_groups)

        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        group_applied_mats: List[Tuple[Any, List[int]]] = []

        for grp in bake_groups:
            grp_name = grp["name"]
            grp_mats = grp["mats"]
            grp_polys = grp["poly_indices"]
            grp_stem = f"{stem}_{grp_name}" if grp_name else stem

            print(f"[bake_mesh:group] Baking '{grp_stem}' ({len(grp_mats)} materials, {len(grp_polys)} faces)...", flush=True)

            grp_maps: Dict[str, str] = {}
            temp_images_for_pack: Dict[str, Any] = {}

            for map_type in selected_maps:
                defs = MAP_DEFS[map_type]
                suffix = defs["suffix"]
                out_filename = f"{grp_stem}_{suffix}.png"
                out_filepath = os.path.join(output_dir, out_filename)
                technique = defs["technique"]

                bake_img = bpy.data.images.new(
                    name=f"Bake_{grp_stem}_{suffix}",
                    width=resolution,
                    height=resolution,
                    alpha=True,
                    float_buffer=(technique == "NORMAL"),
                )
                if defs["colorspace"] != "sRGB":
                    bake_img.colorspace_settings.name = 'Non-Color'

                if uv_name in obj.data.uv_layers:
                    u_idx = obj.data.uv_layers.find(uv_name)
                    if u_idx >= 0:
                        obj.data.uv_layers.active_index = u_idx
                        obj.data.uv_layers.active = obj.data.uv_layers[uv_name]

                targets_info = prepare_bake_targets(grp_mats, uv_name, bake_img)

                if technique == "NORMAL":
                    bpy.context.scene.cycles.samples = 1
                    print(f"[bake_mesh:bake] {grp_stem} normal -> '{out_filename}' (1spp)", flush=True)
                    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', save_mode='INTERNAL')

                    if is_directx:
                        try:
                            import numpy as np
                            px = np.empty(resolution * resolution * 4, dtype=np.float32)
                            bake_img.pixels.foreach_get(px)
                            px[1::4] = 1.0 - px[1::4]
                            bake_img.pixels.foreach_set(px)
                            print(f"[bake_mesh:bake] Converted normal Y- (DirectX / UE5 format)", flush=True)
                        except Exception as ex:
                            print(f"[bake_mesh:bake] Warning: DirectX flip: {ex}", flush=True)

                elif technique == "AO":
                    other_objs_vis = {}
                    for other_o in bpy.data.objects:
                        if other_o != obj and other_o.type == 'MESH':
                            other_objs_vis[other_o] = other_o.hide_render
                            other_o.hide_render = True

                    ao_spp = max(int(ao_samples) if ao_samples else 32, 8)
                    bpy.context.scene.cycles.samples = ao_spp
                    print(f"[bake_mesh:bake] {grp_stem} ao -> '{out_filename}' ({ao_spp}spp, isolated)", flush=True)
                    try:
                        bpy.ops.object.bake(type='AO', save_mode='INTERNAL')
                    finally:
                        for other_o, prev_vis in other_objs_vis.items():
                            other_o.hide_render = prev_vis

                else:
                    bpy.context.scene.cycles.samples = 1
                    print(f"[bake_mesh:bake] {grp_stem} {suffix} via EMIT -> '{out_filename}' (1spp)", flush=True)
                    routes = {}
                    for m in grp_mats:
                        r_info = setup_emission_routing(m, map_type)
                        if r_info:
                            routes[m] = r_info

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
                grp_maps[map_type] = out_filepath
                baked_files.append(out_filepath)

                if map_type in ("roughness", "metallic", "ao", "alpha", "specular"):
                    temp_images_for_pack[map_type] = bake_img
                else:
                    try:
                        bpy.data.images.remove(bake_img)
                    except Exception:
                        pass

            # Channel Packing Pass for Group
            if pack_mode != "none":
                pack_key, pack_path = execute_channel_packing(pack_mode, output_dir, grp_stem, resolution, temp_images_for_pack)
                if pack_key and pack_path:
                    grp_maps[pack_key] = pack_path
                    baked_files.append(pack_path)

            for img in temp_images_for_pack.values():
                try:
                    bpy.data.images.remove(img)
                except Exception:
                    pass

            mat_title = f"{material_name}_{grp_name}" if (material_name and grp_name) else (material_name if material_name else f"M_{grp_stem}")
            baked_mat = build_single_baked_material(mat_title, grp_maps, pack_mode)
            group_applied_mats.append((baked_mat, grp_polys))
            if baked_mat.name not in updated_materials:
                updated_materials.append(baked_mat.name)

            baked_maps[grp_stem] = grp_maps

        # Apply new baked materials and restore preserved slots on the mesh
        apply_group_materials(obj, group_applied_mats, preserved_slots, uv_name)
        applied_objects.append(obj.name)
        print(f"[bake_mesh] Successfully finished '{obj.name}' with {len(group_applied_mats)} baked materials and {len(preserved_slots)} preserved slots", flush=True)

    restore_cycles_settings(orig_cycles)
    print(f"[bake_mesh] Completed execution for {len(applied_objects)} mesh(es). Output: '{output_dir}'", flush=True)

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
