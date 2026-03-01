# Migration Plan: Comfy-Org/ComfyUI-React-Extension-Template

Repo is being updated to match the `Comfy-Org/ComfyUI-React-Extension-Template` pattern,
adding a React/TypeScript Style Mixer UI alongside the existing custom nodes.

---

## Steps

### ✅ Step 0 — Save this plan (first order of business)

### ✅ Step 1 — Clean up the Python layer
- [x] Save plan to `PLAN.md`
- [x] Delete broken tests (`tests/test_immac_tools.py` — asserts old-style class attributes that don't exist on `io.ComfyNode`)
- [x] Remove dead dict registration from `src/immac_tools/__init__.py` (`NODE_CLASS_MAPPINGS`, `NODE_DISPLAY_NAME_MAPPINGS`, `WEB_DIRECTORY`)
- [x] Remove unused `ExampleForwardingExtension` from `src/immac_tools/forwarding_nodes.py`

### ✅ Step 2 — Rewrite root `__init__.py` to match the template pattern
- [x] Remove `WEB_DIRECTORY` re-export
- [x] Set `NODE_CLASS_MAPPINGS = {}` (nodes registered via `comfy_entrypoint`)
- [x] Wire `comfy_entrypoint` to `src/immac_tools/nodes.py`
- [x] Register aiohttp static routes to serve `dist/immac_style_mixer/` at `/immac_style_mixer/`
- [x] Register `nodes.EXTENSION_WEB_DIRS[project_name]` using `comfy_config` (with fallback)

### ✅ Step 3 — Add Style Mixer REST API (`src/immac_tools/api.py`)
- [x] `style_mixer_data.json` load/save helpers
- [x] `GET  /immac_style_mixer/api/data`
- [x] `POST /immac_style_mixer/api/data` (with basic structural validation)
- [x] Routes wired into root `__init__.py` via `register_routes()`
- [x] Images handled by ComfyUI built-ins (`/upload/image` + `/view`)

### Step 4 — Update `pyproject.toml` ← *currently here*
- Change `includes = []` → `includes = ["dist/"]`
- Remove `[build-system]` / `[tool.setuptools]` blocks (not needed; ComfyUI loads directly)

### Step 5 — Scaffold `ui/` (React + TypeScript + Vite)
- `ui/package.json` — deps: `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`, `@comfyorg/comfyui-frontend-types`; build output → `../dist/immac_style_mixer`
- `ui/vite.config.ts` — output `../dist/immac_style_mixer`
- `ui/tsconfig.json` + `ui/tsconfig.node.json`
- `ui/src/main.tsx` — registers ComfyUI extension; mounts panel as a sidebar tab via `app.extensionManager.registerSidebarTab`

### Step 6 — Build UI components
- `hooks/useStyleMixerData.ts` — fetch/save via `/immac_style_mixer/api/data`
- `components/StyleCard.tsx` — name (editable), value, favorite star, delete
- `components/MixCard.tsx` — name, radio to activate, list of style entries (name + weight slider + ON/OFF toggle + remove), favorite star
- `components/StyleGallery.tsx` — grid of all styles; "Add Style" inline form
- `components/StyleMixerPanel.tsx` — top-level: **Current Mix** / **Mixes** / **Styles** sections

### Step 7 — GitHub Actions CI
- `.github/workflows/react-build.yml` — on push to `main`: `npm ci` + `npm run build` inside `ui/`

---

## Key Decisions
- Single `POST /immac_style_mixer/api/data` endpoint for all persistence (minimal backend; expand later)
- Sidebar tab (not floating window) for the panel
- `dist/` tracked in git — required for registry publishing via `includes = ["dist/"]`
- Styles are user-defined strings (prompt text snippets)
