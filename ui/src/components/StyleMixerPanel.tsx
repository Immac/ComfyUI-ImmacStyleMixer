import { useCallback, useState } from 'react'
import { useStyleMixerData, styleImageUrl } from '../hooks/useStyleMixerData'
import { Mix, MixEntry, Style, StyleMixerData } from '../types'
import MixCard from './MixCard'
import StyleGallery from './StyleGallery'
import ImageLightbox from './ImageLightbox'
import BarInput from './BarInput'

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
  const { data, loading, error, update, pendingRefresh, refreshNodes } = useStyleMixerData()

  const currentMix = data.mixes.find((m) => m.id === data.current_mix_id) ?? null
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [hoveredChipId, setHoveredChipId] = useState<string | null>(null)
  const [dragOverCurrentMix, setDragOverCurrentMix] = useState(false)

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

  const updateMix = useCallback((updated: Mix) => {
    update((prev) => ({
      ...prev,
      mixes: prev.mixes.map((m) => (m.id === updated.id ? updated : m)),
    }))
  }, [update])

  const addStyleToCurrentMix = useCallback((styleId: string) => {
    if (!currentMix) return
    if (currentMix.styles.some((e) => e.style_id === styleId)) return
    updateMix({ ...currentMix, styles: [...currentMix.styles, { style_id: styleId, weight: 1, enabled: true }] })
  }, [currentMix, updateMix])

  const removeStyleFromCurrentMix = useCallback((styleId: string) => {
    if (!currentMix) return
    updateMix({ ...currentMix, styles: currentMix.styles.filter((e) => e.style_id !== styleId) })
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

  const updateCurrentMixEntry = useCallback((styleId: string, patch: Partial<MixEntry>) => {
    if (!currentMix) return
    updateMix({
      ...currentMix,
      styles: currentMix.styles.map((e) => e.style_id === styleId ? { ...e, ...patch } : e),
    })
  }, [currentMix, updateMix])

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
                display: 'flex', gap: 8, flexWrap: 'wrap',
                borderRadius: 6,
                border: `1px dashed ${dragOverCurrentMix ? '#88aaff' : 'transparent'}`,
                background: dragOverCurrentMix ? 'rgba(100,130,255,0.07)' : 'transparent',
                padding: dragOverCurrentMix ? 4 : 0,
                transition: 'border-color 0.15s, background 0.15s, padding 0.1s',
                minHeight: 40,
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
                return (
                  <div
                    key={entry.style_id}
                    onMouseEnter={() => setHoveredChipId(entry.style_id)}
                    onMouseLeave={() => setHoveredChipId(null)}
                    onDoubleClick={() => updateCurrentMixEntry(entry.style_id, { enabled: !entry.enabled })}
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
                        {style?.image_filename ? (
                          <img
                            src={styleImageUrl(style.image_filename, style.image_updated_at)}
                            alt={style.name}
                            style={{
                              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                              transition: 'transform 0.3s ease',
                              transform: hoveredChipId === entry.style_id ? 'scale(1.05)' : 'scale(1)',
                            }}
                          />
                        ) : (
                          <i className="pi pi-image" style={{ fontSize: 20, color: '#555' }} />
                        )}
                      </div>
                      {style?.image_filename && hoveredChipId === entry.style_id && (
                        <button
                          title="View full size"
                          onClick={() => setLightboxSrc(styleImageUrl(style.image_filename!, style.image_updated_at))}
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
                          onClick={(e) => { e.stopPropagation(); updateCurrentMixEntry(entry.style_id, { enabled: !entry.enabled }) }}
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
                            onChange={(v) => updateCurrentMixEntry(entry.style_id, { weight: v })}
                            min={0}
                            max={1}
                            step={0.05}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {sortedMixes.map((mix) => (
            <MixCard
              key={mix.id}
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
          ))}
          <button
            title="Add a new mix"
            onClick={addMix}
            style={{
              width: '100%',
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
        />
      </CollapsibleSection>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
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
