"""StylePickNode — picks a saved style and outputs its name, id, and value."""

import json
import os
from typing import Any

_DATA_FILE_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "style_mixer_data.json")
)


def _load_data() -> dict:
    if not os.path.exists(_DATA_FILE_PATH):
        return {"styles": [], "mixes": [], "current_mix_id": None}
    with open(_DATA_FILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _style_names() -> list[str]:
    data = _load_data()
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
            return os.path.getmtime(_DATA_FILE_PATH)
        except OSError:
            return float("nan")

    def execute(self, style: str) -> tuple[str, str, str]:
        data = _load_data()
        found = next((s for s in data.get("styles", []) if s["name"] == style), None)
        if found is None:
            return (style, "", "")
        return (found["name"], found["id"], found.get("value", "").strip())
