"""SaveMixNode — persists a Style Blend result as a saved mix."""

import json
import os
import re
import time
import uuid

import numpy as np
from PIL import Image

from comfy_api.latest import io

from ._style_utils import DATA_FILE_PATH, load_data, save_data

MIX_IMAGE_SUBFOLDER = os.path.join("immac_style_mixer", "mixes")


def _save_mix_image(tensor, mix_name: str, existing_filename: str | None = None) -> str:
    """Save a ComfyUI IMAGE tensor to the input/immac_style_mixer/mixes folder.

    Returns the basename that was written.
    """
    import folder_paths  # available at runtime inside ComfyUI

    input_dir = folder_paths.get_input_directory()
    out_dir = os.path.join(input_dir, MIX_IMAGE_SUBFOLDER)
    os.makedirs(out_dir, exist_ok=True)

    frame = tensor[0]  # [H, W, C]
    arr = (frame.cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(arr)

    if existing_filename:
        filename = existing_filename
    else:
        safe = re.sub(r"[^\w\-]", "_", mix_name)[:40]
        filename = f"mix_{safe}_{uuid.uuid4().hex[:8]}.png"

    img.save(os.path.join(out_dir, filename))
    return filename

_MODE = [
    "Create",
    "Update (by name)",
]


class SaveMixNode(io.ComfyNode):
    """Creates or updates a saved mix from a blend_json (output of Style Blend).

    mode controls the behaviour when a mix with the same name already exists:
      Create            — always creates a new mix; raises an error if the name
                          is already taken.
      Update (by name)  — overwrites the styles list of an existing mix with the
                          same name, or creates a new mix if none is found.

    The blend_json input must be wired from the blend_json output of a Style
    Blend node.  Each entry in that JSON array encodes a {style_id, weight}
    pair that will be stored in the mix exactly as produced by Style Blend
    (including any deduplication / normalisation already applied there).
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="SaveMixImmacStyleMixer",
            display_name="Save Mix",
            category="Immac/Style Mixer",
            is_output_node=True,
            description=(
                "Saves a blend_json (from Style Blend) as a named mix.\n"
                "\n"
                "Create           — creates a new mix; fails if the name exists.\n"
                "Update (by name) — updates the styles of an existing mix, or\n"
                "                   creates one if it does not exist yet.\n"
            ),
            inputs=[
                io.String.Input("blend_json", force_input=True),
                io.String.Input("name", default="", multiline=False),
                io.Combo.Input("mode", options=_MODE, default="Update (by name)"),
                io.String.Input("id", optional=True, default="", multiline=False),
                io.Image.Input("example_image", optional=True),
            ],
            outputs=[
                io.String.Output(display_name="mix_id"),
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
        blend_json: str,
        name: str,
        mode: str,
        id: str = "",
        example_image=None,
    ) -> io.NodeOutput:
        name = (name or "").strip()
        if not name:
            raise ValueError("[SaveMixNode] 'name' must not be empty.")

        forced_id = (id or "").strip()

        try:
            entries = json.loads(blend_json)
        except (json.JSONDecodeError, TypeError) as exc:
            raise ValueError(f"[SaveMixNode] Invalid blend_json: {exc}") from exc

        if not isinstance(entries, list):
            raise ValueError("[SaveMixNode] blend_json must be a JSON array.")

        mix_styles = [
            {
                "style_id": e["style_id"],
                "weight": float(e.get("weight", 1.0)),
                "enabled": True,
            }
            for e in entries
            if e.get("style_id")
        ]

        data = load_data()
        mixes: list[dict] = data.setdefault("mixes", [])

        # Look up existing mix: prefer id match, fall back to name match
        existing = (
            next((m for m in mixes if m.get("id") == forced_id), None)
            if forced_id
            else None
        ) or next((m for m in mixes if m.get("name") == name), None)

        if mode == "Create":
            if existing is not None:
                raise RuntimeError(
                    f"[SaveMixNode] A mix named '{name}' already exists "
                    f"(id={existing['id']}). Use 'Update (by name)' to overwrite."
                )
            mix_id = forced_id or str(uuid.uuid4())
            new_mix: dict = {"id": mix_id, "name": name, "styles": mix_styles}
            if example_image is not None:
                new_mix["image_filename"] = _save_mix_image(example_image, name)
                new_mix["image_updated_at"] = int(time.time())
            mixes.append(new_mix)
        else:  # "Update (by name)"
            if existing is not None:
                existing["styles"] = mix_styles
                mix_id = existing["id"]
                if example_image is not None:
                    existing["image_filename"] = _save_mix_image(
                        example_image, name,
                        existing_filename=existing.get("image_filename") or None,
                    )
                    existing["image_updated_at"] = int(time.time())
            else:
                mix_id = forced_id or str(uuid.uuid4())
                new_mix = {"id": mix_id, "name": name, "styles": mix_styles}
                if example_image is not None:
                    new_mix["image_filename"] = _save_mix_image(example_image, name)
                    new_mix["image_updated_at"] = int(time.time())
                mixes.append(new_mix)

        save_data(data)
        return io.NodeOutput(mix_id)
