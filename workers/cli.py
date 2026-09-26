import argparse
import sys
import os

# Add core and current dir to sys.path so generated protobuf modules can resolve cleanly
sys.path.append(os.path.abspath("core"))
sys.path.append(os.path.abspath("."))

from commands import register, scan, health, start, browse, connect, rescan_hardware, diagnose


def main():
    parser = argparse.ArgumentParser(
        prog="runner",
        description="Automation Studio Runner Daemon & CLI Tools"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Start command
    subparsers.add_parser("start", help="Start background pipeline worker and persistent gRPC stream")

    # Connect command
    subparsers.add_parser("connect", help="Connect to persistent gRPC stream to listen for server commands")

    # Register command
    subparsers.add_parser("register", help="Register workstation runner with server using setup token")

    # Rescan Hardware command
    subparsers.add_parser("rescan-hardware", help="Re-scan workstation hardware (CPU, RAM, GPU, Disks) and sync with server")

    # Detect Executors command
    detect_parser = subparsers.add_parser("detect-executors", help="Scan local software installations (Blender, Unreal, Python)")
    detect_parser.add_argument("--key", type=str, default="", help="Specific executor key to scan (blender/unreal/python)")

    # Diagnose / Health commands
    subparsers.add_parser("diagnose", help="Run comprehensive workstation diagnostics (Config, gRPC, RabbitMQ, HW, Executors)")
    subparsers.add_parser("health", help="Quick ping to test gRPC channel health")

    # Browse command
    browse_parser = subparsers.add_parser("browse", help="Browse directory (1 level, lazy-loading)")
    browse_parser.add_argument("--dir", type=str, default=".", help="Directory to browse")

    # Scan command
    scan_parser = subparsers.add_parser("scan", help="Scan local directory and sync resources with server")
    scan_parser.add_argument("--dir", type=str, default=".", help="Directory to scan")
    scan_parser.add_argument("-r", "--recursive", action="store_true", help="Scan subdirectories recursively")

    # Tool utilities
    subparsers.add_parser("purge", help="Purge all pending messages in RabbitMQ queues")
    subparsers.add_parser("compile-protos", help="Compile gRPC protos from packages/proto into workers/core")

    args = parser.parse_args()

    if args.command == "start":
        start.run()
    elif args.command == "connect":
        connect.run()
    elif args.command == "register":
        register.run()
    elif args.command == "rescan-hardware":
        rescan_hardware.run()
    elif args.command == "detect-executors":
        from core.executors.scanner import scan_all_executors
        print(f"--- Scanning Executors (Filter: '{args.key or 'ALL'}') ---")
        candidates = scan_all_executors(args.key if args.key else None)
        for c in candidates:
            print(f"  [{c['executor_key']}] {c['version']} -> {c['executable_path']}")
        print(f"Total found: {len(candidates)}")
    elif args.command == "diagnose":
        diagnose.run()
    elif args.command == "health":
        health.run()
    elif args.command == "browse":
        browse.run(args.dir)
    elif args.command == "scan":
        scan.run(args.dir, recursive=args.recursive)
    elif args.command == "purge":
        from tools import purge_queues
        purge_queues.run()
    elif args.command == "compile-protos":
        from tools import compile_protos
        compile_protos.run()
    elif args.command in ("worker", "pipeline-worker"):
        from worker.pipeline_consumer import PipelineConsumer
        consumer = PipelineConsumer()
        consumer.start()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()

