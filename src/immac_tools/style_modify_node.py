"""StyleModifyNode — updates an existing style in style_mixer_data.json."""

import os
from typing import Any

from ._style_utils import DATA_FILE_PATH, apply_image, load_data, save_data


class StyleModifyNode:
    """Updates an existing style entry in the Style Mixer data file.

    Requires a style_id (typically piped from a Style Pick node).
    All other inputs are optional — empty/unconnected fields are left unchanged.

    This node never creates a new style; use the Create Style node for that.
    """

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "style_id": ("STRING", {"forceInput": True}),
            },
            "optional": {
                "name": ("STRING", {"default": "", "multiline": False}),
                "value": ("STRING", {"default": "", "multiline": True}),
                "favorite": ("BOOLEAN", {"default": False}),
                "example_image": ("IMAGE", {}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("style_id", "style_value")
    OUTPUT_NODE = True
    FUNCTION = "execute"
    CATEGORY = "Immac/Style Mixer"
    DESCRIPTION = (
        "Updates an existing style in the Style Mixer data file.\n"
        "\n"
        "style_id is required and must be wired in (e.g. from a Style Pick node).\n"
        "All other inputs are optional — leave them empty to keep the existing value.\n"
        "\n"
        "To create a new style, use the Create Style node instead."
    )

    @classmethod
    def IS_CHANGED(cls, **_kwargs: Any) -> float:
        try:
            return os.path.getmtime(DATA_FILE_PATH)
        except OSError:
            return float("nan")

    def execute(
        self,
        style_id: str,
        name: str = "",
        value: str = "",
        favorite: bool = False,
        example_image: Any = None,
    ) -> tuple[str, str]:
        style_id = style_id.strip()
        name = name.strip()
        value = value.strip()

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
        style["favorite"] = favorite
        apply_image(style, example_image, style.get("name", ""), force=True)

        save_data(data)
        return (style["id"], style["value"])
