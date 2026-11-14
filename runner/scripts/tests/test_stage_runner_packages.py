import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest


GUEST = Path(__file__).resolve().parents[1] / "stage_runner_guest.py"
spec = importlib.util.spec_from_file_location("package_test_guest", GUEST)
guest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guest)


class PackageInjectionTests(unittest.TestCase):
    def test_cache_takes_precedence_and_repeated_injection_does_not_duplicate(self):
        original_path = sys.path[:]
        try:
            with tempfile.TemporaryDirectory() as root:
                bundled = Path(root) / "bundled"
                cache = Path(root) / "cache"
                bundled.mkdir()
                cache.mkdir()
                (bundled / "forgity_probe.py").write_text("source = 'bundled'\n")
                (cache / "forgity_probe.py").write_text("source = 'cache'\n")
                sys.path.insert(0, str(bundled))
                guest.inject_site_packages(str(cache))
                guest.inject_site_packages(str(cache))
                import forgity_probe
                self.assertEqual(forgity_probe.source, "cache")
                self.assertEqual(sys.path.count(str(cache)), 1)
                sys.modules.pop("forgity_probe", None)
        finally:
            sys.path[:] = original_path

    def test_missing_cache_fails_and_no_cache_preserves_path(self):
        original = sys.path[:]
        guest.inject_site_packages(None)
        self.assertEqual(sys.path, original)
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(FileNotFoundError):
                guest.inject_site_packages(str(Path(root) / "missing"))


if __name__ == "__main__":
    unittest.main()
