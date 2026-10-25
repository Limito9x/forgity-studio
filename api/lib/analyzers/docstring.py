import re
from typing import Dict, List, Optional, Tuple


def clean_docstring(raw_doc: Optional[str]) -> Tuple[str, str, Dict[str, str]]:
    """
    Cleans Google/Sphinx style docstrings:
      - Extracts first line as summary.
      - Retains full markdown description.
      - Removes duplicate Args: / Returns: / Raises: sections from the clean description.
      - Maps parameter names to their parsed descriptions.
    """
    if not raw_doc or not raw_doc.strip():
        return "", "", {}

    lines = [line.rstrip() for line in raw_doc.strip().split("\n")]
    summary = lines[0].strip() if lines else ""

    in_args_section = False
    in_returns_section = False
    clean_desc_lines: List[str] = []
    param_descs: Dict[str, str] = {}
    current_param: Optional[str] = None
    param_pattern = re.compile(r"^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(\(.*?\))?\s*:\s*(.*)$")

    for line in lines:
        stripped = line.strip()
        lower = stripped.lower()

        if lower.startswith("args:") or lower.startswith("parameters:") or lower.startswith("consumes:"):
            in_args_section = True
            in_returns_section = False
            current_param = None
            continue
        elif lower.startswith("returns:") or lower.startswith("outputs:") or lower.startswith("yields:"):
            in_args_section = False
            in_returns_section = True
            current_param = None
            continue
        elif lower.startswith("raises:") or lower.startswith("example:"):
            in_args_section = False
            in_returns_section = False
            current_param = None

        if in_args_section:
            match = param_pattern.match(line)
            if match:
                current_param = match.group(1).strip()
                param_descs[current_param] = match.group(3).strip()
            elif current_param and (line.startswith("    ") or line.startswith("\t")):
                param_descs[current_param] += " " + stripped
        elif in_returns_section:
            pass
        else:
            clean_desc_lines.append(line)

    clean_description = "\n".join(clean_desc_lines).strip()
    return summary, clean_description, param_descs


def extract_options_from_docstring(param_desc: str) -> Optional[List[str]]:
    """
    Heuristic fallback to extract dropdown options from docstrings if Literal[...] was not used.
    Examples matched:
      - "Target provider ('gemini', 'openai', 'ollama'). Default 'gemini'."
      - "Mode: ['fast', 'quality', 'balanced']"
      - "'gemini', 'openai', or 'ollama'"
    """
    if not param_desc:
        return None

    # 1. Match bracketed lists e.g. ('a', 'b', 'c') or ['a', 'b', 'c']
    bracket_match = re.search(r"[\(\[]\s*([\'\"][a-zA-Z0-9_\-\.]+[\'\"].*?)[\)\]]", param_desc)
    if bracket_match:
        content = bracket_match.group(1)
        # Extract quoted words
        items = re.findall(r"[\'\"]([a-zA-Z0-9_\-\.]+)[\'\"]", content)
        if len(items) >= 2:
            return items

    # 2. Match comma-separated quoted options e.g. 'gemini', 'openai', or 'ollama'
    quotes = re.findall(r"[\'\"]([a-zA-Z0-9_\-\.]+)[\'\"]", param_desc)
    if len(quotes) >= 2:
        # Ignore common non-option words
        filtered = [q for q in quotes if q.lower() not in ("default", "optional", "required", "none", "true", "false")]
        if len(filtered) >= 2:
            return filtered

    return None
