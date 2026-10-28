# pyrefly: ignore [missing-import]
import bpy


def main(
    target_objects: list,
    uv_name: str = "UVMap_Baked",
    margin: float = 0.002,
    smart_project: bool = True
) -> dict:
    """
    Create a new UV Map layer and unwrap/pack UVs for specified target mesh objects.

    Args:
        target_objects: List of object base names to process (e.g. ["Genesis9", "Eyelashes", "Hair"]).
        uv_name: Name of the newly created UV layer (default: 'UVMap_Baked').
        margin: Island margin for UV packing / smart project.
        smart_project: Whether to run Smart UV Project on the new UV layer.

    Returns:
        Dictionary with uv_name, processed objects list, and count.
    """
    try:
        margin = float(margin) if margin is not None else 0.002
    except (ValueError, TypeError):
        margin = 0.002

    if isinstance(smart_project, str):
        smart_project = smart_project.lower() in ("true", "1", "yes")
    else:
        smart_project = bool(smart_project)

    if target_objects is None:
        print("[generate_uv] target_objects is None. Processing all mesh objects in scene.", flush=True)
        target_objects = [obj.name for obj in bpy.data.objects if obj.type == 'MESH']
    elif len(target_objects) == 0:
        print("[generate_uv] NOTICE: target_objects is empty list []. Nothing to unwrap, skipping.", flush=True)
        return {
            "uv_name": uv_name,
            "target_objects": [],
            "processed_objects": [],
            "count": 0
        }

    processed_objects = []

    for base_name in target_objects:
        # Match objects by name substring (case-insensitive) or exact name
        matching_objs = [
            obj for obj in bpy.data.objects
            if obj.type == 'MESH' and (base_name.lower() in obj.name.lower())
        ]

        for obj in matching_objs:
            bpy.context.view_layer.objects.active = obj
            mesh = obj.data
            uv_layers = mesh.uv_layers

            # 1. Identify original UV layer
            original_uv_name = None
            if uv_layers.active:
                original_uv_name = str(uv_layers.active.name)
            elif len(uv_layers) > 0:
                original_uv_name = str(uv_layers[0].name)
                uv_layers.active = uv_layers[0]

            # 2. If object has no UV layer at all, create one via Smart UV Project
            if len(uv_layers) == 0:
                print(f"[generate_uv] {obj.name}: No UV layers found, creating Smart UV Project...", flush=True)
                bpy.ops.object.mode_set(mode='EDIT')
                bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.uv.smart_project(angle_limit=1.15192, margin_method='SCALED', island_margin=margin)
                bpy.ops.object.mode_set(mode='OBJECT')
                if len(uv_layers) == 0:
                    uv_layers.new(name="UVMap")
                original_uv_name = uv_layers.active.name if uv_layers.active else uv_layers[0].name

            # 3. Create or replace the target Bake UV layer
            if uv_name in uv_layers:
                uv_layers.remove(uv_layers[uv_name])

            new_layer = uv_layers.new(name=uv_name)
            uv_layers.active = new_layer

            # 4. Pack UV Islands / Smart Project into target UV layer
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')

            if smart_project and len(uv_layers) <= 1:
                bpy.ops.uv.smart_project(
                    angle_limit=1.15192, # 66 degrees in radians
                    island_margin=margin,
                    area_weight=0.0,
                    correct_aspect=True,
                    scale_to_bounds=False
                )
            else:
                # Pack existing handcrafted DAZ UV islands into 1 single atlas
                bpy.ops.uv.pack_islands(margin=margin)

            bpy.ops.object.mode_set(mode='OBJECT')

            # 5. Set original UV as active_render (for source material reading) and target UV as active (for bake writing)
            if original_uv_name and original_uv_name in uv_layers:
                uv_layers[original_uv_name].active_render = True
            if uv_name in uv_layers:
                uv_layers[uv_name].active = True

            processed_objects.append(obj.name)
            print(f"[generate_uv] UV setup completed for '{obj.name}' (Active: '{uv_layers.active.name}', Active Render: '{original_uv_name}')", flush=True)

    print(f"[generate_uv] Completed UV generation for {len(processed_objects)} objects.", flush=True)

    return {
        "uv_name": uv_name,
        "target_objects": target_objects,
        "processed_objects": processed_objects,
        "count": len(processed_objects)
    }
