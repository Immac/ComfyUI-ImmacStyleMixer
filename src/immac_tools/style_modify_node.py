"""StyleModifyNode — updates an existing style in style_mixer_data.json."""

import os

from comfy_api.latest import io

from ._style_utils import DATA_FILE_PATH, apply_image, load_data, save_data


class StyleModifyNode(io.ComfyNode):
    """Updates an existing style entry in the Style Mixer data file.

    Requires a style_id (typically piped from a Style Pick node).
    All other inputs are optional — empty/unconnected fields are left unchanged.

    This node never creates a new style; use the Create Style node for that.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="StyleModifyImmacStyleMixer",
            display_name="Modify Style",
            category="Immac/Style Mixer",
            is_output_node=True,
            description=(
                "Updates an existing style in the Style Mixer data file.\n"
                "\n"
                "style_id is required and must be wired in (e.g. from a Style Pick node).\n"
                "All other inputs are optional — leave them empty to keep the existing value.\n"
                "\n"
                "To create a new style, use the Create Style node instead."
            ),
            inputs=[
                io.String.Input("style_id", force_input=True),
                io.String.Input("name", optional=True, default="", multiline=False),
                io.String.Input("value", optional=True, default="", multiline=True),
                io.Boolean.Input("favorite", optional=True, default=False),
                io.Image.Input("example_image", optional=True),
            ],
            outputs=[
                io.String.Output(display_name="style_id"),
                io.String.Output(display_name="style_value"),
            ],
        )

    @classmethod
    def fingerprint_inputs(cls, **_kwargs) -> float:
        try:
            return os.path.getmtime(DATA_FILE_PATH)
        except OSError:
            return float("nan")

    @classmethod
    def execute(
        cls,
        style_id: str,
        name: str = "",
        value: str = "",
        favorite: bool = False,
        example_image=None,
    ) -> io.NodeOutput:
        style_id = (style_id or "").strip()
        name = (name or "").strip()
        value = (value or "").strip()

        if not style_id:
            raise ValueError("[StyleModifyNode] 'style_id' must not be empty.")

        data = load_data()
        styles: list[dict] = data.setdefault("styles", [])

        style = next((s for s in styles if s.get("id") == style_id), None)
        if style is None:
            raise RuntimeError(
                f"[StyleModifyNode] No style found with id='{style_id}'."
            )

        if name:
            style["name"] = name
        if value:
            style["value"] = value
        style["favorite"] = favorite if favorite is not None else style.get("favorite", False)
        apply_image(style, example_image, style.get("name", ""), force=True)

        save_data(data)
        return io.NodeOutput(style["id"], style["value"])
