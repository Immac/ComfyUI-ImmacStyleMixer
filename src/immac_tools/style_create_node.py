"""StyleCreateNode — creates or updates a style in style_mixer_data.json."""

import json
import os
import re
import time
import uuid
from typing import Any

import numpy as np
from PIL import Image

_DATA_FILE_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "style_mixer_data.json")
)

_IMAGE_SUBFOLDER = os.path.join("immac_style_mixer", "styles")

_CREATION_MODES = [
    "Create",           # Fail if a style with that name already exists
    "Create or Skip",   # No-op (return existing) if name already exists
    "Create or Update", # Upsert: create new, or overwrite value+favorite if exists
    "Overwrite",        # Always replace the matching style entirely
]


def _load_data() -> dict:
    if not os.path.exists(_DATA_FILE_PATH):
        return {"styles": [], "mixes": [], "current_mix_id": None}
    with open(_DATA_FILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_data(data: dict) -> None:
    with open(_DATA_FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _save_image_tensor(tensor: Any, style_name: str, existing_filename: str | None = None) -> str:
    """Save a ComfyUI IMAGE tensor ([B,H,W,C] float32 0-1) to the input folder.

    If *existing_filename* is provided the file is overwritten in place so that
    the stored filename reference in the JSON stays stable.
    Returns the filename (basename only) that was written.
    """
    import folder_paths  # available at runtime inside ComfyUI

    input_dir = folder_paths.get_input_directory()
    out_dir = os.path.join(input_dir, _IMAGE_SUBFOLDER)
    os.makedirs(out_dir, exist_ok=True)

    # Take the first frame, convert to uint8 PIL image
    frame = tensor[0]  # [H, W, C]
    arr = (frame.cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(arr)

    if existing_filename:
        # Overwrite the existing file in place — keeps the JSON reference stable
        filename = existing_filename
    else:
        # Generate a new unique filename
        safe = re.sub(r"[^\w\-]", "_", style_name)[:40]
        filename = f"style_{safe}_{uuid.uuid4().hex[:8]}.png"

    img.save(os.path.join(out_dir, filename))
    return filename


class StyleCreateNode:
    """Creates or updates a style entry in the Style Mixer data file."""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "name": ("STRING", {"default": "", "multiline": False}),
                "value": ("STRING", {"default": "", "multiline": True}),
                "creation_mode": (_CREATION_MODES, {"default": "Create or Update"}),
            },
            "optional": {
                "style_id": ("STRING", {"forceInput": True}),
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
        "Creates or updates a style in the Style Mixer data file.\n"
        "\n"
        "If style_id is connected (e.g. from a Style Pick node) the style is looked\n"
        "up by ID and the name is updated to match the name input.\n"
        "If only name is provided, lookup falls back to matching by name.\n"
        "\n"
        "Creation modes:\n"
        "  Create           — fails if a matching style already exists.\n"
        "  Create or Skip   — returns the existing style unchanged if one is found.\n"
        "  Create or Update — creates if new, overwrites value & favorite if exists.\n"
        "  Overwrite        — always replaces the matching style (create if missing)."
    )

    @classmethod
    def IS_CHANGED(cls, **_kwargs: Any) -> float:
        try:
            return os.path.getmtime(_DATA_FILE_PATH)
        except OSError:
            return float("nan")

    def execute(
        self,
        name: str,
        value: str,
        creation_mode: str,
        style_id: str = "",
        favorite: bool = False,
        example_image: Any = None,
    ) -> tuple[str, str]:
        name = name.strip()
        value = value.strip()
        style_id = style_id.strip()

        if not name:
            raise ValueError("[StyleCreateNode] 'name' must not be empty.")

        data = _load_data()
        styles: list[dict] = data.setdefault("styles", [])

        # Resolve the existing style: ID takes priority over name.
        # When found by ID, also update the name field so renames propagate.
        existing: dict | None = None
        if style_id:
            existing = next((s for s in styles if s.get("id") == style_id), None)
            if existing is not None and existing.get("name") != name:
                existing["name"] = name
        if existing is None:
            existing = next((s for s in styles if s.get("name") == name), None)

        def _apply_image(style: dict, img: Any | None, force: bool) -> None:
            """Save image tensor and set image_filename on the style dict if provided."""
            if img is None:
                return
            existing = style.get("image_filename") or None
            if not force and existing:
                # Don't clobber an existing image unless forced (Overwrite mode)
                return
            # Reuse the existing filename so the file is overwritten in place;
            # only generates a new name when there is none yet.
            style["image_filename"] = _save_image_tensor(img, name, existing_filename=existing)
            # Bump timestamp so the UI knows to bust its image cache
            style["image_updated_at"] = int(time.time())

        if creation_mode == "Create":
            if existing is not None:
                raise RuntimeError(
                    f"[StyleCreateNode] A style already exists matching the provided "
                    f"name/id (id={existing['id']}, name='{existing['name']}'). "
                    f"Use a different creation mode to allow updates."
                )
            new_style: dict = {
                "id": str(uuid.uuid4()),
                "name": name,
                "value": value,
                "favorite": favorite,
                "image_filename": None,
            }
            _apply_image(new_style, example_image, force=False)
            styles.append(new_style)
            _save_data(data)
            return (new_style["id"], new_style["value"])

        elif creation_mode == "Create or Skip":
            if existing is not None:
                return (existing["id"], existing.get("value", ""))
            new_style = {
                "id": str(uuid.uuid4()),
                "name": name,
                "value": value,
                "favorite": favorite,
                "image_filename": None,
            }
            _apply_image(new_style, example_image, force=False)
            styles.append(new_style)
            _save_data(data)
            return (new_style["id"], new_style["value"])

        elif creation_mode == "Create or Update":
            if existing is not None:
                existing["value"] = value
                existing["favorite"] = favorite
                _apply_image(existing, example_image, force=True)
                _save_data(data)
                return (existing["id"], existing["value"])
            new_style = {
                "id": str(uuid.uuid4()),
                "name": name,
                "value": value,
                "favorite": favorite,
                "image_filename": None,
            }
            _apply_image(new_style, example_image, force=False)
            styles.append(new_style)
            _save_data(data)
            return (new_style["id"], new_style["value"])

        elif creation_mode == "Overwrite":
            if existing is not None:
                existing["value"] = value
                existing["favorite"] = favorite
                _apply_image(existing, example_image, force=True)
                _save_data(data)
                return (existing["id"], existing["value"])
            new_style = {
                "id": str(uuid.uuid4()),
                "name": name,
                "value": value,
                "favorite": favorite,
                "image_filename": None,
            }
            _apply_image(new_style, example_image, force=True)
            styles.append(new_style)
            _save_data(data)
            return (new_style["id"], new_style["value"])

        else:
            raise ValueError(f"[StyleCreateNode] Unknown creation_mode: '{creation_mode}'")
