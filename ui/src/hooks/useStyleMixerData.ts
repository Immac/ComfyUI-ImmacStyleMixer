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

  const fetchData = useCallback(() => {
    return fetch(API_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<StyleMixerData>
      })
      .then((d) => { dataRef.current = d; setData(d) })
      .catch((e: unknown) => setError(String(e)))
  }, [])

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handler = () => { fetchData().catch(() => {}) }
    window.addEventListener('immac:execution_success', handler)
    return () => window.removeEventListener('immac:execution_success', handler)
  }, [fetchData])

  // Debounced save — writes 400ms after the last update.
  const update = useCallback((next: StyleMixerData | ((prev: StyleMixerData) => StyleMixerData), options?: { silent?: boolean }) => {
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
      // Something added. If a list was previously empty (showing the placeholder),
      // refresh combos immediately so nodes pick up the first real name.
      const wasStylesEmpty = styleCountDelta > 0 && prev.styles.length === 0
      const wasMixesEmpty  = mixCountDelta  > 0 && prev.mixes.length  === 0
      if (wasStylesEmpty || wasMixesEmpty) {
        try {
          ;(window as any).app?.refreshComboInNodes?.()
          ;(window as any).app?.toast?.add({
            severity: 'info',
            summary: 'Style Mixer',
            detail: 'First item added — node combo lists refreshed.',
            life: 4000,
          })
        } catch (e) {
          console.warn('[ImmacStyleMixer] refreshComboInNodes/toast failed', e)
        }
        setPendingRefresh(false)
      } else if (!options?.silent) {
        // Show the badge so the user can choose when to reload.
        setPendingRefresh(true)
      }
    }

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolved),
      })
        .then(() => {
          // Node combo lists are refreshed only on explicit create/delete actions
          // (handled above via count-delta logic). Do NOT call refreshComboInNodes
          // here so that weight/enable/rename/selection changes never trigger a reload.

          // Refresh image preview widgets in all pinned Immac nodes.
          try {
            ;(window as any).app?.graph?.nodes?.forEach((node: any) => {
              if (typeof node._immacUpdatePreview === 'function') node._immacUpdatePreview()
            })
          } catch (_) {}
        })
        .catch((e: unknown) => console.error('[ImmacStyleMixer] Save failed', e))
    }, 400)
  }, [])

  // Call this when the user explicitly wants to refresh the ComfyUI node cache.
  const refreshNodes = useCallback(() => {
    try {
      ;(window as any).app?.refreshComboInNodes?.()
      // Also refresh image preview widgets in all pinned Immac nodes.
      ;(window as any).app?.graph?.nodes?.forEach((node: any) => {
        if (typeof node._immacUpdatePreview === 'function') node._immacUpdatePreview()
      })
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

/** Build a URL to display a mix image via ComfyUI's /view endpoint.
 * Pass `updatedAt` (image_updated_at from the Mix object) to bust the browser cache
 * when the file has been overwritten in place. */
export function mixImageUrl(filename: string, updatedAt?: number): string {
  const bust = updatedAt ? `&t=${updatedAt}` : ''
  return `/view?filename=${encodeURIComponent(filename)}&subfolder=immac_style_mixer%2Fmixes&type=input${bust}`
}

export interface ConflictItem {
  id: string
  name: string
  existingName: string
  type: 'style' | 'mix'
}

/** Detect conflicts between incoming and existing data.
 * Returns conflicts where either ID or name matches an existing item. */
export function detectConflicts(
  incoming: StyleMixerData,
  existing: StyleMixerData
): ConflictItem[] {
  const conflicts: ConflictItem[] = []
  
  // Check style conflicts
  for (const incomingStyle of incoming.styles) {
    const existingById = existing.styles.find(s => s.id === incomingStyle.id)
    const existingByName = existing.styles.find(s => s.name === incomingStyle.name)
    
    if (existingById || existingByName) {
      const existing = existingById || existingByName!
      conflicts.push({
        id: incomingStyle.id,
        name: incomingStyle.name,
        existingName: existing.name,
        type: 'style'
      })
    }
  }
  
  // Check mix conflicts
  for (const incomingMix of incoming.mixes) {
    const existingById = existing.mixes.find(m => m.id === incomingMix.id)
    const existingByName = existing.mixes.find(m => m.name === incomingMix.name)
    
    if (existingById || existingByName) {
      const existing = existingById || existingByName!
      conflicts.push({
        id: incomingMix.id,
        name: incomingMix.name,
        existingName: existing.name,
        type: 'mix'
      })
    }
  }
  
  return conflicts
}

/** Merge incoming data with existing data, applying conflict resolutions.
 * For 'rename': auto-number duplicates (e.g., "Style Name (2)")
 * For 'replace': overwrite existing item with same ID or name */
export function mergeWithResolutions(
  incoming: StyleMixerData,
  existing: StyleMixerData,
  resolutions: Record<string, 'rename' | 'replace'>
): StyleMixerData {
  const result: StyleMixerData = {
    styles: [...existing.styles],
    mixes: [...existing.mixes],
    current_mix_id: existing.current_mix_id
  }
  
  // Helper to generate unique name with numbering
  function getUniqueName(baseName: string, existingNames: Set<string>): string {
    if (!existingNames.has(baseName)) return baseName
    
    let counter = 2
    let newName = `${baseName} (${counter})`
    while (existingNames.has(newName)) {
      counter++
      newName = `${baseName} (${counter})`
    }
    return newName
  }
  
  const existingStyleNames = new Set(result.styles.map(s => s.name))
  const existingMixNames = new Set(result.mixes.map(m => m.name))
  
  // Import styles
  for (const incomingStyle of incoming.styles) {
    const resolution = resolutions[incomingStyle.id]
    const existingIdx = result.styles.findIndex(s => s.id === incomingStyle.id || s.name === incomingStyle.name)
    
    if (resolution === 'replace' && existingIdx >= 0) {
      // Replace existing
      result.styles[existingIdx] = incomingStyle
    } else if (resolution === 'rename' || existingIdx >= 0) {
      // Rename with unique name
      const newName = getUniqueName(incomingStyle.name, existingStyleNames)
      const renamedStyle = { ...incomingStyle, name: newName, id: crypto.randomUUID() }
      result.styles.push(renamedStyle)
      existingStyleNames.add(newName)
    } else {
      // No conflict - just add
      result.styles.push(incomingStyle)
      existingStyleNames.add(incomingStyle.name)
    }
  }
  
  // Import mixes
  for (const incomingMix of incoming.mixes) {
    const resolution = resolutions[incomingMix.id]
    const existingIdx = result.mixes.findIndex(m => m.id === incomingMix.id || m.name === incomingMix.name)
    
    if (resolution === 'replace' && existingIdx >= 0) {
      // Replace existing
      result.mixes[existingIdx] = incomingMix
    } else if (resolution === 'rename' || existingIdx >= 0) {
      // Rename with unique name
      const newName = getUniqueName(incomingMix.name, existingMixNames)
      const renamedMix = { ...incomingMix, name: newName, id: crypto.randomUUID() }
      result.mixes.push(renamedMix)
      existingMixNames.add(newName)
    } else {
      // No conflict - just add
      result.mixes.push(incomingMix)
      existingMixNames.add(incomingMix.name)
    }
  }
  
  return result
}
