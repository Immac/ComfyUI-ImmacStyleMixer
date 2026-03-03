"""StyleBlendNode — merges up to 8 weighted style strings into a single prompt."""

from typing import Any

_MAX_STYLES = 8


class StyleBlendNode:
    """Accepts up to 8 weighted style strings and joins them into one prompt."""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        optional: dict[str, Any] = {}
        for i in range(1, _MAX_STYLES + 1):
            optional[f"style_{i}"] = ("STRING", {"forceInput": True})
        return {"required": {}, "optional": optional}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "execute"
    CATEGORY = "Immac/Style Mixer"
    DESCRIPTION = (
        "Combines up to 8 weighted style strings (from Weight Style nodes) "
        "into a single comma-separated prompt."
    )

    def execute(self, **kwargs: str | None) -> tuple[str]:
        parts: list[str] = []
        for i in range(1, _MAX_STYLES + 1):
            val = kwargs.get(f"style_{i}")
            if val is None:
                continue
            val = val.strip()
            if val:
                parts.append(val)
        return (", ".join(parts),)
