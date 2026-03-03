"""StyleCreateNode — creates a new style in style_mixer_data.json."""

import uuid
import os

from comfy_api.latest import io

from ._style_utils import DATA_FILE_PATH, apply_image, load_data, save_data

_IF_EXISTS_MODES = [
    "Fail",  # Raise an error if a style with this name already exists
    "Skip",  # Return the existing style unchanged, do nothing
]


class StyleCreateNode(io.ComfyNode):
    """Creates a new style entry in the Style Mixer data file.

    Use 'if_exists' to control behaviour when a style with the same name
    already exists:
      Fail — raises an error (default, prevents accidental overwrites).
      Skip — returns the existing style unchanged.

    To update an existing style, use the Modify Style node instead.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="StyleCreateImmacStyleMixer",
            display_name="Create Style",
            category="Immac/Style Mixer",
            is_output_node=True,
            description=(
                "Creates a new style in the Style Mixer data file.\n"
                "\n"
                "if_exists controls what happens when a style with the same name already exists:\n"
                "  Fail — raises an error (safe default).\n"
                "  Skip — returns the existing style unchanged.\n"
                "\n"
                "To update an existing style, use the Modify Style node."
            ),
            inputs=[
                io.String.Input("name", default="", multiline=False),
                io.String.Input("value", default="", multiline=True),
                io.Combo.Input("if_exists", options=_IF_EXISTS_MODES, default="Fail"),
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
        name: str,
        value: str,
        if_exists: str,
        favorite: bool = False,
        example_image=None,
    ) -> io.NodeOutput:
        name = name.strip()
        value = value.strip()

        if not name:
            raise ValueError("[StyleCreateNode] 'name' must not be empty.")

        data = load_data()
        styles: list[dict] = data.setdefault("styles", [])

        existing = next((s for s in styles if s.get("name") == name), None)

        if existing is not None:
            if if_exists == "Fail":
                raise RuntimeError(
                    f"[StyleCreateNode] A style named '{name}' already exists "
                    f"(id={existing['id']}). Use 'Skip' or the Modify Style node."
                )
            # Skip — return existing unchanged
            return io.NodeOutput(existing["id"], existing.get("value", ""))

        new_style: dict = {
            "id": str(uuid.uuid4()),
            "name": name,
            "value": value,
            "favorite": favorite if favorite is not None else False,
            "image_filename": None,
        }
        apply_image(new_style, example_image, name, force=False)
        styles.append(new_style)
        save_data(data)
        return io.NodeOutput(new_style["id"], new_style["value"])
