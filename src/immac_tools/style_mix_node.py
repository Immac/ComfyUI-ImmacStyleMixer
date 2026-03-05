"""PickMixNode — picks a saved mix and outputs its assembled prompt string and id."""

import json
import os

from comfy_api.latest import io

from ._style_utils import build_negative

_DATA_FILE_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "style_mixer_data.json")
)

_NEGATIVE_MODE = [
    "assembled",
    "mix_override",
    "both",
]


def _load_data() -> dict:
    if not os.path.exists(_DATA_FILE_PATH):
        return {"styles": [], "mixes": [], "current_mix_id": None}
    with open(_DATA_FILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _mix_names() -> list[str]:
    data = _load_data()
    names = [m["name"] for m in data.get("mixes", [])]
    return names if names else ["(no mixes saved)"]


def _resolve_mix(mix_name: str) -> tuple[str, str, dict | None]:
    """Return (prompt, mix_id, mix_dict) for the given mix name."""
    data = _load_data()
    styles_by_id = {s["id"]: s for s in data.get("styles", [])}
    mix = next((m for m in data.get("mixes", []) if m["name"] == mix_name), None)
    if mix is None:
        return "", "", None

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
        if weight < 1e-9:
            continue
        if abs(weight - 1.0) < 1e-6:
            parts.append(value)
        else:
            parts.append(f"({value}:{weight:.2f})")

    return ", ".join(parts), mix.get("id", ""), mix


class PickMixNode(io.ComfyNode):
    """Outputs the assembled prompt string and id for a saved style mix."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PickMixImmacStyleMixer",
            display_name="Pick Mix",
            category="Immac/Style Mixer",
            description="Outputs the prompt text and id assembled from the selected style mix.",
            inputs=[
                io.Combo.Input("mix", options=_mix_names()),
                io.Combo.Input(
                    "negative_mode",
                    options=_NEGATIVE_MODE,
                    default="assembled",
                ),
            ],
            outputs=[
                io.String.Output(display_name="prompt"),
                io.String.Output(display_name="mix_id"),
                io.String.Output(display_name="negative"),
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
    def execute(cls, mix: str, negative_mode: str = "assembled") -> io.NodeOutput:
        prompt, mix_id, mix_dict = _resolve_mix(mix)
        if mix_dict is None:
            return io.NodeOutput(prompt, mix_id, "")

        data = _load_data()
        styles_by_id = {s["id"]: s for s in data.get("styles", [])}
        active_entries = [
            e for e in mix_dict.get("styles", []) if e.get("enabled", True)
        ]

        assembled_neg = build_negative(active_entries, styles_by_id)
        mix_neg = mix_dict.get("negative", "").strip()

        if negative_mode == "assembled":
            negative = assembled_neg
        elif negative_mode == "mix_override":
            negative = mix_neg
        else:  # "both"
            parts = [p for p in (assembled_neg, mix_neg) if p]
            negative = ", ".join(parts)

        return io.NodeOutput(prompt, mix_id, negative)


# Keep old name as alias for backward compatibility with existing workflows
StyleMixNode = PickMixNode
