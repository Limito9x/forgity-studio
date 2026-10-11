import sys
from core.daemon.service_manager import get_service_manager


def run(args):
    """Entry point for `runner service <subcommand>`."""
    mgr = get_service_manager()
    subcmd = getattr(args, "service_action", None)

    if subcmd == "install":
        autostart = getattr(args, "autostart", True)
        success = mgr.install(autostart=autostart)
        sys.exit(0 if success else 1)
    elif subcmd == "uninstall":
        success = mgr.uninstall()
        sys.exit(0 if success else 1)
    elif subcmd == "start":
        success = mgr.start()
        sys.exit(0 if success else 1)
    elif subcmd == "stop":
        success = mgr.stop()
        sys.exit(0 if success else 1)
    elif subcmd == "restart":
        success = mgr.restart()
        sys.exit(0 if success else 1)
    elif subcmd == "status":
        state = mgr.status()
        sys.exit(0 if state.get("running") else 3)
    elif subcmd == "logs":
        lines = getattr(args, "lines", 50)
        follow = getattr(args, "follow", False)
        mgr.logs(lines=lines, follow=follow)
    else:
        print("[ERROR] Unknown service command. Use 'runner service --help' for available actions.")
        sys.exit(1)
