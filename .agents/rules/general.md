# Monorepo General Rules

Những quy tắc này áp dụng cho toàn bộ workspace Monorepo `Automation/`.

---

## 1. Ưu Tiên Bậc Nhất: Sử Dụng CodeGraph MCP Kèm projectPath (TOP MANDATORY PRIORITY)

- **Top Priority Tool:** Bắt buộc ưu tiên sử dụng MCP tool `call_mcp_tool` với `ServerName: "codegraph"`, `ToolName: "codegraph_explore"` là công cụ ĐẦU TIÊN và BẬC NHẤT trước khi làm bất kỳ thao tác phân tích kiến trúc, dò tìm symbol, xem references/callers/callees, hoặc đọc code chi tiết.
- **BẮT BUỘC tham số `projectPath`:** Khi gọi `codegraph_explore`, LUÔN LUÔN truyền trực tiếp tham số `projectPath: "d:\\FullStack\\Automation"` (hoặc đường dẫn tuyệt đối tới subproject tương ứng). Không bao giờ được gọi `codegraph_explore` mà thiếu `projectPath` vì MCP client chạy ở môi trường ngoài project root và sẽ báo lỗi `No CodeGraph project is loaded`.
- **Cú pháp chuẩn khi gọi tool:**
  ```json
  {
    "ServerName": "codegraph",
    "ToolName": "codegraph_explore",
    "Arguments": {
      "projectPath": "d:\\FullStack\\Automation",
      "query": "<SymbolName hoặc câu hỏi>"
    }
  }
  ```
- **Lệnh shell thay thế (khi không dùng MCP):** `codegraph explore "<query>" --path "d:\\FullStack\\Automation"`.
- **Tuyệt đối cấm mò mẫm bằng Grep/View:** Nghiêm cấm dùng `grep_search`, `list_dir`, hoặc `view_file` để tìm kiếm mò mẫm, phán đoán mù mờ khi chưa dùng CodeGraph để nắm toàn bộ bức tranh dependencies, blast radius và verbatim source code.

---

## 2. Quản Lý Terminal & Tiến Trình Nền (Process Management)

- **MANDATORY TERMINAL CONTROL:** Bắt buộc ưu tiên thực thi các lệnh chạy hữu hạn trong terminal mà User có thể thấy và điều khiển.
- **CLEAN UP BACKGROUND TASKS:** Tuyệt đối KHÔNG để server/tiến trình (như `dotnet run`, `pnpm dev`, `python cli.py start`) chạy ngầm vĩnh viễn trong background.
  - Nếu phải chạy background task để kiểm tra ngắn hạn, BẮT BUỘC phải dùng tool `manage_task` với action `kill` để tắt tiến trình ngay lập tức sau khi kiểm tra xong.
  - Tránh triệt để việc giam giữ cổng mạng (port collision) hoặc khóa file `.dll` / `.exe` trên Windows.
- **User Control:** Luôn trả lại quyền kiểm soát terminal cho User sau khi xác nhận code hoạt động. User sẽ tự chủ động khởi chạy server khi cần làm việc.

---

## 3. Ngôn Ngữ & Quy Ước Hiển Thị (Language Conventions)

- **UI & Code:** Toàn bộ văn bản hiển thị cho người dùng (UI text, nhãn, thông báo lỗi, placeholder), tài liệu commit, và tên biến/hàm/lớp PHẢI viết bằng **tiếng Anh**.
- **Agent Chat & Plans:** Khi User viết tiếng Việt, Agent phản hồi bằng **tiếng Việt**. Tất cả tài liệu kế hoạch (`implementation_plan.md`, `walkthrough.md`) viết bằng **tiếng Việt**.
- **Comments & Logs:** Có thể viết bằng **tiếng Việt** hoặc **tiếng Anh**.

---

## 4. Điều Hướng Theo Phạm Vi (Scope Routing)

Khi thực hiện tác vụ, hãy xác định khu vực mã nguồn đang thao tác để đọc và tuân thủ các quy tắc riêng biệt:
- **`api/` (Backend)**: Tuân thủ nghiêm ngặt [rules/backend.md](file:///d:/FullStack/Automation/.agents/rules/backend.md).
- **`web/` (Frontend)**: Tuân thủ nghiêm ngặt [rules/frontend.md](file:///d:/FullStack/Automation/.agents/rules/frontend.md).
- **`workers/` (Workers)**: Tuân thủ nghiêm ngặt [rules/workers.md](file:///d:/FullStack/Automation/.agents/rules/workers.md).

---

## 5. Quy Chuẩn Tài Liệu, Kế Hoạch & Cẩm Nang Vận Hành (Single Source of Truth)

- **Tập Trung Tuyệt Đối Trong `.agents/`:** Toàn bộ Kế hoạch kỹ thuật (`.agents/plans/`) và Cẩm nang vận hành cốt lõi (`.agents/playbooks/`) BẮT BUỘC phải đặt trong thư mục `.agents/`. Nghiêm cấm tạo file markdown rác, kế hoạch rác ngoài thư mục `docs/`.
- **Bắt Buộc Đọc Playbook Trước Khi Code:** Trước khi can thiệp vào bất kỳ module/feature cốt lõi nào (như Pipeline Engine, Canvas Graph Sync, Worker Storage), Agent BẮT BUỘC phải đọc Playbook tương ứng trong `.agents/playbooks/` để nắm vững Mental Model và luồng vận hành thực tế (Lifecycle) từ A đến Z, tránh suy diễn hoặc over-engineer.
- **Bắt Buộc Cập Nhật Liên Tục (Continuous Sync):** Sau khi hoàn thành hoặc sửa đổi luồng thực thi / hợp đồng dữ liệu, Agent BẮT BUỘC phải quay lại cập nhật Playbook tương ứng và đồng bộ Chỉ mục (Index) trong [AGENTS.md](file:///d:/FullStack/Automation/.agents/AGENTS.md). Tuyệt đối không để tài liệu bị lỗi thời làm sai lệch các Agent về sau.

---

## 6. Quy Trình Thực Thi Theo Kế Hoạch Phân Phase & Cổng Duyệt (Phased Execution & Review Gate)

Đối với các tác vụ tái cấu trúc quy trình, sửa đổi kiến trúc hoặc phát triển tính năng có độ phức tạp cao:

1. **Tầng 1 - Kế Hoạch Tổng Quát (Master Roadmap):**
   - Agent cùng User thống nhất một Master Plan tổng quát lưu tại `.agents/plans/<date>-<topic>.md`.
   - Master Plan phải phân chia rõ ràng các Phase độc lập, có ranh giới và mục tiêu nghiệm thu cụ thể.

2. **Tầng 2 - Lập Implementation Plan Chi Tiết Từng Phase (BẮT BUỘC):**
   - **Trước khi can thiệp mã nguồn của bất kỳ Phase nào**, Agent **TUYỆT ĐỐI KHÔNG ĐƯỢC tự ý code ngay**.
   - Agent BẮT BUỘC phải trình bày một **Implementation Plan chi tiết riêng cho Phase đó** gồm:
     * Danh sách file sẽ tạo / sửa đổi kèm đường dẫn tuyệt đối dạng markdown link.
     * Đặc tả hợp đồng dữ liệu / method / consumer / UI component (Before vs After).
     * Ranh giới đỏ (Redlines), các giả định kiến trúc và xử lý edge cases.
     * Tiêu chí nghiệm thu và các bước kiểm thử (Build / Unit test / Manual verification).

3. **Tầng 3 - Cổng Duyệt Của User (User Review Gate):**
   - Agent dừng lại chờ User xem xét, phản biện và uốn nắn kế hoạch chi tiết của Phase.
   - **Chỉ khi User xác nhận đồng ý hoặc yêu cầu thực thi** (ví dụ: *"thực thi phase X"*), Agent mới được phép bắt đầu sửa code.

4. **Tầng 4 - Hoàn Tất Phase & Chuyển Giao Tuần Tự (No Auto-Run Next Phase):**
   - Sau khi thực thi xong Phase X và nghiệm thu đạt yêu cầu, Agent tóm tắt kết quả và dừng lại.
   - **Nghiêm cấm tự động nhảy sang code Phase tiếp theo** khi chưa lập Implementation Plan chi tiết cho Phase mới và chưa được User duyệt.


