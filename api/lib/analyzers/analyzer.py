import ast
import json
import os
import re
from typing import Any, Dict, List, Optional

from .context import ASTAnalysisContext
from .docstring import clean_docstring, extract_options_from_docstring
from .resolvers import DynamicDependencyResolver
from .strategies import (
    DEFAULT_EXECUTOR_STRATEGIES,
    DEFAULT_OUTPUT_STRATEGIES,
    ExecutorStrategy,
    GenericPythonExecutorStrategy,
    OutputDiscoveryStrategy,
)
from .typing_utils import extract_default_value, normalize_type_and_cardinality


class PythonScriptAnalyzer:
    """
    Facade orchestrating pluggable AST strategies to produce complete,
    standardized schemas for Automation Studio.
    """

    def __init__(
        self,
        executor_strategies: Optional[List[ExecutorStrategy]] = None,
        output_strategies: Optional[List[OutputDiscoveryStrategy]] = None,
        dep_resolver: Optional[DynamicDependencyResolver] = None,
    ):
        self.executor_strategies = executor_strategies or DEFAULT_EXECUTOR_STRATEGIES
        self.output_strategies = output_strategies or DEFAULT_OUTPUT_STRATEGIES
        self.dep_resolver = dep_resolver or DynamicDependencyResolver()

    def analyze(self, source_code: str, file_name: Optional[str] = None) -> Dict[str, Any]:
        try:
            ctx = ASTAnalysisContext(source_code, file_name)
        except SyntaxError as e:
            return {
                "error": f"Python Syntax Error: {e.msg} at line {e.lineno}",
                "suggestedName": file_name or "InvalidScript",
                "suggestedLabel": file_name or "Invalid Script",
                "executor": "python",
                "inputs": [],
                "outputs": [],
                "dependencies": []
            }

        # 1. Match Executor Strategy
        active_executor = next(
            (strategy for strategy in self.executor_strategies if strategy.matches(ctx)),
            GenericPythonExecutorStrategy()
        )

        # 2. Extract Names
        base_name = os.path.splitext(os.path.basename(file_name))[0] if file_name else "custom_script"
        suggested_label = re.sub(r"[_\-]+", " ", base_name).title()

        # 3. Locate Entry Function
        entry_func = self._find_entry_point(ctx.tree)
        module_doc = ast.get_docstring(ctx.tree) or ""
        func_doc = ast.get_docstring(entry_func) if entry_func else ""
        summary, clean_desc, param_descs = clean_docstring(func_doc or module_doc)

        # 4. Parse Inputs
        inputs = self._parse_inputs(entry_func, param_descs)

        # 5. Discover Outputs via Strategy Chain
        outputs: List[Dict[str, Any]] = []
        if entry_func:
            for strategy in self.output_strategies:
                outputs = strategy.discover(entry_func, func_doc or module_doc)
                if outputs:
                    break
        if not outputs:
            outputs = [{"name": "result", "dataType": "Text", "cardinality": "Single", "description": "Output"}]

        # 6. Dynamic Dependencies Resolution
        dependencies = self.dep_resolver.resolve(ctx.imported_modules, active_executor.dcc_builtins)

        return {
            "suggestedName": base_name,
            "suggestedLabel": suggested_label,
            "executor": active_executor.name,
            "summary": summary,
            "description": clean_desc,
            "inputs": inputs,
            "outputs": outputs,
            "dependencies": dependencies,
            "warnings": []
        }

    def _find_entry_point(self, tree: ast.AST) -> Optional[ast.FunctionDef]:
        alias_target: Optional[str] = None
        functions: Dict[str, ast.FunctionDef] = {}

        for node in getattr(tree, "body", []):
            if isinstance(node, ast.FunctionDef):
                functions[node.name] = node
            elif isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "main":
                        if isinstance(node.value, ast.Name):
                            alias_target = node.value.id

        if alias_target and alias_target in functions:
            return functions[alias_target]
        for candidate in ("main", "run", "execute"):
            if candidate in functions:
                return functions[candidate]
        if functions:
            return list(functions.values())[0]
        return None

    def _parse_inputs(self, entry_func: Optional[ast.FunctionDef], param_descs: Dict[str, str]) -> List[Dict[str, Any]]:
        inputs: List[Dict[str, Any]] = []
        if not entry_func:
            return inputs

        args = entry_func.args
        num_args = len(args.args)
        num_defaults = len(args.defaults)
        first_default_idx = num_args - num_defaults

        for i, arg in enumerate(args.args):
            name = arg.arg
            if name in ("self", "cls"):
                continue

            has_default = i >= first_default_idx
            default_val = None
            if has_default:
                default_idx = i - first_default_idx
                default_val = extract_default_value(args.defaults[default_idx])

            is_required = not has_default and default_val is None
            prim_type, cardinality, options = normalize_type_and_cardinality(arg.annotation)

            desc = param_descs.get(name, "")

            # Heuristic fallback: if options is None, inspect docstring
            if options is None and desc:
                doc_options = extract_options_from_docstring(desc)
                if doc_options:
                    options = doc_options

            # Format metadata hint payload for FormRenderer
            metadata_hint: Optional[str] = None
            if options:
                metadata_hint = json.dumps({"type": "select", "options": options})

            inputs.append({
                "name": name,
                "label": re.sub(r"[_\-]+", " ", name).title(),
                "dataType": prim_type,
                "cardinality": cardinality,
                "required": is_required,
                "defaultValue": default_val,
                "options": options,
                "metadata": metadata_hint,
                "description": desc
            })

        return inputs
