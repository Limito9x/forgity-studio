import queue
import time
import logging
from core.grpc_client import get_channel
from core.config import get_config
from core import agent_pb2
from core import agent_pb2_grpc
from handlers import handle_browse, handle_scan_executors, handle_scan_sync, handle_scan_hardware

logger = logging.getLogger(__name__)


def generate_messages(agent_id: str, msg_queue: queue.Queue):
    """
    Generator yielding outgoing messages to the backend gRPC stream.
    The first message registers the agent_id with the backend ConnectionRegistry.
    Subsequent messages are yielded from the response queue as commands complete.
    """
    yield agent_pb2.AgentMessage(agent_id=agent_id)

    while True:
        try:
            msg = msg_queue.get(timeout=1.0)
            if msg is None:
                break
            yield msg
        except queue.Empty:
            pass


def handle_server_message(agent_id: str, server_msg: agent_pb2.ServerMessage, msg_queue: queue.Queue):
    """Dispatch incoming ServerMessage from backend to the appropriate handler."""
    payload_case = server_msg.WhichOneof("payload")
    response = None

    if payload_case == "browse_command":
        response = handle_browse(server_msg.browse_command)
    elif payload_case == "scan_executors_command":
        response = handle_scan_executors(server_msg.scan_executors_command)
    elif payload_case == "scan_command":
        response = handle_scan_sync(server_msg.scan_command)
    elif payload_case == "scan_hardware_command":
        response = handle_scan_hardware(server_msg.scan_hardware_command)
    else:
        logger.warning(f"Received unknown server payload case: '{payload_case}'")
        return


    if response is not None:
        agent_msg = agent_pb2.AgentMessage(
            agent_id=agent_id,
            command_response=response
        )
        msg_queue.put(agent_msg)


def run(retry_interval: int = 5):
    """
    Start bidirectional gRPC stream connection with backend.
    Maintains persistent heartbeat and dispatches server commands.
    """
    config = get_config()
    agent_id = config.get("agentId") or config.get("runnerId")
    if not agent_id:
        print("[ERROR] Missing agentId/runnerId in configuration. Please run 'runner.bat register' first.")
        return

    print(f"[INFO] Connecting bidirectional gRPC stream to backend (Runner ID: {agent_id})...")

    while True:
        try:
            channel = get_channel()
            stub = agent_pb2_grpc.AgentServiceStub(channel)
            msg_queue = queue.Queue()

            response_stream = stub.Connect(generate_messages(agent_id, msg_queue))
            print("[OK] Bidirectional gRPC stream connected. Listening for server commands...\n")

            for server_msg in response_stream:
                handle_server_message(agent_id, server_msg, msg_queue)

            print("[WARNING] Connection closed by server. Preparing to reconnect...")
        except KeyboardInterrupt:
            print("\n[STOP] gRPC stream stopped by user.")
            break
        except Exception as e:
            print(f"[ERROR] gRPC connection failed: {e}")

        print(f"[INFO] Reconnecting in {retry_interval} seconds... (Press Ctrl+C to abort)")
        try:
            time.sleep(retry_interval)
        except KeyboardInterrupt:
            print("\n[STOP] gRPC stream stopped by user.")
            break


if __name__ == "__main__":
    run()
