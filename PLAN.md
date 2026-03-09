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
- [x] Restore `NODE_CLASS_MAPPINGS` + `NODE_DISPLAY_NAME_MAPPINGS` (required by ComfyUI core and Manager; `comfy_entrypoint` alone doesn't surface nodes universally yet)
- [x] Wire `comfy_entrypoint` to `src/immac_tools/nodes.py` (forward-compat)
- [x] Register aiohttp static routes to serve `dist/immac_style_mixer/` at `/immac_style_mixer/`
- [x] Register `nodes.EXTENSION_WEB_DIRS[project_name]` using `comfy_config` (with fallback)

### ✅ Step 3 — Add Style Mixer REST API (`src/immac_tools/api.py`)
- [x] `style_mixer_data.json` load/save helpers
- [x] `GET  /immac_style_mixer/api/data`
- [x] `POST /immac_style_mixer/api/data` (with basic structural validation)
- [x] Routes wired into root `__init__.py` via `register_routes()`
- [x] Images handled by ComfyUI built-ins (`/upload/image` + `/view`)

### ✅ Step 4 — Update `pyproject.toml`
- [x] Change `includes = []` → `includes = ["dist/"]`
- [x] Remove `[build-system]` / `[tool.setuptools]` blocks

### ✅ Step 5 — Scaffold `ui/` (React + TypeScript + Vite)
- [x] `ui/package.json`
- [x] `ui/vite.config.ts` — output → `../dist/immac_style_mixer/`
- [x] `ui/tsconfig.json` + `ui/tsconfig.node.json`
- [x] `ui/src/main.tsx` — registers ComfyUI sidebar tab `immac-style-mixer`
- [x] `ui/src/components/StyleMixerPanel.tsx` — placeholder
- [x] Build verified (`npm run build` ✔)

### ✅ Step 6 — Build UI components
- [x] `types.ts` — `Style`, `Mix`, `MixEntry`, `StyleMixerData`
- [x] `hooks/useStyleMixerData.ts` — fetch/save via API; `uploadStyleImage()` + `styleImageUrl()` helpers
- [x] `components/StyleCard.tsx` — image upload (drag&drop/picker), editable name & prompt, favorite star, delete
- [x] `components/MixCard.tsx` — name, radio to activate, style entries (ON/OFF + weight + remove), add-style dropdown, favorite star
- [x] `components/StyleGallery.tsx` — sorted grid (favorites first), inline "Add" form
- [x] `components/StyleMixerPanel.tsx` — Current Mix / Mixes / Styles sections wired to data hook
- [x] Build verified (`tsc && vite build` ✔)

### ✅ Step 7 — Documentation and license
- [x] Rewrite `README.md` to accurately describe the Style Mixer (nodes, sidebar, dev build)
- [x] Update `PLAN.md` to reflect completed features
- [x] Verify `LICENSE` (MIT, 2026)

---

## Post-plan features (completed)

These features were implemented after the core plan was done:

### UI polish
- [x] Auto-fill CSS grid layout — styles: `minmax(180px, 1fr)`, mixes: `minmax(280px, 1fr)`
- [x] Click card to select mix (removed radio button)
- [x] Magnify button on style thumbnail hover; `scale-105` CSS transition
- [x] Full-size image lightbox (`ImageLightbox.tsx`)
- [x] Copy prompt button on style and mix cards (clipboard API)
- [x] Draggable bar input for style weights (`BarInput.tsx`) — matches ComfyUI slider feel
- [x] Delete confirmation shown as centered card overlay (`overflow: hidden` clipping)
- [x] Overlay shows actual style/mix name in delete prompt

### Canvas integration
- [x] Drag a style card onto the canvas → creates a `StylePickImmacStyleMixer` node set to that style (uses `onDragEnd` pattern; ComfyUI intercepts the `drop` event itself)
- [x] Style Mix node shows a thumbnail preview of the selected mix's cover image (or first enabled style fallback)
  - DOM widget (`addDOMWidget`) renders immediately on node creation — not subject to deprecated `node.imgs` / `setSizeForImage`
  - `mixWidget.callback` wrapping is the correct hook (fires on arrows, context menu, programmatic calls)
  - `scheduleCanvasDirty`: 10 rAF frames after node creation to force the canvas to redraw and show the preview on page reload

---

## Key Decisions
- Single `POST /immac_style_mixer/api/data` endpoint for all persistence (minimal backend; expand later)
- Sidebar tab (not floating window) for the panel
- `dist/` tracked in git — required for registry publishing via `includes = ["dist/"]`
- Styles are user-defined strings (prompt text snippets)

---

## Dev Notes

### Accessing the `api` singleton

- **Do NOT** use `(app as any).api` — it is `undefined` in the newer ComfyUI Vue frontend.
- **Always** import it directly:
  ```ts
  // @ts-ignore
  import { api } from '/scripts/api.js'
  ```
- Declare the module type in `comfy.d.ts`:
  ```ts
  declare module '/scripts/api.js' {
    export const api: { addEventListener: (event: string, cb: (...args: any[]) => void) => void }
  }
  ```
- Add it to Vite's externals in `vite.config.ts`:
  ```ts
  rollupOptions: { external: ['/scripts/app.js', '/scripts/api.js'] }
  ```

---

### Choosing the right ComfyUI event

| Event | Fires | Use for |
|---|---|---|
| `executed` | Once per node that produced output | Fine-grained per-node logic (requires `comfyClass` filtering) |
| `execution_success` | Once per completed queue item | "Anything finished — refresh everything" |

For simple global refresh, prefer `execution_success`.

---

### Refreshing node previews after execution

Listen on `execution_success` and call `_immacUpdatePreview()` on every node that has it:
```ts
api.addEventListener('execution_success', () => {
  const nodes: any[] = (app as any).graph?._nodes ?? []
  for (const n of nodes) {
    if (typeof n._immacUpdatePreview === 'function') n._immacUpdatePreview()
  }
})
```

---

### Refreshing React sidebar panel data after execution

The panel mounts once and its `useStyleMixerData` hook fetches data once on mount. To keep sidebar images up to date after a workflow runs:

1. In `main.tsx`, dispatch a `CustomEvent` alongside the canvas refresh:
   ```ts
   api.addEventListener('execution_success', () => {
     refreshAllPreviews()
     window.dispatchEvent(new CustomEvent('immac:execution_success'))
   })
   ```

2. In `useStyleMixerData`, listen for it and re-fetch:
   ```ts
   useEffect(() => {
     const handler = () => { fetchData().catch(() => {}) }
     window.addEventListener('immac:execution_success', handler)
     return () => window.removeEventListener('immac:execution_success', handler)
   }, [fetchData])
   ```

This keeps the panel's `image_updated_at` timestamps fresh, which flows through to `styleImageUrl`/`mixImageUrl` cache-busters so images reload automatically without a full page refresh.

---

### Canvas / LiteGraph timing on page load

Node preview images (`_immacUpdatePreview`) must not be called before LiteGraph's render loop is running — the image widget silently fails otherwise.

**What didn't work:**
- Calling immediately in `loadedGraphNode` → canvas loop not started yet
- A fixed `setTimeout(500ms)` → too fragile, can still be too early
- `requestAnimationFrame` waiting for `LiteGraph.use_deferred_text_metrics` → property unavailable in ComfyUI's LiteGraph build

**What works:**
- Schedule `setDirtyCanvas(true)` across ~10 consecutive `requestAnimationFrame` calls. By that point the canvas loop has started and the widget renders correctly:
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

---

### ComfyUI node preview image pattern

Each PickMix/StylePick node gets an `_immacUpdatePreview(value?)` method attached in `nodeCreated`. It:
1. Fetches fresh data from `/immac_style_mixer/api/data`
2. Finds the matching style/mix by name
3. Calls `node.imgs = [img]` + `scheduleCanvasDirty` to display it on the canvas

Cache-busting is done via `image_updated_at` timestamps stored in `style_mixer_data.json` and updated any time a node saves a new image file.

---

### Style Mix node — preview image on widget change

**Goal:** show the selected mix's cover image (or a style fallback) in the node body when the `mix` combo widget changes, without triggering execution.

**What doesn't work in the current ComfyUI frontend:**

- `node.imgs` + `setSizeForImage()` — deprecated. Setting `node.imgs` has no visible effect unless a `$$canvas-image-preview` DOM widget is already present on the node, which only happens after the node executes at least once (via `onExecuted`). `setSizeForImage` is explicitly `@deprecated` in the frontend's type definitions.
- `Object.defineProperty` on `widget.value` — the `ComboWidget` class stores its value in a private field. Shadowing `.value` on the instance intercepts external assignments but misses internal stepped-widget logic that writes to the private field directly (e.g. arrow button navigation).

**What works:**

- `node.addDOMWidget(...)` injects a real `<img>` HTML element into the node body. It renders immediately on node creation, is fully controlled by us, and isn't subject to any of the deprecation or class-internals issues.
- `mixWidget.callback` wrapping is the correct hook for value changes — ComfyUI calls it reliably on all interaction paths (arrows, context menu, programmatic `widget.callback?.(value)` calls). `widget.value` is already updated by the time callback fires.

**Implementation** (`ui/src/main.tsx`, `nodeCreated` hook):
1. Create a `<div><img></div>` DOM widget on the node (`serialize: false`).
2. Wrap `mixWidget.callback` to call `updatePreview(mixWidget.value)`.
3. `updatePreview` fetches `/immac_style_mixer/api/data`, finds the mix, resolves the image URL (mix cover → first enabled style thumbnail → nothing), and sets `imgEl.src`. The `<img>` is hidden until loaded.
4. `scheduleCanvasDirty` fires `setDirtyCanvas(true, true)` across 10 rAF frames after node creation so the preview appears on page reload without a hard race condition against the LiteGraph render loop.

---

### npm / build directory

- The `package.json` is in `ui/`, not the repo root.
- Always run builds from `ui/`:
  ```sh
  cd /path/to/Immac_Style_Mixer/ui && npm run build
  ```
  or use an absolute path in one command:
  ```sh
  bash -c 'cd /path/to/.../ui && npm run build'
  ```

---

### `comfy_api` Python package

- The `comfy_api` package (`comfy_api.latest.io`, etc.) is **not on PyPI** — it ships as part of ComfyUI itself and is only importable at runtime inside a running ComfyUI process.
- Tests that import it require either mocking or running inside ComfyUI's environment.
