# Rà soát Inspect -> Classify -> Import (06/11/2026)

Phạm vi được user yêu cầu: classifier nhận contracts từ inspect và metadata map FBX; sửa toàn diện việc suy đoán schema và các lỗi nối tiếp.

| Hạng mục | Trước | Sau |
|---|---|---|
| Blueprint fields | Đọc thuộc tính không expose, mọi field thành Unknown | Đọc native FEdGraphPinType.export_text, giữ type/container |
| Schema selection | Có Texture2D là Wardrobe, không có là Character | AI chọn target_schema từ toàn bộ schemas inspect, validator kiểm tra membership/fields |
| Pins | character_schema, wardrobe_schema bắt user nhập | Bỏ hai pin; dữ liệu nghiệp vụ chỉ export_manifest + contracts |
| Properties | Object/container lẫn vào trường AI được điền | Chỉ scalar hỗ trợ; mesh/thumbnail do importer bind |
| Verification | Fixture kiểu cũ che lỗi inspect thực | Unit tests native serialization, classifier/importer boundary, commandlet đọc hai Blueprint thật |

Files: pipeline-scripts/unreal/inspect_game_contracts.py; pipeline-scripts/ai/classify_character_manifest.py; pipeline-scripts/unreal/import_character_wardrobe.py; tests tương ứng; playbook character.

Ranh giới: không sửa game assets, không tự thêm field/schema shader giả; lỗi contract gốc phải báo ở inspect/preflight. Không gọi AI trả phí trong kiểm thử; quyết định semantic AI được mô phỏng. Chạy harness cho mọi business script sửa.
