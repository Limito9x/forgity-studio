"""
Centralized branding constants and system daemon identifiers.
Parameterized following Option B: Changing these values updates all paths, task names, and units.
"""
import os
from pathlib import Path

APP_SLUG = os.getenv("FORGITY_APP_SLUG", "forgity")
APP_NAME = os.getenv("FORGITY_APP_NAME", "Forgity Studio")
CLI_PROG = os.getenv("FORGITY_CLI_PROG", "runner")

# Service identifiers
WINDOWS_TASK_NAME = r"\Forgity\RunnerDaemon"
SYSTEMD_SERVICE_NAME = "forgity-runner.service"
LAUNCHD_PLIST_NAME = "com.forgity.runner.plist"

PID_FILE_NAME = f"{CLI_PROG}.pid"
LOG_FILE_NAME = f"{CLI_PROG}.log"
