#!/usr/bin/env python3
"""
Forgity Studio - Backlog & Engineering Plans Automation Utility
--------------------------------------------------------------
Manages engineering plans, archive lifecycle, BACKLOG.md, and AGENTS.md indexing.

Usage:
    python .agents/scripts/backlog.py check
    python .agents/scripts/backlog.py archive [--dry-run]
    python .agents/scripts/backlog.py new "<Title>" [--scope "<Scope>"] [--summary "<Summary>"]
    python .agents/scripts/backlog.py list [--active-only]
"""

import os
import re
import sys
import shutil
import argparse
import subprocess
from datetime import datetime
from pathlib import Path

# Configure utf-8 stdout/stderr on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Paths configuration
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent
AGENTS_DIR = WORKSPACE_ROOT / ".agents"
PLANS_DIR = AGENTS_DIR / "plans"
ARCHIVE_DIR = PLANS_DIR / "archive"
BACKLOG_FILE = PLANS_DIR / "BACKLOG.md"
AGENTS_FILE = AGENTS_DIR / "AGENTS.md"
README_FILE = PLANS_DIR / "README.md"


def get_git_tracked_files():
    try:
        res = subprocess.run(
            ["git", "ls-files"],
            cwd=WORKSPACE_ROOT,
            capture_output=True,
            text=True,
            check=True
        )
        return set(res.stdout.splitlines())
    except Exception:
        return set()


def split_markdown_row(line):
    """
    Splits markdown table cells properly, respecting escaped pipes (\\|).
    """
    placeholder = "@@ESCAPED_PIPE@@"
    safe_line = line.strip().replace(r"\|", placeholder)
    if safe_line.startswith("|"):
        safe_line = safe_line[1:]
    if safe_line.endswith("|"):
        safe_line = safe_line[:-1]
    
    parts = safe_line.split("|")
    return [p.replace(placeholder, r"\|").strip() for p in parts]


def parse_backlog_items():
    """
    Parses table rows from BACKLOG.md.
    Returns list of dicts: {code, num, date, title_cell, problem, solution, links, status, status_cell, raw_line, line_idx}
    """
    if not BACKLOG_FILE.exists():
        print(f"Error: {BACKLOG_FILE} not found.", file=sys.stderr)
        return []

    lines = BACKLOG_FILE.read_text(encoding="utf-8").splitlines()
    items = []

    for idx, line in enumerate(lines):
        clean_line = line.strip()
        if not clean_line.startswith("|") or "BL-" not in clean_line:
            continue
        
        cells = split_markdown_row(clean_line)
        if len(cells) < 7:
            continue

        # Cell 0: **BL-001**
        bl_match = re.search(r"BL-(\d+)", cells[0])
        if not bl_match:
            continue

        bl_num = int(bl_match.group(1))
        code = f"BL-{bl_num:03d}"
        date_str = cells[1]
        title_cell = cells[2]
        problem_cell = cells[3]
        solution_cell = cells[4]
        links_cell = cells[5]
        status_cell = cells[6]

        status = "Pending"
        if "Resolved" in status_cell:
            status = "Resolved"
        elif "Merged" in status_cell:
            status = "Merged"
        elif "In Progress" in status_cell:
            status = "In Progress"

        items.append({
            "code": code,
            "num": bl_num,
            "date": date_str,
            "title_cell": title_cell,
            "problem": problem_cell,
            "solution": solution_cell,
            "links": links_cell,
            "status": status,
            "status_cell": status_cell,
            "raw_line": line,
            "line_idx": idx
        })

    return items


def extract_plan_paths_from_cell(links_cell):
    """
    Extracts file paths referenced in the links column.
    Matches markdown links like [text](file:///path/to/file.md) or [text](path/to/file.md)
    """
    found = []
    link_matches = re.findall(r"\[([^\]]+)\]\(([^)]+)\)", links_cell)
    for text, url in link_matches:
        clean_url = url.replace("file:///", "").replace("file://", "")
        if ":" in clean_url and (clean_url.startswith("/") or clean_url.startswith("\\")):
            clean_url = clean_url.lstrip("/\\")
        p = Path(clean_url)
        if not p.is_absolute():
            p = (PLANS_DIR / clean_url).resolve()
        found.append((text, url, p))
    return found


def cmd_list(args):
    items = parse_backlog_items()
    print(f"\nTotal Backlog Items: {len(items)}\n" + "=" * 90)
    print(f"{'Code':<8} | {'Date':<10} | {'Status':<12} | {'Title'}")
    print("-" * 90)
    for item in items:
        if args.active_only and item["status"] in ("Resolved", "Merged"):
            continue
        title_match = re.search(r"\*\*([^*]+)\*\*", item["title_cell"])
        title = title_match.group(1) if title_match else item["title_cell"][:40]
        print(f"{item['code']:<8} | {item['date']:<10} | {item['status']:<12} | {title}")
    print("=" * 90 + "\n")


def find_file_in_archive(filename):
    """Finds if a file exists anywhere in ARCHIVE_DIR."""
    for f in ARCHIVE_DIR.rglob("*.md"):
        if f.name.lower() == filename.lower():
            return f
    return None


def cmd_check(args):
    print("\n🔍 Checking Backlog & Engineering Plans Integrity...\n")
    items = parse_backlog_items()

    errors = 0
    warnings = 0

    # 1. Check all links in BACKLOG.md
    for item in items:
        plan_links = extract_plan_paths_from_cell(item["links"])
        for link_text, raw_url, target_path in plan_links:
            if target_path.suffix == ".md" and "plans" in str(target_path).lower():
                if not target_path.exists():
                    # Check if it was moved to archive without updating link
                    archived_path = find_file_in_archive(target_path.name)
                    if archived_path:
                        print(f"⚠️  [LINK OUTDATED] {item['code']}: '{target_path.name}' exists in archive '{archived_path.parent.name}' but BACKLOG link points to root plans.")
                        warnings += 1
                    else:
                        print(f"❌ [BROKEN LINK] {item['code']}: {link_text} -> {target_path} DOES NOT EXIST.")
                        errors += 1
                else:
                    if item["status"] in ("Resolved", "Merged") and target_path.parent == PLANS_DIR:
                        print(f"⚠️  [SHOULD ARCHIVE] {item['code']} is '{item['status']}' but file is in root plans: {target_path.name}")
                        warnings += 1

    # 2. Check root plans directory for unlinked files
    root_plan_files = [f for f in PLANS_DIR.glob("*.md") if f.name not in ("BACKLOG.md", "README.md")]
    all_referenced_names = set()
    for item in items:
        for _, _, p in extract_plan_paths_from_cell(item["links"]):
            all_referenced_names.add(p.name.lower())

    for f in root_plan_files:
        if f.name.lower() not in all_referenced_names:
            print(f"⚠️  [ORPHAN PLAN] File not referenced in BACKLOG.md: {f.name}")
            warnings += 1

    # 3. Check AGENTS.md links
    if AGENTS_FILE.exists():
        agents_content = AGENTS_FILE.read_text(encoding="utf-8")
        agents_links = re.findall(r"\[([^\]]+)\]\(([^)]+)\)", agents_content)
        for text, url in agents_links:
            if "plans" in url and url.endswith(".md"):
                clean = url.replace("file:///", "").replace("file://", "").lstrip("/\\")
                p = Path(clean)
                if not p.is_absolute():
                    p = (AGENTS_DIR / clean).resolve()
                if not p.exists():
                    archived_p = find_file_in_archive(p.name)
                    if archived_p:
                        print(f"⚠️  [OUTDATED IN AGENTS.MD] {text} -> points to root, but file is in {archived_p.parent.name}")
                        warnings += 1
                    else:
                        print(f"❌ [BROKEN LINK IN AGENTS.MD] {text} -> {clean}")
                        errors += 1

    print("\n" + "-" * 50)
    print(f"Integrity check finished: {errors} Errors, {warnings} Warnings.")
    if warnings > 0:
        print("💡 Run `python .agents/scripts/backlog.py archive` to fix links and archive completed plans.")
    print("-" * 50 + "\n")
    return 0 if errors == 0 else 1


def cmd_archive(args):
    print("\n📦 Running Plan Archival Lifecycle...\n")
    items = parse_backlog_items()
    tracked = get_git_tracked_files()

    backlog_content = BACKLOG_FILE.read_text(encoding="utf-8")
    agents_content = AGENTS_FILE.read_text(encoding="utf-8") if AGENTS_FILE.exists() else ""
    readme_content = README_FILE.read_text(encoding="utf-8") if README_FILE.exists() else ""

    archived_count = 0
    healed_links_count = 0

    # Phase 1: Self-heal outdated links in BACKLOG.md and AGENTS.md for files ALREADY in archive
    for arch_file in ARCHIVE_DIR.rglob("*.md"):
        arch_sub = arch_file.parent.name # e.g. "2026-10"
        fname = arch_file.name

        # Replace in BACKLOG.md
        bad_link_1 = f"plans/{fname}"
        good_link_1 = f"plans/archive/{arch_sub}/{fname}"
        if bad_link_1 in backlog_content:
            backlog_content = backlog_content.replace(bad_link_1, good_link_1)
            healed_links_count += 1

        bad_link_2 = f".agents/plans/{fname}"
        good_link_2 = f".agents/plans/archive/{arch_sub}/{fname}"
        if bad_link_2 in backlog_content:
            backlog_content = backlog_content.replace(bad_link_2, good_link_2)
            healed_links_count += 1

        # Replace in AGENTS.md
        if agents_content:
            if bad_link_1 in agents_content:
                agents_content = agents_content.replace(bad_link_1, good_link_1)
                healed_links_count += 1
            if bad_link_2 in agents_content:
                agents_content = agents_content.replace(bad_link_2, good_link_2)
                healed_links_count += 1

    # Phase 2: Move root plans that are Resolved/Merged into their archive folder
    root_plans = [f for f in PLANS_DIR.glob("*.md") if f.name not in ("BACKLOG.md", "README.md")]

    for plan_file in root_plans:
        # Check if plan corresponds to a Resolved or Merged item
        item_match = None
        for item in items:
            if item["status"] in ("Resolved", "Merged") and plan_file.name.lower() in item["links"].lower():
                item_match = item
                break

        date_match = re.match(r"^(\d{4})-(\d{2})-\d{2}", plan_file.name)
        if not date_match:
            continue

        year, month = date_match.group(1), date_match.group(2)
        archive_sub = ARCHIVE_DIR / f"{year}-{month}"

        # If it's matched to a Resolved item or user forced
        if item_match or args.all_resolved:
            dest_file = archive_sub / plan_file.name
            print(f"🚀 Archiving: {plan_file.name} -> archive/{year}-{month}/")

            if not args.dry_run:
                archive_sub.mkdir(parents=True, exist_ok=True)
                rel_path = plan_file.relative_to(WORKSPACE_ROOT).as_posix()
                if rel_path in tracked:
                    subprocess.run(["git", "mv", str(plan_file), str(dest_file)], cwd=WORKSPACE_ROOT, check=True)
                else:
                    shutil.move(str(plan_file), str(dest_file))

                # Update BACKLOG.md links
                old_rel = f"plans/{plan_file.name}"
                new_rel = f"plans/archive/{year}-{month}/{plan_file.name}"
                backlog_content = backlog_content.replace(old_rel, new_rel)

                old_abs = f".agents/plans/{plan_file.name}"
                new_abs = f".agents/plans/archive/{year}-{month}/{plan_file.name}"
                backlog_content = backlog_content.replace(old_abs, new_abs)

                # Update AGENTS.md links and active/archived sections
                if agents_content:
                    agents_content = agents_content.replace(old_abs, new_abs)
                    agents_content = agents_content.replace(old_rel, new_rel)

                    # Move from Active to Archived section if present
                    active_line_regex = re.compile(rf"^\s*-\s*\[\*\*([^*]+)\*\*\]\([^)]*{re.escape(plan_file.name)}\):\s*(.*)$", re.MULTILINE)
                    m = active_line_regex.search(agents_content)
                    if m:
                        active_line = m.group(0)
                        title_part = m.group(1)
                        desc_part = m.group(2)
                        agents_content = agents_content.replace(active_line + "\n", "")

                        arch_header = "### Kế hoạch vừa hoàn thành gần nhất (Đã Archive):"
                        if arch_header in agents_content:
                            agents_content = agents_content.replace(
                                arch_header,
                                f"{arch_header}\n- [**{title_part}**](file:///{WORKSPACE_ROOT.as_posix()}/{new_abs}): {desc_part}"
                            )

            archived_count += 1

    # Phase 3: Clean up any leftover active items in AGENTS.md that are already resolved/archived
    if agents_content and not args.dry_run:
        for item in items:
            if item["status"] in ("Resolved", "Merged"):
                # Check if item code is in active section
                active_block_match = re.search(r"### Kế hoạch đang thực hiện \(Active\):(.*?)(?=###|$)", agents_content, re.DOTALL)
                if active_block_match:
                    active_text = active_block_match.group(1)
                    for line in active_text.splitlines():
                        if item["code"].lower() in line.lower() and line.strip().startswith("-"):
                            agents_content = agents_content.replace(line + "\n", "")
                            # Add to archive section if not present
                            arch_header = "### Kế hoạch vừa hoàn thành gần nhất (Đã Archive):"
                            if line.strip() not in agents_content and arch_header in agents_content:
                                agents_content = agents_content.replace(arch_header, f"{arch_header}\n{line.strip()}")

    if not args.dry_run:
        BACKLOG_FILE.write_text(backlog_content, encoding="utf-8")
        if agents_content:
            AGENTS_FILE.write_text(agents_content, encoding="utf-8")

    print(f"\n✅ Archival completed: {archived_count} plans moved, {healed_links_count} outdated links healed.")
    return 0


def cmd_new(args):
    items = parse_backlog_items()
    next_num = max([item["num"] for item in items], default=0) + 1
    code = f"BL-{next_num:03d}"

    slug = re.sub(r"[^a-zA-Z0-9]+", "-", args.title.lower()).strip("-")
    date_str = datetime.now().strftime("%Y-%m-%d")
    date_display = datetime.now().strftime("%d/%m/%Y")
    filename = f"{date_str}-{code.lower()}-{slug}.md"
    plan_path = PLANS_DIR / filename

    print(f"\n📝 Creating new Backlog Item [{code}]: {args.title}")
    print(f"📄 Plan File: {plan_path.relative_to(WORKSPACE_ROOT)}")

    template = f"""# {code}: {args.title}

> **Mã công việc**: `{code}`  
> **Trạng thái**: `Pending` *(Đang lập kế hoạch)*  
> **Ngày tạo**: {date_display}  
> **Phạm vi**: {args.scope or 'Chưa phân loại'}

---

## 1. Tóm Tắt Mục Tiêu (Executive Summary)
{args.summary or args.title}

---

## 2. Vấn Đề & Hiện Trạng (Problem Statement)
- Mô tả chi tiết vấn đề cần giải quyết...

---

## 3. Đề Xuất Kỹ Thuật (Technical Proposal)
- Phương án triển khai và các quyết định kiến trúc cốt lõi...

---

## 4. Lộ Trình Triển Khai Theo Giai Đoạn (Phased Implementation)

### Phase 1: Chuẩn bị & Hợp đồng (Contracts)
- [ ] Nhiệm vụ 1.1...

### Phase 2: Triển khai Cốt lõi (Core Implementation)
- [ ] Nhiệm vụ 2.1...

### Phase 3: Kiểm thử & Hoàn thiện (Verification & Polish)
- [ ] Viết unit/integration tests...
- [ ] Cập nhật tài liệu và Playbook...

---

## 5. Kế Hoạch Kiểm Thử (Test Plan)
- [ ] Test case 1...
"""

    plan_path.write_text(template, encoding="utf-8")

    # Append to BACKLOG.md
    backlog_content = BACKLOG_FILE.read_text(encoding="utf-8")
    table_row = (
        f"| **{code}** | {date_str} | **{args.title}**<br/>*({args.scope or 'Core'})* | "
        f"{args.summary or args.title} | "
        f"1. Triển khai theo kế hoạch kỹ thuật chi tiết. | "
        f"- [plans/{filename}](file:///{WORKSPACE_ROOT.as_posix()}/.agents/plans/{filename}) | `Pending` |"
    )

    split_marker = "## 3. Quy Định Thêm Mới Vào Backlog"
    if split_marker in backlog_content:
        parts = backlog_content.split(split_marker)
        new_backlog = parts[0].rstrip() + "\n" + table_row + "\n\n---\n\n" + split_marker + parts[1]
    else:
        new_backlog = backlog_content + "\n" + table_row + "\n"

    BACKLOG_FILE.write_text(new_backlog, encoding="utf-8")

    # Add to AGENTS.md Active Plans
    if AGENTS_FILE.exists():
        agents_content = AGENTS_FILE.read_text(encoding="utf-8")
        active_marker = "### Kế hoạch đang thực hiện (Active):"
        if active_marker in agents_content:
            new_active_line = f"- [**{code.lower()}-{slug} ({date_display})**](file:///{WORKSPACE_ROOT.as_posix()}/.agents/plans/{filename}): {args.title}."
            agents_content = agents_content.replace(active_marker, f"{active_marker}\n{new_active_line}")
            AGENTS_FILE.write_text(agents_content, encoding="utf-8")

    print(f"✅ Successfully registered {code} in BACKLOG.md and AGENTS.md.\n")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Forgity Studio Backlog & Plans Manager")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # list
    list_parser = subparsers.add_parser("list", help="List backlog items")
    list_parser.add_argument("--active-only", action="store_true", help="Show only pending/active items")

    # check
    subparsers.add_parser("check", help="Verify links and backlog file integrity")

    # archive
    arch_parser = subparsers.add_parser("archive", help="Archive resolved plans into archive/YYYY-MM/")
    arch_parser.add_argument("--dry-run", action="store_true", help="Print actions without modifying files")
    arch_parser.add_argument("--all-resolved", action="store_true", help="Archive all resolved items even if not explicitly marked")

    # new
    new_parser = subparsers.add_parser("new", help="Create a new backlog item and plan document")
    new_parser.add_argument("title", type=str, help="Title of the feature/backlog item")
    new_parser.add_argument("--scope", type=str, default="", help="Scope/Module (e.g. Backend API, Pipeline DCC)")
    new_parser.add_argument("--summary", type=str, default="", help="Brief summary of the problem and goal")

    args = parser.parse_args()

    if args.command == "list":
        return cmd_list(args)
    elif args.command == "check":
        return cmd_check(args)
    elif args.command == "archive":
        return cmd_archive(args)
    elif args.command == "new":
        return cmd_new(args)


if __name__ == "__main__":
    sys.exit(main() or 0)
