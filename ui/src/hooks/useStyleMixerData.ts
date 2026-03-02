import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPTY_DATA, StyleMixerData } from '../types'

const API_URL = '/immac_style_mixer/api/data'

export function useStyleMixerData() {
  const [data, setData] = useState<StyleMixerData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Tracks which mix IDs have changes not yet flushed to the ComfyUI node cache.
  const [dirtyMixIds, setDirtyMixIds] = useState<ReadonlySet<string>>(new Set())

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

    // Compute which mix IDs became dirty due to this change.
    setDirtyMixIds((prevDirty) => {
      const dirty = new Set(prevDirty)

      // Mixes whose own content changed.
      for (const mix of resolved.mixes) {
        const prevMix = prev.mixes.find((m) => m.id === mix.id)
        if (!prevMix || JSON.stringify(prevMix) !== JSON.stringify(mix)) {
          dirty.add(mix.id)
        }
      }

      // If any style's content changed, mark every mix that uses it as dirty.
      const changedStyleIds = new Set(
        resolved.styles
          .filter((s) => {
            const p = prev.styles.find((ps) => ps.id === s.id)
            return !p || JSON.stringify(p) !== JSON.stringify(s)
          })
          .map((s) => s.id)
      )
      if (changedStyleIds.size > 0) {
        for (const mix of resolved.mixes) {
          if (mix.styles.some((e) => changedStyleIds.has(e.style_id))) {
            dirty.add(mix.id)
          }
        }
      }

      // Remove IDs for mixes that no longer exist.
      const mixIdSet = new Set(resolved.mixes.map((m) => m.id))
      for (const id of dirty) {
        if (!mixIdSet.has(id)) dirty.delete(id)
      }

      return dirty
    })

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
  // Clears all dirty badges once the refresh fires.
  const refreshNodes = useCallback(() => {
    try {
      ;(window as any).app?.refreshComboInNodes?.()
    } catch (e) {
      console.warn('[ImmacStyleMixer] refreshComboInNodes failed', e)
    }
    setDirtyMixIds(new Set())
  }, [])

  return { data, loading, error, update, dirtyMixIds, refreshNodes }
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
