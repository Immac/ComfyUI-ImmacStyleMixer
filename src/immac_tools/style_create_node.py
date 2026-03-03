"""StyleCreateNode — creates a new style in style_mixer_data.json."""

import os
import uuid
from typing import Any

from ._style_utils import DATA_FILE_PATH, apply_image, load_data, save_data

_IF_EXISTS_MODES = [
    "Fail",  # Raise an error if a style with this name already exists
    "Skip",  # Return the existing style unchanged, do nothing
]


class StyleCreateNode:
    """Creates a new style entry in the Style Mixer data file.

    Use 'if_exists' to control behaviour when a style with the same name
    already exists:
      Fail — raises an error (default, prevents accidental overwrites).
      Skip — returns the existing style unchanged.

    To update an existing style, use the Modify Style node instead.
    """

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "name": ("STRING", {"default": "", "multiline": False}),
                "value": ("STRING", {"default": "", "multiline": True}),
                "if_exists": (_IF_EXISTS_MODES, {"default": "Fail"}),
            },
            "optional": {
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
        "Creates a new style in the Style Mixer data file.\n"
        "\n"
        "if_exists controls what happens when a style with the same name already exists:\n"
        "  Fail — raises an error (safe default).\n"
        "  Skip — returns the existing style unchanged.\n"
        "\n"
        "To update an existing style, use the Modify Style node."
    )

    @classmethod
    def IS_CHANGED(cls, **_kwargs: Any) -> float:
        try:
            return os.path.getmtime(DATA_FILE_PATH)
        except OSError:
            return float("nan")

    def execute(
        self,
        name: str,
        value: str,
        if_exists: str,
        favorite: bool = False,
        example_image: Any = None,
    ) -> tuple[str, str]:
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
            return (existing["id"], existing.get("value", ""))

        new_style: dict = {
            "id": str(uuid.uuid4()),
            "name": name,
            "value": value,
            "favorite": favorite,
            "image_filename": None,
        }
        apply_image(new_style, example_image, name, force=False)
        styles.append(new_style)
        save_data(data)
        return (new_style["id"], new_style["value"])
