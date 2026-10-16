import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
workers_root = os.path.dirname(current_dir)
if workers_root not in sys.path:
    sys.path.insert(0, workers_root)
if os.path.join(workers_root, "core") not in sys.path:
    sys.path.insert(0, os.path.join(workers_root, "core"))

from commands.purge import run

if __name__ == "__main__":
    run()
