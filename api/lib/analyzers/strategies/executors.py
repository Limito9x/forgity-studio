import ast
from typing import List, Set
from .base import ExecutorStrategy
from ..context import ASTAnalysisContext


class UnrealExecutorStrategy(ExecutorStrategy):
    name = "unreal"
    dcc_builtins: Set[str] = {"unreal"}

    def matches(self, ctx: ASTAnalysisContext) -> bool:
        if "unreal" in ctx.imported_modules:
            return True
        for node in ctx.import_nodes:
            if "unreal" in ast.unparse(node):
                return True
        return False


class BlenderExecutorStrategy(ExecutorStrategy):
    name = "blender"
    dcc_builtins: Set[str] = {"bpy", "bmesh", "mathutils", "gpu", "aud", "bl_operators", "bl_ui"}

    def matches(self, ctx: ASTAnalysisContext) -> bool:
        if any(mod in ctx.imported_modules for mod in self.dcc_builtins):
            return True
        for node in ctx.import_nodes:
            unparsed = ast.unparse(node)
            if any(mod in unparsed for mod in self.dcc_builtins):
                return True
        return False


class GenericPythonExecutorStrategy(ExecutorStrategy):
    name = "python"
    dcc_builtins: Set[str] = set()

    def matches(self, ctx: ASTAnalysisContext) -> bool:
        return True  # Catch-all fallback


DEFAULT_EXECUTOR_STRATEGIES: List[ExecutorStrategy] = [
    UnrealExecutorStrategy(),
    BlenderExecutorStrategy(),
    GenericPythonExecutorStrategy(),
]
