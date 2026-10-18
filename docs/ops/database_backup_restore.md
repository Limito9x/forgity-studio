# Cẩm Nang Vận Hành: Sao Lưu & Phục Hồi Cơ Sở Dữ Liệu PostgreSQL (Docker)

> **Mã tài liệu:** `OPS-DB-BACKUP-RESTORE`  
> **Áp dụng cho:** PostgreSQL 17 Alpine (Docker Compose), Local Dev & VPS Deployment  
> **Công cụ hỗ trợ:** `scripts/backup-db.ps1`, `scripts/restore-db.ps1`

---

## 1. Thông Tin Môi Trường & Quy Ước Mặc Định

Theo cấu hình chuẩn trong [docker-compose.yml](file:///d:/FullStack/Automation/docker-compose.yml) và [.env](file:///d:/FullStack/Automation/.env):

| Tham số | Giá trị mặc định | Mô tả |
| :--- | :--- | :--- |
| **Container Name** | `forgity-db-dev` hoặc `forgity-db-prod` | Đặt theo `${PROJECT_NAME}-db-${ENV_MODE}` |
| **Database Name** | `Forgity` | Tên cơ sở dữ liệu chính của hệ thống |
| **Postgres User** | `postgres` | Tài khoản quản trị cơ sở dữ liệu |
| **Port trên Host** | `5433` (Map vào `5432` container) | Tránh đụng độ với PostgreSQL cài trên máy chủ |
| **Thư mục Backup** | `backups/` | Tự động tạo ở thư mục gốc (đã được ignore trong Git) |

---

## 2. Cách 1: Sử Dụng Script Tự Động 1-Chạm (Khuyên Dùng)

Dự án đã tích hợp sẵn 2 PowerShell scripts tiện dụng trong thư mục `scripts/`:

### 2.1. Sao lưu dữ liệu (`backup-db.ps1`)

```powershell
# Sao lưu dạng file .sql theo ngày giờ (mặc định)
.\scripts\backup-db.ps1

# Sao lưu dạng nén nhị phân .dump (nhẹ hơn, restore đa luồng nhanh hơn)
.\scripts\backup-db.ps1 -Format dump

# Tùy chỉnh container hoặc thư mục lưu
.\scripts\backup-db.ps1 -Container "forgity-db-prod" -OutputDir "D:\Backups"
```
- File xuất ra sẽ có định dạng: `backups/forgity_Forgity_YYYYMMDD_HHmmss.sql` (hoặc `.dump`).

### 2.2. Phục hồi dữ liệu (`restore-db.ps1`)

```powershell
# Phục hồi dữ liệu (có hộp thoại hỏi xác nhận an toàn y/N)
.\scripts\restore-db.ps1 -File .\backups\forgity_Forgity_20261018_154500.sql

# Phục hồi file nén .dump
.\scripts\restore-db.ps1 -File .\backups\forgity_Forgity_20261018_154500.dump

# Chạy tự động không cần hỏi (dùng cho CI/CD hoặc auto deploy)
.\scripts\restore-db.ps1 -File .\backup.sql -Force
```

---

## 3. Cách 2: Các Lệnh Thủ Công Qua Docker CLI (Thao Tác Nhanh)

Nếu bạn ở trên Linux/macOS hoặc máy chủ không có PowerShell, có thể chạy trực tiếp các lệnh Docker sau:

### 3.1. Tạo bản sao lưu (Backup)

#### A. Xuất file Plain SQL (`.sql`):
```bash
docker exec -t forgity-db-prod pg_dump -U postgres -d Forgity > backup.sql
```

#### B. Xuất file nén Custom Format (`.dump` - Chuẩn Production):
```bash
docker exec forgity-db-prod pg_dump -U postgres -d Forgity -F c -b -v -f /tmp/backup.dump
docker cp forgity-db-prod:/tmp/backup.dump ./backup.dump
docker exec forgity-db-prod rm -f /tmp/backup.dump
```

---

### 3.2. Phục hồi dữ liệu (Restore)

> [!WARNING]
> **Lỗi thường gặp:** `database "Forgity" is being accessed by other users`.  
> Backend API hoặc các service đang duy trì Connection Pool tới DB sẽ chặn lệnh restore. Do đó, **bắt buộc** phải ngắt toàn bộ connection trước khi restore.

#### Bước 1: Ngắt toàn bộ kết nối đang mở vào Database
```bash
docker exec -i forgity-db-prod psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'Forgity' AND pid <> pg_backend_pid();"
```

#### Bước 2A: Nạp lại từ file Plain SQL (`.sql`)
```bash
# Trên Windows PowerShell
Get-Content backup.sql -Raw | docker exec -i forgity-db-prod psql -U postgres -d Forgity

# Trên Linux / macOS Bash
cat backup.sql | docker exec -i forgity-db-prod psql -U postgres -d Forgity
```

#### Bước 2B: Nạp lại từ file Custom Format (`.dump`)
```bash
docker cp ./backup.dump forgity-db-prod:/tmp/backup.dump
docker exec -i forgity-db-prod pg_restore -U postgres -d Forgity --clean --if-exists -v /tmp/backup.dump
docker exec forgity-db-prod rm -f /tmp/backup.dump
```

---

## 4. Xử Lý Các Trường Hợp Đặc Biệt

### 4.1. Tạo mới Database trắng trước khi nạp
Nếu database bị hỏng schema hoặc muốn làm sạch 100%:
```bash
# Xóa database cũ
docker exec -i forgity-db-prod psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"Forgity\";"

# Tạo database mới trống
docker exec -i forgity-db-prod psql -U postgres -d postgres -c "CREATE DATABASE \"Forgity\";"

# Bơm dữ liệu vào database mới
Get-Content backup.sql -Raw | docker exec -i forgity-db-prod psql -U postgres -d Forgity
```

### 4.2. Kiểm tra nhanh số lượng bảng sau khi Restore
> [!NOTE]
> Dự án sử dụng mô hình Modular Monolith chia nhỏ theo schema (`runner`, `studio`, `pipeline`, `tag`, `identity`...), do đó để xem tất cả các bảng cần dùng cú pháp `\dt *.*` thay vì `\dt` thông thường.
```bash
docker exec -i forgity-postgres psql -U postgres -d Forgity -c "\dt *.*"
```

---

## 5. Chiến Lược Tự Động Hóa Hàng Đêm Lên Cloudflare R2 (Off-site Cronjob)

Để phòng chống hoàn toàn rủi ro máy chủ VM bị chết (Single Point of Failure), dự án trang bị 2 scripts tại `scripts/ops/`:
- `scripts/ops/backup-nightly.sh`: Dump dữ liệu tự động, lưu giữ 7 ngày ở local và dọn rác.
- `scripts/ops/upload-r2.py`: Đẩy file dump lên Cloudflare R2 và xóa bản backup cũ hơn 14 ngày trên R2.

### Cài đặt Cronjob trên GCP VM:

1. **Cấp quyền thực thi:**
   ```bash
   chmod +x ~/scripts/ops/backup-nightly.sh
   chmod +x ~/scripts/ops/upload-r2.py
   ```

2. **Mở bảng cấu hình cron:**
   ```bash
   crontab -e
   ```

3. **Thêm dòng sau (Tự động chạy lúc 2:00 AM mỗi đêm):**
   ```bash
   0 2 * * * /bin/bash /home/thuanlee0407/scripts/ops/backup-nightly.sh >> /home/thuanlee0407/backup.log 2>&1
   ```

4. **Kiểm tra log sao lưu:**
   ```bash
   tail -n 50 ~/backup.log
   ```

