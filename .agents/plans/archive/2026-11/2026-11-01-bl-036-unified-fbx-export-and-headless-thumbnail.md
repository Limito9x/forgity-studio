# BL-036: Unified FBX Export, Headless 3D Thumbnail Renderer & Wardrobe DataAsset Ingestion

> **Mã công việc**: `BL-036`  
> **Trạng thái**: `Resolved` *(01/11/2026)*  
> **Ngày lập**: 01/11/2026  
> **Phạm vi**: DCC Scripts (Blender/Python), AI Classifier & Unreal Engine  

---

## 1. Tóm Tắt Mục Tiêu (Executive Summary)
Hợp nhất hai script xuất FBX (`export_fbx.py` và `batch_export_fbx.py`) thành một script duy nhất hỗ trợ cả hai chế độ Single và Batch. Bổ sung Headless 3D Thumbnail Renderer tự động sinh ảnh PNG góc nhìn 3/4 Isometric nền trong suốt cho menu Wardrobe UE5, và mở rộng Backend Tool `UpdateResourceMetadata` với chân pin `ThumbnailMap`.

---

## 2. Vấn Đề & Hiện Trạng (Problem Statement)
1. Tách rời `export_fbx` và `batch_export_fbx` gây trùng lặp 70% mã nguồn, khiến người dùng khó chuyển đổi giữa xuất đơn lẻ và xuất hàng loạt trên Canvas.
2. Menu Wardrobe trong UE5 yêu cầu thumbnail trực quan để người chơi chọn trang phục, nhưng trước đây phải chụp thủ công hoặc không có ảnh.
3. Tool `UpdateResourceMetadata` chưa hỗ trợ nhận `ThumbnailMap` để gắn thumbnail vào tài nguyên đã lưu.

---

## 3. Quyết Sách Kỹ Thuật (Technical Decisions)
1. **Hợp nhất `export_fbx.py`**:
   - Thêm tham số `export_mode: Literal["Single", "Batch"]`.
   - Giữ lại `batch_export_fbx.py` làm wrapper mỏng để đảm bảo backward compatibility.
2. **Headless 3D Thumbnail Renderer**:
   - Sử dụng Blender Workbench Studio MatCap + Cavity.
   - Tự động đóng khung Camera Bounding Sphere góc 3/4 Isometric.
   - Render ảnh PNG $512 \times 512$ với nền trong suốt.
3. **Convention-Driven AI Slot Mapping**:
   - Chuẩn hóa quy ước Naming Tag & Slots (`System.Wardrobe.Slots.*`).
4. **Unreal Ingestion & Backend Tool**:
   - Import PNG thành Texture UI 2D và bind vào `PDA_WardrobeItem`.
   - Bổ sung pin `ThumbnailMap` trong `UpdateResourceMetadataTool`.
