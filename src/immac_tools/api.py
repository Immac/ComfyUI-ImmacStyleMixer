"""REST API routes for the Style Mixer.

Data schema (style_mixer_data.json):
{
    "styles": [
        {
            "id": "<uuid>",
            "name": "My Style",
            "value": "impressionist painting, vivid colors",
            "favorite": false,
            "image_filename": "abc.png"   // or null
        }
    ],
    "mixes": [
        {
            "id": "<uuid>",
            "name": "My Mix",
            "favorite": false,
            "styles": [
                { "style_id": "<uuid>", "weight": 1.0, "enabled": true }
            ]
        }
    ],
    "current_mix_id": null
}

Images are stored and served via ComfyUI's built-in endpoints:
  Upload : POST /upload/image  (subfolder=immac_style_mixer/styles, type=input)
  Display: GET  /view?filename={name}&subfolder=immac_style_mixer/styles&type=input
"""

import json
import os

from aiohttp import web

_EMPTY_DATA: dict = {
    "styles": [],
    "mixes": [],
    "current_mix_id": None,
}


def _data_path(workspace_path: str) -> str:
    return os.path.join(workspace_path, "style_mixer_data.json")


def _load(workspace_path: str) -> dict:
    path = _data_path(workspace_path)
    if not os.path.exists(path):
        return dict(_EMPTY_DATA)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(workspace_path: str, data: dict) -> None:
    path = _data_path(workspace_path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def register_routes(app: web.Application, workspace_path: str) -> None:
    """Register Style Mixer API routes on the given aiohttp Application."""

    routes = web.RouteTableDef()

    @routes.get("/immac_style_mixer/api/data")
    async def get_data(request: web.Request) -> web.Response:
        return web.json_response(_load(workspace_path))

    @routes.post("/immac_style_mixer/api/data")
    async def post_data(request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except Exception:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        # Basic structural validation
        if not isinstance(data, dict):
            return web.json_response({"error": "Expected a JSON object"}, status=400)
        for key in ("styles", "mixes"):
            if key not in data or not isinstance(data[key], list):
                return web.json_response(
                    {"error": f"Missing or invalid field: '{key}'"}, status=400
                )

        _save(workspace_path, data)
        return web.json_response({"status": "ok"})

    app.add_routes(routes)
