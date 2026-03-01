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
      container.style.height = '100%'
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
  })
}

init().catch(console.error)
