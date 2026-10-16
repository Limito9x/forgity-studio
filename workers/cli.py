import argparse
import sys
import os
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)

# Add core and current dir to sys.path so generated protobuf modules can resolve cleanly
WORKERS_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(WORKERS_ROOT, "core"))
sys.path.append(WORKERS_ROOT)

from commands import register, scan, health, start, browse, connect, rescan_hardware, diagnose, service


def main():
    parser = argparse.ArgumentParser(
        prog="runner",
        description="Automation Studio Runner Daemon & CLI Tools"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Start command
    subparsers.add_parser("start", help="Start background pipeline worker and persistent gRPC stream")
    subparsers.add_parser("worker", aliases=["pipeline-worker"], help="Start pipeline consumer only")
    cleanup_parser = subparsers.add_parser("cleanup", help="Preview runtime cleanup; --apply deletes eligible files")
    cleanup_parser.add_argument("--apply", action="store_true", help="Apply TTL and cache quota cleanup")

    # Service command (Daemon management)
    service_parser = subparsers.add_parser("service", help="Manage OS native daemon service (Task Scheduler / systemd / launchd)")
    service_sub = service_parser.add_subparsers(dest="service_action", help="Service actions")
    
    install_p = service_sub.add_parser("install", help="Register daemon with OS supervisor")
    install_p.add_argument("--no-autostart", dest="autostart", action="store_false", help="Do not start immediately after installation")
    install_p.set_defaults(autostart=True)
    
    service_sub.add_parser("uninstall", help="Unregister daemon from OS supervisor")
    service_sub.add_parser("start", help="Start background daemon")
    service_sub.add_parser("stop", help="Stop background daemon")
    service_sub.add_parser("restart", help="Restart background daemon")
    service_sub.add_parser("status", help="Query daemon status (running, PID, auto-start)")
    
    logs_p = service_sub.add_parser("logs", help="Display daemon logs")
    logs_p.add_argument("-n", "--lines", type=int, default=50, help="Number of lines to show (default: 50)")
    logs_p.add_argument("-f", "--follow", action="store_true", help="Follow log output in real-time")

    # Connect command
    subparsers.add_parser("connect", help="Connect to persistent gRPC stream to listen for server commands")

    # Register command (supports non-interactive)
    reg_parser = subparsers.add_parser("register", help="Register workstation runner with server using setup token")
    reg_parser.add_argument("--url", type=str, default="", help="Backend API Base URL (e.g. http://localhost:5189/api)")
    reg_parser.add_argument("--token", type=str, default="", help="One-time Setup Token obtained from Web Dashboard")
    reg_parser.add_argument("--name", type=str, default="", help="Custom runner display name (default: hostname)")
    reg_parser.add_argument("--non-interactive", action="store_true", help="Run without prompts (fails if required token is missing)")

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

    if args.command == "cleanup":
        from core.runtime_storage import cleanup
        print(cleanup(dry_run=not args.apply))
    elif args.command == "start":
        start.run()
    elif args.command == "connect":
        connect.run()
    elif args.command == "register":
        register.run(
            api_url=args.url,
            setup_token=args.token,
            runner_name=args.name,
            non_interactive=args.non_interactive
        )
    elif args.command == "service":
        service.run(args)
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
        from commands import purge
        purge.run()
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

