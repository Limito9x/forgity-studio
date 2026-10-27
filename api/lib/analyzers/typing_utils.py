import ast
from typing import Any, List, Optional, Tuple


def normalize_type_and_cardinality(annotation_node: Optional[ast.AST]) -> Tuple[str, str, Optional[List[str]]]:
    """
    Parses an AST annotation node and returns:
      - primitive_type: "Text" | "Number" | "Boolean" | "Struct" | "Unknown"
      - cardinality: "Single" | "Array" | "Map"
      - options: List of string options if Literal[...] is detected, else None
    """
    if annotation_node is None:
        return "Unknown", "Single", None

    # 1. Literal extraction
    options = extract_literal_options(annotation_node)
    if options is not None:
        return "Text", "Single", options

    # 2. Check for Optional[...] -> strip Optional wrapper
    if isinstance(annotation_node, ast.Subscript):
        base_id = _get_identifier(annotation_node.value)
        if base_id in ("Optional", "Union"):
            slice_node = annotation_node.slice
            if isinstance(slice_node, ast.Tuple):
                non_none = [e for e in slice_node.elts if not _is_none(e)]
                if len(non_none) == 1:
                    return normalize_type_and_cardinality(non_none[0])
                # Prioritize Map or Array over scalar fallback (e.g. Union[Dict[str, Any], str] -> Map)
                for candidate in non_none:
                    c_type, c_card, c_opts = normalize_type_and_cardinality(candidate)
                    if c_card in ("Map", "Array"):
                        return c_type, c_card, c_opts
                if non_none:
                    return normalize_type_and_cardinality(non_none[0])
            else:
                return normalize_type_and_cardinality(slice_node)

    # 3. Python 3.10+ pipe union: e.g. str | None or dict | str
    if isinstance(annotation_node, ast.BinOp) and isinstance(annotation_node.op, ast.BitOr):
        left, right = annotation_node.left, annotation_node.right
        if _is_none(right):
            return normalize_type_and_cardinality(left)
        if _is_none(left):
            return normalize_type_and_cardinality(right)
        l_type, l_card, l_opts = normalize_type_and_cardinality(left)
        r_type, r_card, r_opts = normalize_type_and_cardinality(right)
        if l_card in ("Map", "Array"):
            return l_type, l_card, l_opts
        if r_card in ("Map", "Array"):
            return r_type, r_card, r_opts
        return l_type, l_card, l_opts

    # 4. List / Sequence / Set -> Array
    if isinstance(annotation_node, ast.Subscript):
        base_id = _get_identifier(annotation_node.value)
        if base_id in ("List", "list", "Sequence", "Set", "set"):
            inner_type, _, inner_options = normalize_type_and_cardinality(annotation_node.slice)
            return inner_type if inner_type != "Unknown" else "Text", "Array", inner_options
        if base_id in ("Dict", "dict", "Mapping"):
            return "Text", "Map", None

    # 5. Base identifier matching
    id_name = _get_identifier(annotation_node).lower()
    if id_name in ("str", "string", "path", "filepath"):
        return "Text", "Single", None
    elif id_name in ("int", "float", "number"):
        return "Number", "Single", None
    elif id_name in ("bool", "boolean"):
        return "Boolean", "Single", None
    elif id_name in ("dict", "map", "mapping"):
        return "Text", "Map", None
    elif id_name in ("list", "tuple", "set", "array"):
        return "Text", "Array", None

    return "Text", "Single", None


def extract_literal_options(node: ast.AST) -> Optional[List[str]]:
    """Extracts string values if node is Literal['a', 'b', ...]"""
    if isinstance(node, ast.Subscript):
        base_id = _get_identifier(node.value)
        if base_id in ("Literal", "typing.Literal"):
            slice_node = node.slice
            elts = slice_node.elts if isinstance(slice_node, ast.Tuple) else [slice_node]
            options: List[str] = []
            for elt in elts:
                val = _extract_constant_val(elt)
                if val is not None:
                    options.append(str(val))
            return options if options else None
    return None


def extract_default_value(default_node: Optional[ast.AST]) -> Any:
    """Safely extracts static default values without eval()."""
    if default_node is None:
        return None
    if isinstance(default_node, ast.Constant):
        return default_node.value
    if isinstance(default_node, ast.List):
        return [_extract_constant_val(elt) for elt in default_node.elts if _extract_constant_val(elt) is not None]
    if isinstance(default_node, ast.Dict):
        res = {}
        for k, v in zip(default_node.keys, default_node.values):
            if k is not None:
                kval = _extract_constant_val(k)
                vval = _extract_constant_val(v)
                if kval is not None:
                    res[str(kval)] = vval
        return res
    if isinstance(default_node, ast.Name):
        if default_node.id == "None":
            return None
        if default_node.id == "True":
            return True
        if default_node.id == "False":
            return False
    return None


def _extract_constant_val(node: ast.AST) -> Any:
    if isinstance(node, ast.Constant):
        return node.value
    return None


def _get_identifier(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    elif isinstance(node, ast.Attribute):
        return f"{_get_identifier(node.value)}.{node.attr}"
    return ""


def _is_none(node: ast.AST) -> bool:
    if isinstance(node, ast.Constant) and node.value is None:
        return True
    if isinstance(node, ast.Name) and node.id == "None":
        return True
    return False
