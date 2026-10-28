# pyrefly: ignore [missing-import]
import bpy


def main(target_objects: list, ratio: float = 0.5) -> dict:
    """
    Decimate specified target mesh objects to reduce polygon count while preserving armature weights.

    Args:
        target_objects: List of object base names to decimate (e.g. ["Genesis9", "Hair"]).
        ratio: Decimation ratio between 0.0 and 1.0 (e.g. 0.5 = 50% polygon count).

    Returns:
        Dictionary with decimated objects list and ratio applied.
    """
    if not target_objects:
        print("[decimate_mesh] No target_objects provided. Skipping decimation.", flush=True)
        return {"decimated_count": 0, "ratio": ratio}

    ratio = float(ratio)
    meshes_decimated = 0
    decimated_names = []

    target_meshes = []
    for base_name in target_objects:
        if not base_name:
            continue

        obj = bpy.data.objects.get(base_name)
        if obj and obj.type == 'MESH':
            if obj not in target_meshes:
                target_meshes.append(obj)
            continue

        mesh_with_suffix = bpy.data.objects.get(f"{base_name} Mesh")
        if mesh_with_suffix and mesh_with_suffix.type == 'MESH':
            if mesh_with_suffix not in target_meshes:
                target_meshes.append(mesh_with_suffix)
            continue

        if obj and obj.children:
            child_meshes = [c for c in obj.children if c.type == 'MESH']
            if child_meshes:
                for c in child_meshes:
                    if c not in target_meshes:
                        target_meshes.append(c)
                continue

        matching = [
            o for o in bpy.data.objects
            if o.type == 'MESH' and (base_name.lower() in o.name.lower())
        ]
        for o in matching:
            if o not in target_meshes:
                target_meshes.append(o)

    for obj in target_meshes:
        bpy.context.view_layer.objects.active = obj

        # Remove subdivision surface modifiers first if present
        for m in list(obj.modifiers):
            if m.type == 'SUBSURF':
                obj.modifiers.remove(m)

        # Add Decimate modifier with COLLAPSE mode (preserves Armature weights)
        mod = obj.modifiers.new(name="DecimateAuto", type='DECIMATE')
        mod.ratio = ratio
        mod.decimate_type = 'COLLAPSE'

        # Apply modifier permanently
        bpy.ops.object.modifier_apply(modifier=mod.name)
        meshes_decimated += 1
        decimated_names.append(obj.name)
        print(f"[decimate_mesh] Decimated '{obj.name}' with ratio {ratio}", flush=True)

    log_msg = f"Decimated {meshes_decimated} meshes with ratio {ratio}" if meshes_decimated > 0 else "No valid meshes found to decimate."
    print(f"[decimate_mesh] {log_msg}", flush=True)

    return {
        "decimated_count": meshes_decimated,
        "decimated_objects": decimated_names,
        "ratio": ratio
    }
