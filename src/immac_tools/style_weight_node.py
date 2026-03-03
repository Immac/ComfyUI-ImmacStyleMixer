"""StyleWeightNode — applies a float weight to a style value string."""

from typing import Any


class StyleWeightNode:
    """Wraps a style prompt value with a weight: (value:weight) or value if weight ≈ 1.0."""

    @classmethod
    def INPUT_TYPES(cls) -> dict[str, Any]:
        return {
            "required": {
                "style_value": ("STRING", {"forceInput": True}),
                "weight": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01, "display": "slider"},
                ),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("weighted_style",)
    FUNCTION = "execute"
    CATEGORY = "Immac/Style Mixer"
    DESCRIPTION = (
        "Applies a float weight to a style value. "
        "Outputs the value unchanged when weight ≈ 1.0, "
        "otherwise wraps it as (value:weight)."
    )

    def execute(self, style_value: str, weight: float) -> tuple[str]:
        value = (style_value or "").strip()
        if not value:
            return ("",)
        if abs(weight - 1.0) < 1e-6:
            return (value,)
        return (f"({value}:{weight:.2f})",)
