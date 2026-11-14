import sys
import ast
from typing import Set, List, Optional

# Dynamic discovery of standard library modules (Python 3.10+)
STDLIB_MODULES: Set[str] = set(sys.stdlib_module_names) if hasattr(sys, "stdlib_module_names") else {
    "os", "sys", "time", "json", "math", "re", "typing", "collections", "itertools",
    "pathlib", "shutil", "subprocess", "logging", "hashlib", "importlib", "functools",
    "dataclasses", "abc", "copy", "tempfile", "traceback", "uuid", "socket", "threading",
    "asyncio", "argparse", "datetime", "enum", "io", "random", "struct", "urllib"
}


class ASTAnalysisContext:
    """Holds parsed AST and cross-cutting analysis caches for all strategies."""

    def __init__(self, source_code: str, file_name: Optional[str] = None):
        self.source_code = source_code
        self.file_name = file_name
        self.tree: ast.AST = ast.parse(source_code)
        self.imported_modules: Set[str] = set()
        self.import_nodes: List[ast.AST] = []
        self._index_imports()

    def _index_imports(self):
        for node in ast.walk(self.tree):
            if isinstance(node, ast.Import):
                self.import_nodes.append(node)
                for alias in node.names:
                    self.imported_modules.add(alias.name.split('.')[0])
            elif isinstance(node, ast.ImportFrom) and node.module:
                self.import_nodes.append(node)
                self.imported_modules.add(node.module.split('.')[0])
