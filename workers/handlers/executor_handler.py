import logging
from core import agent_pb2
from core.executors.scanner import scan_all_executors

logger = logging.getLogger(__name__)


def handle_scan_executors(command: agent_pb2.ScanExecutorsCommand) -> agent_pb2.CommandResponse:
    """
    Handle scan executors command from the backend server.
    
    Args:
        command: agent_pb2.ScanExecutorsCommand with command_id and executor_key filter.

    Returns:
        agent_pb2.CommandResponse containing ScanExecutorsCommandResult.
    """
    cmd_id = command.command_id
    target_key = (command.executor_key or "").strip().lower()

    logger.info(f"Scanning for software executors (Filter: '{target_key or 'ALL'}')...")
    try:
        candidates = scan_all_executors(target_key if target_key else None)
        candidate_messages = [
            agent_pb2.ExecutorCandidateMessage(
                executor_key=c["executor_key"],
                executable_path=c["executable_path"],
                version=c["version"]
            )
            for c in candidates
        ]

        logger.info(
            f"Scan executors succeeded: found {len(candidate_messages)} candidates. Command ID: {cmd_id}"
        )

        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=True,
            scan_executors_result=agent_pb2.ScanExecutorsCommandResult(
                items=candidate_messages
            )
        )
    except Exception as e:
        logger.error(f"Error handling ScanExecutorsCommand: {e}", exc_info=True)
        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=False,
            error_message=str(e)
        )
