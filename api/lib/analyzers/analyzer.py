import ast
import json
import os
import re
from typing import Any, Dict, List, Optional

from .context import ASTAnalysisContext
from .docstring import clean_docstring, extract_options_from_docstring, extract_file_hint
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
            base_name = os.path.splitext(os.path.basename(file_name))[0] if file_name else "InvalidScript"
            return {
                "error": f"Python Syntax Error: {e.msg} at line {e.lineno}",
                "suggestedName": base_name,
                "suggestedLabel": base_name,
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

        # 4. Locate Entry Function
        entry_func = self._find_entry_point(ctx.tree)
        module_doc = ast.get_docstring(ctx.tree) or ""
        func_doc = ast.get_docstring(entry_func) if entry_func else ""
        summary, clean_desc, param_descs = clean_docstring(func_doc or module_doc)

        # 4b. Discover Composite Structs (TypedDict / @dataclass)
        detected_structs = self._discover_structs(ctx.tree)

        # 5. Parse Inputs
        inputs = self._parse_inputs(entry_func, param_descs, detected_structs)

        # 6. Discover Outputs via Strategy Chain
        outputs: List[Dict[str, Any]] = []
        if entry_func:
            for strategy in self.output_strategies:
                outputs = strategy.discover(entry_func, func_doc or module_doc)
                if outputs:
                    break
        if not outputs:
            outputs = [{"name": "result", "dataType": "Text", "cardinality": "Single", "description": "Output"}]

        # 7. Dynamic Dependencies Resolution
        dependencies = self.dep_resolver.resolve(ctx.imported_modules, active_executor.dcc_builtins)

        return {
            "suggestedName": base_name,
            "suggestedLabel": suggested_label,
            "executor": active_executor.name,
            "summary": summary,
            "description": clean_desc,
            "inputs": inputs,
            "outputs": outputs,
            "detectedStructs": detected_structs,
            "dependencies": dependencies,
            "warnings": []
        }

    def _discover_structs(self, tree: ast.AST) -> List[Dict[str, Any]]:
        structs: List[Dict[str, Any]] = []
        for node in getattr(tree, "body", []):
            if not isinstance(node, ast.ClassDef):
                continue

            # Detect TypedDict or @dataclass
            is_typed_dict = any(
                (isinstance(base, ast.Name) and base.id == "TypedDict") or
                (isinstance(base, ast.Attribute) and base.attr == "TypedDict")
                for base in node.bases
            )
            is_dataclass = any(
                (isinstance(dec, ast.Name) and dec.id == "dataclass") or
                (isinstance(dec, ast.Attribute) and dec.attr == "dataclass") or
                (isinstance(dec, ast.Call) and isinstance(dec.func, (ast.Name, ast.Attribute)) and
                 getattr(dec.func, "id", getattr(dec.func, "attr", "")) == "dataclass")
                for dec in node.decorator_list
            )

            if not (is_typed_dict or is_dataclass):
                continue

            class_name = node.name
            slug = re.sub(r"[^a-zA-Z0-9_]+", "_", class_name).strip("_").lower()
            doc = ast.get_docstring(node) or ""
            fields: List[Dict[str, Any]] = []

            for item in node.body:
                if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                    fname = item.target.id
                    prim_type, card, opts = normalize_type_and_cardinality(item.annotation)
                    dval = extract_default_value(item.value) if item.value else None

                    # Map AST type names to Studio primitive types
                    field_type = "String"
                    if prim_type == "Number":
                        field_type = "Number"
                    elif prim_type == "Boolean":
                        field_type = "Boolean"
                    elif prim_type == "Asset":
                        field_type = "Asset"
                    else:
                        field_type = "String"

                    fields.append({
                        "name": fname,
                        "label": re.sub(r"[_\-]+", " ", fname).title(),
                        "type": field_type,
                        "cardinality": card,
                        "defaultValue": dval,
                        "options": opts
                    })

            if fields:
                structs.append({
                    "slug": slug,
                    "displayName": class_name,
                    "description": doc,
                    "fields": fields
                })

        return structs

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

    def _parse_inputs(
        self,
        entry_func: Optional[ast.FunctionDef],
        param_descs: Dict[str, str],
        detected_structs: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        inputs: List[Dict[str, Any]] = []
        if not entry_func:
            return inputs

        struct_map = {s["displayName"].lower(): s["slug"] for s in (detected_structs or [])}

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

            # Check if annotation directly matches a detected Struct name
            matched_struct_type = None
            if arg.annotation:
                raw_type_name = getattr(arg.annotation, "id", getattr(arg.annotation, "attr", "")).lower()
                if raw_type_name in struct_map:
                    prim_type = "Struct"
                    matched_struct_type = struct_map[raw_type_name]

            desc = param_descs.get(name, "")

            # 1. Check for explicit or heuristic file/asset hint
            file_hint = extract_file_hint(name, desc)
            metadata_hint: Optional[str] = None

            if file_hint and file_hint[0]:
                prim_type = "Asset"
                hint_dict: Dict[str, Any] = {"type": "file"}
                if file_hint[1]:
                    hint_dict["accept"] = file_hint[1]
                metadata_hint = json.dumps(hint_dict)
            else:
                # Heuristic fallback: if options is None, inspect docstring
                if options is None and desc:
                    doc_options = extract_options_from_docstring(desc)
                    if doc_options:
                        options = doc_options

                # Format metadata hint payload for FormRenderer
                if options:
                    control_type = "tagsInput" if cardinality == "Array" else "select"
                    metadata_hint = json.dumps({"type": control_type, "options": options})

            input_entry: Dict[str, Any] = {
                "name": name,
                "label": re.sub(r"[_\-]+", " ", name).title(),
                "dataType": prim_type,
                "cardinality": cardinality,
                "required": is_required,
                "defaultValue": default_val,
                "options": options,
                "metadata": metadata_hint,
                "description": desc
            }
            if matched_struct_type:
                input_entry["structType"] = matched_struct_type

            inputs.append(input_entry)

        return inputs
