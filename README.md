# ComfyUI-ImmacStyleMixer

A ComfyUI custom node package that adds a **Style Mixer** sidebar panel for managing reusable prompt styles and named mixes, plus a set of nodes to use those styles directly inside your workflows.

---

## Features

### Sidebar panel

Open the **Immac Style Mixer** tab in the ComfyUI sidebar to:

- **Styles** — create, edit, and delete named prompt snippets with an optional thumbnail image.
  - Drag-and-drop or click to upload a thumbnail.
  - Favorite styles sort to the top of the grid.
  - Click the magnify icon to open a full-size lightbox.
  - Copy the prompt text to the clipboard in one click.
  - Drag a style card onto the canvas to instantly create a **Style Pick** node wired to that style.
- **Mixes** — combine styles into a named mix with individual per-style weights and on/off toggles.
  - Draggable bar inputs for weights (ComfyUI-native feel).
  - Copy the fully assembled prompt for the selected mix.
  - The **Current Mix** section shows the active mix's styles and their thumbnails at a glance.
- **Node preview** — Style Mix nodes show a live thumbnail of the selected mix directly on the canvas node.

All data is stored in `style_mixer_data.json` beside the custom node and persisted via a lightweight REST API.

### Custom nodes (category `Immac/Style Mixer`)

| Node | Node ID | Description |
|---|---|---|
| **Style Mix** | `StyleMixImmacStyleMixer` | Picks a saved mix by name and outputs the assembled weighted prompt string. |
| **Style Pick** | `StylePickImmacStyleMixer` | Picks a saved style by name and outputs `style_name`, `style_id`, and `style_value`. |
| **Weight Style** | `StyleWeightImmacStyleMixer` | Pairs a `style_id` (from Style Pick) with a weight; outputs a `style_entry` JSON for Style Blend and a `weighted_value` string. |
| **Style Blend** | `StyleBlendImmacStyleMixer` | Aggregates up to 16 weighted `style_entry` inputs into a `blend_json` and an assembled `prompt`. Supports deduplication and weight normalisation modes. |
| **Save Mix** | `SaveMixImmacStyleMixer` | Persists a `blend_json` (from Style Blend) as a named mix. Supports *Create* and *Update (by name)* modes. |
| **Create Style** | `StyleCreateImmacStyleMixer` | Creates a new style entry (name, prompt value, optional image). *Fail* or *Skip* on duplicate names. |
| **Modify Style** | `StyleModifyImmacStyleMixer` | Updates an existing style by `style_id`. Only non-empty inputs overwrite the stored value. |

---

## Installation

Clone into your ComfyUI `custom_nodes` directory and restart ComfyUI:

```bash
cd /path/to/ComfyUI/custom_nodes
git clone https://github.com/Immac/ComfyUI-ImmacStyleMixer
```

ComfyUI will discover the `comfy_entrypoint` automatically. The sidebar tab and all nodes will appear after the next restart.

> **ComfyUI Manager** — if you use a manager that supports Git URLs, add `https://github.com/Immac/ComfyUI-ImmacStyleMixer` directly.

---

## Development

### Prerequisites

- Python 3.12+ with `comfy_api` available (a running ComfyUI environment).
- Node.js 18+ and npm (for the React UI).

### Build the UI

```bash
cd ui
npm install
npm run build
```

The compiled assets are written to `dist/immac_style_mixer/` and committed to the repository so end users do not need Node.js.

### Project layout

```
__init__.py                  # ComfyUI entry point — registers nodes, API routes, and static files
src/immac_tools/
    api.py                   # REST API (GET/POST /immac_style_mixer/api/data, export/import)
    style_mix_node.py        # Style Mix node
    style_pick_node.py       # Style Pick node
    style_weight_node.py     # Weight Style node
    style_blend_node.py      # Style Blend node
    save_mix_node.py         # Save Mix node
    style_create_node.py     # Create Style node
    style_modify_node.py     # Modify Style node
    _style_utils.py          # Shared data load/save helpers
ui/src/
    main.tsx                 # ComfyUI sidebar tab registration + canvas node preview
    components/              # React components (StyleMixerPanel, StyleCard, MixCard, …)
    hooks/useStyleMixerData.ts
style_mixer_data.json        # Persisted styles and mixes (auto-created on first use)
dist/immac_style_mixer/      # Built UI assets (committed)
```

---

## License

MIT — see [LICENSE](LICENSE).
