import os
import logging
from core import agent_pb2
from commands.scan import scan_directory

logger = logging.getLogger(__name__)


def handle_scan_sync(command: agent_pb2.ScanCommand) -> agent_pb2.CommandResponse:
    """
    Handle resource scan and synchronization command from the backend server.
    
    Args:
        command: agent_pb2.ScanCommand with command_id, directory_path, and extensions.

    Returns:
        agent_pb2.CommandResponse containing ScanCommandResult.
    """
    cmd_id = command.command_id
    target_dir = command.directory_path or "."
    extensions = list(command.extensions) if command.extensions else None
    abs_directory = os.path.abspath(target_dir)

    logger.info(f"Scanning resources in '{abs_directory}' (Extensions: {extensions})...")
    try:
        items = scan_directory(abs_directory, abs_directory, recursive=True, extensions=extensions)
        logger.info(f"Scan sync succeeded: found {len(items)} items. Command ID: {cmd_id}")

        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=True,
            scan_result=agent_pb2.ScanCommandResult(items=items)
        )
    except Exception as e:
        logger.error(f"Error handling ScanCommand: {e}", exc_info=True)
        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=False,
            error_message=str(e)
        )
