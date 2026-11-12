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
    if len(sys.argv) > 1 and sys.argv[1] == "--batch":
        try:
            raw_input = sys.stdin.read()
            payload = json.loads(raw_input) if raw_input.strip() else []
        except Exception as e:
            print(json.dumps({"error": f"Invalid JSON stdin: {str(e)}"}), file=sys.stderr)
            sys.exit(1)

        analyzer = PythonScriptAnalyzer()
        results = []
        for item in payload:
            key = item.get("key") or ""
            file_name = item.get("fileName") or (os.path.basename(item.get("path")) if item.get("path") else "script.py")
            content = item.get("content")
            if content is None and item.get("path") and os.path.isfile(item["path"]):
                try:
                    with open(item["path"], "r", encoding="utf-8") as f:
                        content = f.read()
                except Exception:
                    content = ""
            if content is None:
                content = ""

            try:
                analysis = analyzer.analyze(content, file_name=file_name)
            except Exception as ex:
                import traceback
                error_trace = traceback.format_exc()
                print(f"[__main__] Exception on {file_name}: {ex}\n{error_trace}", file=sys.stderr)
                base_name = os.path.splitext(file_name)[0]
                analysis = {
                    "error": str(ex),
                    "suggestedName": base_name,
                    "suggestedLabel": base_name,
                    "executor": "python",
                    "inputs": [],
                    "outputs": [],
                    "dependencies": []
                }
            analysis["key"] = key
            if "path" in item:
                analysis["path"] = item["path"]
            results.append(analysis)

        print(json.dumps(results, ensure_ascii=False))
        return

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
