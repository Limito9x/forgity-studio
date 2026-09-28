import logging
from core import agent_pb2
from core.system.file_browser import browse, get_system_places, get_pinned_folders, get_drives

logger = logging.getLogger(__name__)


def handle_browse(command: agent_pb2.BrowseCommand) -> agent_pb2.CommandResponse:
    """
    Handle remote directory browse command from the backend server.
    
    Args:
        command: agent_pb2.BrowseCommand with command_id and directory_path.

    Returns:
        agent_pb2.CommandResponse containing BrowseCommandResult.
    """
    cmd_id = command.command_id
    target_dir = (command.directory_path or "").strip()

    try:
        browse_data = browse(target_dir=target_dir)

        # Convert items to protobuf BrowseItemMessage
        items = [
            agent_pb2.BrowseItemMessage(
                name=i["name"],
                path=i["path"],
                is_directory=i["is_directory"],
                size_bytes=i["size_bytes"]
            )
            for i in browse_data["items"]
        ]

        # Quick system places (Home, Desktop, Downloads, Documents)
        system_places = [
            agent_pb2.SystemPlaceMessage(
                name=p["name"],
                path=p["path"]
            )
            for p in get_system_places()
        ]

        # Pinned folders from local config
        pinned_folders = get_pinned_folders()

        # Logical disk drives with realtime free/total bytes
        drives = [
            agent_pb2.DriveInfoMessage(
                mount=d["mount"],
                label=d["label"],
                total_bytes=d["total_bytes"],
                free_bytes=d["free_bytes"]
            )
            for d in get_drives()
        ]

        logger.info(
            f"Browse succeeded for '{browse_data['current_path']}' "
            f"({len(items)} items, {len(drives)} drives). Command ID: {cmd_id}"
        )

        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=True,
            browse_result=agent_pb2.BrowseCommandResult(
                current_path=browse_data["current_path"],
                parent_path=browse_data["parent_path"],
                can_navigate_up=browse_data["can_navigate_up"],
                items=items,
                system_places=system_places,
                pinned_folders=pinned_folders,
                drives=drives
            )
        )
    except Exception as e:
        logger.error(f"Error handling BrowseCommand for path '{target_dir}': {e}", exc_info=True)
        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=False,
            error_message=str(e)
        )
