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

  window.app.registerExtension({
    name: 'ImmacStyleMixer',

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

      if (comboWidget.value) updatePreview(String(comboWidget.value))
    },
  })
}

init().catch(console.error)
