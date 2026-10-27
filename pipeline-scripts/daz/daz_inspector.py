import gzip
import json
import os
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Optional


def load_duf_json(file_path: Path) -> dict:
    try:
        with file_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (UnicodeDecodeError, json.JSONDecodeError):
        pass

    try:
        with gzip.open(file_path, "rt", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise ValueError(f"Could not parse DAZ .duf file '{file_path}': {e}")


def inspect_single_duf(file_path: Path) -> dict:
    """
    Inspect a single DAZ .duf file and extract summary, objects, materials, and bones.
    """
    data = load_duf_json(file_path)

    scene = data.get("scene", {})
    raw_nodes = scene.get("nodes", [])
    raw_materials = scene.get("materials", [])

    # 1. Objects / Figures in Scene
    objects = []
    external_dependencies = set()
    total_bones_count = 0

    for node in raw_nodes:
        name = node.get("name", "unnamed")
        label = node.get("label", name)
        url = urllib.parse.unquote(node.get("url", ""))
        parent = node.get("parent")

        if url and ".dsf" in url:
            base_dsf = url.split("#")[0]
            external_dependencies.add(base_dsf)

        if parent is not None and not any(k in node for k in ["geometries", "conform_target"]):
            total_bones_count += 1
            continue

        obj_type = "Prop / Object"
        if "genesis" in url.lower() or "figure" in url.lower():
            obj_type = "Character Figure"
        elif "geometries" in node:
            obj_type = "Mesh Asset"

        objects.append({
            "name": label,
            "type": obj_type,
            "is_visible": node.get("visible", True),
            "source_ref": Path(url.split("#")[0]).name if url else "Inline",
            "internal_name": name,
        })

    # 2. Materials
    material_names = list({mat.get("name", "unnamed") for mat in raw_materials if mat.get("name")})

    # 3. Clean compact metadata result
    return {
        "summary": f"DAZ '{file_path.name}': {len(objects)} Object(s), {len(material_names)} Material(s), {total_bones_count} Bones.",
        "objects": objects,
        "materials": material_names,
        "dependencies": [Path(d).name for d in external_dependencies],
        "stats": {
            "objects_count": len(objects),
            "materials_count": len(material_names),
            "bones_count": total_bones_count,
            "dependencies_count": len(external_dependencies),
        }
    }


def main(
    full_paths: Optional[List[str]] = None,
    full_path: Optional[str] = None
) -> dict:
    """
    DAZ Studio .duf Inspector.
    Inspects DAZ Studio scene/character .duf files and extracts metadata (objects, materials, bones, dependencies).

    Args:
        full_paths: List of absolute paths to DAZ .duf files to inspect.
        full_path: Single absolute path to a DAZ .duf file (optional single-file input).

    Returns:
        dict containing:
            - metadata_map: Dict[str, dict] mapping each file's FullPath to its inspected metadata
            - summary: Overall summary string of the inspection
            - count: Total number of files inspected
    """
    targets: List[str] = []
    if full_paths:
        for p in full_paths:
            if p and str(p).strip():
                targets.append(str(p).strip())
    if full_path and str(full_path).strip():
        targets.append(str(full_path).strip())

    if not targets:
        print("[daz_inspector] Notice: No file paths provided. Returning empty metadata.", flush=True)
        return {
            "metadata_map": {},
            "summary": "No DAZ files provided for inspection.",
            "count": 0,
        }

    metadata_map: Dict[str, dict] = {}
    summaries: List[str] = []

    for file_str in targets:
        resolved_path = Path(file_str).resolve()
        clean_key = str(resolved_path).replace("\\", "/")

        if not resolved_path.exists():
            print(f"[daz_inspector] Warning: File not found: '{resolved_path}'", flush=True)
            continue

        try:
            meta = inspect_single_duf(resolved_path)
            metadata_map[clean_key] = meta
            summaries.append(f"{resolved_path.name}: {len(meta.get('objects', []))} obj(s), {len(meta.get('materials', []))} mat(s)")
            print(f"[daz_inspector] Inspected '{resolved_path.name}' -> {len(meta.get('objects', []))} objects, {len(meta.get('materials', []))} materials.", flush=True)
        except Exception as ex:
            print(f"[daz_inspector] Error inspecting '{resolved_path}': {ex}", flush=True)

    summary_text = f"Inspected {len(metadata_map)} DAZ file(s). " + "; ".join(summaries[:3])
    if len(summaries) > 3:
        summary_text += f" ...and {len(summaries) - 3} more."

    return {
        "metadata_map": metadata_map,
        "summary": summary_text,
        "count": len(metadata_map),
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        res = main(full_paths=sys.argv[1:])
        print(json.dumps(res, indent=2, ensure_ascii=False))
    else:
        print("Usage: python daz_inspector.py <path_to_daz_file.duf> [...]")
