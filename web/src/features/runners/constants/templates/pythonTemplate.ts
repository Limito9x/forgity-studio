import type { ScriptTemplateDefinition } from "./types";

export const PYTHON_SCRIPT_TEMPLATE: ScriptTemplateDefinition = {
  fileName: "python_catalog_manifest.py",
  summary: "Runs in standard Python. Ideal for file orchestration, manifest generation, data conversion, and tagging.",
  environmentNote: "Executes using the Runner's Python environment. Standard libraries (os, sys, json, pathlib) are always ready. Additional third-party modules (numpy, pillow) depend on the target Runner's installed packages.",
  builtinModules: ["os", "sys", "json", "pathlib", "hashlib"],
  code: `"""
Standard Python Standalone Pipeline Node Template
Executed by the Runner workstation's default Python runtime.
"""
import os
import json
from pathlib import Path

def main(
    manifest_file: str,
    output_directory: str = "",
    tag_prefix: str = "asset_",
    max_items: int = 100
):
    """
    Parses incoming asset catalogs and outputs indexed JSON manifests for batch stages.
    
    Inputs:
      manifest_file: Input manifest or raw file path.
      output_directory: Destination path for generated manifests.
      tag_prefix: Metadata tagging prefix.
      max_items: Maximum items to include in this batch.
    """
    print(f"Reading manifest from: {manifest_file}")
    
    out_dir = Path(output_directory) if output_directory else Path(manifest_file).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    
    output_index_path = str(out_dir / "catalog_index.json")
    
    # Mock data indexing
    results_map = {f"{tag_prefix}{i}": f"item_{i}.dat" for i in range(min(max_items, 10))}
    
    with open(output_index_path, "w", encoding="utf-8") as f:
        json.dump(results_map, f, indent=2)
    
    # Return Dictionary mapping to pipeline pins
    return {
        "catalog_index_path": output_index_path,
        "items_manifest": results_map,
        "total_processed": len(results_map)
    }
`,
};
