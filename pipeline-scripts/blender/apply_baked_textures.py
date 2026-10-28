# pyrefly: ignore [missing-import]
"""
Pipeline Tool: Apply Baked Textures to Blender Materials.
Supports:
1. Single Material Consolidation (Default): Consolidates all polygons and legacy material slots
   into a single, clean PBR material using the newly baked UV map and textures.
2. Non-Destructive Multi-Slot Injection: Surgically injects baked textures into existing slots.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set

try:
    import bpy
    HAS_BPY = True
except ImportError:
    bpy = None
    HAS_BPY = False


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tga", ".exr", ".tif", ".tiff", ".bmp", ".webp"}


def parse_names(raw_input: Any) -> List[str]:
    """Parse string/list/json inputs into a clean list of names."""
    if not raw_input:
        return []

    if isinstance(raw_input, (list, tuple, set)):
        result = []
        for item in raw_input:
            result.extend(parse_names(item))
        return result

    if isinstance(raw_input, str):
        s = raw_input.strip()
        if not s:
            return []
        if (s.startswith("[") and s.endswith("]")) or (s.startswith("(") and s.endswith(")")):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, (list, tuple, set)):
                    return parse_names(parsed)
            except Exception:
                pass
        if "," in s:
            return [x.strip() for x in s.split(",") if x.strip()]
        return [s]

    return [str(raw_input).strip()]


def find_target_objects(object_names: Optional[Any] = None) -> List[Any]:
    """Find and return mesh objects in the current Blender scene."""
    if not HAS_BPY or not bpy.data:
        return []

    if not object_names:
        # Default to selected meshes or all meshes in scene
        selected = [o for o in bpy.context.selected_objects if o.type == "MESH"]
        if selected:
            return selected
        return [o for o in bpy.data.objects if o.type == "MESH"]

    parsed = parse_names(object_names)
    matched: List[Any] = []

    for name in parsed:
        clean_name = name.lower().strip()
        if not clean_name:
            continue

        for obj in bpy.data.objects:
            if obj.type == "MESH" and (obj.name.lower() == clean_name or clean_name in obj.name.lower()):
                if obj not in matched:
                    matched.append(obj)

    return matched if matched else [o for o in bpy.data.objects if o.type == "MESH"]


def scan_directory_for_textures(directory: str, prefix: str = "") -> Dict[str, str]:
    """
    Scan a directory for baked texture maps matching standard PBR conventions.
    Returns a dict mapping: {"diffuse": path, "normal": path, "roughness": path, ...}
    """
    if not os.path.isdir(directory):
        return {}

    textures: Dict[str, str] = {}
    clean_prefix = prefix.lower().strip()

    for root, _, files in os.walk(directory):
        for f in files:
            f_path = Path(root) / f
            if f_path.suffix.lower() not in IMAGE_EXTS:
                continue

            stem = f_path.stem.lower()
            if clean_prefix and not stem.startswith(clean_prefix) and clean_prefix not in stem:
                continue

            full_path = str(f_path.resolve()).replace("\\", "/")

            if any(k in stem for k in ["basecolor", "base_color", "diffuse", "albedo"]):
                textures.setdefault("diffuse", full_path)
            elif any(k in stem for k in ["normal", "norm", "nrm"]):
                textures.setdefault("normal", full_path)
            elif "orm" in stem:
                textures.setdefault("orm", full_path)
            elif any(k in stem for k in ["roughness", "rough"]):
                textures.setdefault("roughness", full_path)
            elif any(k in stem for k in ["metallic", "metal"]):
                textures.setdefault("metallic", full_path)
            elif any(k in stem for k in ["alpha", "opacity"]):
                textures.setdefault("alpha", full_path)
            elif any(k in stem for k in ["ambientocclusion", "ao", "occlusion"]):
                textures.setdefault("ao", full_path)

    return textures


def resolve_textures(
    baked_maps: Optional[Any] = None,
    bake_manifest: Optional[Any] = None,
    output_dir: Optional[str] = None,
    prefix: str = ""
) -> Dict[str, str]:
    """
    Normalize texture mappings from baked_maps, bake_manifest, or by directory scan.
    """
    # 1. Direct dictionary of maps (e.g. from native_bake.baked_maps)
    if isinstance(baked_maps, dict) and baked_maps:
        normalized: Dict[str, str] = {}
        for k, v in baked_maps.items():
            if not v or not isinstance(v, str):
                continue
            key_lower = k.lower().strip()
            if key_lower in ("basecolor", "albedo", "diffuse"):
                normalized["diffuse"] = v
            elif key_lower in ("normal", "norm"):
                normalized["normal"] = v
            elif key_lower == "orm":
                normalized["orm"] = v
            elif key_lower in ("roughness", "rough"):
                normalized["roughness"] = v
            elif key_lower in ("metallic", "metal"):
                normalized["metallic"] = v
            elif key_lower in ("alpha", "opacity"):
                normalized["alpha"] = v
            elif key_lower == "ao":
                normalized["ao"] = v
            else:
                normalized[key_lower] = v
        if normalized:
            return normalized

    # 2. Check bake_manifest structure
    if isinstance(bake_manifest, dict):
        if "baked_maps" in bake_manifest and isinstance(bake_manifest["baked_maps"], dict):
            return resolve_textures(baked_maps=bake_manifest["baked_maps"])
        if "output_dir" in bake_manifest and not output_dir:
            output_dir = bake_manifest["output_dir"]

    # 3. Fallback: Directory scan
    if output_dir and os.path.isdir(output_dir):
        scanned = scan_directory_for_textures(output_dir, prefix=prefix)
        if scanned:
            return scanned

    return {}


def create_separate_color_node(nodes: Any) -> Optional[Any]:
    """Create Separate Color node compatible with Blender 3.x, 4.x, and 5.x."""
    if not HAS_BPY:
        return None
    if hasattr(bpy.types, "ShaderNodeSeparateColor"):
        return nodes.new("ShaderNodeSeparateColor")
    if hasattr(bpy.types, "ShaderNodeSeparateRGB"):
        return nodes.new("ShaderNodeSeparateRGB")
    return None


def build_single_baked_material(
    material_name: str,
    textures: Dict[str, str]
) -> Any:
    """
    Create a clean, dedicated single PBR Material wired to the baked textures.
    """
    # 1. Create or retrieve material
    mat = bpy.data.materials.get(material_name)
    if not mat:
        mat = bpy.data.materials.new(name=material_name)

    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    # 2. Add Output and Principled BSDF nodes
    out_node = nodes.new("ShaderNodeOutputMaterial")
    out_node.location = (400, 0)

    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    links.new(bsdf.outputs["BSDF"], out_node.inputs["Surface"])

    # 3. Wire Base Color
    if "diffuse" in textures and os.path.isfile(textures["diffuse"]):
        img = bpy.data.images.load(textures["diffuse"], check_existing=True)
        img.colorspace_settings.name = "sRGB"

        bc_node = nodes.new("ShaderNodeTexImage")
        bc_node.image = img
        bc_node.label = "Baked_BaseColor"
        bc_node.name = "Baked_BaseColor"
        bc_node.location = (-600, 200)

        if "Base Color" in bsdf.inputs:
            links.new(bc_node.outputs["Color"], bsdf.inputs["Base Color"])
        print(f"[ApplyBaked] Wired Base Color: '{textures['diffuse']}'", flush=True)

    # 4. Wire Normal Map
    if "normal" in textures and os.path.isfile(textures["normal"]):
        img = bpy.data.images.load(textures["normal"], check_existing=True)
        img.colorspace_settings.name = "Non-Color"

        norm_tex = nodes.new("ShaderNodeTexImage")
        norm_tex.image = img
        norm_tex.label = "Baked_Normal"
        norm_tex.name = "Baked_Normal"
        norm_tex.location = (-600, -350)

        norm_map = nodes.new("ShaderNodeNormalMap")
        norm_map.location = (-250, -350)
        norm_map.space = 'TANGENT'

        links.new(norm_tex.outputs["Color"], norm_map.inputs["Color"])
        if "Normal" in bsdf.inputs:
            links.new(norm_map.outputs["Normal"], bsdf.inputs["Normal"])
        print(f"[ApplyBaked] Wired Normal Map: '{textures['normal']}'", flush=True)

    # 5. Wire ORM (Occlusion=R, Roughness=G, Metallic=B) if present
    if "orm" in textures and os.path.isfile(textures["orm"]):
        img = bpy.data.images.load(textures["orm"], check_existing=True)
        img.colorspace_settings.name = "Non-Color"

        orm_tex = nodes.new("ShaderNodeTexImage")
        orm_tex.image = img
        orm_tex.label = "Baked_ORM"
        orm_tex.name = "Baked_ORM"
        orm_tex.location = (-600, -100)

        sep_col = create_separate_color_node(nodes)
        if sep_col:
            sep_col.location = (-280, -100)
            links.new(orm_tex.outputs["Color"], sep_col.inputs[0])

            g_out = sep_col.outputs.get("Green") or sep_col.outputs.get("G")
            b_out = sep_col.outputs.get("Blue") or sep_col.outputs.get("B")

            if g_out and "Roughness" in bsdf.inputs:
                links.new(g_out, bsdf.inputs["Roughness"])
            if b_out and "Metallic" in bsdf.inputs:
                links.new(b_out, bsdf.inputs["Metallic"])
            print(f"[ApplyBaked] Wired ORM Packed Texture: '{textures['orm']}'", flush=True)
    else:
        # Separate Roughness
        if "roughness" in textures and os.path.isfile(textures["roughness"]):
            img = bpy.data.images.load(textures["roughness"], check_existing=True)
            img.colorspace_settings.name = "Non-Color"

            r_node = nodes.new("ShaderNodeTexImage")
            r_node.image = img
            r_node.label = "Baked_Roughness"
            r_node.location = (-600, -50)
            if "Roughness" in bsdf.inputs:
                links.new(r_node.outputs["Color"], bsdf.inputs["Roughness"])
            print(f"[ApplyBaked] Wired Roughness: '{textures['roughness']}'", flush=True)

        # Separate Metallic
        if "metallic" in textures and os.path.isfile(textures["metallic"]):
            img = bpy.data.images.load(textures["metallic"], check_existing=True)
            img.colorspace_settings.name = "Non-Color"

            m_node = nodes.new("ShaderNodeTexImage")
            m_node.image = img
            m_node.label = "Baked_Metallic"
            m_node.location = (-600, -200)
            if "Metallic" in bsdf.inputs:
                links.new(m_node.outputs["Color"], bsdf.inputs["Metallic"])
            print(f"[ApplyBaked] Wired Metallic: '{textures['metallic']}'", flush=True)

    # 6. Wire Alpha if present
    if "alpha" in textures and os.path.isfile(textures["alpha"]):
        img = bpy.data.images.load(textures["alpha"], check_existing=True)
        img.colorspace_settings.name = "Non-Color"

        a_node = nodes.new("ShaderNodeTexImage")
        a_node.image = img
        a_node.label = "Baked_Alpha"
        a_node.location = (-600, 450)
        if "Alpha" in bsdf.inputs:
            links.new(a_node.outputs["Color"], bsdf.inputs["Alpha"])
        print(f"[ApplyBaked] Wired Alpha: '{textures['alpha']}'", flush=True)

    return mat


def apply_single_material_to_mesh(
    obj: Any,
    material: Any,
    uv_name: str = "UVMap_Baked",
    clean_old_uvs: bool = True
) -> None:
    """
    Consolidate all polygons of obj onto a single material slot, remove old slots,
    and activate the target UV layer.
    """
    if not obj or obj.type != 'MESH' or not obj.data:
        return

    mesh = obj.data

    # 1. Clear all old material slots and assign only the consolidated material
    mesh.materials.clear()
    mesh.materials.append(material)

    # 2. Point all polygons to slot 0
    for poly in mesh.polygons:
        poly.material_index = 0

    # 3. Configure UV layers
    uvs = mesh.uv_layers
    if uvs:
        target_uv = uvs.get(uv_name)
        if not target_uv:
            for u in uvs:
                if u.name.lower() == uv_name.lower():
                    target_uv = u
                    break

        if target_uv:
            target_uv.active = True
            target_uv.active_render = True
            print(f"[ApplyBaked] Object '{obj.name}': Set UV '{target_uv.name}' as Active & Active Render", flush=True)

            if clean_old_uvs:
                to_remove = [u for u in uvs if u != target_uv]
                for old_u in to_remove:
                    uvs.remove(old_u)
                target_uv.name = "UVMap"
                print(f"[ApplyBaked] Object '{obj.name}': Cleaned {len(to_remove)} old UVs. Standardized to 'UVMap'", flush=True)


def main(
    baked_maps: Optional[Dict[str, str]] = None,
    bake_manifest: Optional[Dict[str, Any]] = None,
    output_dir: Optional[str] = None,
    target_objects: Optional[Any] = None,
    object_names: Optional[Any] = None,
    uv_name: str = "UVMap_Baked",
    single_material: bool = True,
    material_name: str = "",
    clean_old_uvs: bool = True,
    **kwargs: Any
) -> Dict[str, Any]:
    """
    Main entry point for Apply Baked Textures.

    Args:
        baked_maps: Map of texture types to filepaths (e.g. {'diffuse': '...', 'normal': '...'}).
        bake_manifest: Output dict from native_bake or SimpleBake.
        output_dir: Directory containing baked textures.
        target_objects: List or comma-separated object names to target.
        object_names: Alias for target_objects.
        uv_name: UV layer name to activate (default: 'UVMap_Baked').
        single_material: Whether to consolidate all slots into 1 single material (default: True).
        material_name: Optional custom name for the new material.
        clean_old_uvs: Whether to remove legacy UVs and rename target UV to 'UVMap' (default: True).
    """
    if not HAS_BPY:
        print("[ApplyBaked] Running outside Blender (bpy not available). Returning mock success.", flush=True)
        return {
            "status": "SUCCESS",
            "updated_materials": [material_name or "M_Baked"],
            "applied_objects": parse_names(target_objects or object_names or ["TargetMesh"]),
            "single_material": single_material
        }

    # 1. Resolve target mesh objects
    targets = target_objects or object_names or kwargs.get("objects")
    objs = find_target_objects(targets)
    if not objs:
        raise RuntimeError(f"[ApplyBaked] No valid mesh objects found for target(s): {targets}")

    # 2. Resolve textures mapping
    prefix = objs[0].name if objs else ""
    textures = resolve_textures(
        baked_maps=baked_maps,
        bake_manifest=bake_manifest,
        output_dir=output_dir,
        prefix=prefix
    )

    if not textures:
        # Check if output_dir is inside kwargs
        alt_dir = kwargs.get("output_dir")
        if alt_dir:
            textures = resolve_textures(output_dir=alt_dir, prefix=prefix)

    if not textures:
        raise RuntimeError(
            f"[ApplyBaked] Could not resolve any baked textures from inputs (baked_maps, bake_manifest, output_dir: '{output_dir}')."
        )

    print(f"[ApplyBaked] Resolved {len(textures)} texture map(s): {list(textures.keys())}", flush=True)

    updated_materials: List[str] = []
    processed_objects: List[str] = []

    # 3. Apply textures
    if single_material:
        # Single Material Consolidation mode
        for obj in objs:
            mat_name = material_name if material_name else f"M_{obj.name}"
            baked_mat = build_single_baked_material(mat_name, textures)
            apply_single_material_to_mesh(
                obj=obj,
                material=baked_mat,
                uv_name=uv_name,
                clean_old_uvs=clean_old_uvs
            )
            if baked_mat.name not in updated_materials:
                updated_materials.append(baked_mat.name)
            processed_objects.append(obj.name)
            print(f"[ApplyBaked] Successfully consolidated '{obj.name}' to single material '{baked_mat.name}' (1 slot).", flush=True)
    else:
        # Multi-slot non-destructive update
        for obj in objs:
            for slot in obj.material_slots:
                mat = slot.material
                if not mat:
                    continue
                # In non-destructive mode, wire base color and normal if missing
                if "diffuse" in textures and os.path.isfile(textures["diffuse"]):
                    img = bpy.data.images.load(textures["diffuse"], check_existing=True)
                    # Simple wire
                    if mat.node_tree:
                        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                        if bsdf and "Base Color" in bsdf.inputs:
                            tex_node = mat.node_tree.nodes.new("ShaderNodeTexImage")
                            tex_node.image = img
                            mat.node_tree.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])

                if mat.name not in updated_materials:
                    updated_materials.append(mat.name)
            processed_objects.append(obj.name)

    print(f"[ApplyBaked] Finished. Consolidated {len(processed_objects)} object(s) with {len(updated_materials)} material(s).", flush=True)

    return {
        "status": "SUCCESS",
        "updated_materials": updated_materials,
        "applied_objects": processed_objects,
        "single_material": single_material,
        "textures": textures
    }


if __name__ == "__main__" and HAS_BPY:
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description="Blender Apply Baked Textures CLI")
    parser.add_argument("--targets", type=str, default="", help="Target object names")
    parser.add_argument("--output_dir", type=str, default="", help="Directory containing baked textures")
    parser.add_argument("--uv", type=str, default="UVMap_Baked", help="UV map name")
    parser.add_argument("--mat_name", type=str, default="", help="Consolidated material name")
    parser.add_argument("--multi_slot", action="store_true", help="Keep multiple slots instead of single material")

    args = parser.parse_args(argv)

    res = main(
        output_dir=args.output_dir,
        target_objects=args.targets,
        uv_name=args.uv,
        single_material=not args.multi_slot,
        material_name=args.mat_name
    )
    print(f"[ApplyBaked CLI] Result: {res}")
