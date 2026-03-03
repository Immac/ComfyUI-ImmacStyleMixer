"""StylePickNode — picks a saved style and outputs its name, id, and value."""

import os
from typing import Any

from ._style_utils import DATA_FILE_PATH, load_data


def _style_names() -> list[str]:
    data = load_data()
    names = [s["name"] for s in data.get("styles", [])]
    return names if names else ["(no styles saved)"]


class StylePickNode:
    """Picks a saved style and outputs its name, id, and prompt value."""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "style": (_style_names(), {}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("style_name", "style_id", "style_value")
    FUNCTION = "execute"
    CATEGORY = "Immac/Style Mixer"
    DESCRIPTION = "Picks a saved style and outputs its name, id, and prompt value."

    @classmethod
    def IS_CHANGED(cls, style: str) -> float:
        """Invalidate cache whenever the data file changes."""
        try:
            return os.path.getmtime(DATA_FILE_PATH)
        except OSError:
            return float("nan")

    def execute(self, style: str) -> tuple[str, str, str]:
        data = load_data()
        found = next((s for s in data.get("styles", []) if s["name"] == style), None)
        if found is None:
            return (style, "", "")
        return (found["name"], found["id"], found.get("value", "").strip())
