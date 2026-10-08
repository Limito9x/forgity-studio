"""
Test script for native_bake.py
Tạo một mesh thử nghiệm có Principled BSDF material với màu sắc, roughness, unwrap UV và chạy native bake.
"""
import os
import sys
import bpy

# Đưa đường dẫn hiện tại vào sys.path để import native_bake
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

import native_bake

def run_test():
    print("[TestNativeBake] Initializing clean test scene...", flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1. Tạo một Cube mẫu
    bpy.ops.mesh.primitive_cube_add(size=2.0)
    cube = bpy.context.active_object
    cube.name = "TestCube"

    # 2. Tạo UV map cho Cube
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Đổi tên UV layer thành UVMap_Baked
    cube.data.uv_layers.active.name = "UVMap_Baked"

    # 3. Tạo một Material PBR có màu sắc và roughness
    mat = bpy.data.materials.new(name="M_TestCube")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.8, 0.2, 0.3, 1.0) # Màu đỏ hồng
    bsdf.inputs['Roughness'].default_value = 0.35
    bsdf.inputs['Metallic'].default_value = 0.1

    cube.data.materials.append(mat)

    # 4. Chạy Native Bake với danh sách map: diffuse, roughness, normal, metallic
    out_dir = os.path.join(current_dir, "test_output")
    print(f"[TestNativeBake] Running native_bake.main() to '{out_dir}'...", flush=True)

    result = native_bake.main(
        target_objects=["TestCube"],
        output_dir=out_dir,
        maps=["diffuse", "roughness", "normal", "metallic"],
        uv_name="UVMap_Baked",
        resolution=512, # Test 512x512 cho cực nhanh
        bake_orm=False,
        file_prefix="TestCube"
    )

    print("[TestNativeBake] Result:", result, flush=True)
    
    # Kiểm tra xem các file đã được tạo ra chưa
    for map_type, path in result.get("baked_maps", {}).items():
        if os.path.exists(path):
            size = os.path.getsize(path)
            print(f"[TestNativeBake] ✅ Verified map '{map_type}': {path} ({size} bytes)", flush=True)
        else:
            print(f"[TestNativeBake] ❌ Missing map '{map_type}': {path}", flush=True)

if __name__ == "__main__":
    run_test()
