# pyrefly: ignore [missing-import]
"""
Blender 3D Scene / Model Inspector Script
Compatible with Blender Executor (runs inside Blender via Python API)

Extracts structured hierarchical metadata from Blender scenes:
- Armatures -> Objects (Meshes) -> Material Slots -> Textures (with Map Type classification)
- Standalone / Unbound Objects -> Material Slots -> Textures
"""

import bpy
import os
import json
from typing import Dict, Any, List, Optional


def detect_texture_type(socket_name: str, node_label: str, file_path: str) -> str:
    """
    Auto-detect texture map type based on connected socket name, node label, or filename.
    """
    text = f"{socket_name} {node_label} {os.path.basename(file_path)}".lower()
    
    if any(k in text for k in ["normal", "nor", "nrm", "_n.", "_nrm", "_normal"]):
        return "Normal"
    if any(k in text for k in ["base color", "diffuse", "albedo", "col", "basecolor", "_d.", "_c.", "_diff", "_alb"]):
        return "Base Color"
    if any(k in text for k in ["roughness", "rough", "rgh", "_r.", "_rough"]):
        return "Roughness"
    if any(k in text for k in ["metallic", "metal", "met", "_m.", "_metal"]):
        return "Metallic"
    if any(k in text for k in ["specular", "spec", "spc", "_s.", "_spec"]):
        return "Specular"
    if any(k in text for k in ["alpha", "opacity", "transparent", "trans", "_a.", "_alpha", "_opac"]):
        return "Alpha"
    if any(k in text for k in ["height", "displacement", "disp", "bump", "_disp", "_bump", "_h."]):
        return "Displacement / Bump"
    if any(k in text for k in ["emission", "emit", "glow", "_emit"]):
        return "Emission"
    if any(k in text for k in ["ambient occlusion", "ao", "occlusion", "_ao."]):
        return "Ambient Occlusion"
    if any(k in text for k in ["subsurface", "sss", "skin"]):
        return "Subsurface"
    
    return "Generic"


MAP_TYPE_TO_PRESET: Dict[str, Dict[str, Any]] = {
    "Normal": {"preset": "NORMAL", "srgb": False},
    "Roughness": {"preset": "MASKS", "srgb": False},
    "Metallic": {"preset": "MASKS", "srgb": False},
    "Specular": {"preset": "MASKS", "srgb": False},
    "Ambient Occlusion": {"preset": "MASKS", "srgb": False},
    "Displacement / Bump": {"preset": "GRAYSCALE", "srgb": False},
    "Alpha": {"preset": "GRAYSCALE", "srgb": False},
    "Base Color": {"preset": "COLOR", "srgb": True},
    "Emission": {"preset": "COLOR", "srgb": True},
    "Subsurface": {"preset": "COLOR", "srgb": True},
    "Generic": {"preset": "DEFAULT", "srgb": True},
}


def resolve_texture_preset(map_type: str) -> Dict[str, Any]:
    """Resolve explicit compression preset and sRGB flag based on map type."""
    return MAP_TYPE_TO_PRESET.get(map_type, {"preset": "DEFAULT", "srgb": True})


def extract_material_info(mat, blend_dir: str = "", warnings_collector: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Extract material name and all connected texture images with classifications.
    Calculates relative paths relative to blend_dir and detects external texture references.
    """
    if not mat:
        return {"name": None, "textures": []}
    
    textures = []
    seen_images = set()
    
    if mat.use_nodes and mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                img = node.image
                raw_filepath = img.filepath or ""
                abs_filepath = bpy.path.abspath(raw_filepath) if raw_filepath else img.name
                resolution = f"{img.size[0]}x{img.size[1]}" if hasattr(img, 'size') and len(img.size) >= 2 and (img.size[0] > 0 or img.size[1] > 0) else "Unknown"
                
                # Trace connections to find map type
                socket_connected = ""
                for out in node.outputs:
                    for link in out.links:
                        socket_connected = link.to_socket.name
                        if link.to_node.type == 'NORMAL_MAP':
                            socket_connected = "Normal"
                        elif link.to_node.type == 'BUMP':
                            socket_connected = "Bump"
                        elif link.to_node.type == 'DISPLACEMENT':
                            socket_connected = "Displacement"
                        break
                    if socket_connected:
                        break
                
                map_type = detect_texture_type(socket_connected, node.label or node.name, abs_filepath)
                preset_info = resolve_texture_preset(map_type)
                
                # Path relative computation & external detection
                rel_path = abs_filepath.replace("\\", "/")
                is_external = False
                
                if blend_dir and os.path.isabs(abs_filepath):
                    try:
                        common = os.path.commonpath([blend_dir, abs_filepath])
                        if os.path.abspath(common) == os.path.abspath(blend_dir):
                            rel_path = os.path.relpath(abs_filepath, blend_dir).replace("\\", "/")
                            is_external = False
                        else:
                            is_external = True
                            rel_path = os.path.relpath(abs_filepath, blend_dir).replace("\\", "/")
                    except ValueError:
                        # Different drive letters on Windows (e.g. C: and D:)
                        is_external = True
                        rel_path = abs_filepath.replace("\\", "/")
                
                if is_external and warnings_collector is not None:
                    warn_msg = f"Texture '{img.name}' ({map_type}) is outside the blend folder: {abs_filepath}"
                    if warn_msg not in warnings_collector:
                        warnings_collector.append(warn_msg)

                tex_key = f"{img.name}_{map_type}"
                if tex_key not in seen_images:
                    seen_images.add(tex_key)
                    textures.append({
                        "name": img.name,
                        "map_type": map_type,
                        "compression_preset": preset_info["preset"],
                        "srgb": preset_info["srgb"],
                        "file_path": rel_path,
                        "absolute_path": abs_filepath.replace("\\", "/"),
                        "is_external": is_external,
                        "resolution": resolution,
                        "colorspace": getattr(img.colorspace_settings, 'name', 'sRGB') if hasattr(img, 'colorspace_settings') else 'sRGB',
                    })
    
    return {
        "name": mat.name,
        "textures": textures
    }


def extract_object_info(obj, blend_dir: str = "", warnings_collector: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Extract mesh object polygon/vertex counts and material slots with nested textures.
    """
    mesh = obj.data
    poly_count = len(mesh.polygons) if mesh else 0
    vert_count = len(mesh.vertices) if mesh else 0
    
    slots_info = []
    for idx, slot in enumerate(obj.material_slots):
        mat_info = extract_material_info(slot.material, blend_dir=blend_dir, warnings_collector=warnings_collector)
        slots_info.append({
            "slot_name": slot.name if slot.name else f"Slot_{idx}",
            "slot_index": idx,
            "material_name": mat_info["name"],
            "textures": mat_info["textures"]
        })
    
    return {
        "name": obj.name,
        "face_count": poly_count,
        "vertex_count": vert_count,
        "material_slots": slots_info
    }


def inspect_blender_scene(input_path: str = "") -> Dict[str, Any]:
    """
    Perform hierarchical inspection of the Blender scene.
    Structure:
    Armature -> Objects -> Material Slots -> Textures
    """
    # 1. Optionally open .blend file if specified
    if input_path and os.path.exists(input_path) and input_path.lower().endswith(".blend"):
        try:
            bpy.ops.wm.open_mainfile(filepath=input_path)
        except Exception as e:
            print(f"[blender_inspector] Warning opening blend file: {e}")

    # Determine blend root folder for relative path calculations
    blend_filepath = input_path or bpy.data.filepath
    blend_dir = os.path.dirname(os.path.abspath(blend_filepath)) if blend_filepath else ""
    warnings_collector: List[str] = []

    # 2. Extract Armatures & assign meshes under their respective Armature
    armature_objs = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    mesh_objs = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    
    assigned_mesh_names = set()
    armatures_data = []
    
    for arm in armature_objs:
        arm_meshes = []
        for obj in mesh_objs:
            is_bound = False
            if obj.parent == arm:
                is_bound = True
            elif hasattr(obj, "find_armature") and obj.find_armature() == arm:
                is_bound = True
            else:
                for mod in obj.modifiers:
                    if mod.type == 'ARMATURE' and getattr(mod, "object", None) == arm:
                        is_bound = True
                        break
            
            if is_bound:
                arm_meshes.append(extract_object_info(obj, blend_dir=blend_dir, warnings_collector=warnings_collector))
                assigned_mesh_names.add(obj.name)
        
        bones_count = len(arm.data.bones) if arm.data and hasattr(arm.data, 'bones') else 0
        
        armatures_data.append({
            "name": arm.name,
            "bones_count": bones_count,
            "objects": arm_meshes
        })

    # 3. Standalone / other objects not under any armature
    standalone_objects = [
        extract_object_info(obj, blend_dir=blend_dir, warnings_collector=warnings_collector) 
        for obj in mesh_objs if obj.name not in assigned_mesh_names
    ]

    # 4. Result metadata tree
    result: Dict[str, Any] = {}
    if blend_dir:
        result["blend_directory"] = blend_dir.replace("\\", "/")

    if armatures_data:
        result["armatures"] = armatures_data
        if standalone_objects:
            result["other_objects"] = standalone_objects
    else:
        result["objects"] = standalone_objects

    if warnings_collector:
        result["warnings"] = warnings_collector

    return result


def main(
    input_path: Optional[str] = None,
    paths: Optional[Union[List[str], str]] = None,
    **kwargs: Any
) -> dict:
    """
    Inspect the Blender 3D scene / model and output structured metadata JSON.
    Supports both single input_path and batch paths array.

    Args:
        input_path: Optional path to .blend file or model file.
        paths: Optional list of paths to .blend files.

    Returns:
        Dictionary containing:
          - metadata_map: Dict[str, str] mapping file path to metadata JSON string
          - metadata: metadata JSON string of the first inspected scene (backwards compatible)
          - count: number of processed files
    """
    target_paths: List[str] = []

    if paths is not None:
        if isinstance(paths, list):
            target_paths.extend([str(p).strip() for p in paths if str(p).strip()])
        elif isinstance(paths, str) and paths.strip():
            try:
                parsed = json.loads(paths)
                if isinstance(parsed, list):
                    target_paths.extend([str(p).strip() for p in parsed if str(p).strip()])
                else:
                    target_paths.append(str(parsed).strip())
            except Exception:
                target_paths.append(paths.strip())

    if input_path and str(input_path).strip():
        cleaned_single = str(input_path).strip()
        if cleaned_single not in target_paths:
            target_paths.insert(0, cleaned_single)

    metadata_map: Dict[str, str] = {}
    first_metadata_json = ""

    if not target_paths:
        # Default: inspect currently open active scene in Blender
        metadata = inspect_blender_scene("")
        metadata_json = json.dumps(metadata, indent=2, ensure_ascii=False)
        active_filepath = bpy.data.filepath or "active_scene"
        metadata_map[active_filepath] = metadata_json
        first_metadata_json = metadata_json
    else:
        for p in target_paths:
            metadata = inspect_blender_scene(p)
            metadata_json = json.dumps(metadata, indent=2, ensure_ascii=False)
            metadata_map[p] = metadata_json
            if not first_metadata_json:
                first_metadata_json = metadata_json

    return {
        "metadata_map": metadata_map,
        "metadata": first_metadata_json,
        "count": len(metadata_map),
    }


if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else ""
    res = main(input_path=path)
    print(res.get("metadata", ""))
