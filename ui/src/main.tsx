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

      function loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = url
        })
      }

      async function updatePreview(mixName: string) {
        try {
          const resp = await fetch('/immac_style_mixer/api/data')
          if (!resp.ok) return
          const data = await resp.json()
          const mix = data.mixes?.find((m: any) => m.name === mixName)

          let urls: string[] = []

          if (mix?.image_filename) {
            urls = [`/view?filename=${encodeURIComponent(mix.image_filename)}&subfolder=immac_style_mixer%2Fmixes&type=input`]
          } else if (mix?.styles?.length) {
            // Fall back to style thumbnails for enabled entries
            const stylesById = Object.fromEntries((data.styles ?? []).map((s: any) => [s.id, s]))
            urls = (mix.styles as any[])
              .filter((e) => e.enabled !== false)
              .map((e) => stylesById[e.style_id])
              .filter((s) => s?.image_filename)
              .map((s) => `/view?filename=${encodeURIComponent(s.image_filename)}&subfolder=immac_style_mixer%2Fstyles&type=input`)
          }

          if (!urls.length) {
            node.imgs = undefined
            window.app?.graph?.setDirtyCanvas(true)
            return
          }

          const results = await Promise.allSettled(urls.map(loadImage))
          const loaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
          if (loaded.length) {
            node.imgs = loaded
            node.setSizeForImage?.()
          } else {
            node.imgs = undefined
          }
          window.app?.graph?.setDirtyCanvas(true)
        } catch (e) {
          console.error('[ImmacStyleMixer] Preview update failed', e)
        }
      }

      // Wrap the widget callback to intercept value changes
      const origCallback = mixWidget.callback
      mixWidget.callback = function (value: string) {
        if (origCallback) origCallback.call(this, value)
        updatePreview(value)
      }

      // Show initial preview without executing
      if (mixWidget.value) updatePreview(mixWidget.value)
    },
  })
}

init().catch(console.error)
