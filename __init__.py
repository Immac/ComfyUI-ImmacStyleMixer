"""Top-level entry point for ComfyUI-ImmacStyleMixer."""

import os
import server
from aiohttp import web
import nodes

from .src.immac_tools.api import register_routes
from .src.immac_tools.nodes import (
    ConcatenateSigmasNode,
    SpliceSigmasAtNode,
    ResampleSigmas,
    SkipEveryNthImages,
    MatchContrastNode,
)
from .src.immac_tools.forwarding_nodes import (
    ForwardAnyNode,
    ForwardConditioningNode,
    ForwardModelNode,
)

# Traditional mapping — required by ComfyUI core and the Manager
NODE_CLASS_MAPPINGS = {
    "ConcatenateSigmasImmacTools": ConcatenateSigmasNode,
    "SpliceSigmasAtImmacTools": SpliceSigmasAtNode,
    "ResampleSigmasImmacTools": ResampleSigmas,
    "SkipEveryNthImagesImmacTools": SkipEveryNthImages,
    "MatchContrastImmacTools": MatchContrastNode,
    "ForwardAnyImmacTools": ForwardAnyNode,
    "ForwardConditioningImmacTools": ForwardConditioningNode,
    "ForwardModelImmacTools": ForwardModelNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ConcatenateSigmasImmacTools": "Concatenate Sigmas Node",
    "SpliceSigmasAtImmacTools": "Splice Sigmas At Node",
    "ResampleSigmasImmacTools": "Resample Sigmas",
    "SkipEveryNthImagesImmacTools": "Skip Every Nth Image",
    "MatchContrastImmacTools": "Match Contrast",
    "ForwardAnyImmacTools": "Forward Any",
    "ForwardConditioningImmacTools": "Forward Conditioning",
    "ForwardModelImmacTools": "Forward Model",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]

workspace_path = os.path.dirname(__file__)
dist_path = os.path.join(workspace_path, "dist", "immac_style_mixer")
dist_locales_path = os.path.join(workspace_path, "dist", "locales")

if os.path.exists(dist_path):
    server.PromptServer.instance.app.add_routes([
        web.static("/immac_style_mixer/", dist_path),
    ])
    if os.path.exists(dist_locales_path):
        server.PromptServer.instance.app.add_routes([
            web.static("/locales/", dist_locales_path),
        ])

    project_name = os.path.basename(workspace_path)
    try:
        from comfy_config import config_parser
        project_config = config_parser.extract_node_configuration(workspace_path)
        project_name = project_config.project.name
    except Exception as e:
        print(f"[ImmacStyleMixer] Could not load project config, using '{project_name}': {e}")

    nodes.EXTENSION_WEB_DIRS[project_name] = os.path.join(workspace_path, "dist")
else:
    print("[ImmacStyleMixer] Web dist directory not found — skipping static file registration.")

# Always register API routes (data endpoints work even before the UI is built)
register_routes(server.PromptServer.instance.app, workspace_path)


