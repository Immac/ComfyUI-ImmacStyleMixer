"""StyleMixNode — picks a saved mix and outputs its assembled prompt string."""

import json
import os

from comfy_api.latest import io

_DATA_FILE_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "style_mixer_data.json")
)


def _load_data() -> dict:
    if not os.path.exists(_DATA_FILE_PATH):
        return {"styles": [], "mixes": [], "current_mix_id": None}
    with open(_DATA_FILE_PATH, "r", encoding="utf-8") as f:
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


class StyleMixNode(io.ComfyNode):
    """Outputs the assembled prompt string for a saved style mix."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="StyleMixImmacStyleMixer",
            display_name="Style Mix",
            category="Immac/Style Mixer",
            description="Outputs the prompt text assembled from the selected style mix.",
            inputs=[
                io.Combo.Input("mix", options=_mix_names()),
            ],
            outputs=[
                io.String.Output(display_name="prompt"),
            ],
        )

    @classmethod
    def fingerprint_inputs(cls, **_kwargs) -> float:
        """Return the data file's mtime so ComfyUI invalidates the cache on every save."""
        try:
            return os.path.getmtime(_DATA_FILE_PATH)
        except OSError:
            return float("nan")

    @classmethod
    def execute(cls, mix: str) -> io.NodeOutput:
        return io.NodeOutput(_build_prompt(mix))
