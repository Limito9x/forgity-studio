#!/usr/bin/env python3
"""
Forgity Studio - Smart Starter Template Packager
Packs authoritative core template assets from an Unreal Engine project into 'forgity_starter_template.zip'.

Preserves relative hierarchy:
  - Content/Characters/Genesis9/Base/**  -> Content/Characters/Genesis9/Base/**
  - Content/Systems/**                  -> Content/Systems/**
  - Content/ThirdPerson/Blueprints/**   -> Content/ThirdPerson/Blueprints/**
  - Config/DefaultGameplayTags.ini      -> config_patch/DefaultGameplayTags.ini
"""

import os
import sys
import zipfile
import fnmatch
from typing import List, Tuple

DEFAULT_PROJECT_PATH = r"D:\Games\UnrealEngine\Projects\TemplateProject"
DEFAULT_OUTPUT_ZIP = r"D:\FullStack\Automation\forgity_starter_template.zip"

# Include patterns relative to project root
INCLUDE_PATTERNS = [
    ("Content/Characters/Genesis9/Base/**", "Content/Characters/Genesis9/Base"),
    ("Content/Systems/**", "Content/Systems"),
    ("Content/ThirdPerson/Blueprints/**", "Content/ThirdPerson/Blueprints"),
    ("Config/DefaultGameplayTags.ini", "config_patch/DefaultGameplayTags.ini"),
]

# File extensions to ignore
EXCLUDE_EXTENSIONS = {".tmp", ".lock", ".log", ".bak", ".orig"}


def matches_any_pattern(rel_path: str, patterns: List[Tuple[str, str]]) -> bool:
    norm_path = rel_path.replace("\\", "/")
    for pat, _ in patterns:
        if fnmatch.fnmatch(norm_path, pat):
            return True
    return False


def get_archive_target_path(rel_path: str) -> str:
    norm_path = rel_path.replace("\\", "/")
    if norm_path == "Config/DefaultGameplayTags.ini" or norm_path.lower() == "config/defaultgameplaytags.ini":
        return "config_patch/DefaultGameplayTags.ini"
    return norm_path


def pack_template(
    project_root: str = DEFAULT_PROJECT_PATH,
    output_zip: str = DEFAULT_OUTPUT_ZIP
) -> str:
    project_root = os.path.abspath(project_root)
    if not os.path.isdir(project_root):
        raise FileNotFoundError(f"Unreal Project root not found: '{project_root}'")

    print(f"[Packer] Scanning Unreal project: {project_root}", flush=True)

    files_to_pack: List[Tuple[str, str]] = []

    # 1. Discover matching files
    for root, _, files in os.walk(project_root):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext in EXCLUDE_EXTENSIONS:
                continue

            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, project_root).replace("\\", "/")

            if matches_any_pattern(rel_path, INCLUDE_PATTERNS):
                arc_name = get_archive_target_path(rel_path)
                files_to_pack.append((full_path, arc_name))

    if not files_to_pack:
        raise ValueError("No matching template files found to pack. Verify project directory.")

    print(f"[Packer] Found {len(files_to_pack)} authoritative template files.", flush=True)

    # 2. Write Zip Archive with highest compression
    out_dir = os.path.dirname(os.path.abspath(output_zip))
    os.makedirs(out_dir, exist_ok=True)

    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full_path, arc_name in files_to_pack:
            zf.write(full_path, arcname=arc_name)

    size_mb = os.path.getsize(output_zip) / (1024 * 1024)
    print(f"[Packer] Successfully created: '{output_zip}' ({size_mb:.2f} MB)", flush=True)
    return output_zip


if __name__ == "__main__":
    proj = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PROJECT_PATH
    out = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUTPUT_ZIP
    try:
        pack_template(proj, out)
    except Exception as ex:
        print(f"Error packing template: {ex}", file=sys.stderr)
        sys.exit(1)

