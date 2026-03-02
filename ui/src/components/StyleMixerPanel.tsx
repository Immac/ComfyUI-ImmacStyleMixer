import { useCallback, useRef, useState } from 'react'
import { useStyleMixerData } from '../hooks/useStyleMixerData'
import { Mix, MixEntry, Style, StyleMixerData } from '../types'
import MixCard from './MixCard'
import StyleGallery from './StyleGallery'

function uid(): string {
  return crypto.randomUUID()
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        fontWeight: 700,
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#888',
        borderBottom: '1px solid var(--p-surface-border, #333)',
        paddingBottom: 4,
        marginBottom: 8,
        flexShrink: 0,
      }}
    >
      {title}
    </div>
  )
}

const DIVIDER_PX = 6
const MIN_FLEX = 0.08 // minimum section size as a fraction of total flex

export default function StyleMixerPanel() {
  const { data, loading, error, update } = useStyleMixerData()
  const [mixFilter, setMixFilter] = useState('')
  // flex-grow proportions for the three panes; sum can be anything
  const [sizes, setSizes] = useState([1, 2, 2])
  const containerRef = useRef<HTMLDivElement>(null)

  const currentMix = data.mixes.find((m) => m.id === data.current_mix_id) ?? null

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

  // ── Drag-to-resize dividers ──────────────────────────────────────────────────

  function startDrag(dividerIndex: number, startY: number) {
    const container = containerRef.current
    if (!container) return
    const totalH = container.clientHeight - DIVIDER_PX * 2
    const snapshot = [...sizes]
    const snapshotTotal = snapshot.reduce((a, b) => a + b, 0)

    function onMove(e: MouseEvent) {
      const dy = e.clientY - startY
      const delta = (dy / totalH) * snapshotTotal
      setSizes((prev) => {
        const next = [...prev]
        next[dividerIndex] = Math.max(MIN_FLEX * snapshotTotal, snapshot[dividerIndex] + delta)
        next[dividerIndex + 1] = Math.max(MIN_FLEX * snapshotTotal, snapshot[dividerIndex + 1] - delta)
        return next
      })
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (loading) return <div style={panelShell}>Loading…</div>
  if (error) return <div style={{ ...panelShell, color: '#e55' }}>Error: {error}</div>

  const favoritesMixes = data.mixes.filter((m) => m.favorite)
  const restMixes = data.mixes.filter((m) => !m.favorite)
  const sortedMixes = [...favoritesMixes, ...restMixes]
  const filteredMixes = mixFilter.trim()
    ? sortedMixes.filter((m) => m.name.toLowerCase().includes(mixFilter.toLowerCase()))
    : sortedMixes

  return (
    <div ref={containerRef} style={panelShell}>

      {/* ── Pane 0: Current Mix ──────────────────────────────────────────── */}
      <div style={{ flex: sizes[0], minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={paneInner}>
          <SectionHeader title="Current Mix" />
          {!currentMix ? (
            <div style={{ fontSize: 12, color: '#666' }}>No mix active — select one from Mixes below.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{currentMix.name}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {currentMix.styles.length === 0 && (
                  <div style={{ fontSize: 12, color: '#666' }}>No styles in this mix yet.</div>
                )}
                {currentMix.styles.map((entry) => {
                  const style = data.styles.find((s) => s.id === entry.style_id)
                  return (
                    <div
                      key={entry.style_id}
                      style={{
                        border: `1px solid ${entry.enabled ? 'var(--p-primary-color, #6c6)' : 'var(--p-surface-border, #444)'}`,
                        borderRadius: 6,
                        padding: '6px 10px',
                        background: 'var(--p-surface-section, #1e1e1e)',
                        opacity: entry.enabled ? 1 : 0.45,
                        fontSize: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        minWidth: 80,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{style?.name ?? '?'}</span>
                      <span style={{ color: '#aaa' }}>×{entry.weight.toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Divider 0 ────────────────────────────────────────────────────── */}
      <div
        onMouseDown={(e) => startDrag(0, e.clientY)}
        style={dividerStyle}
        title="Drag to resize"
      >
        <div style={dividerHandle} />
      </div>

      {/* ── Pane 1: Mixes ────────────────────────────────────────────────── */}
      <div style={{ flex: sizes[1], minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={paneInner}>
          <SectionHeader title="Mixes" />
          <input
            placeholder="Filter mixes…"
            value={mixFilter}
            onChange={(e) => setMixFilter(e.target.value)}
            style={{ ...filterInput, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 6, flex: 1 }}>
            {filteredMixes.map((mix) => (
              <MixCard
                key={mix.id}
                mix={mix}
                styles={data.styles}
                isActive={mix.id === data.current_mix_id}
                onActivate={() => setCurrentMix(mix.id)}
                onUpdate={updateMix}
                onDelete={() => deleteMix(mix.id)}
              />
            ))}
            <button
              title="Add a new mix"
              onClick={addMix}
              style={{
                minWidth: 80,
                border: '1px dashed var(--p-surface-border, #555)',
                borderRadius: 8,
                background: 'transparent',
                color: '#666',
                cursor: 'pointer',
                fontSize: 22,
                alignSelf: 'flex-start',
                flexShrink: 0,
                aspectRatio: '1',
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* ── Divider 1 ────────────────────────────────────────────────────── */}
      <div
        onMouseDown={(e) => startDrag(1, e.clientY)}
        style={dividerStyle}
        title="Drag to resize"
      >
        <div style={dividerHandle} />
      </div>

      {/* ── Pane 2: Styles ───────────────────────────────────────────────── */}
      <div style={{ flex: sizes[2], minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={paneInner}>
          <SectionHeader title="Styles" />
          <StyleGallery
            styles={data.styles}
            onUpdate={updateStyle}
            onDelete={deleteStyle}
            onAdd={addStyle}
          />
        </div>
      </div>

    </div>
  )
}

const panelShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  color: 'var(--p-text-color, #eee)',
  fontSize: 13,
}

const paneInner: React.CSSProperties = {
  padding: '10px 12px',
  height: '100%',
  overflowY: 'auto',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
}

const dividerStyle: React.CSSProperties = {
  flexShrink: 0,
  height: DIVIDER_PX,
  cursor: 'ns-resize',
  background: 'var(--p-surface-border, #333)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const dividerHandle: React.CSSProperties = {
  width: 32,
  height: 2,
  borderRadius: 2,
  background: '#666',
}

const filterInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--p-surface-ground, #141414)',
  border: '1px solid var(--p-surface-border, #444)',
  borderRadius: 4,
  color: 'inherit',
  padding: '4px 8px',
  fontSize: 12,
  flexShrink: 0,
}
