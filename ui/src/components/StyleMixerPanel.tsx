import { useCallback, useRef, useState } from 'react'
import JSZip from 'jszip'
import { useStyleMixerData, styleImageUrl, detectConflicts, mergeWithResolutions, normalizeImportData, ImportNormalizationSummary, ConflictItem } from '../hooks/useStyleMixerData'
import { Mix, MixEntry, Style, StyleMixerData } from '../types'
import MixCard from './MixCard'
import StyleGallery from './StyleGallery'
import ImageLightbox from './ImageLightbox'
import BarInput from './BarInput'
import ConflictResolutionDialog from './ConflictResolutionDialog'
import AlertModal from './AlertModal'
import ConfirmModal from './ConfirmModal'

function uid(): string {
  return crypto.randomUUID()
}

function CollapsibleSection({ title, children, defaultOpen = true, grow = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean; grow?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: open && grow ? '1 1 0' : '0 0 auto',
      minHeight: 0,
      borderBottom: '1px solid var(--p-surface-border, #333)',
    }}>
      {/* Always-visible header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 0',
          width: '100%',
          textAlign: 'left',
          color: '#888',
          flexShrink: 0,
        }}
      >
        <i
          className={`pi ${open ? 'pi-chevron-down' : 'pi-chevron-right'}`}
          style={{ fontSize: 10, flexShrink: 0 }}
        />
        <span
          style={{
            fontWeight: 700,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {title}
        </span>
      </button>
      {/* Scrollable content */}
      {open && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 8 }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function StyleMixerPanel() {
  const { data, loading, error, update, pendingRefresh, refreshNodes, reload } = useStyleMixerData()

  const currentMix = data.mixes.find((m) => m.id === data.current_mix_id) ?? null
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [hoveredChipId, setHoveredChipId] = useState<string | null>(null)
  const [dragOverCurrentMix, setDragOverCurrentMix] = useState(false)

  // Import/Export state
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])
  const [pendingImport, setPendingImport] = useState<StyleMixerData | null>(null)
  const [pendingImportSummary, setPendingImportSummary] = useState<ImportNormalizationSummary | null>(null)
  const [importing, setImporting] = useState(false)
  const styleFileInputRef = useRef<HTMLInputElement>(null)
  const mixFileInputRef = useRef<HTMLInputElement>(null)
  const allFileInputRef = useRef<HTMLInputElement>(null)

  type ImportMode = 'replace' | 'merge'
  type DuplicatePolicy = 'rename' | 'replace' | 'skip'

  // Modal state
  const [alertModal, setAlertModal] = useState<{ title: string; message: string } | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; confirmText?: string; cancelText?: string; onConfirm: () => void; onCancel: () => void } | null>(null)
  const [modeModal, setModeModal] = useState<{ onConfirm: (mode: ImportMode) => void; onCancel: () => void } | null>(null)
  const [policyModal, setPolicyModal] = useState<{ onConfirm: (policy: DuplicatePolicy) => void; onCancel: () => void } | null>(null)

  const showImportCleanupToast = useCallback((summary: ImportNormalizationSummary | null) => {
    if (!summary) return
    const parts: string[] = []
    if (summary.ignoredStyles > 0) parts.push(`${summary.ignoredStyles} duplicate style(s) ignored`)
    if (summary.ignoredMixes > 0) parts.push(`${summary.ignoredMixes} duplicate mix(es) ignored`)
    if (summary.skippedInvalidImageRefs > 0) parts.push(`${summary.skippedInvalidImageRefs} invalid image reference(s) skipped`)
    if (parts.length === 0) return
    ;(window as any).app?.toast?.add({
      severity: 'info',
      summary: 'Import Cleanup',
      detail: parts.join(' · '),
      life: 4500,
    })
  }, [])

  const showServerImportCleanupToast = useCallback((summary: any, skippedInvalidImages?: number) => {
    const parts: string[] = []
    const ignoredStyles = Number(summary?.ignored_duplicate_styles ?? 0)
    const ignoredMixes = Number(summary?.ignored_duplicate_mixes ?? 0)
    const skippedImages = Number(skippedInvalidImages ?? 0)
    if (ignoredStyles > 0) parts.push(`${ignoredStyles} duplicate style(s) ignored`)
    if (ignoredMixes > 0) parts.push(`${ignoredMixes} duplicate mix(es) ignored`)
    if (skippedImages > 0) parts.push(`${skippedImages} invalid image path(s) skipped`)
    if (parts.length === 0) return
    ;(window as any).app?.toast?.add({
      severity: 'info',
      summary: 'Import Cleanup',
      detail: parts.join(' · '),
      life: 4500,
    })
  }, [])

  // ── Style operations ────────────────────────────────────────────────────────

  const addStyle = useCallback((name: string) => {
    const s: Style = { id: uid(), name, value: '', favorite: false, image_filename: null }
    update((prev) => ({ ...prev, styles: [...prev.styles, s] }))
  }, [update])

  const updateStyle = useCallback((updated: Style) => {
    update((prev) => ({
      ...prev,
      styles: prev.styles.map((s) => (s.id === updated.id ? updated : s)),
    }))
  }, [update])

  const deleteStyle = useCallback((id: string) => {
    update((prev: StyleMixerData) => ({
      ...prev,
      styles: prev.styles.filter((s) => s.id !== id),
      mixes: prev.mixes.map((m) => ({
        ...m,
        styles: m.styles.filter((e: MixEntry) => e.style_id !== id),
      })),
    }))
  }, [update])

  const duplicateMix = useCallback((source: Mix) => {
    const copy: Mix = { ...source, id: uid(), name: `${source.name} (copy)`, favorite: false }
    update((prev: StyleMixerData) => {
      const idx = prev.mixes.findIndex((m) => m.id === source.id)
      const next = [...prev.mixes]
      next.splice(idx + 1, 0, copy)
      return { ...prev, mixes: next }
    })
  }, [update])

  // ── Mix operations ───────────────────────────────────────────────────────────

  const addMix = useCallback(() => {
    const m: Mix = { id: uid(), name: `Mix ${data.mixes.length + 1}`, favorite: false, image_filename: null, styles: [] }
    update((prev) => ({ ...prev, mixes: [...prev.mixes, m] }))
  }, [data.mixes.length, update])

  const updateMix = useCallback((updated: Mix, options?: { silent?: boolean }) => {
    update((prev) => ({
      ...prev,
      mixes: prev.mixes.map((m) => (m.id === updated.id ? updated : m)),
    }), options)
  }, [update])

  const addStyleToCurrentMix = useCallback((styleId: string) => {
    if (!currentMix) return
    if (currentMix.styles.some((e) => e.style_id === styleId)) return
    updateMix({ ...currentMix, styles: [...currentMix.styles, { style_id: styleId, weight: 1, enabled: true }] }, { silent: true })
  }, [currentMix, updateMix])

  const removeStyleFromCurrentMix = useCallback((styleId: string) => {
    if (!currentMix) return
    updateMix({ ...currentMix, styles: currentMix.styles.filter((e) => e.style_id !== styleId) }, { silent: true })
  }, [currentMix, updateMix])

  const deleteMix = useCallback((id: string) => {
    update((prev) => ({
      ...prev,
      mixes: prev.mixes.filter((m) => m.id !== id),
      current_mix_id: prev.current_mix_id === id ? null : prev.current_mix_id,
    }))
  }, [update])

  const setCurrentMix = useCallback((id: string) => {
    update((prev) => ({ ...prev, current_mix_id: id }))
  }, [update])

  const updateCurrentMixEntry = useCallback((styleId: string, patch: Partial<MixEntry>, options?: { silent?: boolean }) => {
    if (!currentMix) return
    updateMix({
      ...currentMix,
      styles: currentMix.styles.map((e) => e.style_id === styleId ? { ...e, ...patch } : e),
    }, options)
  }, [currentMix, updateMix])

  // ── Import/Export operations ─────────────────────────────────────────────────

  const handleImportStyle = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // Reset input
    
    try {
      setImporting(true)
      const zip = await JSZip.loadAsync(file)
      const jsonFile = zip.file('style_mixer_data.json')
      if (!jsonFile) throw new Error('Invalid style ZIP: missing style_mixer_data.json')
      
      const jsonText = await jsonFile.async('text')
      const importedRaw = JSON.parse(jsonText) as StyleMixerData
      const normalized = normalizeImportData(importedRaw)
      const imported = normalized.data

      const totalItems = (imported.styles?.length ?? 0) + (imported.mixes?.length ?? 0)
      if (totalItems >= 5000) {
        return new Promise<void>((resolve) => {
          setConfirmModal({
            title: 'Large Import Warning',
            message: `This ZIP contains ${totalItems} items (styles + mixes). Import may be slow.\n\nDo you want to continue?`,
            onConfirm: () => {
              setConfirmModal(null)
              resolve()
            },
            onCancel: () => {
              setConfirmModal(null)
              resolve()
            },
          })
        })
      }
      
      if (!imported.styles || imported.styles.length === 0) {
        throw new Error('No styles found in import file')
      }
      
      // Detect conflicts
      const conflictList = detectConflicts(imported, data)
      
      if (conflictList.length > 0) {
        // Show conflict dialog
        setConflicts(conflictList)
        setPendingImport(imported)
        setPendingImportSummary(normalized.summary)
      } else {
        // No conflicts - merge directly
        const merged = mergeWithResolutions(imported, data, {})
        update(merged)
        ;(window as any).app?.toast?.add({
          severity: 'success',
          summary: 'Style Imported',
          detail: `${imported.styles.length} style(s) imported successfully.`,
          life: 3000,
        })
        showImportCleanupToast(normalized.summary)
      }
    } catch (err) {
      console.error('[ImmacStyleMixer] Import failed', err)
      setAlertModal({
        title: 'Import Failed',
        message: String(err),
      })
    } finally {
      setImporting(false)
    }
  }, [data, update, showImportCleanupToast])

  const handleImportMix = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // Reset input
    
    try {
      setImporting(true)
      const zip = await JSZip.loadAsync(file)
      const jsonFile = zip.file('style_mixer_data.json')
      if (!jsonFile) throw new Error('Invalid mix ZIP: missing style_mixer_data.json')
      
      const jsonText = await jsonFile.async('text')
      const importedRaw = JSON.parse(jsonText) as StyleMixerData
      const normalized = normalizeImportData(importedRaw)
      const imported = normalized.data

      const totalItems = (imported.styles?.length ?? 0) + (imported.mixes?.length ?? 0)
      if (totalItems >= 5000) {
        return new Promise<void>((resolve) => {
          setConfirmModal({
            title: 'Large Import Warning',
            message: `This ZIP contains ${totalItems} items (styles + mixes). Import may be slow.\n\nDo you want to continue?`,
            onConfirm: () => {
              setConfirmModal(null)
              resolve()
            },
            onCancel: () => {
              setConfirmModal(null)
              resolve()
            },
          })
        })
      }
      
      if (!imported.mixes || imported.mixes.length === 0) {
        throw new Error('No mixes found in import file')
      }
      
      // Detect conflicts
      const conflictList = detectConflicts(imported, data)
      
      if (conflictList.length > 0) {
        // Show conflict dialog
        setConflicts(conflictList)
        setPendingImport(imported)
        setPendingImportSummary(normalized.summary)
      } else {
        // No conflicts - merge directly
        const merged = mergeWithResolutions(imported, data, {})
        update(merged)
        ;(window as any).app?.toast?.add({
          severity: 'success',
          summary: 'Mix Imported',
          detail: `${imported.mixes.length} mix(es) imported successfully.`,
          life: 3000,
        })
        showImportCleanupToast(normalized.summary)
      }
    } catch (err) {
      console.error('[ImmacStyleMixer] Import failed', err)
      setAlertModal({
        title: 'Import Failed',
        message: String(err),
      })
    } finally {
      setImporting(false)
    }
  }, [data, update, showImportCleanupToast])

  const handleConflictResolution = useCallback((resolutions: Record<string, 'rename' | 'replace'>) => {
    if (!pendingImport) return
    
    const merged = mergeWithResolutions(pendingImport, data, resolutions)
    update(merged)
    
    const totalItems = (pendingImport.styles?.length || 0) + (pendingImport.mixes?.length || 0)
    ;(window as any).app?.toast?.add({
      severity: 'success',
      summary: 'Import Complete',
      detail: `${totalItems} item(s) imported successfully.`,
      life: 3000,
    })
    showImportCleanupToast(pendingImportSummary)
    
    // Clear state
    setConflicts([])
    setPendingImport(null)
    setPendingImportSummary(null)
  }, [pendingImport, pendingImportSummary, data, update, showImportCleanupToast])

  const handleImportAll = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const mode = await new Promise<{ importMode: ImportMode; duplicatePolicy: DuplicatePolicy } | null>((resolveMode) => {
      setModeModal({
        onConfirm: (selectedMode) => {
          setModeModal(null)
          if (selectedMode === 'replace' && (data.styles.length > 0 || data.mixes.length > 0)) {
            setConfirmModal({
              title: 'Confirm Replace',
              message: `Replace will overwrite all current data (${data.styles.length} styles, ${data.mixes.length} mixes).\n\nDo you want to continue?`,
              onConfirm: () => {
                setConfirmModal(null)
                resolveMode({ importMode: 'replace', duplicatePolicy: 'rename' })
              },
              onCancel: () => {
                setConfirmModal(null)
                resolveMode(null)
              },
            })
          } else if (selectedMode === 'replace') {
            resolveMode({ importMode: 'replace', duplicatePolicy: 'rename' })
          } else {
            setPolicyModal({
              onConfirm: (policy) => {
                setPolicyModal(null)
                resolveMode({ importMode: 'merge', duplicatePolicy: policy })
              },
              onCancel: () => {
                setPolicyModal(null)
                resolveMode(null)
              },
            })
          }
        },
        onCancel: () => {
          setModeModal(null)
          resolveMode(null)
        },
      })
    })
    if (!mode) return

    try {
      setImporting(true)
      const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip'
      const isJson = file.name.toLowerCase().endsWith('.json') || file.type.includes('json')

      if (!isZip && !isJson) {
        throw new Error('Unsupported file type. Use .json or .zip backup files.')
      }

      if (isZip) {
        const zip = await JSZip.loadAsync(file)
        const dataFile = zip.file('style_mixer_data.json')
        if (dataFile) {
          const parsed = JSON.parse(await dataFile.async('string')) as StyleMixerData
          const styleCount = Array.isArray(parsed?.styles) ? parsed.styles.length : 0
          const mixCount = Array.isArray(parsed?.mixes) ? parsed.mixes.length : 0
          const itemCount = styleCount + mixCount
          if (itemCount >= 5000) {
            const proceed = await new Promise<boolean>((resolve) => {
              setConfirmModal({
                title: 'Large Import Warning',
                message: `This ZIP contains ${itemCount} items (styles + mixes). Import may be slow.\n\nDo you want to continue?`,
                onConfirm: () => {
                  setConfirmModal(null)
                  resolve(true)
                },
                onCancel: () => {
                  setConfirmModal(null)
                  resolve(false)
                },
              })
            })
            if (!proceed) return
          }
        }

        const callRestore = async (imageFailureAction: 'ask' | 'continue' | 'rollback') => {
          const params = new URLSearchParams({
            import_mode: mode.importMode,
            duplicate_policy: mode.duplicatePolicy,
            image_failure_action: imageFailureAction,
          })
          return fetch(`/immac_style_mixer/api/restore.zip?${params.toString()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/zip' },
            body: await file.arrayBuffer(),
          })
        }

        let resp = await callRestore('ask')
        if (resp.status === 409) {
          const problem = await resp.json()
          const failed = Number(problem.total_failed_images ?? 0)
          const continueImport = await new Promise<boolean>((resolve) => {
            setConfirmModal({
              title: 'Image Import Failed',
              message: `${failed} image(s) failed to restore.\n\nPress OK to continue without those images, or Cancel to rollback.`,
              onConfirm: () => {
                setConfirmModal(null)
                resolve(true)
              },
              onCancel: () => {
                setConfirmModal(null)
                resolve(false)
              },
            })
          })
          if (continueImport) {
            resp = await callRestore('continue')
          } else {
            const rollbackResp = await callRestore('rollback')
            if (!rollbackResp.ok) {
              const rollbackText = await rollbackResp.text()
              throw new Error(`Rollback failed: HTTP ${rollbackResp.status}: ${rollbackText.slice(0, 300)}`)
            }
            setAlertModal({
              title: 'Import Cancelled',
              message: 'Restore rolled back. No data changes were applied.',
            })
            return
          }
        }

        if (!resp.ok) {
          const text = await resp.text()
          throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`)
        }

        const result = await resp.json()
        showServerImportCleanupToast(result?.summary, result?.skipped_invalid_images)
        await reload()
        ;(window as any).app?.toast?.add({
          severity: 'success',
          summary: 'Import Complete',
          detail: `Imported ${result?.styles ?? 0} styles and ${result?.mixes ?? 0} mixes from ZIP.`,
          life: 4000,
        })
        return
      }

      const text = await file.text()
      const parsed = JSON.parse(text) as StyleMixerData
      const normalized = normalizeImportData(parsed)
      const itemCount = normalized.data.styles.length + normalized.data.mixes.length
      if (itemCount >= 5000) {
        const proceed = await new Promise<boolean>((resolve) => {
          setConfirmModal({
            title: 'Large Import Warning',
            message: `This JSON contains ${itemCount} items (styles + mixes). Import may be slow.\n\nDo you want to continue?`,
            onConfirm: () => {
              setConfirmModal(null)
              resolve(true)
            },
            onCancel: () => {
              setConfirmModal(null)
              resolve(false)
            },
          })
        })
        if (!proceed) return
      }

      const response = await fetch('/immac_style_mixer/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: normalized.data,
          import_mode: mode.importMode,
          duplicate_policy: mode.duplicatePolicy,
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`)
      }

      const result = await response.json()
      showImportCleanupToast(normalized.summary)
      showServerImportCleanupToast(result?.summary)
      await reload()
      ;(window as any).app?.toast?.add({
        severity: 'success',
        summary: 'Import Complete',
        detail: `Imported ${result?.styles ?? 0} styles and ${result?.mixes ?? 0} mixes from JSON.`,
        life: 4000,
      })
    } catch (err) {
      console.error('[ImmacStyleMixer] Import all failed', err)
      setAlertModal({
        title: 'Import Failed',
        message: String(err),
      })
    } finally {
      setImporting(false)
    }
  }, [data.styles.length, data.mixes.length, reload, showImportCleanupToast, showServerImportCleanupToast])

  const handleExportAll = useCallback(async () => {
    try {
      const response = await fetch('/immac_style_mixer/api/backup.zip')
      if (!response.ok) throw new Error(`Export failed: HTTP ${response.status}`)
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().split('T')[0]
      a.download = `style_mixer_backup_${date}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      ;(window as any).app?.toast?.add({
        severity: 'success',
        summary: 'Export Complete',
        detail: 'Full backup downloaded successfully.',
        life: 3000,
      })
    } catch (err) {
      console.error('[ImmacStyleMixer] Export failed', err)
      ;(window as any).app?.toast?.add({
        severity: 'error',
        summary: 'Export Failed',
        detail: String(err),
        life: 5000,
      })
    }
  }, [])

  if (loading) return <div style={panelStyle}>Loading…</div>
  if (error) return <div style={{ ...panelStyle, color: '#e55' }}>Error: {error}</div>

  const favoritesMixes = data.mixes.filter((m) => m.favorite)
  const restMixes = data.mixes.filter((m) => !m.favorite)
  const sortedMixes = [...favoritesMixes, ...restMixes]

  return (
    <div style={panelStyle}>
      {/* ── Current Mix ──────────────────────────────────────────────────── */}
      <CollapsibleSection title="Current Mix" grow={false}>
        {!currentMix ? (
          <div style={{ fontSize: 12, color: '#666' }}>
            No mix active — select one from Mixes below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{currentMix.name}</div>
            <div
              style={{
                display: 'flex', gap: 8, flexWrap: 'nowrap', overflowX: 'auto',
                borderRadius: 6,
                border: `1px dashed ${dragOverCurrentMix ? '#88aaff' : 'transparent'}`,
                background: dragOverCurrentMix ? 'rgba(100,130,255,0.07)' : 'transparent',
                padding: dragOverCurrentMix ? 4 : 0,
                transition: 'border-color 0.15s, background 0.15s, padding 0.1s',
                minHeight: 40,
                paddingBottom: 6,
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-immac-style-id')) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                  setDragOverCurrentMix(true)
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCurrentMix(false)
              }}
              onDrop={(e) => {
                setDragOverCurrentMix(false)
                const styleId = e.dataTransfer.getData('application/x-immac-style-id')
                if (styleId) { e.preventDefault(); addStyleToCurrentMix(styleId) }
              }}
            >
              {currentMix.styles.length === 0 && !dragOverCurrentMix && (
                <div style={{ fontSize: 12, color: '#666' }}>No styles in this mix yet.</div>
              )}
              {currentMix.styles.map((entry) => {
                const style = data.styles.find((s) => s.id === entry.style_id)
                const imageSrc = style?.image_filename ? styleImageUrl(style.image_filename, style.image_updated_at) : ''
                return (
                  <div
                    key={entry.style_id}
                    onMouseEnter={() => setHoveredChipId(entry.style_id)}
                    onMouseLeave={() => setHoveredChipId(null)}
                    onDoubleClick={() => updateCurrentMixEntry(entry.style_id, { enabled: !entry.enabled }, { silent: true })}
                    style={{
                      border: `1px solid ${entry.enabled ? 'var(--p-primary-color, #6c6)' : 'var(--p-surface-border, #444)'}`,
                      borderRadius: 6,
                      overflow: 'hidden',
                      background: 'var(--p-surface-section, #1e1e1e)',
                      opacity: entry.enabled ? 1 : 0.45,
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      width: 180,
                      flexShrink: 0,
                    }}
                  >
                    {/* Square image preview */}
                    <div style={{ position: 'relative', width: '100%', paddingBottom: '100%' }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'var(--p-surface-ground, #141414)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {imageSrc ? (
                          <img
                            src={imageSrc}
                            alt={style?.name ?? 'style'}
                            style={{
                              width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                              transition: 'transform 0.3s ease',
                              transform: hoveredChipId === entry.style_id ? 'scale(1.05)' : 'scale(1)',
                            }}
                          />
                        ) : (
                          <i className="pi pi-image" style={{ fontSize: 20, color: '#555' }} />
                        )}
                      </div>
                      {imageSrc && hoveredChipId === entry.style_id && (
                        <button
                          title="View full size"
                          onClick={() => setLightboxSrc(imageSrc)}
                          style={{
                            position: 'absolute',
                            top: 6,
                            left: 6,
                            background: 'rgba(255,255,255,0.92)',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 13,
                            padding: '3px 6px',
                            lineHeight: 1,
                            color: '#222',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                          }}
                        >
                          <i className="pi pi-search-plus" />
                        </button>
                      )}
                    </div>
                    {/* Name + controls */}
                    <div style={{ padding: '4px 6px', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', fontSize: 12 }}>{style?.name ?? '?'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {/* ON/OFF toggle */}
                        <button
                          title={entry.enabled ? 'Disable style' : 'Enable style'}
                          onClick={(e) => { e.stopPropagation(); updateCurrentMixEntry(entry.style_id, { enabled: !entry.enabled }, { silent: true }) }}
                          style={{
                            background: entry.enabled ? 'var(--p-primary-color, #557755)' : 'transparent',
                            border: '1px solid var(--p-surface-border, #555)',
                            borderRadius: 4,
                            color: entry.enabled ? '#fff' : '#888',
                            cursor: 'pointer',
                            fontSize: 10,
                            padding: '1px 4px',
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                        >
                          {entry.enabled ? 'ON' : 'OFF'}
                        </button>
                        {/* Weight bar */}
                        <div style={{ flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                          <BarInput
                            value={entry.weight}
                            onChange={(v) => updateCurrentMixEntry(entry.style_id, { weight: v }, { silent: true })}
                            step={0.01}
                            width="100%"
                          />
                        </div>
                        {/* Remove button */}
                        <button
                          title="Remove from mix"
                          onClick={(e) => { e.stopPropagation(); removeStyleFromCurrentMix(entry.style_id) }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#e66',
                            fontSize: 13,
                            padding: '0 2px',
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* ── Mixes ────────────────────────────────────────────────────────── */}
      <CollapsibleSection title="Mixes">
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 4 }}>
          {sortedMixes.map((mix) => (
            <div key={mix.id} style={{ flex: '0 0 280px' }}>
              <MixCard
                mix={mix}
                styles={data.styles}
                isActive={mix.id === data.current_mix_id}
                isDirty={pendingRefresh}
                onActivate={() => setCurrentMix(mix.id)}
                onUpdate={updateMix}
                onDelete={() => deleteMix(mix.id)}
                onDuplicate={() => duplicateMix(mix)}
                onRefreshCache={refreshNodes}
              />
            </div>
          ))}
          <button
            title="Add a new mix"
            onClick={addMix}
            style={{
              flex: '0 0 120px',
              minHeight: 80,
              border: '1px dashed var(--p-surface-border, #555)',
              borderRadius: 8,
              background: 'transparent',
              color: '#666',
              cursor: 'pointer',
              fontSize: 22,
            }}
          >
            +
          </button>
        </div>
      </CollapsibleSection>

      {/* ── Styles ───────────────────────────────────────────────────────── */}
      <CollapsibleSection title="Styles">
        <StyleGallery
          styles={data.styles}
          onUpdate={updateStyle}
          onDelete={deleteStyle}
          onAdd={addStyle}
          currentMixStyleIds={currentMix ? new Set(currentMix.styles.map((e) => e.style_id)) : undefined}
          onAddToMix={currentMix ? addStyleToCurrentMix : undefined}
          onRemoveFromMix={currentMix ? removeStyleFromCurrentMix : undefined}
          isDirty={pendingRefresh}
          onRefreshCache={refreshNodes}
        />
      </CollapsibleSection>

      {/* ── Import/Export Toolbar ────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--p-surface-border, #333)',
        padding: '8px 0',
        display: 'flex',
        gap: 8,
        flexShrink: 0,
      }}>
        <button
          onClick={() => styleFileInputRef.current?.click()}
          disabled={importing}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            backgroundColor: '#2a2a2a',
            border: '1px solid #444',
            borderRadius: 4,
            color: '#ccc',
            cursor: importing ? 'not-allowed' : 'pointer',
            opacity: importing ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          title="Import a style from a ZIP file"
        >
          <i className="pi pi-download" style={{ fontSize: 12 }} />
          Import Style
        </button>

        <button
          onClick={() => mixFileInputRef.current?.click()}
          disabled={importing}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            backgroundColor: '#2a2a2a',
            border: '1px solid #444',
            borderRadius: 4,
            color: '#ccc',
            cursor: importing ? 'not-allowed' : 'pointer',
            opacity: importing ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          title="Import a mix from a ZIP file"
        >
          <i className="pi pi-download" style={{ fontSize: 12 }} />
          Import Mix
        </button>

        <button
          onClick={() => allFileInputRef.current?.click()}
          disabled={importing}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            backgroundColor: '#2a2a2a',
            border: '1px solid #444',
            borderRadius: 4,
            color: '#ccc',
            cursor: importing ? 'not-allowed' : 'pointer',
            opacity: importing ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          title="Import all styles and mixes from JSON or ZIP backup"
        >
          <i className="pi pi-download" style={{ fontSize: 12 }} />
          Import All
        </button>

        <button
          onClick={handleExportAll}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            backgroundColor: '#2a2a2a',
            border: '1px solid #444',
            borderRadius: 4,
            color: '#ccc',
            cursor: 'pointer',
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          title="Export all styles and mixes as a backup ZIP"
        >
          <i className="pi pi-upload" style={{ fontSize: 12 }} />
          Export All
        </button>

        {/* Hidden file inputs */}
        <input
          ref={styleFileInputRef}
          type="file"
          accept=".zip"
          onChange={handleImportStyle}
          style={{ display: 'none' }}
        />
        <input
          ref={mixFileInputRef}
          type="file"
          accept=".zip"
          onChange={handleImportMix}
          style={{ display: 'none' }}
        />
        <input
          ref={allFileInputRef}
          type="file"
          accept=".json,.zip,application/json,application/zip"
          onChange={handleImportAll}
          style={{ display: 'none' }}
        />
      </div>

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
      {conflicts.length > 0 && pendingImport && (
        <ConflictResolutionDialog
          conflicts={conflicts}
          onConfirm={handleConflictResolution}
          onCancel={() => { setConflicts([]); setPendingImport(null); setPendingImportSummary(null) }}
        />
      )}

      {/* Modal Dialogs */}
      {alertModal && (
        <AlertModal
          title={alertModal.title}
          message={alertModal.message}
          onClose={() => setAlertModal(null)}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          cancelText={confirmModal.cancelText}
          onConfirm={() => confirmModal.onConfirm()}
          onCancel={() => confirmModal.onCancel()}
        />
      )}

      {modeModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => modeModal.onCancel()}
        >
          <div
            style={{
              backgroundColor: '#1e1e1e',
              border: '1px solid #444',
              borderRadius: 4,
              padding: 20,
              maxWidth: 400,
              width: '90%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
              Select Import Mode
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#aaa' }}>
              Choose how to handle this import:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => modeModal.onConfirm('merge')}
                style={{
                  padding: '10px 12px',
                  fontSize: 13,
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2a2a2a')}
              >
                <strong>Merge</strong>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                  Combine with existing data (choose rename/replace strategy)
                </div>
              </button>
              <button
                onClick={() => modeModal.onConfirm('replace')}
                style={{
                  padding: '10px 12px',
                  fontSize: 13,
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2a2a2a')}
              >
                <strong>Replace</strong>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                  Overwrite all current data with imported data
                </div>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => modeModal.onCancel()}
                style={{
                  padding: '6px 16px',
                  fontSize: 13,
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#ccc',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {policyModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => policyModal.onCancel()}
        >
          <div
            style={{
              backgroundColor: '#1e1e1e',
              border: '1px solid #444',
              borderRadius: 4,
              padding: 20,
              maxWidth: 400,
              width: '90%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
              Select Merge Strategy
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#aaa' }}>
              How should conflicting items be handled?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => policyModal.onConfirm('rename')}
                style={{
                  padding: '10px 12px',
                  fontSize: 13,
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2a2a2a')}
              >
                <strong>Rename</strong>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                  Auto-number duplicates (e.g., "Style (2)")
                </div>
              </button>
              <button
                onClick={() => policyModal.onConfirm('replace')}
                style={{
                  padding: '10px 12px',
                  fontSize: 13,
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2a2a2a')}
              >
                <strong>Replace</strong>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                  Overwrite existing items with imported versions
                </div>
              </button>
              <button
                onClick={() => policyModal.onConfirm('skip')}
                style={{
                  padding: '10px 12px',
                  fontSize: 13,
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2a2a2a')}
              >
                <strong>Skip</strong>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                  Keep existing items, ignore duplicates
                </div>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => policyModal.onCancel()}
                style={{
                  padding: '6px 16px',
                  fontSize: 13,
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: 4,
                  color: '#ccc',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  padding: '0 12px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  color: 'var(--p-text-color, #eee)',
  fontSize: 13,
  boxSizing: 'border-box',
}


