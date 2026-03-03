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

import io
import json
import os
import zipfile

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

    @routes.get("/immac_style_mixer/api/backup.zip")
    async def get_backup_zip(request: web.Request) -> web.Response:
        """Stream a ZIP containing style_mixer_data.json + all style/mix images."""
        try:
            import folder_paths  # ComfyUI runtime module
            input_dir = folder_paths.get_input_directory()
        except Exception:
            input_dir = os.path.join(workspace_path, "input")

        data = _load(workspace_path)
        buf = io.BytesIO()

        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            # 1 — JSON data file
            zf.writestr(
                "style_mixer_data.json",
                json.dumps(data, indent=2, ensure_ascii=False),
            )

            # 2 — style images
            styles_src = os.path.join(input_dir, "immac_style_mixer", "styles")
            if os.path.isdir(styles_src):
                for fname in os.listdir(styles_src):
                    fpath = os.path.join(styles_src, fname)
                    if os.path.isfile(fpath):
                        zf.write(fpath, os.path.join("images", "styles", fname))

            # 3 — mix cover images
            mixes_src = os.path.join(input_dir, "immac_style_mixer", "mixes")
            if os.path.isdir(mixes_src):
                for fname in os.listdir(mixes_src):
                    fpath = os.path.join(mixes_src, fname)
                    if os.path.isfile(fpath):
                        zf.write(fpath, os.path.join("images", "mixes", fname))

        buf.seek(0)
        date = __import__("datetime").date.today().isoformat()
        filename = f"style_mixer_backup_{date}.zip"
        return web.Response(
            body=buf.read(),
            content_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    app.add_routes(routes)
