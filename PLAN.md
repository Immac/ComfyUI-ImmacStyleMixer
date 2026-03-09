# Style Mixer — Project Plan & Dev Notes

ComfyUI custom-node extension with a React/TypeScript sidebar panel.
Follows the `Comfy-Org/ComfyUI-React-Extension-Template` pattern.

---

## Implementation Status

### ✅ Step 1 — Python layer cleanup
- [x] Deleted broken tests (used old-style class attributes incompatible with `io.ComfyNode`)
- [x] Removed dead dict registration from `src/immac_tools/__init__.py`
- [x] Removed unused `ExampleForwardingExtension` from `forwarding_nodes.py`

### ✅ Step 2 — Root `__init__.py`
- [x] `NODE_CLASS_MAPPINGS` + `NODE_DISPLAY_NAME_MAPPINGS` (required by ComfyUI core and Manager)
- [x] `comfy_entrypoint` wired to `src/immac_tools/` (forward-compat)
- [x] aiohttp static routes serve `dist/immac_style_mixer/` at `/immac_style_mixer/`
- [x] `nodes.EXTENSION_WEB_DIRS[project_name]` registered via `comfy_config` (with fallback)

### ✅ Step 3 — REST API (`src/immac_tools/api.py`)
- [x] `style_mixer_data.json` load/save helpers
- [x] `GET  /immac_style_mixer/api/data`
- [x] `POST /immac_style_mixer/api/data` (with structural validation)
- [x] `GET  /immac_style_mixer/api/backup` — download ZIP with images
- [x] `POST /immac_style_mixer/api/restore` — restore from JSON or ZIP (auto-detected server-side)
- [x] Routes wired into root `__init__.py` via `register_routes()`
- [x] Images handled by ComfyUI built-ins (`/upload/image` + `/view`)

### ✅ Step 4 — `pyproject.toml`
- [x] `includes = ["dist/"]`
- [x] Removed `[build-system]` / `[tool.setuptools]` blocks
- [x] Metadata updated (`immac_tools.json`)

### ✅ Step 5 — UI scaffold (`ui/`)
- [x] `ui/package.json`, `ui/vite.config.ts` (output → `../dist/immac_style_mixer/`)
- [x] `ui/tsconfig.json` + `ui/tsconfig.node.json`
- [x] `ui/src/main.tsx` — registers ComfyUI sidebar tab `immac-style-mixer`
- [x] Build verified (`npm run build` from `ui/` ✔)

### ✅ Step 6 — UI components
- [x] `types.ts` — `Style`, `Mix`, `MixEntry`, `StyleMixerData`
- [x] `hooks/useStyleMixerData.ts` — fetch/save via API; `uploadStyleImage()` + `styleImageUrl()` helpers
- [x] `components/StyleCard.tsx` — image upload (drag&drop/picker), editable name & prompt, optional negative prompt, favorite star, delete
- [x] `components/MixCard.tsx` — name, click to activate, style entries (ON/OFF + weight bar + remove), add-style dropdown, favorite star
- [x] `components/StyleGallery.tsx` — auto-fill grid (favorites first), inline "Add" form
- [x] `components/StyleMixerPanel.tsx` — Current Mix / Mixes / Styles sections wired to data hook
- [x] `components/BarInput.tsx` — draggable weight slider (ComfyUI style), drag range 0–1, typed range −10–10
- [x] `components/ImageLightbox.tsx` — full-size image overlay on magnify button click

### ✅ Step 7 — Python nodes (V3 API)
- [x] All nodes migrated to V3 API (`comfy_api.latest.io`)
- [x] **Pick Style** (`style_pick_node.py`) — combo of style names; image preview widget on canvas
- [x] **Pick Mix** (`style_mix_node.py`) — combo of mix names; `mix_id` output; canvas image preview (DOM widget); preview updates on widget change without execution
- [x] **Blend Style** (`style_blend_node.py`) — `io.Autogrow` growing slots; accepts raw `style_id` (no weight node) with default weight 1.0; skips zero-weight styles
- [x] **Weight Style** (`style_weight_node.py`) — wraps a `style_id` with a float weight
- [x] **Save Mix** (`save_mix_node.py`) — saves current mix state; optional `example_image` + `mix_id` inputs
- [x] **Save Style** (`save_style_node.py`) — Create / Create or Skip / Create or Update / Overwrite modes; optional `example_image` input; `OUTPUT_NODE = True`; updates `image_updated_at` for cache-busting
- [x] `IS_CHANGED` uses data file mtime to bust node cache on sidebar saves
- [x] Node display names are verb-first: Pick Style, Blend Style, etc.

### ✅ Step 8 — Canvas integration
- [x] Drag style card onto canvas → creates a Pick Style node set to that style (`onDragEnd` pattern; ComfyUI intercepts the native `drop` event)
- [x] Drag mix card onto canvas → creates a Pick Mix node
- [x] `loadedGraphNode` hook upgrades placeholder nodes on workflow reload
- [x] `scheduleCanvasDirty`: 10 rAF frames after node creation to force canvas redraw on page reload (avoids race with LiteGraph render loop)
- [x] Node combos refresh via `refreshComboInNodes` 1500 ms after sidebar saves (add/delete only; weight/toggle changes are silent)

### ✅ Step 9 — Execution feedback
- [x] `execution_success` event → refreshes all node previews (`_immacUpdatePreview`)
- [x] `execution_success` event → dispatches `immac:execution_success` custom window event → re-fetches sidebar data so images update automatically without page reload
- [x] `image_updated_at` timestamps in `style_mixer_data.json` flow through to `styleImageUrl`/`mixImageUrl` cache-busters

### ✅ Step 10 — Backup / Restore
- [x] Moved to ComfyUI Settings panel (registered via `settings[]` in `registerExtension`)
- [x] **Download ZIP** — server-side endpoint bundles `style_mixer_data.json` + all referenced images
- [x] **Restore** — auto-detects JSON vs ZIP; ZIP restore extracts images server-side; shows real server error on failure

### ✅ Step 11 — Negative prompts
- [x] `negative_prompt` field on `Style` and `Mix` types
- [x] Pick Style node exposes `negative_prompt` output
- [x] Skip zero-weight styles from blended prompt output

### ✅ Step 12 — Documentation & packaging
- [x] `README.md` rewritten (nodes, sidebar, dev build)
- [x] `LICENSE` (MIT, 2026)
- [x] Example workflow moved to `examples/` (ComfyUI template discovery)
- [x] `style_mixer_data.json.example` added; actual data file removed from tracking
- [x] `dist/` tracked in git (required for registry publishing)

---

## UI Polish (all done)

- [x] Auto-fill CSS grid — styles: `minmax(180px, 1fr)`, mixes: `minmax(280px, 1fr)`
- [x] Click card to select mix (no radio button)
- [x] Magnify button on style thumbnail hover; `scale-105` CSS transition
- [x] Full-size image lightbox (`ImageLightbox.tsx`)
- [x] Copy prompt button on style and mix cards (clipboard API)
- [x] Draggable bar input for weights (`BarInput.tsx`)
- [x] Delete confirmation as centered card overlay (`overflow: hidden` clipping); shows actual name
- [x] On/off toggle and weight bar in Current Mix section
- [x] Double-click current mix chip to toggle on/off
- [x] Remove button on current mix style chips
- [x] Drag style cards onto mix cards or Current Mix to add them
- [x] Toggle add/remove from mix button on style cards
- [x] Mixes section scrolls horizontally when cards overflow
- [x] Toast warning on delete; dirty badge on add/delete; auto-refresh on delete
- [x] `object-fit: contain` (padded) for all card and mix thumbnails
- [x] Fill-bar loading animation while sidebar data fetches

---

## Key Decisions

- Single `POST /immac_style_mixer/api/data` endpoint for all persistence (minimal backend)
- Sidebar tab (not floating window) for the panel
- `dist/` tracked in git — required for registry publishing via `includes = ["dist/"]`
- Styles are user-defined prompt text snippets (no fixed schema)
- Weight drag range 0–1, typed range −10–10 (separate `dragMin`/`dragMax`)

---

## Dev Notes

### Build

`package.json` is in `ui/`, not the repo root. Always build from there:
```sh
cd /path/to/Immac_Style_Mixer/ui && npm run build
# or as a one-liner from any directory:
bash -c 'cd /path/to/.../ui && npm run build'
```

---

### Accessing the `api` singleton

**Do NOT** use `(app as any).api` — it is `undefined` in the newer ComfyUI Vue frontend.
Always import directly:
```ts
// @ts-ignore
import { api } from '/scripts/api.js'
import { app } from '/scripts/app.js'
```

Declare types in `comfy.d.ts` and add to Vite externals in `vite.config.ts`:
```ts
rollupOptions: { external: ['/scripts/app.js', '/scripts/api.js'] }
```

---

### Choosing the right ComfyUI event

| Event | Fires | Use for |
|---|---|---|
| `executed` | Once per node that produced output | Fine-grained per-node logic (filter by `comfyClass`) |
| `execution_success` | Once per completed queue item | "Anything finished — refresh everything" |

For simple global refresh, prefer `execution_success`.

---

### Refreshing node previews after execution

```ts
api.addEventListener('execution_success', () => {
  const nodes: any[] = (app as any).graph?._nodes ?? []
  for (const n of nodes) {
    if (typeof n._immacUpdatePreview === 'function') n._immacUpdatePreview()
  }
})
```

---

### Refreshing sidebar panel data after execution

1. `main.tsx` dispatches a custom event alongside canvas refresh:
   ```ts
   api.addEventListener('execution_success', () => {
     refreshAllPreviews()
     window.dispatchEvent(new CustomEvent('immac:execution_success'))
   })
   ```
2. `useStyleMixerData` listens and re-fetches:
   ```ts
   useEffect(() => {
     const handler = () => { fetchData().catch(() => {}) }
     window.addEventListener('immac:execution_success', handler)
     return () => window.removeEventListener('immac:execution_success', handler)
   }, [fetchData])
   ```

---

### Canvas / LiteGraph timing on page load

Node preview images must not be set before LiteGraph's render loop is running.

**What didn't work:**
- Calling `_immacUpdatePreview` immediately in `loadedGraphNode` → loop not started yet
- `setTimeout(500ms)` → fragile, still sometimes too early
- rAF polling for `LiteGraph.use_deferred_text_metrics` → property unavailable in ComfyUI's build
- `Object.defineProperty` on `widget.value` → misses internal ComboWidget private field writes (arrow navigation)

**What works:**
```ts
function scheduleCanvasDirty(node: any, frames = 10) {
  let count = 0
  function tick() {
    node.setDirtyCanvas?.(true, true)
    if (++count < frames) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
```
10 consecutive rAF calls guarantees the render loop is running and the DOM widget image renders correctly.

---

### ComfyUI node preview image pattern

Each Pick Mix / Pick Style node gets `_immacUpdatePreview(value?)` attached in `nodeCreated`. It:
1. Fetches fresh data from `/immac_style_mixer/api/data`
2. Finds the matching style/mix by name
3. Sets `node.imgs = [img]` + calls `scheduleCanvasDirty`

Cache-busting via `image_updated_at` timestamps stored in `style_mixer_data.json`, updated whenever a node saves a new image file.

---

### Style Mix node — preview image on widget change

**Goal:** show the selected mix's cover image (or a style fallback) in the node body when the `mix` combo widget changes, without triggering execution.

**What doesn't work:**
- `node.imgs` + `setSizeForImage()` — deprecated; no visible effect unless `$$canvas-image-preview` DOM widget already exists (only after `onExecuted`)
- `Object.defineProperty` on `widget.value` — misses internal ComboWidget private field writes (arrow buttons)

**What works:**
- `node.addDOMWidget(...)` injects a real `<img>` into the node body — renders immediately, fully controlled, not subject to deprecation issues
- `mixWidget.callback` wrapping is the correct hook — fires reliably on all interaction paths (arrows, context menu, programmatic calls), with `widget.value` already updated

**Implementation** (`ui/src/main.tsx`, `nodeCreated` hook):
1. Create a `<div><img></div>` DOM widget on the node (`serialize: false`)
2. Wrap `mixWidget.callback` → call `updatePreview(mixWidget.value)`
3. `updatePreview` fetches data, finds the mix, resolves image URL (mix cover → first enabled style → nothing), sets `imgEl.src`
4. `scheduleCanvasDirty` fires across 10 rAF frames after node creation

---

### Style drag to canvas

ComfyUI intercepts the native `drop` event on the canvas. Use the `onDragEnd` pattern instead:
```ts
card.addEventListener('dragend', (e) => {
  // use e.clientX / e.clientY to find drop position
  // call app.graph.createNode(...) and position it
})
```

---

### `comfy_api` Python package

The `comfy_api` package (`comfy_api.latest.io`, etc.) is **not on PyPI** — it ships inside ComfyUI itself and is only importable at runtime inside a running ComfyUI process. Tests that import it require mocking or running inside ComfyUI's environment.

---

### Node combo refresh strategy

- **Add or delete** a style or mix → call `app.refreshComboInNodes()` after 1500 ms (debounced)
- **Weight change / enabled toggle / current_mix_id change** → silent save, no combo refresh
- This avoids disruptive node widget resets during normal slider interaction
