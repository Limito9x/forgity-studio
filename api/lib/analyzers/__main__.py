import json
import os
import sys

# Ensure local package can be imported directly when running as a standalone script
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from analyzers.analyzer import PythonScriptAnalyzer


def main():
    if len(sys.argv) > 1 and sys.argv[1] not in ("-", "--stdin"):
        target_path = sys.argv[1]
        if not os.path.isfile(target_path):
            print(json.dumps({"error": f"File not found: {target_path}"}), file=sys.stderr)
            sys.exit(1)
        with open(target_path, "r", encoding="utf-8") as f:
            code = f.read()
        file_name = os.path.basename(target_path)
    else:
        code = sys.stdin.read()
        file_name = sys.argv[2] if len(sys.argv) > 2 else "script.py"

    analyzer = PythonScriptAnalyzer()
    result = analyzer.analyze(code, file_name=file_name)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
