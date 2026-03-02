import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPTY_DATA, StyleMixerData } from '../types'

const API_URL = '/immac_style_mixer/api/data'

export function useStyleMixerData() {
  const [data, setData] = useState<StyleMixerData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // True when a mix or style has been added/deleted since the last cache refresh.
  const [pendingRefresh, setPendingRefresh] = useState(false)

  const dataRef = useRef<StyleMixerData>(EMPTY_DATA)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(API_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<StyleMixerData>
      })
      .then((d) => { dataRef.current = d; setData(d) })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  // Debounced save — writes 400ms after the last update.
  const update = useCallback((next: StyleMixerData | ((prev: StyleMixerData) => StyleMixerData)) => {
    const prev = dataRef.current
    const resolved = typeof next === 'function' ? next(prev) : next
    dataRef.current = resolved
    setData(resolved)

    const mixCountDelta = resolved.mixes.length - prev.mixes.length
    const styleCountDelta = resolved.styles.length - prev.styles.length

    if (mixCountDelta < 0 || styleCountDelta < 0) {
      // Something was deleted — no card to show a badge on. Refresh immediately
      // and notify the user via the ComfyUI toast system.
      try {
        ;(window as any).app?.refreshComboInNodes?.()
        ;(window as any).app?.toast?.add({
          severity: 'warn',
          summary: 'Style Mixer',
          detail: 'A mix or style was deleted — node combo lists have been refreshed.',
          life: 4000,
        })
      } catch (e) {
        console.warn('[ImmacStyleMixer] refreshComboInNodes/toast failed', e)
      }
      setPendingRefresh(false)
    } else if (mixCountDelta > 0 || styleCountDelta > 0) {
      // Something was added — show the badge so the user can reload at will.
      setPendingRefresh(true)
    }

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolved),
      }).catch((e: unknown) => console.error('[ImmacStyleMixer] Save failed', e))
    }, 400)
  }, [])

  // Call this when the user explicitly wants to refresh the ComfyUI node cache.
  const refreshNodes = useCallback(() => {
    try {
      ;(window as any).app?.refreshComboInNodes?.()
    } catch (e) {
      console.warn('[ImmacStyleMixer] refreshComboInNodes failed', e)
    }
    setPendingRefresh(false)
  }, [])

  return { data, loading, error, update, pendingRefresh, refreshNodes }
}

/** Upload a style image via ComfyUI's built-in endpoint and return the filename. */
export async function uploadStyleImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('image', file)
  form.append('subfolder', 'immac_style_mixer/styles')
  form.append('type', 'input')
  const resp = await fetch('/upload/image', { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Upload failed: HTTP ${resp.status}`)
  const json = (await resp.json()) as { name: string }
  return json.name
}

/** Build a URL to display a style image via ComfyUI's /view endpoint.
 * Pass `updatedAt` (image_updated_at from the Style object) to bust the browser cache
 * when the file has been overwritten in place by the StyleCreate node. */
export function styleImageUrl(filename: string, updatedAt?: number): string {
  const bust = updatedAt ? `&t=${updatedAt}` : ''
  return `/view?filename=${encodeURIComponent(filename)}&subfolder=immac_style_mixer%2Fstyles&type=input${bust}`
}

/** Upload a mix cover image via ComfyUI's built-in endpoint and return the filename. */
export async function uploadMixImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('image', file)
  form.append('subfolder', 'immac_style_mixer/mixes')
  form.append('type', 'input')
  const resp = await fetch('/upload/image', { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Upload failed: HTTP ${resp.status}`)
  const json = (await resp.json()) as { name: string }
  return json.name
}

/** Build a URL to display a mix image via ComfyUI's /view endpoint. */
export function mixImageUrl(filename: string): string {
  return `/view?filename=${encodeURIComponent(filename)}&subfolder=immac_style_mixer%2Fmixes&type=input`
}
