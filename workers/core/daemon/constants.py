"""
Centralized branding constants and system daemon identifiers.
Parameterized following Option B: Changing these values updates all paths, task names, and units.
"""
import os
from pathlib import Path

APP_SLUG = os.getenv("AUTOMATION_APP_SLUG", "automation")
APP_NAME = os.getenv("AUTOMATION_APP_NAME", "Automation Studio")
CLI_PROG = os.getenv("AUTOMATION_CLI_PROG", "runner")

# Service identifiers
WINDOWS_TASK_NAME = rf"\{APP_SLUG.capitalize()}\RunnerDaemon"
SYSTEMD_SERVICE_NAME = f"{APP_SLUG}-runner.service"
LAUNCHD_PLIST_NAME = f"com.{APP_SLUG}.runner.plist"

PID_FILE_NAME = f"{CLI_PROG}.pid"
LOG_FILE_NAME = f"{CLI_PROG}.log"
