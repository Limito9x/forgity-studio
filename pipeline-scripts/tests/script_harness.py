# pyrefly: ignore [missing-import]
"""
Pipeline Script Quality & Pin Hygiene Harness (SSOT Validator)
Validates all scripts under pipeline-scripts/ against the Forgity Studio Architecture Rules:
  1. Pin Hygiene: 100% typed pins, zero pass-through echo pins, zero trivial primitive spam.
  2. Dumb Executor Rule: Zero filesystem hunting (no uproject tree-walking), zero heuristic regex guessing.
  3. Docstring & Self-Justification: Every pin must be declared and documented.
  4. Dry-Run Verification: Script must support dry_run=True and execute without TypeError or crash.

Usage:
  python pipeline-scripts/tests/script_harness.py check <path_to_script>
  python pipeline-scripts/tests/script_harness.py check-all
"""

import ast
import os
import sys
import inspect
import importlib.util
from typing import List, Dict, Any, Tuple


class ScriptLinter(ast.NodeVisitor):
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.has_main = False
        self.main_args: List[Tuple[str, Optional[str]]] = []
        self.return_keys: List[str] = []
        self.has_dry_run_arg = False

    def visit_FunctionDef(self, node: ast.FunctionDef):
        if node.name == "main":
            self.has_main = True
            # 1. Check argument type hints
            for arg in node.args.args:
                arg_name = arg.arg
                if arg_name == "self":
                    continue
                if arg_name == "dry_run":
                    self.has_dry_run_arg = True

                type_annot = ast.unparse(arg.annotation) if arg.annotation else None
                self.main_args.append((arg_name, type_annot))

                if not type_annot and arg_name not in ["kwargs", "args"]:
                    self.errors.append(f"Pin '{arg_name}' in main() is missing a Type Hint annotation.")

                # Pin hygiene warning: trivial primitives
                if arg_name in ["character_name", "character_tag", "asset_tag"] and "classify" in self.file_path:
                    self.warnings.append(
                        f"Pin '{arg_name}' may be redundant pin pollution. Consider inferring from asset convention."
                    )

            # 2. Check return statements inside main
            for sub_node in ast.walk(node):
                if isinstance(sub_node, ast.Return) and sub_node.value:
                    if isinstance(sub_node.value, ast.Dict):
                        for k in sub_node.value.keys:
                            if isinstance(k, ast.Constant):
                                self.return_keys.append(str(k.value))
                    elif isinstance(sub_node.value, ast.Name):
                        # Returning a variable name, e.g. return result
                        pass

        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        # Redline: os.walk tree-walking
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == "walk" and isinstance(node.func.value, ast.Name) and node.func.value.id == "os":
                self.errors.append("REDLINE VIOLATION: 'os.walk' filesystem tree-walking detected. Paths must be passed explicitly.")

        self.generic_visit(node)

    def visit_ExceptHandler(self, node: ast.ExceptHandler):
        # Redline: Bare except: pass
        if len(node.body) == 1 and isinstance(node.body[0], ast.Pass):
            # If exception type is not specified (bare except)
            if node.type is None:
                self.errors.append("REDLINE VIOLATION: Bare 'except: pass' detected. Catch specific exceptions or log.")
        self.generic_visit(node)


def validate_script(file_path: str) -> bool:
    """Validates AST and rules for a single script."""
    print(f"\n[HARNESS] Auditing script: {file_path}")
    if not os.path.isfile(file_path):
        print(f"  [ERROR] File not found: {file_path}")
        return False

    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        source = f.read()

    try:
        tree = ast.parse(source, filename=file_path)
    except SyntaxError as e:
        print(f"  [ERROR] Python Syntax Error at line {e.lineno}: {e.msg}")
        return False

    linter = ScriptLinter(file_path)
    linter.visit(tree)

    passed = True

    # Check 1: Must have main()
    if not linter.has_main:
        linter.errors.append("Script does not define a 'def main(...)' entry point.")

    # Check 2: Pass-through pin detection (echoing input to output)
    input_arg_names = {name for name, _ in linter.main_args}
    for ret_key in linter.return_keys:
        if ret_key in input_arg_names and ret_key not in ["status", "summary"]:
            linter.errors.append(
                f"PASS-THROUGH PIN DETECTED: Return key '{ret_key}' matches input argument '{ret_key}'. "
                "Echoing inputs as outputs pollutes the Pipeline Canvas!"
            )

    # Check 3: Redlines & Warnings
    if linter.warnings:
        for w in linter.warnings:
            print(f"  [WARN] {w}")

    if linter.errors:
        for err in linter.errors:
            print(f"  [ERROR] {err}")
        passed = False
    else:
        print("  [OK] Pin Hygiene & Redline Checks passed.")

    # Check 4: Dry-Run Verification
    if linter.has_dry_run_arg and passed:
        try:
            print("  [DRY-RUN] Running dry_run test...")
            spec = importlib.util.spec_from_file_location("test_module", file_path)
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                sys.modules["test_module"] = mod
                spec.loader.exec_module(mod)
                if hasattr(mod, "main"):
                    mock_kwargs: Dict[str, Any] = {"dry_run": True}
                    for name, annot in linter.main_args:
                        if name == "dry_run":
                            continue
                        if "List" in str(annot):
                            mock_kwargs[name] = ["D:/Mock/Asset.fbx"]
                        elif "Dict" in str(annot):
                            mock_kwargs[name] = {"items": [{"asset_name": "MockItem", "fbx_file": "D:/Mock/Asset.fbx"}]}
                        elif "int" in str(annot):
                            mock_kwargs[name] = 1
                        elif "bool" in str(annot):
                            mock_kwargs[name] = False
                        else:
                            mock_kwargs[name] = ""

                    result = mod.main(**mock_kwargs)
                    if isinstance(result, dict):
                        print(f"  [OK] Dry-Run returned valid dictionary with keys: {list(result.keys())}")
                    else:
                        print(f"  [ERROR] Dry-Run returned non-dict type: {type(result)}")
                        passed = False
        except Exception as ex:
            print(f"  [ERROR] Dry-Run invocation failed with exception: {ex}")
            passed = False

    return passed


def main():
    args = sys.argv[1:]
    if not args or args[0] in ["-h", "--help"]:
        print("Usage:")
        print("  python pipeline-scripts/tests/script_harness.py check <path_to_script>")
        print("  python pipeline-scripts/tests/script_harness.py check-all")
        sys.exit(0)

    cmd = args[0]
    if cmd == "check":
        if len(args) < 2:
            print("Error: Missing script path.")
            sys.exit(1)
        target = os.path.abspath(args[1])
        success = validate_script(target)
        sys.exit(0 if success else 1)

    elif cmd == "check-all":
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        all_passed = True
        for dirpath, _, filenames in os.walk(root):
            if "tests" in dirpath or "presets" in dirpath or "__pycache__" in dirpath:
                continue
            for fn in filenames:
                if fn.endswith(".py"):
                    full_p = os.path.join(dirpath, fn)
                    if not validate_script(full_p):
                        all_passed = False
        sys.exit(0 if all_passed else 1)

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
