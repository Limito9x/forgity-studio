# pyrefly: ignore [missing-import]
"""
Pure-Python Unreal Engine UAsset Material Inspector
Runs on Generic Python Executor or Local Host (< 5ms per file, no Unreal Engine process required).

Consumes:
  1. uasset_files (optional): Direct list of physical .uasset file paths (from FilterResourcesTool / ResolveResources).
  2. folder_path (optional): Root or subfolder containing .uasset files to inspect recursively.
  3. file_pattern (optional): Glob pattern to filter material assets (default "M_*.uasset").

Performs:
  - Fast binary parsing of UE5 FPackageFileSummary, FName Table, and FPropertyTags.
  - Automatically extracts exact Unreal package paths (/Game/.../M_Name).
  - Discovers all Texture Sample Parameters (MaterialExpressionTextureSampleParameter2D).
  - Binds exact SAMPLERTYPE_* and resolves texture presets (TC_*, sRGB, Virtual Texture cờ vt, Semantic category).
  - Categorizes Scalar and Vector material parameters.

Outputs:
  - contracts: Dict[material_tag, contract_dict] mapping tags ('Skin', 'Cloth', etc.) to master material specs.
  - contracts_json: Serialized JSON string ready to wire into AI or downstream material setup nodes.
  - materials_count: Number of successfully inspected Master Materials.
  - summary: Human-readable execution summary.
"""

import os
import sys
import json
import glob
import struct
from typing import Dict, Any, List, Optional, Union


def resolve_sampler_preset(sampler_str: str) -> Dict[str, Any]:
    """
    Translates Unreal Engine SAMPLERTYPE_* to texture compression preset,
    sRGB color space, Virtual Texture flag, and semantic mapping category.
    """
    sampler_upper = (sampler_str or "").strip().upper()
    is_virtual = "VIRTUAL" in sampler_upper

    if "NORMAL" in sampler_upper:
        return {
            "sampler_type": sampler_str,
            "compression": "TC_NORMALMAP",
            "srgb": False,
            "vt": is_virtual,
            "semantic": "NORMAL"
        }
    elif "MASK" in sampler_upper or "LINEARCOLOR" in sampler_upper:
        return {
            "sampler_type": sampler_str,
            "compression": "TC_MASKS",
            "srgb": False,
            "vt": is_virtual,
            "semantic": "MASKS"
        }
    elif "GRAYSCALE" in sampler_upper:
        return {
            "sampler_type": sampler_str,
            "compression": "TC_GRAYSCALE",
            "srgb": False,
            "vt": is_virtual,
            "semantic": "GRAYSCALE"
        }
    else:  # Default / Color
        return {
            "sampler_type": sampler_str,
            "compression": "TC_DEFAULT",
            "srgb": True,
            "vt": is_virtual,
            "semantic": "BASE_COLOR"
        }


def parse_uasset_material(filepath: str) -> Optional[Dict[str, Any]]:
    """
    Parses an uncooked Unreal Engine .uasset file header to extract
    package path, Texture Parameter names, and their SAMPLERTYPE_ settings.
    """
    if not filepath or not os.path.isfile(filepath):
        return None

    try:
        with open(filepath, "rb") as f:
            data = f.read()
    except Exception as ex:
        print(f"[inspect_uasset] Warning: Failed to read '{filepath}': {ex}", flush=True)
        return None

    # 1. Locate package name starting with '/Game/'
    idx = data.find(b"/Game/")
    if idx < 4:
        return None

    str_len = struct.unpack("<i", data[idx - 4:idx])[0]
    if str_len <= 0 or str_len > 1024 or idx + str_len > len(data):
        return None

    pkg_name = data[idx:idx + str_len - 1].decode("utf-8", errors="replace")
    after_pkg = idx + str_len
    if after_pkg + 12 > len(data):
        return None

    pkg_flags, name_count, name_offset = struct.unpack("<III", data[after_pkg:after_pkg + 12])
    if name_offset >= len(data) or name_count > 50000:
        return None

    # 2. Read FName Table
    pos = name_offset
    names: List[str] = []
    for _ in range(name_count):
        if pos + 4 > len(data):
            break
        slen = struct.unpack("<i", data[pos:pos + 4])[0]
        pos += 4
        if slen >= 0:
            if pos + slen > len(data):
                break
            s = data[pos:pos + slen - 1].decode("utf-8", errors="replace")
            pos += slen + 4  # 4 bytes hash
        else:
            n_bytes = (-slen) * 2
            if pos + n_bytes > len(data):
                break
            s = data[pos:pos + n_bytes - 2].decode("utf-16-le", errors="replace")
            pos += n_bytes + 4  # 4 bytes hash
        names.append(s)

    # 3. Locate Property Tag identifiers
    param_name_idx = names.index("ParameterName") if "ParameterName" in names else -1
    name_prop_idx = names.index("NameProperty") if "NameProperty" in names else -1
    sampler_type_idx = names.index("SamplerType") if "SamplerType" in names else -1
    texture_idx = names.index("Texture") if "Texture" in names else -1
    obj_prop_idx = names.index("ObjectProperty") if "ObjectProperty" in names else -1

    entries = []
    if param_name_idx >= 0 and name_prop_idx >= 0:
        pat = struct.pack("<II", param_name_idx, 0) + struct.pack("<II", name_prop_idx, 0)
        start = 0
        while True:
            p = data.find(pat, start)
            if p == -1:
                break
            for offset in [24, 25]:
                if p + offset + 8 <= len(data):
                    val_idx, val_num = struct.unpack("<II", data[p + offset:p + offset + 8])
                    if 0 <= val_idx < len(names) and val_num == 0:
                        entries.append((p, names[val_idx]))
                        break
            start = p + 16

    tex_map: Dict[str, Dict[str, Any]] = {}
    legacy_tex_map: Dict[str, str] = {}
    scalar_params: List[str] = []
    vector_params: List[str] = []

    for i, (p, pname) in enumerate(entries):
        next_p = entries[i + 1][0] if i + 1 < len(entries) else min(len(data), p + 450)
        window = data[p:next_p]
        is_tex = False
        sampler = None

        if texture_idx >= 0 and obj_prop_idx >= 0:
            if (struct.pack("<II", texture_idx, 0) + struct.pack("<II", obj_prop_idx, 0)) in window:
                is_tex = True

        if sampler_type_idx >= 0:
            sp = window.find(struct.pack("<II", sampler_type_idx, 0))
            if sp != -1:
                is_tex = True
                for off2 in range(16, min(64, len(window) - sp - 8)):
                    s_idx, s_num = struct.unpack("<II", window[sp + off2:sp + off2 + 8])
                    if 0 <= s_idx < len(names) and s_num == 0 and names[s_idx].startswith("SAMPLERTYPE_"):
                        sampler = names[s_idx]
                        break

        if is_tex:
            sampler_str = sampler or "SAMPLERTYPE_Color"
            preset_info = resolve_sampler_preset(sampler_str)
            tex_map[pname] = preset_info
            legacy_tex_map[pname] = preset_info["semantic"]
        else:
            if any(k in pname for k in ["Color", "Tint", "Vector"]):
                vector_params.append(pname)
            else:
                scalar_params.append(pname)

    mat_name = os.path.basename(pkg_name)
    clean_tag = mat_name
    for prefix in ["M_", "MI_", "Mat_"]:
        if clean_tag.startswith(prefix):
            clean_tag = clean_tag[len(prefix):]
            break

    return {
        "master_material_path": pkg_name,
        "material_name": mat_name,
        "tag": clean_tag,
        "file_path": filepath.replace("\\", "/"),
        "texture_map": tex_map,
        "legacy_texture_map": legacy_tex_map,
        "scalar_params": scalar_params,
        "vector_params": vector_params
    }


def main(
    uasset_files: Optional[List[str]] = None,
    folder_path: str = "",
    file_pattern: str = "M_*.uasset",
    **kwargs
) -> Dict[str, Any]:
    """
    Inspects Unreal Engine .uasset files directly in Pure Python (< 5ms per file),
    extracting Master Material contracts, texture parameter names, SAMPLERTYPEs, and compression presets.

    Args:
        uasset_files: Direct list of physical .uasset file paths (e.g. from FilterResourcesTool).
        folder_path: Root or subfolder containing .uasset files to inspect recursively.
        file_pattern: Glob pattern to filter material assets (default "M_*.uasset").
    """
    target_files: List[str] = []

    # 1. Collect files from explicit input list
    if uasset_files:
        if isinstance(uasset_files, str):
            if uasset_files.startswith("["):
                try:
                    target_files.extend(json.loads(uasset_files))
                except Exception:
                    target_files.append(uasset_files)
            else:
                target_files.append(uasset_files)
        elif isinstance(uasset_files, list):
            target_files.extend([str(f) for f in uasset_files if f])

    # 2. Collect files from folder scanning if provided
    scan_folder = folder_path or kwargs.get("directory") or kwargs.get("folder")
    if scan_folder and os.path.isdir(str(scan_folder)):
        pattern = os.path.join(str(scan_folder), "**", file_pattern or "*.uasset")
        scanned = glob.glob(pattern, recursive=True)
        target_files.extend(scanned)

    # Normalize paths and deduplicate
    clean_paths = []
    seen = set()
    for p in target_files:
        norm = os.path.normpath(str(p)).replace("\\", "/")
        if norm not in seen and os.path.isfile(norm) and norm.lower().endswith(".uasset"):
            seen.add(norm)
            clean_paths.append(norm)

    if not clean_paths:
        print("[inspect_uasset] Warning: No valid .uasset files found to inspect.", flush=True)
        return {
            "contracts": {},
            "contracts_json": "{}",
            "materials_count": 0,
            "summary": "No .uasset files found"
        }

    print(f"[inspect_uasset] Inspecting {len(clean_paths)} .uasset file(s)...", flush=True)

    contracts: Dict[str, Any] = {}
    total_textures = 0

    for path in clean_paths:
        mat_info = parse_uasset_material(path)
        if not mat_info:
            continue

        tag = mat_info["tag"]
        mat_name = mat_info["material_name"]

        # Register under both clean tag ('Cloth') and exact material name ('M_Cloth')
        contract_data = {
            "master_material_path": mat_info["master_material_path"],
            "material_name": mat_name,
            "texture_map": mat_info["texture_map"],
            "legacy_texture_map": mat_info["legacy_texture_map"],
            "scalar_params": mat_info["scalar_params"],
            "vector_params": mat_info["vector_params"],
            "file_path": mat_info["file_path"]
        }

        contracts[tag] = contract_data
        if mat_name != tag:
            contracts[mat_name] = contract_data

        tex_count = len(mat_info["texture_map"])
        total_textures += tex_count
        print(f"[inspect_uasset] Discovered '{mat_name}' ({tag}): {tex_count} texture param(s) -> {mat_info['master_material_path']}", flush=True)

    unique_materials = len(set(c["master_material_path"] for c in contracts.values()))
    summary = f"Successfully inspected {unique_materials} Master Material(s) with {total_textures} total texture parameter(s)."
    print(f"[inspect_uasset] [SUCCESS] {summary}", flush=True)

    return {
        "contracts": contracts,
        "contracts_json": json.dumps(contracts, indent=2),
        "materials_count": unique_materials,
        "summary": summary
    }


inspect_materials = main


if __name__ == "__main__":
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if os.path.isdir(arg):
            res = main(folder_path=arg)
        elif os.path.isfile(arg):
            res = main(uasset_files=[arg])
        else:
            res = main(folder_path=arg)
        print(json.dumps(res, indent=2))
    else:
        print("Usage: python inspect_uasset_materials.py <file.uasset | folder_path>")

