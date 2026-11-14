---
description: Quy trình kiểm tra và build toàn bộ Solution .NET an toàn (tự động tắt API để tránh lock DLL)
---

## Quy Trình Build Toàn Solution .NET

Khi muốn kiểm tra tính đúng đắn hoặc hoàn tất tính năng Backend:

1. **Cách 1: Sử dụng script build an toàn từ thư mục gốc (Khuyến khích)**
   ```powershell
   .\build-dotnet.ps1
   ```
   *Script sẽ tự động dò tìm và tắt các tiến trình đang chiếm port API (5189, 50051) hoặc tiến trình `Automation.Api` để tránh lỗi lock DLL (`MSB3027`), sau đó build toàn bộ solution.*

2. **Cách 2: Sử dụng CLI từ thư mục `api/`**
   ```powershell
   cd api
   .\cli build
   ```

3. **Cách 3: Thủ công**
   - Chạy `.\kill-ports.ps1 -Ports 5189, 50051`
   - Chạy `dotnet build api/Automation.sln`

