// /scripts/app.js is an external — types declared in src/comfy.d.ts,
// module resolved to ComfyUI's runtime at runtime (not bundled by Vite).
// @ts-ignore — tsc can't resolve absolute URL externals; Vite handles this correctly.
import { app } from '/scripts/app.js'
import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'

const StyleMixerPanel = React.lazy(() => import('./components/StyleMixerPanel'))

async function init(): Promise<void> {

  ;(app as any).extensionManager.registerSidebarTab({
    id: 'immac-style-mixer',
    icon: 'pi pi-palette',
    title: 'Style Mixer',
    tooltip: 'Immac Style Mixer',
    type: 'custom' as const,
    render: (element: HTMLElement) => {
      const container = document.createElement('div')
      container.id = 'immac-style-mixer-root'
      container.style.position = 'absolute'
      container.style.inset = '0'
      container.style.overflow = 'hidden'
      element.style.position = 'relative'
      element.style.height = '100%'
      element.appendChild(container)

      ReactDOM.createRoot(container).render(
        <React.StrictMode>
          <Suspense fallback={<div style={{ padding: '1rem' }}>Loading…</div>}>
            <StyleMixerPanel />
          </Suspense>
        </React.StrictMode>
      )
    },
  })

  const API_URL = '/immac_style_mixer/api/data'

  async function downloadBackup() {
    const resp = await fetch(API_URL)
    if (!resp.ok) { alert(`Backup failed: HTTP ${resp.status}`); return }
    const data = await resp.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `style_mixer_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadZip() {
    const a = document.createElement('a')
    a.href = '/immac_style_mixer/api/backup.zip'
    a.download = `style_mixer_backup_${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
  }

  function restoreBackup() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.zip,application/json,application/zip'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const isZip = file.name.endsWith('.zip') || file.type === 'application/zip'

      if (isZip) {
        // ZIP restore — send raw bytes to the server which handles extraction
        file.arrayBuffer().then(async (buf) => {
          try {
            const resp = await fetch('/immac_style_mixer/api/restore.zip', {
              method: 'POST',
              headers: { 'Content-Type': 'application/zip' },
              body: buf,
            })
            if (!resp.ok) {
              const text = await resp.text()
              throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`)
            }
            const result = await resp.json()
            try {
              ;(app as any)?.toast?.add({
                severity: 'success',
                summary: 'Style Mixer',
                detail: `ZIP restored: ${result.styles} styles, ${result.mixes} mixes, ${result.images} images. Reload the Style Mixer panel to see changes.`,
                life: 6000,
              })
            } catch (_) { /* not inside ComfyUI */ }
          } catch (err) {
            alert(`Failed to restore ZIP backup: ${(err as Error).message}`)
          }
        }).catch((err) => alert(`Could not read file: ${(err as Error).message}`))
      } else {
        // JSON restore
        const reader = new FileReader()
        reader.onload = async (ev) => {
          try {
            const parsed = JSON.parse(ev.target?.result as string)
            if (!Array.isArray(parsed.styles) || !Array.isArray(parsed.mixes)) {
              throw new Error('Invalid backup: missing styles or mixes arrays.')
            }
            const resp = await fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(parsed),
            })
            if (!resp.ok) throw new Error(`Save failed: HTTP ${resp.status}`)
            try {
              ;(app as any)?.toast?.add({
                severity: 'success',
                summary: 'Style Mixer',
                detail: `Backup restored: ${parsed.styles.length} styles, ${parsed.mixes.length} mixes. Reload the Style Mixer panel to see changes.`,
                life: 6000,
              })
            } catch (_) { /* not inside ComfyUI */ }
          } catch (err) {
            alert(`Failed to restore backup: ${(err as Error).message}`)
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  ;(app as any).registerExtension({
    name: 'ImmacStyleMixer',

    settings: [
      {
        id: 'ImmacStyleMixer.BackupRestore' as any,
        name: 'Style Mixer — Backup & Restore',
        type: (_name: string, _setter: (v: unknown) => void, _value: unknown) => {
          const row = document.createElement('div')
          row.style.cssText = 'display:flex;gap:8px;align-items:center'

          const dlBtn = document.createElement('button')
          dlBtn.textContent = '⬇ Download backup (JSON)'
          dlBtn.title = 'Save all styles and mixes to a JSON file'
          dlBtn.style.cssText = 'cursor:pointer;padding:4px 10px;border-radius:4px'
          dlBtn.onclick = () => downloadBackup().catch(console.error)

          const zipBtn = document.createElement('button')
          zipBtn.textContent = '⬇ Download ZIP (with images)'
          zipBtn.title = 'Save styles, mixes and all images to a ZIP file'
          zipBtn.style.cssText = 'cursor:pointer;padding:4px 10px;border-radius:4px'
          zipBtn.onclick = () => downloadZip()

          const ulBtn = document.createElement('button')
          ulBtn.textContent = '⬆ Restore (JSON or ZIP)'
          ulBtn.title = 'Restore from a JSON or ZIP backup — auto-detected'
          ulBtn.style.cssText = 'cursor:pointer;padding:4px 10px;border-radius:4px'
          ulBtn.onclick = () => restoreBackup()

          row.appendChild(dlBtn)
          row.appendChild(zipBtn)
          row.appendChild(ulBtn)
          return row
        },
        defaultValue: null as any,
      },
    ],

    nodeCreated(node: any) {
      if (
        node.comfyClass !== 'PickMixImmacStyleMixer' &&
        node.comfyClass !== 'StylePickImmacStyleMixer'
      ) return

      // ── shared DOM preview widget ────────────────────────────────────────
      const isPickNode = node.comfyClass === 'StylePickImmacStyleMixer'
      const widgetName = isPickNode ? 'style' : 'mix'

      const comboWidget = node.widgets?.find((w: any) => w.name === widgetName)
      if (!comboWidget) return

      const imgEl = document.createElement('img')
      imgEl.style.cssText = 'width:100%;height:100%;display:none;object-fit:contain;border-radius:4px'
      const container = document.createElement('div')
      container.style.cssText = 'padding:4px;box-sizing:border-box'
      container.appendChild(imgEl)

      // Use closure-based callbacks so computeLayoutSize always gets the
      // current height without any CSS variable timing/ordering issues.
      let previewHeight = 0
      node.addDOMWidget('immac_preview', 'div', container, {
        serialize: false,
        getMinHeight: () => previewHeight,
        getHeight: () => previewHeight,
      })

      function applyImageSize(natW: number, natH: number) {
        const nodeWidth: number = node.size?.[0] ?? 300
        const ratio = natH / natW
        previewHeight = Math.max(80, Math.min(Math.round((nodeWidth - 8) * ratio), 600))
        const s = node.computeSize?.()
        if (s) node.setSize([Math.max(node.size[0], s[0]), Math.max(node.size[1], s[1])])
        node.onResize?.(node.size)
        node.graph?.setDirtyCanvas(true, true)
      }

      function clearImageSize() {
        previewHeight = 0
        imgEl.style.display = 'none'
        node.graph?.setDirtyCanvas(true, true)
      }

      function showUrl(url: string) {
        imgEl.onload = () => {
          imgEl.style.display = 'block'
          applyImageSize(imgEl.naturalWidth, imgEl.naturalHeight)
        }
        imgEl.onerror = () => { clearImageSize() }
        imgEl.src = url
      }

      async function updatePreview(value: string) {
        try {
          const resp = await fetch('/immac_style_mixer/api/data')
          if (!resp.ok) return
          const data = await resp.json()

          if (isPickNode) {
            const style = (data.styles ?? []).find((s: any) => s.name === value)
            if (!style?.image_filename) { clearImageSize(); return }
            const bust = style.image_updated_at ? `&t=${style.image_updated_at}` : ''
            showUrl(`/view?filename=${encodeURIComponent(style.image_filename)}&subfolder=immac_style_mixer%2Fstyles&type=input${bust}`)
          } else {
            const mix = (data.mixes ?? []).find((m: any) => m.name === value)
            let url = ''
            if (mix?.image_filename) {
              const bust = mix.image_updated_at ? `&t=${mix.image_updated_at}` : ''
              url = `/view?filename=${encodeURIComponent(mix.image_filename)}&subfolder=immac_style_mixer%2Fmixes&type=input${bust}`
            } else if (mix?.styles?.length) {
              const stylesById = Object.fromEntries((data.styles ?? []).map((s: any) => [s.id, s]))
              const first = (mix.styles as any[])
                .filter((e) => e.enabled !== false)
                .map((e) => stylesById[e.style_id])
                .find((s) => s?.image_filename)
              if (first) {
                const bust = first.image_updated_at ? `&t=${first.image_updated_at}` : ''
                url = `/view?filename=${encodeURIComponent(first.image_filename)}&subfolder=immac_style_mixer%2Fstyles&type=input${bust}`
              }
            }
            if (!url) { clearImageSize(); return }
            showUrl(url)
          }
        } catch (e) {
          console.error('[ImmacStyleMixer] Preview update failed', e)
        }
      }

      const origCallback = comboWidget.callback
      comboWidget.callback = function (...args: any[]) {
        origCallback?.apply(this, args)
        // Always read the current widget value fresh from node.widgets
        const w = node.widgets?.find((w: any) => w.name === widgetName)
        updatePreview(String(w?.value ?? ''))
      }

      // Accept an explicit value so loadedGraphNode can pass the restored value
      // directly, avoiding any closure-staleness issue. Falls back to a fresh
      // widget lookup when called without an argument (e.g. from the callback).
      node._immacUpdatePreview = (explicitVal?: string) => {
        const w = node.widgets?.find((w: any) => w.name === widgetName)
        updatePreview(explicitVal ?? String(w?.value ?? ''))
      }

      // For freshly created nodes (not restores) loadedGraphNode is never called,
      // so we schedule a deferred first-paint here. We set a flag so that if
      // loadedGraphNode fires for this node (restore path) it can cancel this.
      // Mirror ComfyUI's own pattern (useImageUploadWidget.ts): use
      // requestAnimationFrame to defer past the synchronous graph configuration
      // so the canvas render loop is alive when setDirtyCanvas fires.
      node._immacPreviewScheduled = true
      requestAnimationFrame(() => {
        if (!node._immacPreviewScheduled) return
        const w = node.widgets?.find((w: any) => w.name === widgetName)
        if (w?.value) updatePreview(String(w.value))
      })
    },

    loadedGraphNode(node: any) {
      if (typeof node._immacUpdatePreview !== 'function') return

      node._immacPreviewScheduled = false

      const isPickNode = node.comfyClass === 'StylePickImmacStyleMixer'
      const widgetName = isPickNode ? 'style' : 'mix'
      const comboWidget = node.widgets?.find((w: any) => w.name === widgetName)
      const currentVal = String(comboWidget?.value ?? '')

      requestAnimationFrame(() => {
        if (currentVal === '(no styles saved)' || currentVal === '(no mixes saved)') {
          fetch('/immac_style_mixer/api/data')
            .then((r) => r.json())
            .then((data) => {
              const items: any[] = isPickNode ? (data.styles ?? []) : (data.mixes ?? [])
              const w = node.widgets?.find((w: any) => w.name === widgetName)
              if (items.length > 0 && w) {
                w.value = items[0].name
                if (Array.isArray(w.options?.values)) {
                  w.options.values = items.map((i: any) => i.name)
                }
              }
              node._immacUpdatePreview()
            })
            .catch(() => node._immacUpdatePreview())
        } else {
          node._immacUpdatePreview(currentVal)
        }
      })
    },
  })
}

init().catch(console.error)
