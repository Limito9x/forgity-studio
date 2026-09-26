import json
import logging
from core import agent_pb2
from core.system.hardware import get_hardware_snapshot

logger = logging.getLogger(__name__)


def handle_scan_hardware(command: agent_pb2.ScanHardwareCommand) -> agent_pb2.CommandResponse:
    """
    Handle remote scan hardware command from the backend server.

    Args:
        command: agent_pb2.ScanHardwareCommand with command_id.

    Returns:
        agent_pb2.CommandResponse containing ScanHardwareCommandResult.
    """
    cmd_id = command.command_id
    logger.info(f"Scanning workstation hardware configuration (Command ID: {cmd_id})...")

    try:
        profile = get_hardware_snapshot()
        logger.info(
            f"Hardware re-scan completed successfully: CPU='{profile['cpu_model']}', "
            f"RAM={round(profile['total_ram_bytes'] / (1024**3), 2)}GB, "
            f"GPU='{profile['primary_gpu_name']}'."
        )

        details_json = json.dumps(profile.get("hardware_details") or {})

        result = agent_pb2.ScanHardwareCommandResult(
            os_platform=profile["os_platform"],
            cpu_model=profile["cpu_model"],
            total_ram_bytes=profile["total_ram_bytes"],
            primary_gpu_name=profile["primary_gpu_name"],
            primary_gpu_vram_bytes=profile["primary_gpu_vram_bytes"],
            hardware_details_json=details_json,
        )

        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=True,
            scan_hardware_result=result,
        )
    except Exception as e:
        logger.error(f"Error executing ScanHardwareCommand: {e}", exc_info=True)
        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=False,
            error_message=str(e),
        )

