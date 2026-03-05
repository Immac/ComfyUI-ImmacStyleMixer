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
    "Update",
    "Save",
]


def _update_mix(
    mix: dict,
    mix_styles: list,
    example_image,
    name: str,
    favorite: bool | None = None,
) -> None:
    """Patch styles and optionally the image/name/favorite on an existing mix dict in place."""
    mix["styles"] = mix_styles
    if name:
        mix["name"] = name
    if favorite is not None:
        mix["favorite"] = favorite
    if example_image is not None:
        mix["image_filename"] = _save_mix_image(
            example_image,
            mix.get("name", ""),
            existing_filename=mix.get("image_filename") or None,
        )
        mix["image_updated_at"] = int(time.time())


def _derive_name(mix_styles: list, data: dict) -> str:
    """Build a 'Quick Mix (A, B, C)' label from the style names in blend order.

    Unresolved style_ids fall back to the first 8 hex chars of the id.
    """
    style_index = {s["id"]: s.get("name", "") for s in data.get("styles", [])}
    parts = []
    for entry in mix_styles:
        sid = entry.get("style_id", "")
        parts.append(style_index.get(sid) or sid[:8])
    joined = ", ".join(parts) if parts else "empty"
    return f"Quick Mix ({joined})"


class SaveMixNode(io.ComfyNode):
    """Creates or updates a saved mix from a blend_json (output of Style Blend).

    mode controls how the target record is resolved and what happens when it
    does or does not exist:

      Create — inserts a new mix. The id input must not be connected (ids are
               assigned automatically). If name is empty an auto-name of the
               form 'Quick Mix (A, B, C)' is derived from the blend contents.
               Fails if a mix with the same name already exists.

      Update — modifies an existing mix (by id or by name); fails if not found.
               Connect either an id or enter a name — not both.

      Save   — updates if found (by id or by name), creates if not found by
               name. If name is empty on create an auto-name is derived.
               Fails if id is given but no match exists.

    The blend_json input must be wired from the blend_json output of a Style
    Blend node.  Each entry in that JSON array encodes a {style_id, weight}
    pair that will be stored in the mix exactly as produced by Style Blend
    (including any deduplication / normalisation already applied there).

    Behaviour matrix (id = connected, name = non-empty, * = auto-derived):

      mode    id   name  found?    result
      Create  –    –     exists    ✅ replace existing Quick Mix (auto-derived name upsert)
      Create  –    –     –         ✅ insert new record (name auto-derived)
      Create  –    ✓     exists    error: name already taken; use Update or Save
      Create  –    ✓     –         ✅ insert new record
      Create  ✓    –     –         error: id must not be connected in Create mode
      Create  ✓    ✓     –         error: id must not be connected in Create mode
      Update  –    –     –         error: id or name required
      Update  –    ✓     exists    ✅ update by name
      Update  –    ✓     –         error: no mix named '{name}'
      Update  ✓    –     exists    ✅ update by id
      Update  ✓    –     –         error: no mix with id '{id}'
      Update  ✓    ✓     –         error: provide id OR name, not both
      Save    –    –     –         ✅ insert new record (name auto-derived)
      Save    –    ✓     exists    ✅ update by name
      Save    –    ✓     –         ✅ insert new record
      Save    ✓    –     exists    ✅ update by id
      Save    ✓    –     –         error: no mix with id '{id}'; provide a name to create
      Save    ✓    ✓     –         error: provide id OR name, not both
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
                "Create — inserts a new mix; fails if the name already exists.\n"
                "Update — modifies an existing mix (by id or by name); fails if not found.\n"
                "Save   — updates if found, creates if not (by name); id-only fails if not found.\n"
                "\n"
                "Connect either an id or enter a name — not both."
            ),
            inputs=[
                io.String.Input("blend_json", force_input=True),
                io.String.Input("name", default="", multiline=False, optional=True),
                io.Combo.Input("mode", options=_MODE, default="Save"),
                io.String.Input("id", optional=True, default="", multiline=False),
                io.Boolean.Input("favorite", optional=True, default=False),
                io.Image.Input("example_image", optional=True),
            ],
            outputs=[
                io.String.Output(display_name="mix_id"),
                io.String.Output(display_name="mix_name"),
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
        name: str = "",
        mode: str = "Save",
        id: str = "",
        favorite: bool = False,
        example_image=None,
    ) -> io.NodeOutput:
        name = (name or "").strip()
        mix_id_input = (id or "").strip()

        # ── Guard: Create mode must not have an id connected ─────────────────
        if mode == "Create" and mix_id_input:
            raise ValueError(
                "[SaveMixNode] The id input should not be connected in Create mode "
                "— ids are assigned automatically."
            )

        # ── Guard: Update / Save must not have both id and name ──────────────
        if mode in ("Update", "Save") and mix_id_input and name:
            raise ValueError(
                "[SaveMixNode] Connect either an id or enter a name — not both."
            )

        # ── Guard: Update requires at least one identifier ───────────────────
        if mode == "Update" and not mix_id_input and not name:
            raise ValueError(
                "[SaveMixNode] Connect an id or enter a name to identify the mix."
            )

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

        # ── Resolve existing record ───────────────────────────────────────────
        if mix_id_input:
            existing = next((m for m in mixes if m.get("id") == mix_id_input), None)
        else:
            existing = next((m for m in mixes if m.get("name") == name), None) if name else None

        # ── Mode: Create ─────────────────────────────────────────────────────
        if mode == "Create":
            # Auto-derive a name if none was given
            name_was_derived = not name
            if name_was_derived:
                name = _derive_name(mix_styles, data)
            if existing is None and name:
                existing = next((m for m in mixes if m.get("name") == name), None)
            if existing is not None:
                if name_was_derived:
                    # Quick Mix names are temporary — replace the existing record
                    _update_mix(existing, mix_styles, example_image, name, favorite)
                    save_data(data)
                    return io.NodeOutput(existing["id"], existing["name"])
                raise RuntimeError(
                    f"[SaveMixNode] A mix named '{name}' already exists "
                    f"(id={existing['id']}). Switch to Update or Save mode to modify it."
                )
            new_mix_id = str(uuid.uuid4())
            new_mix: dict = {
                "id": new_mix_id,
                "name": name,
                "favorite": favorite if favorite is not None else False,
                "styles": mix_styles,
            }
            if example_image is not None:
                new_mix["image_filename"] = _save_mix_image(example_image, name)
                new_mix["image_updated_at"] = int(time.time())
            mixes.append(new_mix)
            save_data(data)
            return io.NodeOutput(new_mix_id, name)

        # ── Mode: Update ─────────────────────────────────────────────────────
        if mode == "Update":
            if existing is None:
                if mix_id_input:
                    raise RuntimeError(
                        f"[SaveMixNode] No mix with id '{mix_id_input}' was found."
                    )
                else:
                    raise RuntimeError(
                        f"[SaveMixNode] No mix named '{name}' was found."
                    )
            _update_mix(existing, mix_styles, example_image, name, favorite)
            save_data(data)
            return io.NodeOutput(existing["id"], existing["name"])

        # ── Mode: Save ───────────────────────────────────────────────────────
        if mix_id_input and existing is None:
            raise RuntimeError(
                f"[SaveMixNode] No mix with id '{mix_id_input}' was found. "
                "To create a new mix, disconnect the id input and enter a name."
            )

        if existing is not None:
            _update_mix(existing, mix_styles, example_image, name, favorite)
            save_data(data)
            return io.NodeOutput(existing["id"], existing["name"])
        else:
            # Save + (name or auto-derive) + not found → create
            if not name:
                name = _derive_name(mix_styles, data)
            new_mix_id = str(uuid.uuid4())
            new_mix = {
                "id": new_mix_id,
                "name": name,
                "favorite": favorite if favorite is not None else False,
                "styles": mix_styles,
            }
            if example_image is not None:
                new_mix["image_filename"] = _save_mix_image(example_image, name)
                new_mix["image_updated_at"] = int(time.time())
            mixes.append(new_mix)
            save_data(data)
            return io.NodeOutput(new_mix_id, name)
