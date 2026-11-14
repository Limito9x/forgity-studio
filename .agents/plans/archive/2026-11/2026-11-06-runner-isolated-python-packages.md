# Sửa cache Python packages riêng của Runner

User đã yêu cầu thực hiện ngày 06/11/2026. Phạm vi một đợt sửa luồng hiện có.

Trạng thái: đã thực hiện và kiểm thử. Cần user restart runner bằng binary mới và Analyze/Publish lại script để cập nhật dependencies đã bị bỏ ở lần publish cũ.

| Trước | Sau |
|---|---|
| Publish bỏ `dependencies` từ analyzer | Truyền `node.dependencies` vào BatchUpsertItem |
| Pip dùng Python hệ thống cho mọi DCC | Resolve Python của executor, pip cài cho interpreter đó với `--target` |
| Hash chỉ dựa vào requirements | Hash chứa runtime identity và requirements |
| Thư mục tồn tại được coi là cache thành công | Marker chỉ được ghi sau cài thành công; cache dở được cài lại |
| Pip lỗi vẫn chạy stage | Báo lỗi và dừng trước khi mở DCC |
| Warm session giữ packages giữa các bộ dependencies | Restart session khi cache path thay đổi |

## Files và hợp đồng

- `web/src/features/pipelines/hooks/useScriptBatchPublish.ts`: chuyển dependencies đã có trong DTO.
- `runner/src/core/python_packages.rs`: resolve embedded Python, probe runtime, chuẩn bị cache.
- `runner/src/core/dispatcher.rs`: gọi chuẩn bị dependencies sau resolve executor.
- `runner/src/core/mod.rs`: đăng ký module.
- `runner/src/process/dcc_pool.rs`: so sánh cache path khi reuse session.
- `runner/scripts/stage_runner_guest.py`: ưu tiên cache trong sys.path, báo lỗi injection rõ ràng.
- Tests Python/Rust cho cache, injection, import packages bằng Unreal Python.
- `.agents/playbooks/runner-runtime.md` và `.agents/AGENTS.md`: đồng bộ mô tả.

Giữ nguyên contract `steps[].dependencies` và `site_packages_path`. Không cài vào site-packages gốc, không chạy ensurepip ghi vào DCC, không thay đổi business scripts hay database. Unreal dùng đường dẫn embedded Python theo Engine; Blender lấy interpreter từ sys.prefix của chính Blender. Runtime không hỗ trợ hoặc thiếu interpreter báo lỗi tường minh.

## Nghiệm thu

- Publish giữ dependencies; frontend build/typecheck.
- Cargo check, focused tests, release build.
- Cache phân biệt runtime, hit không gọi pip, failed/interrupted install không có marker và retry được.
- Python đi kèm Unreal import được pydantic/openai từ cache, môi trường gốc vẫn không có packages mới.
- Warm session chỉ reuse cùng cache path.

## Kết quả kiểm tra

- `cargo check --locked`: đạt.
- `cargo test --locked -- --skip unreal_pydantic_openai_smoke`: 18 đạt.
- `python -B -m unittest discover -s scripts/tests -v`: 2 đạt.
- Test tải packages thật `unreal_pydantic_openai_smoke`: đạt, pydantic 2.14.3, openai 3.46.0, Python Unreal 3.11.8. Cache `runner/cache/python-packages/b092287560bfc879fadf8341`.
- Unreal commandlet chạy `scripts/tests/unreal_package_smoke.py`: exit 0, log `FORGITY_PACKAGE_SMOKE_OK` trong `runner/logs/python_packages_smoke.log`. Script không sửa game assets. Môi trường sandbox chặn Zen khi startup; lần kiểm tra với quyền runtime ngoài sandbox đạt.
- Python Unreal gốc vẫn không tìm thấy pydantic/openai khi chạy không inject.
- `pnpm.cmd build`: đạt sau hai null-safety fixes tại AssetPinUpload và ExecutorExtensions; Vite có cảnh báo kích thước chunks.
- Release đã compile/link; Cargo không copy đè được `target/release/forgity-runner.exe` đang chạy. Binary mới từ linker được lưu tại `runner/dist/isolated-packages/forgity-runner.exe`, `--version` chạy được.
- Chưa chạy lại toàn bộ classification pipeline, chưa kiểm tra live việc đổi cache của warm session; các runner hiện hữu không bị restart.
