"""StyleBlendNode — merges weighted style strings into a single prompt using growing slots."""

from comfy_api.latest import io


class StyleBlendNode(io.ComfyNode):
    """Accepts growing style string inputs (Autogrow) and joins them into one prompt."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        autogrow_template = io.Autogrow.TemplatePrefix(
            input=io.String.Input("style", force_input=True),
            prefix="style",
            min=1,
            max=16,
        )
        return io.Schema(
            node_id="StyleBlendImmacStyleMixer",
            display_name="Style Blend",
            category="Immac/Style Mixer",
            description=(
                "Combines weighted style strings (from Weight Style nodes) "
                "into a single comma-separated prompt. Slots grow automatically."
            ),
            inputs=[
                io.Autogrow.Input("styles", template=autogrow_template),
            ],
            outputs=[
                io.String.Output(display_name="prompt"),
            ],
        )

    @classmethod
    def execute(cls, styles: io.Autogrow.Type) -> io.NodeOutput:
        parts = [str(v).strip() for v in styles.values() if v and str(v).strip()]
        return io.NodeOutput(", ".join(parts))
