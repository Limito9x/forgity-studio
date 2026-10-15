import re
import os


def sanitize_filename(name: str) -> str:
    r"""
    Sanitize string for use in file names across Windows and Linux.
    Replaces illegal characters (\, /, :, *, ?, ", <, >, |) with underscore.
    """
    if not name:
        return ""
    # Replace illegal characters
    cleaned = re.sub(r'[\\/*?:"<>|]', "_", str(name))
    # Replace consecutive spaces or underscores
    cleaned = re.sub(r'[\s_]+', "_", cleaned)
    return cleaned.strip("._")


def format_naming_template(template: str, context: dict) -> str:
    """
    Format naming template string with safe fallback and sanitization.
    Example:
      template = "{content_name}_{slot}_{tag}.fbx"
      context = {"content_name": "Eva", "slot": "hair", "tag": "Noki"}
      result => "Eva_hair_Noki.fbx"
    """
    if not template:
        template = "{slot}_{tag}.fbx"

    def _replace_match(match):
        key = match.group(1)
        val = context.get(key)
        if val is None:
            # Try case-insensitive lookup
            for k, v in context.items():
                if k.lower() == key.lower():
                    val = v
                    break
        if val is None:
            return ""
        return sanitize_filename(str(val))

    formatted = re.sub(r'\{(\w+)\}', _replace_match, template)
    return formatted
