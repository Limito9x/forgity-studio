import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import config, runtime_storage, script_resolver


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "runtime"
        env = patch.dict(os.environ, {"WORKER_DATA_DIR": str(self.root)})
        env.start()
        self.addCleanup(env.stop)
        cfg = patch.object(runtime_storage, "load_config", return_value={"storage": {
            "cache_ttl_hours": 1, "temp_ttl_hours": 1, "cache_max_bytes": 5,
        }})
        cfg.start()
        self.addCleanup(cfg.stop)

    def file(self, relative, age=0, data=b"1234"):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        os.utime(path, (time.time() - age, time.time() - age))
        return path

    def test_preview_ttl_quota_and_apply_preserve_recent_temp(self):
        old = self.file("temp/old/payload.json", 7200)
        recent = self.file("temp/live/output.bin")
        lru = self.file("cache/scripts/a/a.py", 100)
        newest = self.file("cache/scripts/b/b.py")
        preview = runtime_storage.cleanup()
        self.assertEqual(preview["files"], 2)
        self.assertTrue(old.exists())
        result = runtime_storage.cleanup(dry_run=False)
        self.assertEqual(result["bytes"], 8)
        self.assertFalse(old.exists())
        self.assertFalse(lru.exists())
        self.assertTrue(newest.exists())
        self.assertTrue(recent.exists())

    def test_cleanup_skips_active_stage_in_this_process_and_other_process(self):
        old = self.file("temp/old.json", 7200)
        with runtime_storage.storage_lock():
            self.assertIn("skipped", runtime_storage.cleanup(dry_run=False))
            code = "from core.runtime_storage import cleanup; import json; print(json.dumps(cleanup(False)))"
            child = subprocess.run([sys.executable, "-c", code], cwd=Path(__file__).resolve().parent,
                                   capture_output=True, text=True, timeout=10)
            self.assertEqual(child.returncode, 0, child.stderr)
            self.assertIn("skipped", json.loads(child.stdout))
        self.assertTrue(old.exists())

    def test_cleanup_does_not_follow_directory_link(self):
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        file = outside / "keep.bin"
        file.write_bytes(b"keep")
        os.utime(file, (0, 0))
        cache = self.root / "cache"
        cache.mkdir(parents=True)
        link = cache / "link"
        if os.name == "nt":
            result = subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(outside)],
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            link.symlink_to(outside, target_is_directory=True)
        try:
            runtime_storage.cleanup(dry_run=False)
            self.assertEqual(file.read_bytes(), b"keep")
        finally:
            if os.name == "nt":
                link.rmdir()
            else:
                link.unlink()

    def test_asset_partial_download_is_not_reused(self):
        content = b"asset-content"
        digest = hashlib.sha256(content).hexdigest()
        with patch.object(script_resolver, "CACHE_BASE_DIR", str(self.root / "cache")):
            with patch("urllib.request.urlopen", return_value=io.BytesIO(b"partial")):
                self.assertEqual(script_resolver.resolve_file_asset("https://example/a", digest, "a.bin"), "")
            self.assertEqual(list(self.root.rglob("*.tmp")), [])
            with patch("urllib.request.urlopen", return_value=io.BytesIO(content)):
                path = script_resolver.resolve_file_asset("https://example/a", digest, "a.bin")
            self.assertEqual(Path(path).read_bytes(), content)
            with self.assertRaises(ValueError):
                script_resolver.resolve_file_asset("https://example/a", digest, "../escape.bin")

    def test_trial_rejects_insecure_broker_and_uses_verified_tls(self):
        with patch.dict(os.environ, {"WORKER_ENVIRONMENT": "trial", "RABBITMQ_TLS": "false"}):
            with self.assertRaisesRegex(ValueError, "Trial requires"):
                config.get_rabbitmq_parameters()
        with patch.dict(os.environ, {"WORKER_ENVIRONMENT": "trial", "RABBITMQ_TLS": "true"}), \
             patch.object(config, "RABBITMQ_USER", "worker"), \
             patch.object(config, "RABBITMQ_PASSWORD", "test-secret"):
            params = config.get_rabbitmq_parameters(host="mq.example.com", port=5671)
            self.assertEqual(params.ssl_options.server_hostname, "mq.example.com")
            self.assertTrue(params.ssl_options.context.check_hostname)

    def test_config_save_is_atomic_and_invalid_config_fails_explicitly(self):
        target = Path(self.temp.name) / "agent.json"
        target.write_text('{"old": true}', encoding="utf-8")
        with patch("os.replace", side_effect=OSError("locked")):
            self.assertFalse(config.save_config({"new": True}, str(target)))
        self.assertEqual(json.loads(target.read_text()), {"old": True})
        self.assertEqual(list(target.parent.glob("*.tmp")), [])
        self.assertTrue(config.save_config({"new": True}, str(target)))
        with patch.object(config, "CONFIG_FILE", str(target)):
            self.assertEqual(config.load_config(), {"new": True})
            target.write_text("invalid-json", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Cannot read worker configuration"):
                config.load_config()

    def test_unreal_payload_and_engine_temp_use_runtime_storage(self):
        from worker.contracts import StageTaskMessage
        from worker.executors.unreal_executor import UnrealEngineExecutor
        task = StageTaskMessage.model_validate({"stage_execution_id": "stage", "pipeline_execution_id": "pipeline",
                                               "executor": "unreal", "steps": []})
        executor = UnrealEngineExecutor("unused-test-executable")
        env = executor.prepare_environment(task)
        payload = Path(env["UE_STAGE_TASK_FILE"])
        self.assertTrue(payload.is_relative_to(self.root / "temp"))
        self.assertEqual(env["TEMP"], env["TMPDIR"])
        self.assertEqual(json.loads(payload.read_text())["stage_execution_id"], "stage")
        executor.cleanup_after_execution(task)
        self.assertFalse(payload.exists())

    def consumer(self):
        from worker.pipeline_consumer import PipelineConsumer
        consumer = PipelineConsumer.__new__(PipelineConsumer)
        consumer._send_result = MagicMock()
        consumer._send_progress = MagicMock()
        return consumer

    def test_result_publish_failure_does_not_ack_or_change_success(self):
        consumer = self.consumer()
        consumer._send_result.side_effect = OSError("connection lost")
        channel = MagicMock()
        method = MagicMock(delivery_tag=123)
        task = json.dumps({"stage_execution_id": "stage", "pipeline_execution_id": "pipeline",
                           "executor": "python", "steps": []})
        executor = MagicMock()
        executor.execute.return_value = MagicMock(succeeded=True, step_results=[], log="", error_message=None)
        with patch("worker.pipeline_consumer.get_executor", return_value=executor):
            with self.assertRaises(OSError):
                consumer._process_message(channel, method, None, task)
        channel.basic_ack.assert_not_called()
        consumer._send_result.assert_called_once()
        self.assertTrue(consumer._send_result.call_args.args[0].succeeded)

    def test_bad_message_is_rejected_without_requeue(self):
        consumer = self.consumer()
        channel = MagicMock()
        consumer._process_message(channel, MagicMock(delivery_tag=9), None, b"bad-json")
        channel.basic_ack.assert_not_called()
        channel.basic_nack.assert_called_once_with(delivery_tag=9, requeue=False)


if __name__ == "__main__":
    unittest.main()
