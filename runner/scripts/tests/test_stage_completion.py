import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "completion_guest", Path(__file__).resolve().parents[1] / "stage_runner_guest.py"
)
guest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guest)


class CompletionTests(unittest.TestCase):
    def run_guest(self, source, expected_exit=None, missing_packages=False):
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / "step.py"
            script.write_text(source, encoding="utf-8")
            task = Path(directory) / "task.json"
            task.write_text(json.dumps({
                "steps": [{"step_execution_id": "first", "script_path": str(script)},
                          {"step_execution_id": "second", "script_path": str(script)}],
                "site_packages_path": str(Path(directory) / "missing") if missing_packages else None,
            }), encoding="utf-8")
            with patch.dict(os.environ, {"FORGITY_IPC_PIPE": "test", "FORGITY_TASK_JSON": str(task)}), \
                    patch.object(guest, "PipeClient") as client_class, \
                    patch.object(guest, "purge_blender_orphans"):
                client = client_class.return_value
                if expected_exit is None:
                    guest.main()
                else:
                    with self.assertRaises(SystemExit) as caught:
                        guest.main()
                    self.assertEqual(caught.exception.code, expected_exit)
                client.close.assert_called_once()
                return [call.args[0] for call in client.send.call_args_list]

    def test_failed_step_reports_failure_and_exits_nonzero_without_next_step(self):
        events = self.run_guest("def main():\n    raise ValueError('bad material')\n", 1)
        self.assertEqual([e['step_execution_id'] for e in events if e['type'] == 'step_started'], ['first'])
        self.assertFalse(events[-1]['succeeded'])
        self.assertIn('bad material', events[-1]['error_message'])

    def test_success_reports_both_steps_and_returns_normally(self):
        events = self.run_guest("def main():\n    return {'ok': True}\n")
        self.assertEqual(len([e for e in events if e['type'] == 'step_completed']), 2)
        self.assertTrue(events[-1]['succeeded'])

    def test_missing_packages_also_exit_nonzero(self):
        events = self.run_guest("def main():\n    return {}\n", 1, missing_packages=True)
        self.assertFalse(events[-1]['succeeded'])
        self.assertFalse(any(e['type'] == 'step_started' for e in events))


if __name__ == '__main__':
    unittest.main()
