import type { ScriptTemplateDefinition } from "./types";

export const BLENDER_SCRIPT_TEMPLATE: ScriptTemplateDefinition = {
  fileName: "blender_bake_mesh.py",
  summary: "Runs in headless Blender. Decimates geometry, bakes textures, and outputs processed 3D files.",
  environmentNote: "Runs inside Blender's embedded Python. Modules like 'bpy' and 'mathutils' are pre-installed. Third-party packages must be installed into Blender's python bin on the target Runner.",
  builtinModules: ["bpy", "mathutils", "os", "sys"],
  code: `"""
Blender 3D Custom Pipeline Node Template
Automatically detected by AST scanner via 'import bpy'.
"""
import bpy
import os

def main(
    model_path: str,
    output_dir: str = "",
    target_samples: int = 64,
    export_fbx: bool = True
):
    """
    Decimates geometry and bakes texture maps using Blender Cycles.
    
    Inputs:
      model_path: Source 3D model file (FBX, OBJ, BLEND).
      output_dir: Destination folder for exported assets.
      target_samples: Render sample count for baking passes.
      export_fbx: Whether to output an optimized FBX file.
    """
    print(f"Loading mesh from: {model_path}")
    
    # 1. Reset scene and import source model
    bpy.ops.wm.read_factory_settings(use_empty=True)
    
    # 2. Your custom Blender operations here...
    out_dir = output_dir or os.path.dirname(model_path)
    result_fbx = os.path.join(out_dir, "optimized_mesh.fbx")
    ao_map_path = os.path.join(out_dir, "ambient_occlusion.png")
    
    # 3. Return Dictionary to define Node Output Pins
    return {
        "output_mesh_path": result_fbx,
        "ao_texture_path": ao_map_path,
        "triangle_count": 5240,
        "success": True
    }
`,
};
