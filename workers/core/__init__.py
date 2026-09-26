import os
import sys

# Ensure core directory is in sys.path so generated protobuf modules can resolve sibling imports
_core_dir = os.path.dirname(os.path.abspath(__file__))
if _core_dir not in sys.path:
    sys.path.insert(0, _core_dir)

