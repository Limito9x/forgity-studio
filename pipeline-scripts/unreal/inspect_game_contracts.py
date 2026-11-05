# pyrefly: ignore [missing-import]
"""
Pure-Python Game Contracts Inspector (Materials, DataAsset Schemas, and GameplayTags)
Runs on Generic Python Executor or Local Host (< 10ms per file, no Unreal Engine process required).

Consumes:
  1. project_path: Explicit .uproject file on the executing Runner.
  2. material_folders / material_pattern: Content-relative roots and filename filter for materials.
  3. pda_folders / pda_pattern: Content-relative roots and filename filter for PDA schemas.
  Config/DefaultGameplayTags.ini is resolved directly beside the selected .uproject.

Performs:
  - Fast binary parsing of UE5 FPackageFileSummary, FName Table, and FPropertyTags.
  - Automatically identifies asset type:
      * Master Material (M_*): Extracts Texture Sample Parameters, SAMPLERTYPE_, and Presets (TC_*, sRGB, VT).
      * Primary Data Asset Schema (PDA_*): Extracts declared fields (GameplayTag, Text, String, SkeletalMesh, Texture2D).
  - Automatically parses DefaultGameplayTags.ini to extract all registered gameplay tags.

Outputs:
  - contracts: Dict (Map) with keys:
      * "materials": Dict[material_tag, material_contract]
      * "schemas": Dict[schema_name, schema_contract]
      * "gameplay_tags": List[str] of valid registered tags in the project.
      * "wardrobe_slots": List[str] of valid wardrobe slot tags.
  - summary: Human-readable execution summary.
"""

import os
import json
import struct
from pathlib import Path, PureWindowsPath
from typing import Dict, Any, List, Optional, Tuple


def resolve_sampler_preset(sampler_str: str, param_name: str = "") -> Dict[str, Any]:
    """
    Translates Unreal Engine SAMPLERTYPE_* to texture compression preset,
    sRGB color space, Virtual Texture flag, and semantic mapping category.
    Includes smart parameter name heuristic fallback if sampler is ambiguous.
    """
    sampler_upper = (sampler_str or "").strip().upper()
    is_virtual = "VIRTUAL" in sampler_upper
    p_lower = (param_name or "").strip().lower()

    # Prioritize parameter name keywords if technical artist left SamplerType as default Color
    is_opacity_param = any(k in p_lower for k in ["opacity", "alpha", "mask", "trans", "cutout"])
    is_mask_orm_param = any(k in p_lower for k in ["orm", "rough", "metal", "spec", "ao", "cavity"])
    is_normal_param = any(k in p_lower for k in ["norm", "nm", "tangent"])

    if "NORMAL" in sampler_upper or is_normal_param:
        return {
            "sampler_type": sampler_str,
            "compression": "TC_NORMALMAP",
            "srgb": False,
            "vt": is_virtual,
            "semantic": "NORMAL"
        }
    elif "MASK" in sampler_upper or "LINEARCOLOR" in sampler_upper or is_opacity_param or is_mask_orm_param:
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
            preset = resolve_sampler_preset(sampler_val, param_name=param_name)
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

    known_system_fields = {
        "VarGuid", "VarType", "EditedObjectPath", "SavedViewOffset", "BlueprintGuid", "GraphGuid",
        "FriendlyName", "DefaultValue", "DataValue", "bLegacyNeedToPurgeSkelRefs", "bAllowDeletion",
        "Category", "VarName", "RepNotifyFunc", "DataKey", "UbergraphPages", "NewVariables",
        "MetaDataArray", "CategorySorting", "LastEditedDocuments", "ParentClass", "GeneratedClass",
        "Schema", "None", "PropertyFlags", "PropertyGuids", "TagName", "NativeClass", "Package",
        "PackageMetaData", "UberGraphFrame"
    }

    clean_properties: Dict[str, Any] = {}
    ai_editable_fields: List[str] = []
    system_bound_fields: List[str] = []

    for k, v in properties.items():
        if k in known_system_fields or "/" in k or k.startswith("Default__") or k.startswith("SKEL_"):
            continue
        clean_properties[k] = v
        if v.get("type") == "GameplayTag" or k.endswith("Tag") or k in ["DisplayName", "ItemName", "Title"]:
            ai_editable_fields.append(k)
        elif v.get("object_class") in ["SkeletalMesh", "Texture2D"] or k in ["ItemMesh", "BodyMesh", "Mesh", "ItemThumbnail", "Thumbnail"]:
            system_bound_fields.append(k)

    # Defaults by convention if uasset binary AST didn't capture soft objects
    if "DisplayName" not in ai_editable_fields:
        ai_editable_fields.append("DisplayName")
    if schema_name == "PDA_WardrobeItem":
        for bound in ["ItemMesh", "ItemThumbnail"]:
            if bound not in system_bound_fields:
                system_bound_fields.append(bound)
    elif schema_name == "PDA_CharacterProfile":
        if "BodyMesh" not in system_bound_fields:
            system_bound_fields.append("BodyMesh")

    return {
        "schema_name": schema_name,
        "class_path": class_path,
        "package_path": pkg_name,
        "source_file": filepath,
        "ai_editable_fields": ai_editable_fields,
        "system_bound_fields": system_bound_fields,
        "properties": clean_properties
    }


def collect_contract_files(content_root: Path, folders: List[str], pattern: str, group: str) -> List[str]:
    """Collect only explicit Content-relative roots, rejecting paths outside their scope."""
    if not isinstance(folders, list) or not folders:
        raise ValueError(f"{group}_folders must be a non-empty list of Content-relative folders")
    if not pattern or any(char in pattern for char in ("/", "\\", ":")) or pattern in (".", ".."):
        raise ValueError(f"{group}_pattern must be a filename pattern, without directories")
    found = set()
    for folder in folders:
        if not isinstance(folder, str) or not folder.strip():
            raise ValueError(f"{group}_folders contains an empty or invalid folder")
        relative = folder.strip().replace("\\", "/")
        if PureWindowsPath(relative).drive or relative.startswith("/") or ".." in relative.split("/"):
            raise ValueError(f"{group} folder must be relative to Content: {folder}")
        root = (content_root / relative).resolve()
        if not root.is_relative_to(content_root):
            raise ValueError(f"{group} folder is outside Content: {folder}")
        if not root.is_dir():
            raise FileNotFoundError(f"{group} folder does not exist: {root}")
        matches = []
        for candidate in root.rglob(pattern):
            resolved = candidate.resolve()
            if not resolved.is_relative_to(root):
                raise ValueError(f"{group} asset is outside selected folder: {candidate}")
            if resolved.is_file() and resolved.suffix.lower() == ".uasset":
                matches.append(str(resolved))
        if not matches:
            raise ValueError(f"No {group} .uasset files match '{pattern}' in {root}")
        found.update(matches)
    return sorted(found)


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
    except OSError as ex:
        raise OSError(f"Failed to read GameplayTags file: {target_file}") from ex

    return sorted(tags), sorted(slots)


def main(
    project_path: str,
    material_folders: List[str],
    pda_folders: List[str],
    material_pattern: str = "M_*.uasset",
    pda_pattern: str = "PDA_*.uasset",
) -> Dict[str, Any]:
    """
    Inspect material and PDA contracts only inside explicitly selected project folders.

    Args:
        project_path: Absolute .uproject path on the Runner; required to resolve Content and Config without searching.
        material_folders: List of Content-relative material folders; required to bound recursive inspection.
        pda_folders: List of Content-relative PDA schema folders; required to bound recursive inspection. May overlap material folders.
        material_pattern: Filename glob for material candidates, default M_*.uasset; needed to exclude unrelated assets within selected folders.
        pda_pattern: Filename glob for schema candidates, default PDA_*.uasset; needed to exclude unrelated assets within selected folders.

    Returns:
        contracts: Material/schema definitions and registered tags consumed by classification and import; skeletons remains empty, select skeleton_path at import.
        materials_count: Number of inspected material contracts for verification.
        schemas_count: Number of inspected PDA schemas for verification.
        skeletons_count: Always zero; retained for existing output consumers.
        slots_count: Number of discovered wardrobe slots for verification.
        tags_count: Number of registered tags for verification.
        summary: Inspection counts for execution logs.
    """
    project = Path(project_path).expanduser()
    if not project.is_absolute() or project.suffix.lower() != ".uproject" or not project.is_file():
        raise ValueError(f"project_path must be an existing absolute .uproject file: {project_path}")
    project = project.resolve()
    content_root = (project.parent / "Content").resolve()
    material_files = collect_contract_files(content_root, material_folders, material_pattern, "material")
    pda_files = collect_contract_files(content_root, pda_folders, pda_pattern, "pda")
    config_file = project.parent / "Config" / "DefaultGameplayTags.ini"
    if not config_file.is_file():
        raise FileNotFoundError(f"GameplayTags file does not exist: {config_file}")

    materials: Dict[str, Any] = {}
    schemas: Dict[str, Any] = {}
    skeletons: Dict[str, Any] = {}

    for group, files, target, parser, key in (
        ("material", material_files, materials, parse_uasset_material, "material_tag"),
        ("pda", pda_files, schemas, parse_uasset_schema, "schema_name"),
    ):
        for fp in files:
            parsed_tuple = read_uasset_names_and_package(fp)
            if not parsed_tuple:
                raise ValueError(f"Cannot read {group} .uasset contract: {fp}")
            data, pkg_name, names = parsed_tuple
            if group == "material":
                valid_type = "Material" in names and "MaterialInstanceConstant" not in names
            else:
                valid_type = "BlueprintGeneratedClass" in names and any(name in names for name in ("PrimaryDataAsset", "DataAsset"))
            if not valid_type:
                raise ValueError(f"Asset lacks expected {group} type markers: {fp}")
            contract = parser(fp, data, pkg_name, names)
            if not contract:
                raise ValueError(f"Cannot extract {group} contract: {fp}")
            identity = contract[key]
            if identity in target:
                raise ValueError(f"Duplicate {group} contract '{identity}': {target[identity]['source_file']} and {fp}")
            target[identity] = contract

    gameplay_tags, wardrobe_slots = parse_default_gameplay_tags_ini(str(config_file))

    contracts: Dict[str, Any] = {
        "materials": materials,
        "schemas": schemas,
        "skeletons": skeletons,
        "gameplay_tags": gameplay_tags,
        "wardrobe_slots": wardrobe_slots
    }

    summary = (
        f"Inspected {len(set(material_files + pda_files))} .uasset files. "
        f"Discovered {len(materials)} Master Materials, "
        f"{len(schemas)} Schemas ({', '.join(schemas.keys()) or 'None'}), "
        f"{len(skeletons)} Skeletons ({', '.join(skeletons.keys()) or 'None'}), "
        f"{len(wardrobe_slots)} Wardrobe Slots, "
        f"and {len(gameplay_tags)} registered GameplayTags."
    )

    print(f"[inspect_game_contracts] {summary}", flush=True)

    return {
        "contracts": contracts,
        "materials_count": len(materials),
        "schemas_count": len(schemas),
        "skeletons_count": len(skeletons),
        "slots_count": len(wardrobe_slots),
        "tags_count": len(gameplay_tags),
        "summary": summary
    }


if __name__ == "__main__":
    import argparse
    cli = argparse.ArgumentParser(description="Inspect scoped Unreal game contracts")
    cli.add_argument("project_path")
    cli.add_argument("--material-folders", nargs="+", required=True)
    cli.add_argument("--pda-folders", nargs="+", required=True)
    cli.add_argument("--material-pattern", default="M_*.uasset")
    cli.add_argument("--pda-pattern", default="PDA_*.uasset")
    print(json.dumps(main(**vars(cli.parse_args())), indent=2))

