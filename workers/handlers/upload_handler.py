import os
import logging
import requests
from core import agent_pb2

logger = logging.getLogger(__name__)


def handle_upload(command: agent_pb2.UploadFilesCommand) -> agent_pb2.CommandResponse:
    """
    Handle streaming upload of a batch of local asset files directly to presigned cloud URLs (S3/R2/MinIO).
    Streaming directly avoids loading large binary 3D files into RAM.

    Args:
        command: agent_pb2.UploadFilesCommand with command_id and repeated items.

    Returns:
        agent_pb2.CommandResponse containing UploadFilesCommandResult.
    """
    cmd_id = command.command_id
    items = list(command.items)

    logger.info(f"[Upload] Received UploadFilesCommand (ID: {cmd_id}) with {len(items)} file(s).")

    if not items:
        return agent_pb2.CommandResponse(
            command_id=cmd_id,
            success=True,
            upload_files_result=agent_pb2.UploadFilesCommandResult(
                items=[],
                total_bytes_uploaded=0
            )
        )

    results = []
    total_uploaded = 0
    overall_success = True
    error_summary = []

    for item in items:
        file_path = item.file_path
        presigned_url = item.presigned_url
        content_type = item.content_type or "application/octet-stream"
        asset_id = item.asset_id
        resource_version_id = item.resource_version_id

        if not file_path or not os.path.exists(file_path):
            err = f"Local file not found at: '{file_path}'"
            logger.error(f"[Upload] Asset '{asset_id}': {err}")
            results.append(agent_pb2.UploadFileItemResult(
                asset_id=asset_id,
                resource_version_id=resource_version_id,
                success=False,
                bytes_uploaded=0,
                error_message=err
            ))
            overall_success = False
            error_summary.append(f"{asset_id}: {err}")
            continue

        if not presigned_url:
            err = "Missing presigned upload URL"
            logger.error(f"[Upload] Asset '{asset_id}': {err}")
            results.append(agent_pb2.UploadFileItemResult(
                asset_id=asset_id,
                resource_version_id=resource_version_id,
                success=False,
                bytes_uploaded=0,
                error_message=err
            ))
            overall_success = False
            error_summary.append(f"{asset_id}: {err}")
            continue

        try:
            file_size = os.path.getsize(file_path)
            logger.info(f"[Upload] Streaming {file_size} bytes for asset '{asset_id}' to cloud...")

            headers = {
                "Content-Type": content_type,
                "Content-Length": str(file_size),
            }

            with open(file_path, "rb") as f:
                resp = requests.put(presigned_url, data=f, headers=headers, timeout=(10, 1200))

            if resp.status_code not in (200, 201, 204):
                err = f"Storage server returned HTTP {resp.status_code}: {resp.text[:300]}"
                logger.error(f"[Upload] Asset '{asset_id}' failed: {err}")
                results.append(agent_pb2.UploadFileItemResult(
                    asset_id=asset_id,
                    resource_version_id=resource_version_id,
                    success=False,
                    bytes_uploaded=0,
                    error_message=err
                ))
                overall_success = False
                error_summary.append(f"{asset_id}: HTTP {resp.status_code}")
                continue

            logger.info(f"[Upload] Successfully uploaded {file_size} bytes for asset '{asset_id}'.")
            results.append(agent_pb2.UploadFileItemResult(
                asset_id=asset_id,
                resource_version_id=resource_version_id,
                success=True,
                bytes_uploaded=file_size,
                error_message=""
            ))
            total_uploaded += file_size

        except requests.exceptions.ConnectTimeout:
            err = "Storage connection timed out (10s). Please check if MinIO/S3 is running and reachable."
            logger.error(f"[Upload] Asset '{asset_id}': {err}")
            results.append(agent_pb2.UploadFileItemResult(
                asset_id=asset_id,
                resource_version_id=resource_version_id,
                success=False,
                bytes_uploaded=0,
                error_message=err
            ))
            overall_success = False
            error_summary.append(f"{asset_id}: {err}")
        except requests.exceptions.ConnectionError as ce:
            err = f"Cannot connect to storage server (MinIO/S3): {ce}"
            logger.error(f"[Upload] Asset '{asset_id}': {err}")
            results.append(agent_pb2.UploadFileItemResult(
                asset_id=asset_id,
                resource_version_id=resource_version_id,
                success=False,
                bytes_uploaded=0,
                error_message=err
            ))
            overall_success = False
            error_summary.append(f"{asset_id}: Connection failed")
        except Exception as e:
            err = str(e)
            logger.error(f"[Upload] Asset '{asset_id}' exception: {err}", exc_info=True)
            results.append(agent_pb2.UploadFileItemResult(
                asset_id=asset_id,
                resource_version_id=resource_version_id,
                success=False,
                bytes_uploaded=0,
                error_message=err
            ))
            overall_success = False
            error_summary.append(f"{asset_id}: {err}")

    return agent_pb2.CommandResponse(
        command_id=cmd_id,
        success=overall_success,
        error_message="; ".join(error_summary) if not overall_success else "",
        upload_files_result=agent_pb2.UploadFilesCommandResult(
            items=results,
            total_bytes_uploaded=total_uploaded
        )
    )
