# pyrefly: ignore [missing-import]
"""
Asset Material Manifest Combiner & Resolver (Direct PathMap First)
Runs on Agent Worker (compatible with Python 3.10+)

Consumes:
  1. raw_manifest / objects_map (from BuildTagMapFromResourceTool):
     Dictionary of tagged objects containing 'path_map'.
     Keys use PURE INDEX addressing (no property-name predicates); the raw
     object (mesh) name may contain spaces / dots / slashes:
     {
       "object_name": {
         "resource_id": "...",
         "asset_name": "...",
         "file_path": "...",
         "resource_tags": [...],
         "path_map": {
           "objects.MB Yeimi HD for Genesis 9 Feminine Mesh.slots[4].name": {
             "value": "M_MB Yeimi HD for Genesis 9 Feminine Mesh",
             "tags": [{ "name": "Skin", "path": "Materials.Skin" }]
           },
           "objects.MB Yeimi HD for Genesis 9 Feminine Mesh.slots[4].textures[0]": {
             "value": "textures/MB Yeimi HD for Genesis 9 Feminine Mesh_BaseColor.png",
             "tags": [{ "name": "Skin_BaseColor", "path": "Materials.Skin.Textures.Skin_BaseColor" }]
           }
         }
       }
     }
  2. folder_path (optional): Base folder for resolving relative paths to absolute file paths

Outputs:
  Map <object_name, metadata> where each object contains:
    - asset_name: str
    - cloth_type: str (e.g. 'Top', 'Bottom', 'Bra')
    - file_path: str (absolute path to FBX geometry)
    - slot_count: int
    - slots: List[
        {
          "index": 0,
          "name": "Trim-1",
          "material_tag": "Cloth",
          "tag": "Cloth",
          "slot_anchor": "slots[0]",
          "textures": {
            "Cloth_Normal": "C:/.../Normal.jpg",
            "Cloth_BaseColor": "C:/.../BaseColor.jpg"
          }
        }
      ]
"""

import os
import re
import json
from typing import Dict, Any, List, Optional, Union

def _to_bracket_index(p: str) -> str:
    return __import__('re').sub(r"\.(\d+)(?![\'\"])", r"[\1]", p)






def _extract_slot_anchor(path: str) -> Optional[str]:
    """
    Extract the pure-index slot-level anchor from a JSON path.

    Keys address slots ONLY by numeric index; the object prefix (raw FBX mesh
    name) may contain spaces / dots / slashes:
        'objects.MB Yeimi HD for Genesis 9 Feminine Mesh.slots[4].name'
            -> 'objects.MB Yeimi HD for Genesis 9 Feminine Mesh.slots[4]'
        'objects.Laura/Laura.fbx.slots[2].textures[1].file_path'
            -> 'objects.Laura/Laura.fbx.slots[2]'
        'slots[0].name'                              -> 'slots[0]'
    """
    if not path:
        return None
    p = str(path).strip().lstrip("$").lstrip(".")

    match = re.search(r"(?:^|\.)slots\[(\d+)\]", p)
    if match:
        prefix = p[:match.start()].rstrip(".")
        end = p.index("]", match.end() - 1)
        idx_block = p[match.start():end + 1].lstrip(".")
        return f"{prefix}.{idx_block}" if prefix else idx_block

    return None


def _extract_slot_identity(anchor: str, fallback_idx: int) -> tuple[str, int]:
    """
    Extracts (slot_name, slot_index) from a pure-index slot anchor.
    The real slot name is resolved later from the 'slots[i].name' entry.
    """
    idx_match = re.search(r"slots\[(\d+)\]", anchor)
    if idx_match:
        idx = int(idx_match.group(1))
        return f"Slot_{idx}", idx
    return f"Slot_{fallback_idx}", fallback_idx


def _resolve_single_object(
    obj_name: str,
    obj_data: Dict[str, Any],
    fallback_folder: str = ""
) -> Dict[str, Any]:
    """Resolve a single object's slots, material tags, and texture parameter paths."""
    asset_name = obj_data.get("asset_name") or obj_name
    resource_tags = obj_data.get("resource_tags") or []
    
    # Extract cloth_type purely from explicit tags (e.g. ClothType.Bottom) without guessing
    cloth_type = obj_data.get("cloth_type")
    if not cloth_type:
        for t in resource_tags:
            t_str = str(t).strip()
            if "ClothType." in t_str:
                cloth_type = t_str.split("ClothType.")[-1].strip()
                break

    file_path = obj_data.get("file_path") or obj_data.get("relative_path") or ""

    # Base folder for textures: use explicitly passed folder or folder containing geometry file
    effective_folder = fallback_folder
    if not effective_folder and file_path and os.path.isabs(file_path):
        effective_folder = os.path.dirname(file_path)

    path_map = obj_data.get("path_map") or {}
    slots_by_anchor: Dict[str, Dict[str, Any]] = {}

    # 1. Primary: Direct Resolution from Structured path_map
    if isinstance(path_map, dict) and path_map:
        for p_key, p_entry in path_map.items():
            if not isinstance(p_entry, dict):
                continue
            anchor = _extract_slot_anchor(p_key)
            if not anchor:
                continue

            if anchor not in slots_by_anchor:
                s_name, s_idx = _extract_slot_identity(anchor, len(slots_by_anchor))
                slots_by_anchor[anchor] = {
                    "index": s_idx,
                    "name": s_name,
                    "material_tag": "Generic",
                    "tag": "Generic",
                    "slot_anchor": anchor,
                    "textures": {}
                }

            val = p_entry.get("value")
            raw_tags = p_entry.get("tags") or []
            tag_name = p_entry.get("tag_name") or ""
            tag_path = p_entry.get("tag_path") or ""

            # Extract best matching tag from tags list if present
            if raw_tags and isinstance(raw_tags, list):
                # Prioritize tag belonging to Material hierarchy
                mat_tags = [t for t in raw_tags if isinstance(t, dict) and "material" in str(t.get("path", "")).lower()]
                selected = mat_tags[0] if mat_tags else (raw_tags[0] if isinstance(raw_tags[0], dict) else None)
                if selected:
                    tag_name = selected.get("name") or tag_name
                    tag_path = selected.get("path") or tag_path
                elif isinstance(raw_tags[0], str):
                    tag_name = raw_tags[0]
                    tag_path = raw_tags[0]

            # Detect whether this entry is for the Slot Anchor or for a Leaf Parameter
            clean_anchor = anchor.replace("material_slots", "slots")
            clean_pkey = p_key.replace("material_slots", "slots")

            # Check if this entry represents slot metadata (anchor itself, .name, .material, etc.)
            tail = clean_pkey.split("]")[-1].strip(".").lower() if "]" in clean_pkey else ""
            is_explicit_slot_prop = tail in ("name", "slot_name", "material", "material_name", "tag", "material_tag", "slot", "")
            
            # Check if value looks like an image file
            val_str = str(val or "").strip().lower()
            is_image_val = any(val_str.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".tga", ".exr", ".tif", ".tiff", ".bmp", ".dds", ".hdr"])

            is_slot_anchor = (
                clean_pkey == clean_anchor
                or clean_pkey.endswith(clean_anchor)
                or ((".textures" not in clean_pkey) and (is_explicit_slot_prop or not is_image_val))
            )

            if is_slot_anchor:
                # -------------------------------------------------------------
                # Tầng 1: Slot Anchor Definition (Auto Default)
                # -------------------------------------------------------------
                mat_t = tag_name or (tag_path.split(".")[-1] if tag_path else "")
                if mat_t:
                    slots_by_anchor[anchor]["material_tag"] = mat_t
                    slots_by_anchor[anchor]["tag"] = mat_t

                if isinstance(val, dict):
                    # Structured slot object: { "name": "Trim-1", "textures": { "BASE_COLOR": "...", ... } }
                    if val.get("name"):
                        slots_by_anchor[anchor]["name"] = str(val["name"])
                    elif val.get("slot_name"):
                        slots_by_anchor[anchor]["name"] = str(val["slot_name"])

                    # Harvest textures dictionary from slot value
                    dict_textures = val.get("textures")
                    if isinstance(dict_textures, dict):
                        for tex_type, tex_file in dict_textures.items():
                            f_path = str(tex_file) if tex_file else ""
                            if effective_folder and f_path and not os.path.isabs(f_path):
                                f_path = os.path.normpath(os.path.join(effective_folder, f_path)).replace("\\", "/")
                            if f_path and str(tex_type) not in slots_by_anchor[anchor]["textures"]:
                                slots_by_anchor[anchor]["textures"][str(tex_type)] = f_path
                    elif isinstance(dict_textures, list):
                        for t_item in dict_textures:
                            if isinstance(t_item, dict):
                                t_type = t_item.get("type") or t_item.get("name") or "BASE_COLOR"
                                f_path = t_item.get("file_path") or t_item.get("path") or ""
                                if effective_folder and f_path and not os.path.isabs(f_path):
                                    f_path = os.path.normpath(os.path.join(effective_folder, f_path)).replace("\\", "/")
                                if f_path and str(t_type) not in slots_by_anchor[anchor]["textures"]:
                                    slots_by_anchor[anchor]["textures"][str(t_type)] = f_path
                elif val:
                    # String or primitive value representing slot name or material
                    # Only update slot name if this was explicitly .name / slot_name, or if slot name is still default
                    tail_prop = clean_pkey.split("]")[-1].strip(".").lower()
                    if tail_prop in ("name", "slot_name") or slots_by_anchor[anchor]["name"].startswith("Slot_"):
                        slots_by_anchor[anchor]["name"] = str(val).strip()

            else:
                # -------------------------------------------------------------
                # Tầng 2: Explicit Leaf Parameter Definition (Override / Custom)
                # -------------------------------------------------------------
                f_path = ""
                if isinstance(val, str):
                    f_path = val
                elif isinstance(val, dict):
                    f_path = str(val.get("file_path") or val.get("path") or val.get("value") or "")
                elif val is not None:
                    f_path = str(val)

                # Ensure it's genuinely a texture / image file or explicit texture field
                is_texture_target = (
                    ".textures" in clean_pkey
                    or any(str(f_path).lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".tga", ".exr", ".tif", ".tiff", ".bmp", ".dds", ".hdr"])
                )

                # Derive material tag from the tag path hierarchy when the slot
                # tag is still generic: 'Materials.Skin.Textures.Skin_BaseColor' -> 'Skin'
                if slots_by_anchor[anchor]["material_tag"] == "Generic" and tag_path:
                    mat_match = re.match(r"^(?:Material|Materials)\.([^.]+)", tag_path, re.IGNORECASE)
                    if mat_match:
                        mat = mat_match.group(1).strip()
                        if mat:
                            slots_by_anchor[anchor]["material_tag"] = mat
                            slots_by_anchor[anchor]["tag"] = mat

                if not is_texture_target:
                    # Non-texture parameter tagged with a material tag: assign as slot tag if slot still generic
                    mat_t = tag_name or (tag_path.split(".")[-1] if tag_path else "")
                    if mat_t and slots_by_anchor[anchor]["material_tag"] == "Generic":
                        slots_by_anchor[anchor]["material_tag"] = mat_t
                        slots_by_anchor[anchor]["tag"] = mat_t
                    continue

                if effective_folder and f_path and not os.path.isabs(f_path):
                    f_path = os.path.normpath(os.path.join(effective_folder, f_path)).replace("\\", "/")

                # Parameter name: prioritize tag_name (e.g. Cloth_DetailNormal),
                # then last tag path segment (e.g. Eye_BaseColor),
                # then property name in path (e.g. BASE_COLOR from .textures.BASE_COLOR).
                param_name = (tag_name or (tag_path.split(".")[-1] if tag_path else "")).strip()
                if not param_name:
                    tail_prop = clean_pkey.split("]")[-1].strip(".").lower()
                    if tail_prop in ("file_path", "path", "value", "") and f_path:
                        # Pure-index key (e.g. 'slots[4].textures[0]') without any tag:
                        # derive the parameter name from the image file name itself.
                        param_name = os.path.splitext(os.path.basename(str(f_path)))[0]
                    else:
                        parts = clean_pkey.split(".")
                        if parts:
                            param_name = parts[-1]

                if f_path and param_name:
                    slots_by_anchor[anchor]["textures"][param_name] = f_path

    # 2. Fallback: If no path_map, check if raw slots were provided directly
    if not slots_by_anchor and "slots" in obj_data and isinstance(obj_data["slots"], list):
        for idx, s in enumerate(obj_data["slots"]):
            s_name = s.get("name") or f"Slot_{idx}"
            m_tag = s.get("material_tag") or s.get("tag") or "Generic"
            tex_dict = {}
            for t_k, t_v in (s.get("textures") or {}).items():
                t_path = str(t_v)
                if effective_folder and t_path and not os.path.isabs(t_path):
                    t_path = os.path.normpath(os.path.join(effective_folder, t_path)).replace("\\", "/")
                tex_dict[str(t_k)] = t_path
            slots_by_anchor[f"slots[{idx}]"] = {
                "index": idx,
                "name": s_name,
                "material_tag": m_tag,
                "tag": m_tag,
                "slot_anchor": f"slots[{idx}]",
                "textures": tex_dict
            }

    resolved_slots = sorted(slots_by_anchor.values(), key=lambda s: s["index"])

    return {
        "asset_name": asset_name,
        "cloth_type": cloth_type,
        "file_path": file_path,
        "resource_id": obj_data.get("resource_id", ""),
        "version_id": obj_data.get("version_id", ""),
        "resource_tags": resource_tags,
        "slot_count": len(resolved_slots),
        "slots": resolved_slots
    }


def main(
    raw_manifest: Union[Dict[str, Any], str],
    folder_path: str = "",
    output_path: str = "",
    **kwargs
) -> Dict[str, Any]:
    """
    Main entry point: Resolves input into a clean Map <object_name, metadata>.
    """
    # 1. Parse raw manifest
    if isinstance(raw_manifest, str):
        candidate_file = raw_manifest
        if folder_path and not os.path.isabs(candidate_file):
            joined = os.path.normpath(os.path.join(folder_path, candidate_file))
            if os.path.isfile(joined):
                candidate_file = joined

        if os.path.isfile(candidate_file):
            with open(candidate_file, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)
        else:
            manifest_data = json.loads(raw_manifest)
    elif isinstance(raw_manifest, dict):
        manifest_data = json.loads(json.dumps(raw_manifest))  # Deep copy
    else:
        raise TypeError(f"Unsupported manifest input type: {type(raw_manifest)}")

    # 2. Detect whether input is a Batch ObjectsMap or a Single Object
    sample_val = next(iter(manifest_data.values()), None) if isinstance(manifest_data, dict) else None
    # Detect if manifest IS a pure path_map (index) like {"objects.X.slots[4].name": {"value":..,"tags":..}}
    is_pure_path_map = (
        isinstance(manifest_data, dict)
        and manifest_data
        and all(isinstance(v, dict) and ("value" in v or "tags" in v) for v in manifest_data.values())
        and any("slots[" in str(k) for k in manifest_data.keys())
    )
    if is_pure_path_map:
        # Wrap pure path_map into a single object for uniform handling
        manifest_data = {
            "_single": {
                "asset_name": kwargs.get("character_name") or kwargs.get("asset_name") or "Asset",
                "file_path": kwargs.get("file_path") or "",
                "resource_tags": kwargs.get("resource_tags") or [],
                "path_map": manifest_data
            }
        }
        sample_val = next(iter(manifest_data.values()), None)

    is_batch_objects_map = (
        isinstance(manifest_data, dict)
        and not ("slots" in manifest_data or "objects" in manifest_data)
        and isinstance(sample_val, dict)
        and ("path_map" in sample_val or "resource_id" in sample_val or "resource_tags" in sample_val)
    )

    resolved_objects_map: Dict[str, Any] = {}

    if is_batch_objects_map:
        for obj_name, obj_data in manifest_data.items():
            if not isinstance(obj_data, dict):
                continue
            resolved_obj = _resolve_single_object(
                obj_name=obj_name,
                obj_data=obj_data,
                fallback_folder=folder_path
            )
            resolved_objects_map[resolved_obj["asset_name"]] = resolved_obj
    else:
        asset_name = kwargs.get("character_name") or manifest_data.get("asset_name") or "Asset"
        objects_dict = manifest_data.get("objects")
        if not objects_dict and "slots" in manifest_data:
            objects_dict = {
                asset_name: {
                    "asset_name": asset_name,
                    "slot_count": len(manifest_data["slots"]),
                    "slots": manifest_data.pop("slots")
                }
            }
        elif not objects_dict:
            objects_dict = {asset_name: manifest_data}

        for obj_name, obj_data in objects_dict.items():
            if not isinstance(obj_data, dict):
                continue
            resolved_obj = _resolve_single_object(
                obj_name=obj_name,
                obj_data=obj_data,
                fallback_folder=folder_path
            )
            resolved_objects_map[resolved_obj["asset_name"]] = resolved_obj

    print(f"[resolve_material_manifest] Successfully resolved {len(resolved_objects_map)} object(s) in Map<object, metadata>.", flush=True)

    # 3. Save to output path if specified
    if output_path:
        final_output_path = output_path
        if folder_path and not os.path.isabs(final_output_path):
            final_output_path = os.path.normpath(os.path.join(folder_path, final_output_path))
        os.makedirs(os.path.dirname(os.path.abspath(final_output_path)), exist_ok=True)
        with open(final_output_path, "w", encoding="utf-8") as f:
            json.dump(resolved_objects_map, f, indent=2, ensure_ascii=False)
        print(f"[resolve_material_manifest] Saved resolved manifest to: {final_output_path}", flush=True)

    # Return pure Map <object, metadata>
    return {
        "objects": resolved_objects_map,
        "objects_map": resolved_objects_map,
        "object_count": len(resolved_objects_map),
        "manifest": resolved_objects_map
    }


resolve_manifest = main

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        main(sys.argv[1])
