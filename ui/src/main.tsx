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

      const updatePreview = async (mixName: string) => {
        try {
          const resp = await fetch('/immac-style-mixer/data')
          const data = await resp.json()
          const mix = data.mixes?.find((m: any) => m.name === mixName)

          const current = { ...(window.app!.nodeOutputs ?? {}) }
          if (mix?.image_filename) {
            current[String(node.id)] = {
              images: [{
                filename: mix.image_filename,
                subfolder: 'immac_style_mixer/mixes',
                type: 'input',
              }],
            }
          } else {
            delete current[String(node.id)]
          }
          window.app!.nodeOutputs = current
          node.graph?.setDirtyCanvas(true)
        } catch (e) {
          console.error('[ImmacStyleMixer] Failed to load mix preview', e)
        }
      }

      // Load preview immediately on node creation
      requestAnimationFrame(() => updatePreview(String(mixWidget.value ?? '')))

      // Update preview whenever the widget value changes
      const origCallback = mixWidget.callback
      mixWidget.callback = (value: string, ...args: any[]) => {
        origCallback?.call(mixWidget, value, ...args)
        updatePreview(value)
      }
    },
  })
}

init().catch(console.error)
