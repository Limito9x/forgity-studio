import logging
from .blender_scanner import scan_blender_executables
from .python_scanner import scan_python_executables
from .unreal_scanner import scan_unreal_executables

logger = logging.getLogger(__name__)


def scan_all_executors(target_key: str | None = None) -> list[dict]:
    """
    Scan for installed graphics & pipeline software candidates on the workstation.
    
    Args:
        target_key: Optional filter key ("blender", "python", "unreal").
                    If None or empty, scans all supported software engines.

    Returns:
        list of [{"executor_key": str, "executable_path": str, "version": str}]
    """
    results = []
    key = (target_key or "").strip().lower()

    if not key or key == "blender":
        logger.info("Scanning for Blender installations...")
        results.extend(scan_blender_executables())

    if not key or key == "python":
        logger.info("Scanning for Python installations...")
        results.extend(scan_python_executables())

    if not key or key in ("unreal", "unrealengine", "ue"):
        logger.info("Scanning for Unreal Engine installations...")
        results.extend(scan_unreal_executables())

    return results


if __name__ == "__main__":
    print("=================================================================")
    print("             DISCOVERED PIPELINE SOFTWARE EXECUTORS              ")
    print("=================================================================")
    candidates = scan_all_executors()
    if not candidates:
        print("  (No supported software installations detected)")
    else:
        for c in candidates:
            print(f"  [{c['executor_key']:<8}] v{c['version']:<8} -> {c['executable_path']}")
    print(f"\nTotal discovered: {len(candidates)}")
    print("=================================================================")
