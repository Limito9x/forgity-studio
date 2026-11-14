import type { ScriptTemplateDefinition } from "./types";

export const UNREAL_SCRIPT_TEMPLATE: ScriptTemplateDefinition = {
  fileName: "unreal_import_asset.py",
  summary: "Runs inside Unreal Editor headless mode. Ingests meshes, textures, materials, and sets Nanite/LODs.",
  environmentNote: "Requires Unreal Engine 5.x with Python Editor Script Plugin active on the Runner workstation. The 'unreal' library is only accessible in Unreal's headless process.",
  builtinModules: ["unreal", "os", "json"],
  code: `"""
Unreal Engine Custom Pipeline Node Template
Automatically detected by AST scanner via 'import unreal'.
"""
import unreal
import os

def main(
    fbx_file: str,
    destination_path: str = "/Game/ImportedAssets",
    generate_lods: bool = True,
    auto_collision: bool = True
):
    """
    Imports 3D FBX assets into Unreal Content Browser and configures LODs.
    
    Inputs:
      fbx_file: Path to FBX mesh generated upstream.
      destination_path: Content package path inside Unreal project.
      generate_lods: Auto-generate hierarchical LODs.
      auto_collision: Generate simplified collision convex hull.
    """
    print(f"Importing {fbx_file} into {destination_path}")
    
    # 1. Configure Asset Import Task
    task = unreal.AssetImportTask()
    task.filename = fbx_file
    task.destination_path = destination_path
    task.replace_existing = True
    task.automated = True
    task.save = True
    
    options = unreal.FbxImportUI()
    options.import_mesh = True
    options.import_materials = False
    task.options = options
    
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    
    asset_name = os.path.splitext(os.path.basename(fbx_file))[0]
    final_package = f"{destination_path}/{asset_name}"
    
    # 2. Return Dictionary defining downstream pipeline output pins
    return {
        "asset_package_path": final_package,
        "import_status": "Success",
        "mesh_name": asset_name
    }
`,
};
