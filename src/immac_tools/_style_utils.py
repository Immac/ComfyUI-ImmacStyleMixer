"""Shared helpers for Style Mixer node implementations."""

import json
import os
import re
import time
import uuid
from typing import Any

import numpy as np
from PIL import Image

DATA_FILE_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "style_mixer_data.json")
)

IMAGE_SUBFOLDER = os.path.join("immac_style_mixer", "styles")


def load_data() -> dict:
    if not os.path.exists(DATA_FILE_PATH):
        return {"styles": [], "mixes": [], "current_mix_id": None}
    with open(DATA_FILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data: dict) -> None:
    with open(DATA_FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def save_image_tensor(
    tensor: Any,
    style_name: str,
    existing_filename: str | None = None,
) -> str:
    """Save a ComfyUI IMAGE tensor ([B,H,W,C] float32 0-1) to the input folder.

    If *existing_filename* is provided the file is overwritten in place so that
    the stored filename reference in the JSON stays stable.
    Returns the filename (basename only) that was written.
    """
    import folder_paths  # available at runtime inside ComfyUI

    input_dir = folder_paths.get_input_directory()
    out_dir = os.path.join(input_dir, IMAGE_SUBFOLDER)
    os.makedirs(out_dir, exist_ok=True)

    frame = tensor[0]  # [H, W, C]
    arr = (frame.cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(arr)

    if existing_filename:
        filename = existing_filename
    else:
        safe = re.sub(r"[^\w\-]", "_", style_name)[:40]
        filename = f"style_{safe}_{uuid.uuid4().hex[:8]}.png"

    img.save(os.path.join(out_dir, filename))
    return filename


def apply_image(style: dict, img: Any | None, style_name: str, force: bool) -> None:
    """Save image tensor and update image_filename + image_updated_at on style dict."""
    if img is None:
        return
    existing = style.get("image_filename") or None
    if not force and existing:
        return
    style["image_filename"] = save_image_tensor(img, style_name, existing_filename=existing)
    style["image_updated_at"] = int(time.time())


def build_negative(entries: list[dict], styles_by_id: dict) -> str:
    """Assemble a negative prompt from mix entries using the same weighted logic as _build_prompt."""
    parts: list[str] = []
    for e in entries:
        style = styles_by_id.get(e.get("style_id", ""))
        if style is None:
            continue
        negative = style.get("negative", "").strip()
        if not negative:
            continue
        weight = float(e.get("weight", 1.0))
        if weight < 1e-9:
            continue
        if abs(weight - 1.0) < 1e-6:
            parts.append(negative)
        else:
            parts.append(f"({negative}:{weight:.2f})")
    return ", ".join(parts)
