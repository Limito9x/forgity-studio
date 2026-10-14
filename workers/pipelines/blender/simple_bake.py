import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    # pyrefly: ignore [missing-import]
    import bpy
    HAS_BPY = True
except ImportError:
    bpy = None
    HAS_BPY = False


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tga", ".exr", ".tif", ".tiff", ".bmp", ".webp"}


def set_target_uv(objects: List[Any], uv_name: str) -> None:
    """
    Set target UV layer as the active UV (where Cycles bakes textures into).
    IMPORTANT: Do NOT set uv_layer.active_render = True, because active_render
    must remain on the original source UV to allow Cycles to sample original material textures.
    """
    for obj in objects:
        if obj.type == "MESH" and obj.data.uv_layers:
            uv_layer = obj.data.uv_layers.get(uv_name)
            if not uv_layer:
                for layer in obj.data.uv_layers:
                    if layer.name.lower() == uv_name.lower():
                        uv_layer = layer
                        break

            if uv_layer:
                obj.data.uv_layers.active = uv_layer
                obj["SB_uv_used_for_bake"] = uv_layer.name
                orig_render = [l.name for l in obj.data.uv_layers if l.active_render]
                print(f"[SimpleBake] Object '{obj.name}' -> Active Bake UV: '{uv_layer.name}', Sampling UV: {orig_render}")
            else:
                print(f"[SimpleBake] WARNING: Object '{obj.name}' does not have UV layer '{uv_name}'")


def apply_preset_dict(context, d: dict) -> None:
    """Apply preset dictionary directly to SimpleBake properties."""
    import SimpleBake.presets as sbp_mod
    import SimpleBake.utils as sb_utils

    sbp = context.scene.SimpleBake_Props
    sb_utils.suppress_for_preset_load = True
    try:
        d = sbp_mod.fix_legacy(d)
        for p in sbp_mod.basic_props:
            if p in d:
                try:
                    cur = getattr(sbp, p)
                    val = d[p]
                    if hasattr(cur, "to_list"):
                        setattr(sbp, p, tuple(val))
                    else:
                        setattr(sbp, p, val)
                except Exception:
                    pass

        for p in sbp_mod.scene_props:
            if p in d:
                try:
                    sbp_mod.deep_setattr(context.scene, p, d[p])
                except Exception:
                    pass

        # Channel packing images (ORM / ART textures)
        if "channel_packed_images" in d:
            channel_packed_images = d["channel_packed_images"]
            sbp.cp_list.clear()
            for imgname, thiscpt_dict in channel_packed_images.items():
                li = sbp.cp_list.add()
                li.name = imgname
                li.R = thiscpt_dict.get("R", "none")
                li.G = thiscpt_dict.get("G", "none")
                li.B = thiscpt_dict.get("B", "none")
                li.A = thiscpt_dict.get("A", "none")
                li.file_format = thiscpt_dict.get("file_format", "PNG")
                li.exr_codec = thiscpt_dict.get("exr_codec", "ZIP")
                li.png_compression = thiscpt_dict.get("png_compression", 15)
                li.none_value = thiscpt_dict.get("none_value", 0.0)
            if len(sbp.cp_list) > 0:
                sbp.cp_list_index = 0
    finally:
        sb_utils.suppress_for_preset_load = False
        sbp_mod.invalidate_auto_match_cache()


def load_simplebake_preset(context, preset_path: Any) -> None:
    """Load SimpleBake preset from a file path, JSON string, or dictionary."""
    if not preset_path:
        raise ValueError("A valid 'preset_path' must be provided.")

    d = None
    if isinstance(preset_path, dict):
        d = preset_path
    elif isinstance(preset_path, str):
        source_str = preset_path.strip()
        if source_str.startswith("{") and source_str.endswith("}"):
            try:
                d = json.loads(source_str)
            except Exception as e:
                raise ValueError(f"Failed to parse preset JSON string: {e}")
        elif os.path.isfile(source_str):
            print(f"[SimpleBake] Loading preset file from: '{source_str}'")
            with open(source_str, "r", encoding="utf-8", errors="ignore") as f:
                d = json.loads(f.read())
        else:
            raise FileNotFoundError(f"SimpleBake preset file not found: '{source_str}'")
    else:
        raise TypeError(f"Unsupported preset_path type: {type(preset_path)}")

    if not d:
        raise ValueError(f"Preset configuration is empty or invalid: {preset_path}")

    apply_preset_dict(context, d)
    print(f"[SimpleBake] Preset successfully applied to scene ({len(d)} properties).")


def setup_gpu(use_gpu: bool = True) -> None:
    """Detect and activate GPU (OPTIX / CUDA / HIP / ONEAPI) for Cycles baking."""
    if not use_gpu:
        print("[SimpleBake GPU] use_gpu=False -> Using CPU for Cycles.")
        bpy.context.scene.cycles.device = 'CPU'
        return

    try:
        cycles_addon = bpy.context.preferences.addons.get("cycles")
        if not cycles_addon:
            return
        cprefs = cycles_addon.preferences

        preferred_types = ['OPTIX', 'CUDA', 'HIP', 'ONEAPI']
        chosen_type = None
        for dev_type in preferred_types:
            try:
                cprefs.compute_device_type = dev_type
                devices = cprefs.get_devices_for_type(dev_type)
                gpu_devs = [d for d in devices if d.type != 'CPU']
                if gpu_devs:
                    for d in devices:
                        d.use = (d.type != 'CPU')
                    chosen_type = dev_type
                    print(f"[SimpleBake GPU] Activated {len(gpu_devs)} GPU(s) ({dev_type}): {[d.name for d in gpu_devs]}")
                    break
            except Exception:
                continue

        if chosen_type:
            bpy.context.scene.cycles.device = 'GPU'
            print(f"[SimpleBake GPU] Scene Cycles device set to 'GPU' ({chosen_type}).")
        else:
            print("[SimpleBake GPU] No compatible GPU found. Falling back to CPU.")
            bpy.context.scene.cycles.device = 'CPU'
    except Exception as e:
        print(f"[SimpleBake GPU] Warning during GPU setup: {e}")


def detect_channel(stem: str, pack_names: List[str]) -> Optional[str]:
    """Detect texture channel type from file stem."""
    stem_lower = stem.lower()

    # 1. Channel-packed maps (ART, ORM, RMA, etc.)
    for pn in pack_names:
        p_lower = pn.lower()
        if (f"_{p_lower}" in stem_lower or stem_lower.endswith(p_lower) or
                stem_lower.startswith(f"{p_lower}_") or f"_{p_lower}_" in stem_lower):
            return pn

    # 2. Standard PBR maps
    if any(k in stem_lower for k in ["basecolor", "base_color", "diffuse", "albedo", "_col", "_diff", "_alb"]):
        return "BASE_COLOR"
    if any(k in stem_lower for k in ["normal", "_nor", "_nrm", "_nm", "_n."]):
        return "NORMAL"
    if any(k in stem_lower for k in ["specular", "spec", "_spc", "_s.", "_spec"]):
        return "SPECULAR"
    if any(k in stem_lower for k in ["roughness", "_rough", "_rgh"]):
        return "ROUGHNESS"
    if any(k in stem_lower for k in ["metallic", "metal", "_met", "_m."]):
        return "METALLIC"
    if any(k in stem_lower for k in ["ambient_occlusion", "occlusion", "_ao."]):
        return "AO"
    if any(k in stem_lower for k in ["alpha", "opacity", "transparent"]):
        return "ALPHA"
    if any(k in stem_lower for k in ["emission", "emit", "glow"]):
        return "EMISSION"
    if any(k in stem_lower for k in ["displacement", "disp", "height", "bump"]):
        return "DISPLACEMENT"
    if any(k in stem_lower for k in ["thickness", "thick"]):
        return "THICKNESS"

    return None


def scan_baked_textures(
    objs: List[Any],
    output_dir: str,
    cp_names: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Scan the bake output directory and build objects manifest:
    [{ "name": obj.name, "materials": [{ "name": mat.name, "textures": { "BASE_COLOR": "...", "NORMAL": "...", "ART": "..." } }] }]
    """
    # 1. Resolve Blender relative path '//...' to absolute disk path
    resolved_dir = output_dir or ""
    if resolved_dir.startswith("//"):
        try:
            resolved_dir = bpy.path.abspath(resolved_dir)
        except Exception:
            pass
    if resolved_dir:
        resolved_dir = os.path.normpath(os.path.abspath(resolved_dir))

    # 2. Check if output directory exists (with fallback search)
    out_path = Path(resolved_dir) if resolved_dir else None
    if not out_path or not out_path.is_dir():
        print(f"[SimpleBake Manifest] Output directory does not exist: '{resolved_dir}' (raw: '{output_dir}')")
        fallback_candidates = [
            Path(bpy.path.abspath("//SimpleBake_Bakes")),
            Path(os.getcwd()) / "SimpleBake_Bakes",
            Path(os.getcwd()) / "workers" / "SimpleBake_Bakes",
            Path("D:/FullStack/Automation/workers/SimpleBake_Bakes"),
        ]
        found_dir = None
        for cand in fallback_candidates:
            if cand.is_dir():
                found_dir = cand
                print(f"[SimpleBake Manifest] 🔍 Found baked directory via fallback search: '{found_dir}'")
                break
        if found_dir:
            out_path = found_dir
            resolved_dir = str(found_dir)
        else:
            return []

    all_files: List[Path] = []
    for root, _, files in os.walk(out_path):
        for f in files:
            p = Path(root) / f
            if p.suffix.lower() in IMAGE_EXTENSIONS:
                all_files.append(p)

    if not all_files:
        print(f"[SimpleBake Manifest] No image files found in: {resolved_dir}")
        return []

    pack_names = [name.upper() for name in (cp_names or [])]
    for default_name in ["ART", "ORM", "RMA"]:
        if default_name not in pack_names:
            pack_names.append(default_name)

    objects_manifest: List[Dict[str, Any]] = []

    for obj in objs:
        if obj.type != "MESH" or not obj.material_slots:
            continue

        obj_entry: Dict[str, Any] = {
            "name": obj.name,
            "materials": []
        }

        for slot in obj.material_slots:
            mat = slot.material
            if not mat:
                continue

            mat_name_lower = mat.name.lower()
            obj_name_lower = obj.name.lower()
            obj_clean = obj_name_lower.replace(" ", "_")

            best_match: Dict[str, Tuple[int, Path]] = {}

            for fpath in all_files:
                stem = fpath.stem.lower()
                stem_clean = stem.replace(" ", "_")
                chan = detect_channel(fpath.stem, pack_names)
                if not chan:
                    continue

                score = 0
                if mat_name_lower in stem:
                    score += 100
                if obj_name_lower in stem or obj_clean in stem_clean:
                    score += 50
                if mat_name_lower in fpath.parent.name.lower():
                    score += 40
                if obj_name_lower in fpath.parent.name.lower():
                    score += 30

                # Fallback score if object has only 1 material or single target object
                if score == 0 and len(obj.material_slots) == 1:
                    score = 10
                elif score == 0 and len(objs) == 1:
                    score = 5

                if score > 0:
                    current_best = best_match.get(chan)
                    if not current_best or score > current_best[0]:
                        best_match[chan] = (score, fpath)

            matched_textures: Dict[str, str] = {
                chan: str(best_match[chan][1].resolve()).replace("\\", "/")
                for chan in best_match
            }

            if matched_textures:
                obj_entry["materials"].append({
                    "name": mat.name,
                    "textures": matched_textures
                })

        if obj_entry["materials"]:
            objects_manifest.append(obj_entry)

    return objects_manifest


def parse_object_names(raw_input: Any) -> List[str]:
    """Parse object names from list, tuple, comma-separated string, or JSON string."""
    if not raw_input:
        return []

    if isinstance(raw_input, (list, tuple, set)):
        result = []
        for item in raw_input:
            result.extend(parse_object_names(item))
        return result

    if isinstance(raw_input, str):
        s = raw_input.strip()
        if not s:
            return []
        if (s.startswith("[") and s.endswith("]")) or (s.startswith("(") and s.endswith(")")):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, (list, tuple, set)):
                    return parse_object_names(parsed)
            except Exception:
                pass
        if "," in s:
            return [x.strip() for x in s.split(",") if x.strip()]
        return [s]

    return [str(raw_input).strip()]


def main(
    preset_path: str,
    object_names: List[str],
    output_dir: Optional[str] = None,
    target_uv_name: Optional[str] = None,
    use_gpu: bool = True,
) -> Dict[str, Any]:
    """
    Streamlined SimpleBake Pipeline Tool (Pure Bake Engine).
    Loads a preset file, bakes textures for specified mesh objects, and returns a structured texture manifest.

    Args:
        preset_path: Path to SimpleBake preset JSON file (or raw JSON string).
        object_names: List of mesh object names to bake.
        output_dir: Destination directory for baked textures (overrides preset export path if given).
        target_uv_name: Name of destination UV map to bake to (e.g. 'UVMap_Baked').
        use_gpu: Whether to prioritize GPU (OptiX / CUDA) for Cycles baking (default: True).

    Returns:
        Structured dictionary containing status, output directory, objects hierarchy, and material textures map.
    """
    # 1. Ensure SimpleBake addon is enabled
    if "SimpleBake" not in bpy.context.preferences.addons:
        bpy.ops.preferences.addon_enable(module="SimpleBake")

    sbp = bpy.context.scene.SimpleBake_Props

    # 2. Resolve Target Mesh Objects
    parsed_names = parse_object_names(object_names)
    if not parsed_names:
        raise ValueError("Parameter 'object_names' cannot be empty.")

    objs: List[Any] = []
    bpy.ops.object.select_all(action="DESELECT")

    for base_name in parsed_names:
        name_clean = base_name.lower().strip()
        if not name_clean:
            continue

        # Exact match priority
        exact_matches = [
            o for o in bpy.data.objects
            if o.type == "MESH" and (o.name.lower() == name_clean or o.name.lower() == f"{name_clean} mesh")
        ]
        if exact_matches:
            for obj in exact_matches:
                if obj not in objs:
                    objs.append(obj)
                    obj.select_set(True)
            continue

        # Prefix match fallback
        prefix_matches = [
            o for o in bpy.data.objects
            if o.type == "MESH" and (o.name.lower().startswith(f"{name_clean}_") or o.name.lower().startswith(f"{name_clean}."))
        ]
        if prefix_matches:
            for obj in prefix_matches:
                if obj not in objs:
                    objs.append(obj)
                    obj.select_set(True)
            continue

        # Substring match fallback
        for obj in bpy.data.objects:
            if obj.type == "MESH" and name_clean in obj.name.lower() and obj not in objs:
                objs.append(obj)
                obj.select_set(True)

    if not objs:
        raise ValueError(f"No mesh objects found matching 'object_names': {parsed_names}")

    bpy.context.view_layer.objects.active = objs[0]

    # Populate SimpleBake bake object list
    sbp.objects_list.clear()
    for obj in objs:
        item = sbp.objects_list.add()
        item.obj_point = obj
        item.name = obj.name
        obj.select_set(True)

    try:
        bpy.ops.simplebake.refresh_bake_object_list()
    except Exception as e:
        print(f"[SimpleBake] refresh_bake_object_list warning: {e}")

    # 3. Load Preset from file
    load_simplebake_preset(bpy.context, preset_path)

    # 4. Set target bake UV
    if target_uv_name:
        sbp.new_uv_option = False
        set_target_uv(objs, target_uv_name)

    # 5. Output directory override
    if output_dir:
        resolved_out = output_dir
        if resolved_out.startswith("//"):
            try:
                resolved_out = bpy.path.abspath(resolved_out)
            except Exception:
                pass
        out_path = Path(resolved_out).resolve()
        out_path.mkdir(parents=True, exist_ok=True)
        sbp.export_bakes = True
        sbp.export_path = str(out_path).replace("\\", "/")

    # Internal property required by SimpleBake
    sbp['SB_orig_bake_objects'] = [o.name for o in sbp.objects_list]

    # Pre-bake setup for background execution on Blender >= 4.1
    if bpy.app.version >= (4, 1, 0) and sbp.global_mode == "PBR":
        try:
            bpy.ops.simplebake.pbr_pre_bake()
        except Exception as e:
            print(f"[SimpleBake] pbr_pre_bake warning: {e}")

    # Snapshot initial panel state so SimpleBake post-bake restoration never fails
    try:
        from SimpleBake.presets_local import save_preset
        save_preset(bpy.context, "TMP_Panel_Initial_State")
    except Exception as e:
        pass

    # 6. Configure GPU
    setup_gpu(use_gpu=use_gpu)

    # 7. Execute Bake
    print(f"[SimpleBake] Running bake for {len(objs)} object(s) (Mode: {sbp.global_mode})...")
    if sbp.global_mode == "CyclesBake":
        if getattr(sbp, "selected_s2a", False):
            result = bpy.ops.simplebake.bake_operation_cyclesbake_s2a()
        else:
            result = bpy.ops.simplebake.bake_operation_cyclesbake()
    else:
        if getattr(sbp, "selected_s2a", False):
            result = bpy.ops.simplebake.bake_operation_pbrs2a()
        else:
            result = bpy.ops.simplebake.bake_operation_pbr()

    if "FINISHED" not in result and "RUNNING_MODAL" not in result:
        raise RuntimeError(f"SimpleBake execution failed with: {result}")

    # 8. Build Baked Textures Manifest
    raw_output_dir = sbp.export_path if getattr(sbp, "export_bakes", bool(getattr(sbp, "export_path", None))) else output_dir
    final_output_dir = raw_output_dir or ""
    if str(final_output_dir).startswith("//"):
        try:
            final_output_dir = bpy.path.abspath(str(final_output_dir))
        except Exception:
            pass
    if final_output_dir:
        final_output_dir = os.path.normpath(os.path.abspath(str(final_output_dir))).replace("\\", "/")

    cp_names = [item.name for item in sbp.cp_list] if hasattr(sbp, "cp_list") else []

    objects_manifest = scan_baked_textures(
        objs=objs,
        output_dir=final_output_dir or "",
        cp_names=cp_names
    )

    total_mats = sum(len(o.get("materials", [])) for o in objects_manifest)
    print(f"[SimpleBake] Successfully baked {total_mats} material(s) across {len(objects_manifest)} object(s).")

    return {
        "status": "SUCCESS",
        "preset_path": str(preset_path),
        "output_dir": final_output_dir,
        "objects": objects_manifest
    }
