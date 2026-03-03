"""StyleWeightNode — applies a float weight to a style value string."""

from comfy_api.latest import io


class StyleWeightNode(io.ComfyNode):
    """Wraps a style prompt value with a weight: (value:weight) or value if weight ≈ 1.0."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="StyleWeightImmacStyleMixer",
            display_name="Weight Style",
            category="Immac/Style Mixer",
            description=(
                "Applies a float weight to a style value. "
                "Outputs the value unchanged when weight ≈ 1.0, "
                "otherwise wraps it as (value:weight)."
            ),
            inputs=[
                io.String.Input("style_value", force_input=True),
                io.Float.Input(
                    "weight",
                    default=1.0,
                    min=0.0,
                    max=2.0,
                    step=0.01,
                    display_mode="slider",
                ),
            ],
            outputs=[
                io.String.Output(display_name="weighted_style"),
            ],
        )

    @classmethod
    def execute(cls, style_value: str, weight: float) -> io.NodeOutput:
        value = (style_value or "").strip()
        if not value:
            return io.NodeOutput("")
        if abs(weight - 1.0) < 1e-6:
            return io.NodeOutput(value)
        return io.NodeOutput(f"({value}:{weight:.2f})")
