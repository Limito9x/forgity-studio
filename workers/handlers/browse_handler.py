import logging
from core import agent_pb2
from core.system.file_browser import browse

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

        logger.info(
            f"Browse succeeded for '{browse_data['current_path']}' "
            f"({len(items)} items, Parent: '{browse_data['parent_path']}'). Command ID: {cmd_id}"
        )

        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=True,
            browse_result=agent_pb2.BrowseCommandResult(
                current_path=browse_data["current_path"],
                parent_path=browse_data["parent_path"],
                can_navigate_up=browse_data["can_navigate_up"],
                items=items
            )
        )
    except Exception as e:
        logger.error(f"Error handling BrowseCommand for path '{target_dir}': {e}", exc_info=True)
        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=False,
            error_message=str(e)
        )
