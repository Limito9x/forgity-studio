import gzip
import json
import os
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Optional, Union


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


def _extract_path_strings(raw_val: Any) -> List[str]:
    """Helper to recursively extract clean path strings from strings, lists, or dicts."""
    results: List[str] = []
    if raw_val is None:
        return results

    if isinstance(raw_val, list):
        for item in raw_val:
            results.extend(_extract_path_strings(item))
    elif isinstance(raw_val, dict):
        # Look for common path keys in resource/file objects
        for k in ["RelativePath", "relativePath", "relative_path", "Path", "path", "file_path", "FilePath", "uri", "url"]:
            if k in raw_val and raw_val[k]:
                results.extend(_extract_path_strings(raw_val[k]))
                return results
    elif isinstance(raw_val, str):
        cleaned = raw_val.strip()
        if not cleaned:
            return results
        # If it's a JSON array or object, parse and recurse
        if (cleaned.startswith("[") and cleaned.endswith("]")) or (cleaned.startswith("{") and cleaned.endswith("}")):
            try:
                parsed = json.loads(cleaned)
                results.extend(_extract_path_strings(parsed))
                return results
            except Exception:
                pass
        results.append(cleaned)
    else:
        results.append(str(raw_val).strip())

    return results


def main(
    root_path: Optional[str] = None,
    relative_paths: Optional[Union[List[Any], str]] = None,
    input_path: Optional[str] = None,
    paths: Optional[Union[List[Any], str]] = None,
    **kwargs: Any
) -> dict:
    """
    Clean DAZ .duf Inspector.
    Computes full paths from root_path and relative_paths, inspects .duf files,
    and returns a metadata_map dictionary keyed by relative paths.

    Args:
        root_path: Base directory of the repository/workspace.
        relative_paths: List of relative file paths (or resource objects/JSON string).
        input_path: Single relative or absolute file path (for backwards compatibility).
        paths: List of file paths (for backwards compatibility).
        **kwargs: Additional parameters (e.g. root, RootPath, etc.)

    Returns:
        dict containing:
          - metadata_map: Dict[str, str] mapping relative path to metadata JSON string
          - metadata: metadata_map (aliased for flexible pin binding)
          - first_metadata: metadata JSON string of the first inspected file
          - count: number of processed files
    """
    # 1. Resolve root_path
    resolved_root = ""
    for r_candidate in [root_path, kwargs.get("root"), kwargs.get("RootPath"), kwargs.get("root_path"), kwargs.get("workspace_path")]:
        if r_candidate and str(r_candidate).strip():
            resolved_root = str(r_candidate).strip()
            break

    # 2. Extract all target path candidates
    raw_candidates: List[Any] = []
    if relative_paths is not None:
        raw_candidates.append(relative_paths)
    if paths is not None:
        raw_candidates.append(paths)
    if input_path is not None:
        raw_candidates.append(input_path)

    for kw in ["RelativePaths", "relative_path", "RelativePath", "file_paths", "items", "resources"]:
        if kw in kwargs and kwargs[kw] is not None:
            raw_candidates.append(kwargs[kw])

    extracted_paths = _extract_path_strings(raw_candidates)

    if not extracted_paths:
        print("[daz_inspector] Notice: No relative paths provided or list is empty. Returning empty metadata.", flush=True)
        return {
            "metadata_map": {},
            "metadata": {},
            "first_metadata": "",
            "count": 0,
        }

    metadata_map: Dict[str, str] = {}
    first_metadata_json = ""

    for rel_item in extracted_paths:
        if not rel_item:
            continue

        # Standardize relative key (POSIX style, no leading slash)
        rel_key = rel_item.replace("\\", "/").lstrip("/")

        # Compute target full path on disk
        target_file: Optional[Path] = None

        if os.path.isabs(rel_item):
            target_file = Path(rel_item)
            if resolved_root:
                try:
                    rel_key = str(Path(rel_item).relative_to(resolved_root)).replace("\\", "/").lstrip("/")
                except Exception:
                    pass
        else:
            if resolved_root:
                target_file = Path(resolved_root) / rel_item
            else:
                target_file = Path(rel_item)

        # Fallback check
        if not target_file.exists():
            if Path(rel_item).exists():
                target_file = Path(rel_item)
            else:
                print(f"[daz_inspector] Warning: File not found: '{target_file}' (raw: '{rel_item}')", flush=True)
                continue

        try:
            res = inspect_single_duf(target_file)
            meta_json = json.dumps(res, indent=2, ensure_ascii=False)

            # Store keyed by relative path (both normalized and original if different)
            metadata_map[rel_key] = meta_json
            if rel_item != rel_key:
                metadata_map[rel_item] = meta_json

            if not first_metadata_json:
                first_metadata_json = meta_json
        except Exception as ex:
            print(f"[daz_inspector] Error inspecting '{target_file}': {ex}", flush=True)

    return {
        "metadata_map": metadata_map,
        "metadata": metadata_map,
        "first_metadata": first_metadata_json,
        "count": len(metadata_map),
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        res = main(input_path=sys.argv[1])
        print(res.get("metadata", ""))
    else:
        print("Usage: python daz_inspector.py <path_to_daz_file.duf>")
