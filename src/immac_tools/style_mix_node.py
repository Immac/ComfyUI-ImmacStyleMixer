"""StyleMixNode — picks a saved mix and outputs its assembled prompt string."""

import json
import os
from typing import Any

_DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "style_mixer_data.json")


def _load_data() -> dict:
    path = os.path.normpath(_DATA_FILE)
    if not os.path.exists(path):
        return {"styles": [], "mixes": [], "current_mix_id": None}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _mix_names() -> list[str]:
    data = _load_data()
    names = [m["name"] for m in data.get("mixes", [])]
    return names if names else ["(no mixes saved)"]


def _build_prompt(mix_name: str) -> str:
    data = _load_data()
    styles_by_id = {s["id"]: s for s in data.get("styles", [])}
    mix = next((m for m in data.get("mixes", []) if m["name"] == mix_name), None)
    if mix is None:
        return ""

    parts: list[str] = []
    for entry in mix.get("styles", []):
        if not entry.get("enabled", True):
            continue
        style = styles_by_id.get(entry["style_id"])
        if style is None:
            continue
        value: str = style.get("value", "").strip()
        if not value:
            continue
        weight: float = float(entry.get("weight", 1.0))
        if abs(weight - 1.0) < 1e-6:
            parts.append(value)
        else:
            parts.append(f"({value}:{weight:.2f})")

    return ", ".join(parts)


class StyleMixNode:
    """Outputs the assembled prompt string for a saved style mix."""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "mix": (_mix_names(), {}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "execute"
    CATEGORY = "Immac/Style Mixer"
    DESCRIPTION = "Outputs the prompt text assembled from the selected style mix."

    def execute(self, mix: str) -> tuple[str]:
        return (_build_prompt(mix),)
