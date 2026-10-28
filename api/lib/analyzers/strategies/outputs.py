import ast
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from .base import OutputDiscoveryStrategy
from ..typing_utils import normalize_type_and_cardinality, _extract_constant_val


class ReturnDictInspectionStrategy(OutputDiscoveryStrategy):
    """
    Inspects return statements returning dictionary literals.
    Traces local variable type annotations in function scope to determine exact cardinality.
    """

    def discover(self, func_node: ast.FunctionDef, raw_doc: Optional[str]) -> List[Dict[str, Any]]:
        # Index local variable type annotations e.g. body_mesh: List[str] = []
        local_var_types: Dict[str, Tuple[str, str]] = {}
        for stmt in ast.walk(func_node):
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                p_type, card, _ = normalize_type_and_cardinality(stmt.annotation)
                local_var_types[stmt.target.id] = (p_type, card)

        outputs: List[Dict[str, Any]] = []
        seen: Set[str] = set()

        for node in ast.walk(func_node):
            if isinstance(node, ast.Return) and isinstance(node.value, ast.Dict):
                for k, v in zip(node.value.keys, node.value.values):
                    if k is not None:
                        key_name = _extract_constant_val(k)
                        if key_name and str(key_name) not in seen:
                            name = str(key_name)
                            seen.add(name)

                            cardinality = "Single"
                            prim_type = "Text"

                            # 1. Direct AST literal value check
                            if isinstance(v, ast.List):
                                cardinality = "Array"
                            elif isinstance(v, ast.Dict):
                                cardinality = "Map"
                            elif isinstance(v, ast.Name) and v.id in local_var_types:
                                # 2. Local variable annotation trace
                                prim_type, cardinality = local_var_types[v.id]
                            else:
                                # 3. Plural / Suffix naming conventions
                                if name.endswith("es") or name.endswith("s") or name.endswith("_list"):
                                    cardinality = "Array"
                                elif name.endswith("_map") or name.endswith("_dict"):
                                    cardinality = "Map"

                            outputs.append({
                                "name": name,
                                "dataType": prim_type,
                                "cardinality": cardinality,
                                "description": f"Output property '{name}'"
                            })

        return outputs


class DocstringOutputsStrategy(OutputDiscoveryStrategy):
    """Fallback strategy parsing Outputs: or Returns: section in docstring."""

    def discover(self, func_node: ast.FunctionDef, raw_doc: Optional[str]) -> List[Dict[str, Any]]:
        if not raw_doc:
            return []
        outputs: List[Dict[str, Any]] = []
        seen: Set[str] = set()

        in_returns = False
        for line in raw_doc.split("\n"):
            stripped = line.strip()
            if stripped.lower().startswith("outputs:") or stripped.lower().startswith("returns:"):
                in_returns = True
                continue
            if in_returns:
                if stripped.startswith("- ") or stripped.startswith("* "):
                    item = stripped[2:].strip()
                    parts = item.split(":", 1)
                    pin_name = re.sub(r"\(.*?\)", "", parts[0]).strip()
                    desc = parts[1].strip() if len(parts) > 1 else ""
                    if pin_name and re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", pin_name) and pin_name not in seen:
                        seen.add(pin_name)
                        cardinality = "Array" if "list" in item.lower() or "[]" in item else "Single"
                        if "dict" in item.lower() or "map" in item.lower():
                            cardinality = "Map"
                        outputs.append({
                            "name": pin_name,
                            "dataType": "Text",
                            "cardinality": cardinality,
                            "description": desc
                        })
                elif stripped and not (line.startswith("  ") or line.startswith("\t")):
                    in_returns = False

        return outputs


DEFAULT_OUTPUT_STRATEGIES: List[OutputDiscoveryStrategy] = [
    ReturnDictInspectionStrategy(),
    DocstringOutputsStrategy(),
]
