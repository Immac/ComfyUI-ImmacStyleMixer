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
      // node.type is the registered LiteGraph type — most reliable check
      if (node.type !== 'StyleMixImmacStyleMixer') return

      const mixWidget = node.widgets?.find((w: any) => w.name === 'mix')
      if (!mixWidget) return

      // --- Remove "Open in MaskEditor" from the context menu ---
      // getExtraMenuOptions is set on the prototype by litegraphService.
      // Overriding on the instance shadows it so we can filter the menu.
      const protoGetExtraMenuOptions = Object.getPrototypeOf(node).getExtraMenuOptions
      node.getExtraMenuOptions = function (canvas: any, options: any[]) {
        const result = protoGetExtraMenuOptions?.call(this, canvas, options) ?? []
        const maskIdx = options.findIndex((o: any) => o?.content?.includes('MaskEditor'))
        if (maskIdx !== -1) options.splice(maskIdx, 1)
        return result
      }

      // --- Live preview update ---
      // app.nodeOutputs returns the reactive Pinia proxy (nodeOutputs.value).
      // Mutating it directly triggers Vue reactivity → onDrawBackground →
      // updatePreviews detects isNewOutput → showPreview() loads the image.
      // This is the same data path the WS "executed" message uses.
      const loadPreview = (mixName: string) => {
        fetch('/immac-style-mixer/data')
          .then((r) => r.json())
          .then((data) => {
            const mix = data.mixes?.find((m: any) => m.name === mixName)
            const nodeId = String(node.id)

            // Clear existing output first (mirrors LoadImage: node.imgs = undefined)
            node.imgs = undefined
            if (window.app!.nodeOutputs[nodeId]) {
              delete window.app!.nodeOutputs[nodeId]
              node.graph?.setDirtyCanvas(true)
            }

            if (!mix?.image_filename) return

            // Set on the reactive proxy — triggers Vue store update
            window.app!.nodeOutputs[nodeId] = {
              images: [{
                filename: mix.image_filename,
                subfolder: 'immac_style_mixer/mixes',
                type: 'input',
              }],
            }
            node.graph?.setDirtyCanvas(true)
          })
          .catch((e) => console.error('[ImmacStyleMixer] preview fetch failed', e))
      }

      // Wrap widget callback so arrows + dropdown changes both fire loadPreview
      const origCallback = mixWidget.callback
      mixWidget.callback = (value: string, ...args: any[]) => {
        origCallback?.call(mixWidget, value, ...args)
        loadPreview(value)
      }

      // Initial load (value isn't settled immediately, defer one frame)
      requestAnimationFrame(() => loadPreview(String(mixWidget.value ?? '')))
    },
  })
}

init().catch(console.error)
