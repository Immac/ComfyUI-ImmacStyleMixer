import type { ComfyApp } from '@comfyorg/comfyui-frontend-types'
import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'

declare global {
  interface Window {
    app?: ComfyApp
  }
}

const StyleMixerPanel = React.lazy(() => import('./components/StyleMixerPanel'))

function waitForApp(): Promise<void> {
  return new Promise((resolve) => {
    function check() {
      if (window.app) {
        resolve()
        return
      }
      const interval = setInterval(() => {
        if (window.app) {
          clearInterval(interval)
          resolve()
        }
      }, 50)
      setTimeout(() => {
        clearInterval(interval)
        console.error('[ImmacStyleMixer] Timeout waiting for ComfyUI app')
        resolve()
      }, 5000)
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', check)
    } else {
      check()
    }
  })
}

async function init(): Promise<void> {
  await waitForApp()

  if (!window.app) {
    console.error('[ImmacStyleMixer] ComfyUI app not available')
    return
  }

  window.app.extensionManager.registerSidebarTab({
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
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
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
            ;(window as any).app?.toast?.add({
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
    input.click()
  }

  window.app.registerExtension({
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
          ulBtn.textContent = '⬆ Restore backup'
          ulBtn.title = 'Load styles and mixes from a JSON backup file'
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
        node.comfyClass !== 'StyleMixImmacStyleMixer' &&
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

      container.style.setProperty('--comfy-widget-min-height', '0')
      container.style.setProperty('--comfy-widget-height', '0')

      node.addDOMWidget('immac_preview', 'div', container, { serialize: false })

      function applyImageSize(natW: number, natH: number) {
        const nodeWidth: number = node.size?.[0] ?? 300
        const ratio = natH / natW
        const displayH = Math.round((nodeWidth - 8) * ratio)
        const clamped = Math.max(80, Math.min(displayH, 600))
        container.style.setProperty('--comfy-widget-min-height', String(clamped))
        container.style.setProperty('--comfy-widget-height', String(clamped))
        const s = node.computeSize?.()
        if (s) node.setSize([Math.max(node.size[0], s[0]), Math.max(node.size[1], s[1])])
        window.app?.graph?.setDirtyCanvas(true)
      }

      function clearImageSize() {
        container.style.setProperty('--comfy-widget-min-height', '0')
        container.style.setProperty('--comfy-widget-height', '0')
        imgEl.style.display = 'none'
        window.app?.graph?.setDirtyCanvas(true)
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
            // Style Pick: show the selected style's image directly
            const style = (data.styles ?? []).find((s: any) => s.name === value)
            if (!style?.image_filename) { clearImageSize(); return }
            const bust = style.image_updated_at ? `&t=${style.image_updated_at}` : ''
            showUrl(`/view?filename=${encodeURIComponent(style.image_filename)}&subfolder=immac_style_mixer%2Fstyles&type=input${bust}`)
          } else {
            // Style Mix: show mix cover or first enabled style thumbnail
            const mix = (data.mixes ?? []).find((m: any) => m.name === value)
            let url = ''
            if (mix?.image_filename) {
              url = `/view?filename=${encodeURIComponent(mix.image_filename)}&subfolder=immac_style_mixer%2Fmixes&type=input`
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
        updatePreview(String(comboWidget.value ?? ''))
      }

      // Store so loadedGraphNode can call it after values are restored
      node._immacUpdatePreview = () => updatePreview(String(comboWidget.value ?? ''))

      // Only call immediately for newly placed nodes (not workflow reloads)
      // loadedGraphNode handles the reload case with the correct restored value
      if (comboWidget.value) updatePreview(String(comboWidget.value))
    },

    loadedGraphNode(node: any) {
      if (typeof node._immacUpdatePreview === 'function') {
        node._immacUpdatePreview()
      }
    },
  })
}

init().catch(console.error)
