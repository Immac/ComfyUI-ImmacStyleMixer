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
      if (node.comfyClass !== 'StyleMixImmacStyleMixer') return

      const mixWidget = node.widgets?.find((w: any) => w.name === 'mix')
      if (!mixWidget) return

      // Create a DOM-based image preview widget so we bypass the deprecated
      // node.imgs / setSizeForImage path that no longer works in the new frontend.
      const imgEl = document.createElement('img')
      imgEl.style.cssText = 'width:100%;display:none;object-fit:contain;border-radius:4px'
      const container = document.createElement('div')
      container.style.cssText = 'padding:4px'
      container.appendChild(imgEl)
      node.addDOMWidget('immac_mix_preview', 'div', container, { serialize: false })

      async function updatePreview(mixName: string) {
        try {
          const resp = await fetch('/immac_style_mixer/api/data')
          if (!resp.ok) return
          const data = await resp.json()
          const mix = data.mixes?.find((m: any) => m.name === mixName)

          let url = ''

          if (mix?.image_filename) {
            url = `/view?filename=${encodeURIComponent(mix.image_filename)}&subfolder=immac_style_mixer%2Fmixes&type=input`
          } else if (mix?.styles?.length) {
            // Fall back to the first enabled style that has a thumbnail
            const stylesById = Object.fromEntries((data.styles ?? []).map((s: any) => [s.id, s]))
            const first = (mix.styles as any[])
              .filter((e) => e.enabled !== false)
              .map((e) => stylesById[e.style_id])
              .find((s) => s?.image_filename)
            if (first) {
              url = `/view?filename=${encodeURIComponent(first.image_filename)}&subfolder=immac_style_mixer%2Fstyles&type=input`
            }
          }

          if (!url) {
            imgEl.style.display = 'none'
            return
          }

          imgEl.onload = () => {
            imgEl.style.display = 'block'
            window.app?.graph?.setDirtyCanvas(true)
          }
          imgEl.onerror = () => { imgEl.style.display = 'none' }
          imgEl.src = url
        } catch (e) {
          console.error('[ImmacStyleMixer] Preview update failed', e)
        }
      }

      // ComfyUI combo widgets reliably call widget.callback() when the value
      // changes (arrow buttons, context menu, programmatic set). Reading
      // widget.value inside the callback returns the already-updated value.
      const origCallback = mixWidget.callback
      mixWidget.callback = function (...args: any[]) {
        origCallback?.apply(this, args)
        updatePreview(String(mixWidget.value ?? ''))
      }

      // Show initial preview without executing
      if (mixWidget.value) updatePreview(String(mixWidget.value))
    },
  })
}

init().catch(console.error)
