/**
 * Type declarations for ComfyUI runtime modules (served by the ComfyUI server,
 * not bundled — configured as Vite externals so the browser resolves them).
 */

declare module '/scripts/app.js' {
  import type { ComfyApp } from '@comfyorg/comfyui-frontend-types'
  const app: ComfyApp
  export { app }
}

declare module '/scripts/api.js' {
  import type { ComfyApi } from '@comfyorg/comfyui-frontend-types'
  const api: ComfyApi
  export { api }
}
