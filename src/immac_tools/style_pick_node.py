"""PickStyleNode — picks a saved style and outputs its name, id, and value."""

import os

from comfy_api.latest import io

from ._style_utils import DATA_FILE_PATH, load_data


def _style_names() -> list[str]:
    data = load_data()
    names = [s["name"] for s in data.get("styles", [])]
    return names if names else ["(no styles saved)"]


class PickStyleNode(io.ComfyNode):
    """Picks a saved style and outputs its name, id, and prompt value."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PickStyleImmacStyleMixer",
            display_name="Pick Style",
            category="Immac/Style Mixer",
            description="Picks a saved style and outputs its name, id, and prompt value.",
            inputs=[
                io.Combo.Input("style", options=_style_names()),
            ],
            outputs=[
                io.String.Output(display_name="style_name"),
                io.String.Output(display_name="style_id"),
                io.String.Output(display_name="style_value"),
                io.String.Output(display_name="style_negative"),
            ],
        )

    @classmethod
    def fingerprint_inputs(cls, **_kwargs) -> float:
        """Invalidate cache whenever the data file changes."""
        try:
            return os.path.getmtime(DATA_FILE_PATH)
        except OSError:
            return float("nan")

    @classmethod
    def execute(cls, style: str) -> io.NodeOutput:
        data = load_data()
        found = next((s for s in data.get("styles", []) if s["name"] == style), None)
        if found is None:
            return io.NodeOutput(style, "", "", "")
        return io.NodeOutput(
            found["name"],
            found["id"],
            found.get("value", "").strip(),
            found.get("negative", "").strip(),
        )
