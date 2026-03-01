import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPTY_DATA, StyleMixerData } from '../types'

const API_URL = '/immac_style_mixer/api/data'

export function useStyleMixerData() {
  const [data, setData] = useState<StyleMixerData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(API_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<StyleMixerData>
      })
      .then((d) => setData(d))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  // Debounced save — writes 400ms after the last update
  const update = useCallback((next: StyleMixerData | ((prev: StyleMixerData) => StyleMixerData)) => {
    setData((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(resolved),
        }).catch((e: unknown) => console.error('[ImmacStyleMixer] Save failed', e))
      }, 400)
      return resolved
    })
  }, [])

  return { data, loading, error, update }
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

/** Build a URL to display a style image via ComfyUI's /view endpoint. */
export function styleImageUrl(filename: string): string {
  return `/view?filename=${encodeURIComponent(filename)}&subfolder=immac_style_mixer%2Fstyles&type=input`
}
