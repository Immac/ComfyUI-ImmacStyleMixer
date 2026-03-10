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
import uuid
import zipfile

from aiohttp import web

_EMPTY_DATA: dict = {
    "styles": [],
    "mixes": [],
    "current_mix_id": None,
}

_VALID_IMPORT_MODES = {"replace", "merge"}
_VALID_DUPLICATE_POLICIES = {"rename", "replace", "skip"}


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


def _ensure_data_shape(data: dict) -> None:
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object")
    for key in ("styles", "mixes"):
        if key not in data or not isinstance(data[key], list):
            raise ValueError(f"Missing or invalid field: '{key}'")


def _copy_style(style: dict) -> dict:
    return dict(style)


def _copy_mix(mix: dict) -> dict:
    out = dict(mix)
    out["styles"] = [dict(entry) for entry in mix.get("styles", []) if isinstance(entry, dict)]
    return out


def _make_unique_name(base_name: str, used_names: set[str]) -> str:
    if base_name not in used_names:
        return base_name
    n = 1
    while True:
        candidate = f"{base_name} ({n})"
        if candidate not in used_names:
            return candidate
        n += 1


def _make_unique_id(preferred_id: str | None, used_ids: set[str]) -> str:
    if preferred_id and preferred_id not in used_ids:
        return preferred_id
    while True:
        candidate = str(uuid.uuid4())
        if candidate not in used_ids:
            return candidate


def _merge_data(existing: dict, incoming: dict, duplicate_policy: str) -> tuple[dict, dict]:
    """Merge incoming data into existing, returning (merged_data, summary)."""
    existing_styles = [_copy_style(s) for s in existing.get("styles", []) if isinstance(s, dict)]
    existing_mixes = [_copy_mix(m) for m in existing.get("mixes", []) if isinstance(m, dict)]
    incoming_styles = [_copy_style(s) for s in incoming.get("styles", []) if isinstance(s, dict)]
    incoming_mixes = [_copy_mix(m) for m in incoming.get("mixes", []) if isinstance(m, dict)]

    style_name_to_idx = {}
    style_used_names = set()
    style_used_ids = set()
    for idx, style in enumerate(existing_styles):
        name = str(style.get("name", ""))
        style_used_names.add(name)
        if name not in style_name_to_idx:
            style_name_to_idx[name] = idx
        sid = style.get("id")
        if isinstance(sid, str):
            style_used_ids.add(sid)

    style_id_map: dict[str, str] = {}
    added_styles: list[str] = []
    conflicted_styles: list[dict[str, str]] = []

    for incoming_style in incoming_styles:
        incoming_id = incoming_style.get("id")
        incoming_name = str(incoming_style.get("name", ""))
        existing_idx = style_name_to_idx.get(incoming_name)

        if existing_idx is not None:
            existing_style = existing_styles[existing_idx]
            existing_id = existing_style.get("id")
            if duplicate_policy == "skip":
                if isinstance(incoming_id, str) and isinstance(existing_id, str):
                    style_id_map[incoming_id] = existing_id
                conflicted_styles.append({"name": incoming_name, "action": "skipped"})
                continue
            if duplicate_policy == "replace":
                replaced = _copy_style(incoming_style)
                replaced["id"] = existing_id
                replaced["name"] = incoming_name
                existing_styles[existing_idx] = replaced
                if isinstance(incoming_id, str) and isinstance(existing_id, str):
                    style_id_map[incoming_id] = existing_id
                conflicted_styles.append({"name": incoming_name, "action": "replaced"})
                continue

        if duplicate_policy == "rename" and existing_idx is not None:
            final_name = _make_unique_name(incoming_name, style_used_names)
            conflicted_styles.append({"old_name": incoming_name, "new_name": final_name, "action": "renamed"})
        else:
            final_name = incoming_name

        final_id = _make_unique_id(incoming_id if isinstance(incoming_id, str) else None, style_used_ids)
        appended = _copy_style(incoming_style)
        appended["name"] = final_name
        appended["id"] = final_id
        existing_styles.append(appended)

        if existing_idx is None:
            added_styles.append(final_name)

        style_used_names.add(final_name)
        style_used_ids.add(final_id)
        if final_name not in style_name_to_idx:
            style_name_to_idx[final_name] = len(existing_styles) - 1
        if isinstance(incoming_id, str):
            style_id_map[incoming_id] = final_id

    mix_name_to_idx = {}
    mix_used_names = set()
    mix_used_ids = set()
    for idx, mix in enumerate(existing_mixes):
        name = str(mix.get("name", ""))
        mix_used_names.add(name)
        if name not in mix_name_to_idx:
            mix_name_to_idx[name] = idx
        mid = mix.get("id")
        if isinstance(mid, str):
            mix_used_ids.add(mid)

    mix_id_map: dict[str, str] = {}
    added_mixes: list[str] = []
    conflicted_mixes: list[dict[str, str]] = []

    for incoming_mix in incoming_mixes:
        incoming_id = incoming_mix.get("id")
        incoming_name = str(incoming_mix.get("name", ""))
        existing_idx = mix_name_to_idx.get(incoming_name)

        remapped_mix = _copy_mix(incoming_mix)
        remapped_entries = []
        for entry in remapped_mix.get("styles", []):
            style_id = entry.get("style_id")
            mapped_style_id = style_id_map.get(style_id, style_id)
            remapped_entry = dict(entry)
            remapped_entry["style_id"] = mapped_style_id
            remapped_entries.append(remapped_entry)
        remapped_mix["styles"] = remapped_entries

        if existing_idx is not None:
            existing_mix = existing_mixes[existing_idx]
            existing_mix_id = existing_mix.get("id")
            if duplicate_policy == "skip":
                if isinstance(incoming_id, str) and isinstance(existing_mix_id, str):
                    mix_id_map[incoming_id] = existing_mix_id
                conflicted_mixes.append({"name": incoming_name, "action": "skipped"})
                continue
            if duplicate_policy == "replace":
                replaced = _copy_mix(remapped_mix)
                replaced["id"] = existing_mix_id
                replaced["name"] = incoming_name
                existing_mixes[existing_idx] = replaced
                if isinstance(incoming_id, str) and isinstance(existing_mix_id, str):
                    mix_id_map[incoming_id] = existing_mix_id
                conflicted_mixes.append({"name": incoming_name, "action": "replaced"})
                continue

        if duplicate_policy == "rename" and existing_idx is not None:
            final_name = _make_unique_name(incoming_name, mix_used_names)
            conflicted_mixes.append({"old_name": incoming_name, "new_name": final_name, "action": "renamed"})
        else:
            final_name = incoming_name

        final_id = _make_unique_id(incoming_id if isinstance(incoming_id, str) else None, mix_used_ids)
        appended = _copy_mix(remapped_mix)
        appended["name"] = final_name
        appended["id"] = final_id
        existing_mixes.append(appended)

        if existing_idx is None:
            added_mixes.append(final_name)

        mix_used_names.add(final_name)
        mix_used_ids.add(final_id)
        if final_name not in mix_name_to_idx:
            mix_name_to_idx[final_name] = len(existing_mixes) - 1
        if isinstance(incoming_id, str):
            mix_id_map[incoming_id] = final_id

    existing_current_mix_id = existing.get("current_mix_id")
    incoming_current_mix_id = incoming.get("current_mix_id")
    current_mix_id = existing_current_mix_id
    if not current_mix_id and isinstance(incoming_current_mix_id, str):
        current_mix_id = mix_id_map.get(incoming_current_mix_id, incoming_current_mix_id)

    merged_data = {
        "styles": existing_styles,
        "mixes": existing_mixes,
        "current_mix_id": current_mix_id,
    }

    summary = {
        "added_styles": added_styles[:10],
        "added_mixes": added_mixes[:10],
        "conflicted_styles": conflicted_styles[:10],
        "conflicted_mixes": conflicted_mixes[:10],
        "total_added_styles": len(added_styles),
        "total_added_mixes": len(added_mixes),
        "total_conflicted_styles": len(conflicted_styles),
        "total_conflicted_mixes": len(conflicted_mixes),
    }

    return merged_data, summary


def _apply_import(workspace_path: str, incoming_data: dict, import_mode: str, duplicate_policy: str) -> tuple[dict, dict]:
    """Apply import logic, returning (data_to_save, summary)."""
    _ensure_data_shape(incoming_data)
    if import_mode == "replace":
        # Replace mode: no conflicts, everything is new
        summary = {
            "added_styles": [s.get("name", "") for s in incoming_data.get("styles", [])[:10]],
            "added_mixes": [m.get("name", "") for m in incoming_data.get("mixes", [])[:10]],
            "conflicted_styles": [],
            "conflicted_mixes": [],
            "total_added_styles": len(incoming_data.get("styles", [])),
            "total_added_mixes": len(incoming_data.get("mixes", [])),
            "total_conflicted_styles": 0,
            "total_conflicted_mixes": 0,
        }
        return incoming_data, summary
    existing = _load(workspace_path)
    _ensure_data_shape(existing)
    return _merge_data(existing, incoming_data, duplicate_policy)


def register_routes(app: web.Application, workspace_path: str) -> None:
    """Register Style Mixer API routes on the given aiohttp Application."""

    routes = web.RouteTableDef()

    @routes.get("/immac_style_mixer/api/data")
    async def get_data(request: web.Request) -> web.Response:
        return web.json_response(_load(workspace_path))

    @routes.post("/immac_style_mixer/api/data")
    async def post_data(request: web.Request) -> web.Response:
        try:
            payload = await request.json()
        except Exception:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        if not isinstance(payload, dict):
            return web.json_response({"error": "Expected a JSON object"}, status=400)

        import_mode = "replace"
        duplicate_policy = "rename"
        data = payload
        if "data" in payload and isinstance(payload.get("data"), dict):
            data = payload["data"]
            import_mode = str(payload.get("import_mode", import_mode))
            duplicate_policy = str(payload.get("duplicate_policy", duplicate_policy))

        if import_mode not in _VALID_IMPORT_MODES:
            return web.json_response({"error": "Invalid import_mode"}, status=400)
        if duplicate_policy not in _VALID_DUPLICATE_POLICIES:
            return web.json_response({"error": "Invalid duplicate_policy"}, status=400)

        try:
            data_to_save, summary = _apply_import(workspace_path, data, import_mode, duplicate_policy)
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)

        _save(workspace_path, data_to_save)
        return web.json_response({
            "status": "ok",
            "styles": len(data_to_save.get("styles", [])),
            "mixes": len(data_to_save.get("mixes", [])),
            "summary": summary,
        })

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

    @routes.post("/immac_style_mixer/api/restore.zip")
    async def post_restore_zip(request: web.Request) -> web.Response:
        """Restore from a ZIP backup: extract data JSON and images."""
        import_mode = request.query.get("import_mode", "replace")
        duplicate_policy = request.query.get("duplicate_policy", "rename")
        if import_mode not in _VALID_IMPORT_MODES:
            return web.json_response({"error": "Invalid import_mode"}, status=400)
        if duplicate_policy not in _VALID_DUPLICATE_POLICIES:
            return web.json_response({"error": "Invalid duplicate_policy"}, status=400)

        try:
            import folder_paths
            input_dir = folder_paths.get_input_directory()
        except Exception:
            input_dir = os.path.join(workspace_path, "input")

        raw = await request.read()
        buf = io.BytesIO(raw)
        try:
            zf = zipfile.ZipFile(buf, "r")
        except zipfile.BadZipFile:
            return web.json_response({"error": "Not a valid ZIP file"}, status=400)

        with zf:
            names = zf.namelist()
            if "style_mixer_data.json" not in names:
                return web.json_response(
                    {"error": "ZIP does not contain style_mixer_data.json"}, status=400
                )

            # Restore data
            try:
                data = json.loads(zf.read("style_mixer_data.json").decode("utf-8"))
            except Exception:
                return web.json_response({"error": "Invalid style_mixer_data.json"}, status=400)

            try:
                data_to_save, summary = _apply_import(workspace_path, data, import_mode, duplicate_policy)
            except ValueError as exc:
                return web.json_response({"error": str(exc)}, status=400)

            _save(workspace_path, data_to_save)

            # Restore images
            for name in names:
                if name.startswith("images/styles/") or name.startswith("images/mixes/"):
                    parts = name.split("/")  # ["images", "styles"|"mixes", "filename"]
                    if len(parts) != 3 or not parts[2]:
                        continue
                    _, subdir, fname = parts
                    dest_dir = os.path.join(input_dir, "immac_style_mixer", subdir)
                    os.makedirs(dest_dir, exist_ok=True)
                    dest = os.path.join(dest_dir, fname)
                    with open(dest, "wb") as f:
                        f.write(zf.read(name))

        styles_n = len(data_to_save.get("styles", []))
        mixes_n = len(data_to_save.get("mixes", []))
        img_n = sum(
            1 for n in names
            if (n.startswith("images/styles/") or n.startswith("images/mixes/"))
            and n.split("/")[-1]
        )
        return web.json_response({
            "status": "ok",
            "styles": styles_n,
            "mixes": mixes_n,
            "images": img_n,
            "summary": summary,
        })

    app.add_routes(routes)
