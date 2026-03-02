"""StyleCreateNode — creates or updates a style in style_mixer_data.json."""

import json
import os
import uuid
from typing import Any

_DATA_FILE_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "style_mixer_data.json")
)

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
                "favorite": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("style_id", "style_value")
    FUNCTION = "execute"
    CATEGORY = "Immac/Style Mixer"
    DESCRIPTION = (
        "Creates or updates a style in the Style Mixer data file.\n"
        "\n"
        "Creation modes:\n"
        "  Create           — fails if a style with that name already exists.\n"
        "  Create or Skip   — returns the existing style unchanged if the name exists.\n"
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
        favorite: bool = False,
    ) -> tuple[str, str]:
        name = name.strip()
        value = value.strip()

        if not name:
            raise ValueError("[StyleCreateNode] 'name' must not be empty.")

        data = _load_data()
        styles: list[dict] = data.setdefault("styles", [])

        existing = next((s for s in styles if s.get("name") == name), None)

        if creation_mode == "Create":
            if existing is not None:
                raise RuntimeError(
                    f"[StyleCreateNode] A style named '{name}' already exists "
                    f"(id={existing['id']}). Use a different creation mode to allow updates."
                )
            new_style = {
                "id": str(uuid.uuid4()),
                "name": name,
                "value": value,
                "favorite": favorite,
                "image_filename": None,
            }
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
            styles.append(new_style)
            _save_data(data)
            return (new_style["id"], new_style["value"])

        elif creation_mode == "Create or Update":
            if existing is not None:
                existing["value"] = value
                existing["favorite"] = favorite
                _save_data(data)
                return (existing["id"], existing["value"])
            new_style = {
                "id": str(uuid.uuid4()),
                "name": name,
                "value": value,
                "favorite": favorite,
                "image_filename": None,
            }
            styles.append(new_style)
            _save_data(data)
            return (new_style["id"], new_style["value"])

        elif creation_mode == "Overwrite":
            if existing is not None:
                existing["value"] = value
                existing["favorite"] = favorite
                _save_data(data)
                return (existing["id"], existing["value"])
            new_style = {
                "id": str(uuid.uuid4()),
                "name": name,
                "value": value,
                "favorite": favorite,
                "image_filename": None,
            }
            styles.append(new_style)
            _save_data(data)
            return (new_style["id"], new_style["value"])

        else:
            raise ValueError(f"[StyleCreateNode] Unknown creation_mode: '{creation_mode}'")
