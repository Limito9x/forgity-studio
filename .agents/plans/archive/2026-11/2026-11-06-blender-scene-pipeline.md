# Blender scene pipeline và convention instructions

User đã yêu cầu triển khai toàn bộ ba phase ngày 06/11/2026.

| Hạng mục | Trước | Sau |
|---|---|---|
| Discovery | Metadata DAZ trước import | Inspect scene Blender rồi AI classify cùng stage |
| Prepare/bake | Fuzzy names, đoán material bằng keyword | Exact names, chuyển tiếp material role mapping |
| Bake | 3 mode, thay toàn bộ UV | 2 mode, bảo toàn UV vùng không bake |
| Export | Image node rời và source slots cũ | Active output traversal, fresh scene slots |
| Contracts | Tags rộng, slot prefix hardcode | allowed_tag_prefixes |
| Convention | Hardcode trong prompt/validation | Input văn bản format rồi chèn prompt |

## Phase 1 — Scene/classify/prepare
- Thêm `pipeline-scripts/blender/inspect_scene.py`; metadata objects gồm tên chính xác, armature, material slots và polygon counts.
- `pipeline-scripts/ai/classify_mesh_types.py`: validate complete object coverage, body material roles; output `bake_materials` keyed by object, each slot has index/material_name/role.
- `pipeline-scripts/blender/prepare_wardrobe.py`: input mapping; output `prepared_bake_materials` and `object_map`; exact object lookup, fail before mutation on invalid inputs.
- Nghiệm thu: mocked AI/scene validation và Blender prepare mapping.

## Phase 2 — Bake/export
- `pipeline-scripts/blender/bake_mesh.py`: explicit mapping, body_only/all_in_one; source shader traversal and UV0 preservation.
- `pipeline-scripts/blender/export_fbx.py`: traverse active material outputs through groups, fresh polygon-used slots in both modes.
- Nghiệm thu: Blender headless synthetic scene bake/FBX roundtrip; node graph regression tests.

## Phase 3 — Contracts/convention
- `pipeline-scripts/unreal/inspect_game_contracts.py`: allowed tag prefixes with branch boundaries.
- `pipeline-scripts/ai/classify_character_manifest.py`: convention_instructions text, only character_name placeholder, AI character tag output, syntax/contract/consistency validation.
- Nghiệm thu: default/custom conventions, invalid placeholder and tag tests; native Unreal checks where available.

Giữ scale hiện tại; không sửa Runner/backend/frontend hoặc pipeline lưu trên server. Không tạo scratch. Cập nhật playbook, index và hướng dẫn publish/wiring. Chỉ claim các kiểm chứng thực sự đã chạy.
