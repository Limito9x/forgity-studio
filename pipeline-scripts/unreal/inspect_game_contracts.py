# pyrefly: ignore [missing-import]
"""
Pure-Python Game Contracts Inspector (Materials, DataAsset Schemas, and GameplayTags)
Runs on Generic Python Executor or Local Host (< 10ms per file, no Unreal Engine process required).

Consumes:
  1. uasset_files (optional): Direct list of physical .uasset file paths (Materials or Schemas).
  2. folder_path (optional): Root or subfolder containing .uasset files to inspect recursively.
  3. config_folder (optional): Path to Project Config/ folder to read DefaultGameplayTags.ini.
  4. file_pattern (optional): Pattern filter, default "*.uasset".

Performs:
  - Fast binary parsing of UE5 FPackageFileSummary, FName Table, and FPropertyTags.
  - Automatically identifies asset type:
      * Master Material (M_*): Extracts Texture Sample Parameters, SAMPLERTYPE_, and Presets (TC_*, sRGB, VT).
      * Primary Data Asset Schema (PDA_*): Extracts declared fields (GameplayTag, Text, String, SkeletalMesh, Texture2D).
  - Automatically parses DefaultGameplayTags.ini to extract all registered gameplay tags.

Outputs:
  - contracts: Dict with keys:
      * "materials": Dict[material_tag, material_contract]
      * "schemas": Dict[schema_name, schema_contract]
      * "gameplay_tags": List[str] of valid registered tags in the project.
  - contracts_json: Serialized JSON string ready to wire directly into AI Classifier.
  - summary: Human-readable execution summary.
"""

import os
import sys
import json
import glob
import struct
from typing import Dict, Any, List, Optional, Union, Tuple


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


def read_uasset_names_and_package(filepath: str) -> Optional[tuple[bytes, str, List[str]]]:
    """
    Reads uncooked UE5 .uasset file, extracting raw bytes, package name (/Game/...),
    and the full FName Table list.
    """
    if not filepath or not os.path.isfile(filepath):
        return None

    try:
        with open(filepath, "rb") as f:
            data = f.read()
    except Exception as ex:
        print(f"[inspect_contracts] Warning: Failed to read '{filepath}': {ex}", flush=True)
        return None

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

    return data, pkg_name, names


def parse_uasset_material(filepath: str, data: bytes, pkg_name: str, names: List[str]) -> Optional[Dict[str, Any]]:
    """
    Extracts Texture Sample Parameters, SAMPLERTYPE_, and Scalar/Vector parameters from M_*.uasset.
    """
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

    texture_slots: Dict[str, Any] = {}
    seen_names = set()

    for pos, param_name in entries:
        if param_name in seen_names:
            continue

        window_start = max(0, pos - 150)
        window_end = min(len(data), pos + 250)
        chunk = data[window_start:window_end]

        is_tex = False
        if texture_idx >= 0 and obj_prop_idx >= 0:
            pat_tex = struct.pack("<II", texture_idx, 0) + struct.pack("<II", obj_prop_idx, 0)
            if pat_tex in chunk:
                is_tex = True

        sampler_val = "SAMPLERTYPE_Color"
        if sampler_type_idx >= 0:
            pat_s = struct.pack("<II", sampler_type_idx, 0)
            spos = chunk.find(pat_s)
            if spos != -1:
                for off in range(spos, min(len(chunk) - 8, spos + 60)):
                    w_idx, w_num = struct.unpack("<II", chunk[off:off + 8])
                    if 0 <= w_idx < len(names) and w_num == 0:
                        cand = names[w_idx]
                        if cand.startswith("SAMPLERTYPE_"):
                            sampler_val = cand
                            is_tex = True
                            break

        if is_tex:
            seen_names.add(param_name)
            preset = resolve_sampler_preset(sampler_val)
            texture_slots[param_name] = {
                "parameter_name": param_name,
                "sampler_type": sampler_val,
                "compression": preset["compression"],
                "srgb": preset["srgb"],
                "vt": preset["vt"],
                "semantic": preset["semantic"]
            }

    filename = os.path.basename(filepath)
    mat_tag = filename.replace(".uasset", "")
    if mat_tag.startswith("M_"):
        mat_tag = mat_tag[2:]

    return {
        "material_tag": mat_tag,
        "master_material_path": pkg_name,
        "source_file": filepath,
        "texture_slots": texture_slots
    }


def parse_uasset_schema(filepath: str, data: bytes, pkg_name: str, names: List[str]) -> Optional[Dict[str, Any]]:
    """
    Extracts declared fields (GameplayTags, Texts, Strings, SkeletalMeshes, Textures) from PDA_*.uasset.
    """
    filename = os.path.basename(filepath)
    schema_name = filename.replace(".uasset", "")

    # Property type markers in UE5 FName table
    prop_type_names = {
        "StructProperty", "TextProperty", "StrProperty", "NameProperty",
        "ObjectProperty", "SoftObjectProperty", "ArrayProperty", "BoolProperty"
    }

    properties: Dict[str, Any] = {}
    known_system_names = {
        "None", "PropertyFlags", "PropertyGuids", "TagName", "NativeClass",
        "Package", "PackageMetaData", "UberGraphFrame", "Default__" + schema_name + "_C"
    }

    # Discover fields by finding patterns of PropertyName followed by PropertyType
    for prop_type in prop_type_names:
        if prop_type not in names:
            continue
        type_idx = names.index(prop_type)
        pat = struct.pack("<II", type_idx, 0)
        start = 0
        while True:
            p = data.find(pat, start)
            if p == -1:
                break
            # In serialized FProperty tag, NameIndex is usually 8 bytes before TypeIndex
            if p >= 8:
                name_idx, name_num = struct.unpack("<II", data[p - 8:p])
                if 0 <= name_idx < len(names) and name_num == 0:
                    field_name = names[name_idx]
                    if (field_name not in known_system_names and
                            not field_name.startswith("SKEL_") and
                            not field_name.startswith("Default__")):
                        # Determine semantic detail
                        field_type = prop_type.replace("Property", "")
                        details: Dict[str, Any] = {"type": field_type}

                        # Check if Struct is GameplayTag
                        if prop_type == "StructProperty":
                            # Check window for struct type name
                            chunk = data[p:min(len(data), p + 60)]
                            if "GameplayTag" in names:
                                tag_idx = names.index("GameplayTag")
                                if struct.pack("<II", tag_idx, 0) in chunk:
                                    details["struct_type"] = "GameplayTag"
                                    details["type"] = "GameplayTag"

                        # Check if SoftObject is SkeletalMesh or Texture
                        if prop_type in ("SoftObjectProperty", "ObjectProperty"):
                            chunk = data[p:min(len(data), p + 80)]
                            if "SkeletalMesh" in names and struct.pack("<II", names.index("SkeletalMesh"), 0) in chunk:
                                details["object_class"] = "SkeletalMesh"
                            elif "Texture2D" in names and struct.pack("<II", names.index("Texture2D"), 0) in chunk:
                                details["object_class"] = "Texture2D"

                        properties[field_name] = details
            start = p + 4

    # Class path with _C convention for Blueprint DataAssets
    class_path = f"{pkg_name}.{schema_name}_C"

    return {
        "schema_name": schema_name,
        "class_path": class_path,
        "package_path": pkg_name,
        "source_file": filepath,
        "properties": properties
    }


def find_project_root_and_config(start_path: str) -> Optional[str]:
    """
    Walks up directory tree until .uproject file is found,
    then returns the project's Config/ folder path.
    """
    if not start_path:
        return None

    curr = os.path.abspath(start_path)
    if os.path.isfile(curr):
        curr = os.path.dirname(curr)

    # Walk up to root
    for _ in range(12):
        # Check if .uproject exists in curr
        for item in os.listdir(curr):
            if item.endswith(".uproject"):
                config_candidate = os.path.join(curr, "Config")
                if os.path.isdir(config_candidate):
                    return config_candidate
                return None

        parent = os.path.dirname(curr)
        if parent == curr:
            break
        curr = parent

    return None


def parse_default_gameplay_tags_ini(config_path: str) -> Tuple[List[str], List[str]]:
    """
    Parses DefaultGameplayTags.ini to extract:
      1. All registered GameplayTag strings.
      2. Specific wardrobe slot tags ('System.Wardrobe.Slots.*').
    """
    tags: List[str] = []
    slots: List[str] = []
    if not config_path:
        return tags, slots

    target_file = config_path
    if os.path.isdir(config_path):
        target_file = os.path.join(config_path, "DefaultGameplayTags.ini")

    if not os.path.isfile(target_file):
        return tags, slots

    try:
        with open(target_file, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if line.startswith("+GameplayTagList="):
                    start = line.find('Tag="')
                    if start != -1:
                        end = line.find('"', start + 5)
                        if end != -1:
                            tag_str = line[start + 5:end]
                            if tag_str and tag_str not in tags:
                                tags.append(tag_str)
                                if "System.Wardrobe.Slots." in tag_str or ".Slots." in tag_str:
                                    slots.append(tag_str)
    except Exception as ex:
        print(f"[inspect_contracts] Warning: Failed to parse tags ini: {ex}", flush=True)

    return sorted(tags), sorted(slots)


def main(
    uasset_files: Optional[List[str]] = None,
    folder_path: str = "",
    config_folder: str = "",
    file_pattern: str = "*.uasset",
    allowed_prefixes: Optional[List[str]] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    Main entry point for Pure-Python Game Contracts Inspection.
    """
    files_to_inspect: List[str] = []

    if uasset_files:
        files_to_inspect.extend([f for f in uasset_files if f and f.endswith(".uasset")])

    if folder_path and os.path.isdir(folder_path):
        pat = os.path.join(folder_path, "**", file_pattern)
        found = glob.glob(pat, recursive=True)
        files_to_inspect.extend(found)

    # Normalize allowed prefixes
    clean_prefixes = []
    if allowed_prefixes:
        for p in allowed_prefixes:
            if p:
                clean_prefixes.append(p.strip().replace("\\", "/").strip("/").lower())

    # De-duplicate preserving order with path filter
    unique_files: List[str] = []
    seen = set()
    for fp in files_to_inspect:
        norm = os.path.abspath(fp)
        if norm in seen or not os.path.isfile(norm):
            continue

        if clean_prefixes:
            norm_fwd = norm.replace("\\", "/").lower()
            # Must match at least one allowed prefix
            matched = False
            for pfx in clean_prefixes:
                if f"/{pfx}/" in norm_fwd or norm_fwd.endswith(f"/{pfx}") or f"/{pfx}" in norm_fwd:
                    matched = True
                    break
            if not matched:
                continue

        seen.add(norm)
        unique_files.append(norm)

    materials: Dict[str, Any] = {}
    schemas: Dict[str, Any] = {}

    for fp in unique_files:
        parsed_tuple = read_uasset_names_and_package(fp)
        if not parsed_tuple:
            continue
        data, pkg_name, names = parsed_tuple
        base_name = os.path.basename(fp)

        # Distinguish between Master Material and DataAsset Schema
        if base_name.startswith("M_") or "Material" in base_name:
            mat = parse_uasset_material(fp, data, pkg_name, names)
            if mat:
                materials[mat["material_tag"]] = mat
        elif base_name.startswith("PDA_") or "Schema" in base_name or "DataAsset" in base_name:
            schema = parse_uasset_schema(fp, data, pkg_name, names)
            if schema:
                schemas[schema["schema_name"]] = schema

    # Auto-detect config_folder by walking up to .uproject
    if not config_folder and (unique_files or folder_path):
        search_start = unique_files[0] if unique_files else folder_path
        detected_cfg = find_project_root_and_config(search_start)
        if detected_cfg:
            config_folder = detected_cfg

    gameplay_tags, wardrobe_slots = parse_default_gameplay_tags_ini(config_folder)

    contracts_payload = {
        "materials": materials,
        "schemas": schemas,
        "gameplay_tags": gameplay_tags,
        "wardrobe_slots": wardrobe_slots
    }

    contracts_json = json.dumps(contracts_payload, indent=2, ensure_ascii=False)
    summary = (
        f"Inspected {len(unique_files)} .uasset files. "
        f"Discovered {len(materials)} Master Materials, "
        f"{len(schemas)} Schemas ({', '.join(schemas.keys()) or 'None'}), "
        f"{len(wardrobe_slots)} Wardrobe Slots, "
        f"and {len(gameplay_tags)} registered GameplayTags."
    )

    print(f"[inspect_game_contracts] {summary}", flush=True)

    return {
        "contracts": contracts_payload,
        "contracts_json": contracts_json,
        "materials_count": len(materials),
        "schemas_count": len(schemas),
        "slots_count": len(wardrobe_slots),
        "tags_count": len(gameplay_tags),
        "summary": summary
    }


if __name__ == "__main__":
    test_folder = r"D:\Games\UnrealEngine\Projects\TemplateProject\Content"
    test_config = r"D:\Games\UnrealEngine\Projects\TemplateProject\Config"
    res = main(folder_path=test_folder, config_folder=test_config)
    print("\n--- TEST INSPECT RESULT ---")
    print("Materials:", list(res["contracts"]["materials"].keys()))
    print("Schemas:", list(res["contracts"]["schemas"].keys()))
    print("Sample Tags:", res["contracts"]["gameplay_tags"][:5])

