# What We've Learned

## ComfyUI Frontend API

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

### Choosing the right event
| Event | Fires | Use for |
|---|---|---|
| `executed` | Once per node that produced output | Fine-grained per-node logic (requires `comfyClass` filtering) |
| `execution_success` | Once per completed queue item | "Anything finished — refresh everything" |

For simple global refresh, prefer `execution_success`.

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

## Refreshing React sidebar panel data after execution

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

## Canvas / LiteGraph timing on page load

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

## ComfyUI node preview image pattern

Each PickMix/StylePick node gets an `_immacUpdatePreview(value?)` method attached in `nodeCreated`. It:
1. Fetches fresh data from `/immac_style_mixer/api/data`
2. Finds the matching style/mix by name
3. Calls `node.imgs = [img]` + `scheduleCanvasDirty` to display it on the canvas

Cache-busting is done via `image_updated_at` timestamps stored in `style_mixer_data.json` and updated any time a node saves a new image file.

---

## npm / build directory
- The `package.json` is in `ui/`, not the repo root.
- Always run builds from `ui/`:
  ```sh
  cd /path/to/Immac_Style_Mixer/ui && npm run build
  ```
  or use an absolute path in one command:
  ```sh
  bash -c 'cd /path/to/.../ui && npm run build ...'
  ```

---

## `comfy_api` Python package
- The `comfy_api` package (`comfy_api.latest.io`, etc.) is **not on PyPI** — it ships as part of ComfyUI itself and is only importable at runtime inside a running ComfyUI process.
- Tests that import it require either mocking or running inside ComfyUI's environment.
