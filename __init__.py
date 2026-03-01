"""Top-level entry point for ComfyUI-ImmacStyleMixer."""

import os
import server
from aiohttp import web
import nodes

# Python nodes are registered via comfy_entrypoint() — no dict needed here.
NODE_CLASS_MAPPINGS = {}
__all__ = ["NODE_CLASS_MAPPINGS"]

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


