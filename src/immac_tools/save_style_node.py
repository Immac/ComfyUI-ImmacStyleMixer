"""SaveStyleNode — creates or updates a style in style_mixer_data.json."""

import os

from comfy_api.latest import io

from ._style_utils import DATA_FILE_PATH, apply_image, build_negative, load_data, save_data
import uuid

_MODE = [
    "Create",
    "Update",
    "Save",
]


class SaveStyleNode(io.ComfyNode):
    """Creates or updates a style entry in the Style Mixer data file.

    mode controls how the target record is resolved and what happens when it
    does or does not exist:

      Create — inserts a new style. Requires a non-empty name. The id input
               must not be connected (ids are assigned automatically).
               Fails if a style with the same name already exists.

      Update — modifies an existing style. Requires either an id (to look up
               by id) or a name (to look up by name), but not both.
               Fails if no matching record is found.

      Save   — updates an existing style if found (by id or by name), or
               creates a new one if not found by name. Fails if id is given
               but no record with that id exists (there is no name to create
               from). Requires either an id or a name, but not both.

    Behaviour matrix (id = connected, name = non-empty):

      mode    id   name  found?    result
      Create  –    –     –         error: name is required
      Create  –    ✓     exists    error: name already taken; use Update or Save
      Create  –    ✓     –         ✅ insert new record
      Create  ✓    –     –         error: id must not be connected in Create mode
      Create  ✓    ✓     –         error: id must not be connected in Create mode
      Update  –    –     –         error: id or name required
      Update  –    ✓     exists    ✅ update by name
      Update  –    ✓     –         error: no record named '{name}'
      Update  ✓    –     exists    ✅ update by id
      Update  ✓    –     –         error: no record with id '{id}'
      Update  ✓    ✓     –         error: provide id OR name, not both
      Save    –    –     –         error: id or name required
      Save    –    ✓     exists    ✅ update by name
      Save    –    ✓     –         ✅ insert new record
      Save    ✓    –     exists    ✅ update by id
      Save    ✓    –     –         error: no record with id '{id}'; provide a name to create
      Save    ✓    ✓     –         error: provide id OR name, not both
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="SaveStyleImmacStyleMixer",
            display_name="Save Style",
            category="Immac/Style Mixer",
            is_output_node=True,
            description=(
                "Creates or updates a style in the Style Mixer data file.\n"
                "\n"
                "Create — inserts a new style; fails if the name already exists.\n"
                "Update — modifies an existing style (by id or by name); fails if not found.\n"
                "Save   — updates if found, creates if not (by name); id-only fails if not found.\n"
                "\n"
                "Connect either an id or enter a name — not both."
            ),
            inputs=[
                io.String.Input("name", default="", multiline=False, optional=True),
                io.String.Input("value", default="", multiline=True, optional=True),
                io.String.Input("negative", default="", multiline=True, optional=True),
                io.Combo.Input("mode", options=_MODE, default="Save"),
                io.String.Input("id", optional=True, default="", multiline=False),
                io.Boolean.Input("favorite", optional=True, default=False),
                io.Image.Input("example_image", optional=True),
            ],
            outputs=[
                io.String.Output(display_name="style_id"),
                io.String.Output(display_name="style_value"),
                io.String.Output(display_name="style_negative"),
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
        name: str = "",
        value: str = "",
        negative: str = "",
        mode: str = "Save",
        id: str = "",
        favorite: bool = False,
        example_image=None,
    ) -> io.NodeOutput:
        name = (name or "").strip()
        value = (value or "").strip()
        negative = (negative or "").strip()
        style_id = (id or "").strip()

        # ── Guard: Create mode must not have an id connected ──────────────────
        if mode == "Create" and style_id:
            raise ValueError(
                "[SaveStyleNode] The id input should not be connected in Create mode "
                "— ids are assigned automatically."
            )

        # ── Guard: Create mode requires a name ────────────────────────────────
        if mode == "Create" and not name:
            raise ValueError("[SaveStyleNode] A name is required to create a new style.")

        # ── Guard: Update / Save must not have both id and name ───────────────
        if mode in ("Update", "Save") and style_id and name:
            raise ValueError(
                "[SaveStyleNode] Connect either an id or enter a name — not both."
            )

        # ── Guard: Update / Save require at least one identifier ─────────────
        if mode in ("Update", "Save") and not style_id and not name:
            raise ValueError(
                "[SaveStyleNode] Connect an id or enter a name to identify the style."
            )

        data = load_data()
        styles: list[dict] = data.setdefault("styles", [])

        # ── Resolve existing record ───────────────────────────────────────────
        existing: dict | None
        if style_id:
            existing = next((s for s in styles if s.get("id") == style_id), None)
        else:
            existing = next((s for s in styles if s.get("name") == name), None)

        # ── Mode: Create ──────────────────────────────────────────────────────
        if mode == "Create":
            if existing is not None:
                raise RuntimeError(
                    f"[SaveStyleNode] A style named '{name}' already exists "
                    f"(id={existing['id']}). Switch to Update or Save mode to modify it."
                )
            new_style: dict = {
                "id": str(uuid.uuid4()),
                "name": name,
                "value": value,
                "negative": negative,
                "favorite": favorite if favorite is not None else False,
                "image_filename": None,
            }
            apply_image(new_style, example_image, name, force=False)
            styles.append(new_style)
            save_data(data)
            return io.NodeOutput(new_style["id"], new_style["value"], new_style["negative"])

        # ── Mode: Update ──────────────────────────────────────────────────────
        if mode == "Update":
            if existing is None:
                if style_id:
                    raise RuntimeError(
                        f"[SaveStyleNode] No style with id '{style_id}' was found."
                    )
                else:
                    raise RuntimeError(
                        f"[SaveStyleNode] No style named '{name}' was found."
                    )
            _apply_fields(existing, name, value, negative, favorite, example_image)
            save_data(data)
            return io.NodeOutput(existing["id"], existing["value"], existing.get("negative", ""))

        # ── Mode: Save ────────────────────────────────────────────────────────
        # save + id + not found → error (no name to create from)
        if style_id and existing is None:
            raise RuntimeError(
                f"[SaveStyleNode] No style with id '{style_id}' was found. "
                "To create a new style, disconnect the id input and enter a name."
            )

        if existing is not None:
            _apply_fields(existing, name, value, negative, favorite, example_image)
            save_data(data)
            return io.NodeOutput(existing["id"], existing["value"], existing.get("negative", ""))
        else:
            # save + name + not found → create
            new_style = {
                "id": str(uuid.uuid4()),
                "name": name,
                "value": value,
                "negative": negative,
                "favorite": favorite if favorite is not None else False,
                "image_filename": None,
            }
            apply_image(new_style, example_image, name, force=False)
            styles.append(new_style)
            save_data(data)
            return io.NodeOutput(new_style["id"], new_style["value"], new_style["negative"])


def _apply_fields(
    style: dict,
    name: str,
    value: str,
    negative: str,
    favorite: bool | None,
    example_image,
) -> None:
    """Patch non-empty fields onto an existing style dict in place."""
    if name:
        style["name"] = name
    if value:
        style["value"] = value
    if negative:
        style["negative"] = negative
    if favorite is not None:
        style["favorite"] = favorite
    apply_image(style, example_image, style.get("name", ""), force=True)
