"""BlendStyleNode — aggregates weighted style_entry slots into a blend JSON + prompt."""

import json
import os

from comfy_api.latest import io

from ._style_utils import DATA_FILE_PATH, load_data, build_negative

_ON_DUPLICATE = [
    "Skip (keep first)",
    "Skip (keep last)",
    "Sum weights",
    "Average weights",
]

_WEIGHT_MODE = [
    "As-is",
    "Normalize (sum to 1.0)",
    "Normalize (max to 1.0)",
    "Equal weights",
]


class BlendStyleNode(io.ComfyNode):
    """Aggregates style_entry inputs (from Weight Style nodes) into a blend.

    Each slot accepts a style_entry JSON string produced by the Weight Style node.
    The blend_json output can be piped into a Save Mix node to persist the blend.

    on_duplicate controls what happens when the same style_id appears more than once:
      Skip (keep first)  — ignore the later duplicates.
      Skip (keep last)   — ignore the earlier duplicates.
      Sum weights        — add the weights together.
      Average weights    — take the mean of all weights.

    weight_mode is applied after deduplication:
      As-is                  — keep weights exactly as set.
      Normalize (sum to 1.0) — divide all weights so they sum to 1.0.
      Normalize (max to 1.0) — divide all weights so the largest becomes 1.0.
      Equal weights          — set all weights to 1.0 (ignore original weights).
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        autogrow_template = io.Autogrow.TemplatePrefix(
            input=io.String.Input("style_entry", force_input=True),
            prefix="style_entry",
            min=1,
            max=16,
        )
        return io.Schema(
            node_id="BlendStyleImmacStyleMixer",
            display_name="Blend Style",
            category="Immac/Style Mixer",
            description=(
                "Aggregates weighted style_entry inputs (from Weight Style nodes) "
                "into a blend. Outputs blend_json (pipe to Save Mix) and an "
                "assembled prompt string for immediate use."
            ),
            inputs=[
                io.Autogrow.Input("style_entries", template=autogrow_template),
                io.Combo.Input(
                    "on_duplicate",
                    options=_ON_DUPLICATE,
                    default="Skip (keep first)",
                ),
                io.Combo.Input(
                    "weight_mode",
                    options=_WEIGHT_MODE,
                    default="As-is",
                ),
            ],
            outputs=[
                io.String.Output(display_name="blend_json"),
                io.String.Output(display_name="prompt"),
                io.String.Output(display_name="negative"),
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
        style_entries: io.Autogrow.Type,
        on_duplicate: str,
        weight_mode: str,
    ) -> io.NodeOutput:
        # Parse all style_entry JSON blobs
        raw: list[dict] = []
        for v in style_entries.values():
            text = str(v).strip() if v else ""
            if not text:
                continue
            try:
                entry = json.loads(text)
                style_id = entry.get("style_id", "").strip()
                weight = float(entry.get("weight", 1.0))
            except (json.JSONDecodeError, AttributeError):
                # Not a style_entry JSON — treat as a raw style_id (e.g. direct
                # connection from Style Pick) with a default weight of 1.0.
                style_id = text
                weight = 1.0
            if not style_id:
                continue
            raw.append({"style_id": style_id, "weight": weight})

        merged = _deduplicate(raw, on_duplicate)
        merged = _apply_weight_mode(merged, weight_mode)

        blend_json = json.dumps(merged)

        data = load_data()
        styles_by_id = {s["id"]: s for s in data.get("styles", [])}
        prompt = _build_prompt(merged, styles_by_id)
        negative = build_negative(merged, styles_by_id)

        return io.NodeOutput(blend_json, prompt, negative)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _deduplicate(entries: list[dict], mode: str) -> list[dict]:
    """Merge entries with the same style_id according to the chosen strategy."""
    if mode == "Skip (keep first)":
        seen: set[str] = set()
        result: list[dict] = []
        for e in entries:
            if e["style_id"] not in seen:
                seen.add(e["style_id"])
                result.append(dict(e))
        return result

    if mode == "Skip (keep last)":
        seen_last: dict[str, dict] = {}
        for e in entries:
            seen_last[e["style_id"]] = dict(e)
        return list(seen_last.values())

    if mode == "Sum weights":
        acc: dict[str, float] = {}
        order: list[str] = []
        for e in entries:
            sid = e["style_id"]
            if sid not in acc:
                acc[sid] = 0.0
                order.append(sid)
            acc[sid] += e["weight"]
        return [{"style_id": sid, "weight": acc[sid]} for sid in order]

    if mode == "Average weights":
        groups: dict[str, list[float]] = {}
        order2: list[str] = []
        for e in entries:
            sid = e["style_id"]
            if sid not in groups:
                groups[sid] = []
                order2.append(sid)
            groups[sid].append(e["weight"])
        return [
            {"style_id": sid, "weight": sum(groups[sid]) / len(groups[sid])}
            for sid in order2
        ]

    return entries  # fallback


def _apply_weight_mode(entries: list[dict], mode: str) -> list[dict]:
    if not entries:
        return entries

    if mode == "As-is":
        return entries

    if mode == "Normalize (sum to 1.0)":
        total = sum(e["weight"] for e in entries)
        if total < 1e-9:
            return entries
        return [{"style_id": e["style_id"], "weight": round(e["weight"] / total, 4)} for e in entries]

    if mode == "Normalize (max to 1.0)":
        mx = max(e["weight"] for e in entries)
        if mx < 1e-9:
            return entries
        return [{"style_id": e["style_id"], "weight": round(e["weight"] / mx, 4)} for e in entries]

    if mode == "Equal weights":
        return [{"style_id": e["style_id"], "weight": 1.0} for e in entries]

    return entries  # fallback


def _build_prompt(entries: list[dict], styles_by_id: dict) -> str:
    parts: list[str] = []
    for e in entries:
        style = styles_by_id.get(e["style_id"])
        if style is None:
            continue
        value = style.get("value", "").strip()
        if not value:
            continue
        weight = e["weight"]
        if weight < 1e-9:
            continue
        if abs(weight - 1.0) < 1e-6:
            parts.append(value)
        else:
            parts.append(f"({value}:{weight:.2f})")
    return ", ".join(parts)
