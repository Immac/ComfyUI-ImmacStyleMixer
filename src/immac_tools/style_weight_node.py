"""StyleWeightNode — pairs a style_id with a weight for use in StyleBlendNode."""

import json
import os

from comfy_api.latest import io

from ._style_utils import DATA_FILE_PATH, load_data


class StyleWeightNode(io.ComfyNode):
    """Pairs a style_id with a weight, producing a style_entry JSON for StyleBlendNode.

    Connect style_id from a Style Pick node.
    The style_entry output feeds into a Style Blend node.
    weighted_value is a convenience string for direct preview/use.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="StyleWeightImmacStyleMixer",
            display_name="Weight Style",
            category="Immac/Style Mixer",
            description=(
                "Pairs a style_id (from Style Pick) with a weight.\n"
                "Outputs a style_entry JSON for the Style Blend node,\n"
                "plus a weighted_value string for immediate preview/use."
            ),
            inputs=[
                io.String.Input("style_id", force_input=True),
                io.Float.Input(
                    "weight",
                    default=1.0,
                    min=-10.0,
                    max=10.0,
                    step=0.01,
                    display_mode="slider",
                ),
            ],
            outputs=[
                io.String.Output(display_name="style_entry"),
                io.String.Output(display_name="weighted_value"),
            ],
        )

    @classmethod
    def fingerprint_inputs(cls, **_kwargs) -> float:
        try:
            return os.path.getmtime(DATA_FILE_PATH)
        except OSError:
            return float("nan")

    @classmethod
    def execute(cls, style_id: str, weight: float) -> io.NodeOutput:
        style_id = (style_id or "").strip()
        entry = json.dumps({"style_id": style_id, "weight": round(weight, 4)})

        # Build weighted_value by looking up the style in the data file
        data = load_data()
        style = next((s for s in data.get("styles", []) if s["id"] == style_id), None)
        value = (style.get("value", "") if style else "").strip()

        if not value or weight < 1e-9:
            weighted_value = ""
        elif abs(weight - 1.0) < 1e-6:
            weighted_value = value
        else:
            weighted_value = f"({value}:{weight:.2f})"

        return io.NodeOutput(entry, weighted_value)
