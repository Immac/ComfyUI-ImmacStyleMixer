"""ComfyUI-ImmacTools package exports used by ComfyUI.

This module exposes the node registration mappings and the `WEB_DIRECTORY`
constant expected by ComfyUI web extensions.
"""
from .nodes import ConcatenateSigmasNode, SpliceSigmasAtNode, ResampleSigmas, SkipEveryNthImages, MatchContrastNode
from .forwarding_nodes import ForwardAnyNode, ForwardConditioningNode, ForwardModelNode

# Mapping from node_id to node class
NODE_CLASS_MAPPINGS: dict[str, type] = {
    "ConcatenateSigmasImmacTools": ConcatenateSigmasNode,
    "SpliceSigmasAtImmacTools": SpliceSigmasAtNode,
    "ResampleSigmasImmacTools": ResampleSigmas,
    "SkipEveryNthImagesImmacTools": SkipEveryNthImages,
    "MatchContrastImmacTools": MatchContrastNode,
    "ForwardAnyImmacTools": ForwardAnyNode,
    "ForwardConditioningImmacTools": ForwardConditioningNode,
    "ForwardModelImmacTools": ForwardModelNode,
}

# Mapping from node_id to human readable display name
NODE_DISPLAY_NAME_MAPPINGS: dict[str, str] = {
    "ConcatenateSigmasImmacTools": "Concatenate Sigmas Node",
    "SpliceSigmasAtImmacTools": "Splice Sigmas At Node",
    "ResampleSigmasImmacTools": "Resample Sigmas",
    "SkipEveryNthImagesImmacTools": "Skip Every Nth Image",
    "MatchContrastImmacTools": "Match Contrast",
    "ForwardAnyImmacTools": "Forward Any",
    "ForwardConditioningImmacTools": "Forward Conditioning",
    "ForwardModelImmacTools": "Forward Model",
}

# ComfyUI expects this for web extensions
WEB_DIRECTORY = "./web"

__all__ = [
	"NODE_CLASS_MAPPINGS",
	"NODE_DISPLAY_NAME_MAPPINGS",
	"WEB_DIRECTORY",
]
