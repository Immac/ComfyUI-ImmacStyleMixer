"""SaveMixNode — persists a Style Blend result as a saved mix."""

import json
import os
import uuid

from comfy_api.latest import io

from ._style_utils import DATA_FILE_PATH, load_data, save_data

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
    def execute(cls, blend_json: str, name: str, mode: str) -> io.NodeOutput:
        name = (name or "").strip()
        if not name:
            raise ValueError("[SaveMixNode] 'name' must not be empty.")

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
        existing = next((m for m in mixes if m.get("name") == name), None)

        if mode == "Create":
            if existing is not None:
                raise RuntimeError(
                    f"[SaveMixNode] A mix named '{name}' already exists "
                    f"(id={existing['id']}). Use 'Update (by name)' to overwrite."
                )
            mix_id = str(uuid.uuid4())
            mixes.append({"id": mix_id, "name": name, "styles": mix_styles})
        else:  # "Update (by name)"
            if existing is not None:
                existing["styles"] = mix_styles
                mix_id = existing["id"]
            else:
                mix_id = str(uuid.uuid4())
                mixes.append({"id": mix_id, "name": name, "styles": mix_styles})

        save_data(data)
        return io.NodeOutput(mix_id)
