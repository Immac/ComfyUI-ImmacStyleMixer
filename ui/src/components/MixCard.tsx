import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { Mix, MixEntry, Style } from '../types'
import { mixImageUrl, styleImageUrl, uploadMixImage } from '../hooks/useStyleMixerData'
import ImageLightbox from './ImageLightbox'
import BarInput from './BarInput'

interface Props {
  mix: Mix
  styles: Style[]
  isActive: boolean
  isDirty: boolean
  onActivate: () => void
  onUpdate: (updated: Mix, options?: { silent?: boolean }) => void
  onDelete: () => void
  onDuplicate: () => void
  onRefreshCache: () => void
}

export default function MixCard({ mix, styles, isActive, isDirty, onActivate, onUpdate, onDelete, onDuplicate, onRefreshCache }: Props) {
  function handleCardClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('button, input, select, textarea, a')) onActivate()
  }

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(mix.name)
  const [editingMixNegative, setEditingMixNegative] = useState(false)
  const [mixNegativeInput, setMixNegativeInput] = useState(mix.negative ?? '')
  const [uploading, setUploading] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [imageHovered, setImageHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [styleDragOver, setStyleDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function copyPrompt() {
    const parts = mix.styles
      .filter((e) => e.enabled && (e.weight ?? 1.0) > 1e-9)
      .map((e) => {
        const value = styles.find((s) => s.id === e.style_id)?.value ?? ''
        if (!value) return ''
        const w = e.weight ?? 1.0
        return Math.abs(w - 1.0) < 1e-6 ? value : `(${value}:${w.toFixed(2)})`
      })
      .filter(Boolean)
    if (parts.length === 0) return
    navigator.clipboard.writeText(parts.join(', ')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const filename = await uploadMixImage(file)
      onUpdate({ ...mix, image_filename: filename, image_updated_at: Date.now() })
    } catch (e) {
      console.error('[ImmacStyleMixer] Mix image upload failed', e)
    } finally {
      setUploading(false)
    }
  }

  function commitName() {
    setEditingName(false)
    if (nameInput.trim() !== mix.name) onUpdate({ ...mix, name: nameInput.trim() || mix.name })
  }

  function commitMixNegative() {
    setEditingMixNegative(false)
    if (mixNegativeInput !== (mix.negative ?? '')) onUpdate({ ...mix, negative: mixNegativeInput })
  }

  function updateEntry(index: number, patch: Partial<MixEntry>) {
    const next = mix.styles.map((e, i) => (i === index ? { ...e, ...patch } : e))
    onUpdate({ ...mix, styles: next }, { silent: true })
  }

  function removeEntry(index: number) {
    onUpdate({ ...mix, styles: mix.styles.filter((_, i) => i !== index) }, { silent: true })
  }

  function addStyle(styleId: string) {
    if (mix.styles.some((e) => e.style_id === styleId)) return
    onUpdate({ ...mix, styles: [...mix.styles, { style_id: styleId, weight: 1.0, enabled: true }] }, { silent: true })
  }

  const unusedStyles = styles.filter((s) => !mix.styles.some((e) => e.style_id === s.id))

  function dragHandleProps() {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('application/x-immac-mix-name', mix.name)
      },
      onDragEnd: (e: React.DragEvent) => {
        const lgCanvas = (window as any).app?.canvas
        if (!lgCanvas) return
        const canvasEl: HTMLCanvasElement | null = lgCanvas.canvas
        if (!canvasEl) return
        // Only create the node if the pointer is directly over the canvas element,
        // not over any panel UI rendered on top of it.
        if (document.elementFromPoint(e.clientX, e.clientY) !== canvasEl) return
        const pos: [number, number] = lgCanvas.convertEventToCanvasOffset(e)
        const LG = (window as any).LiteGraph
        const node = LG?.createNode('PickMixImmacStyleMixer')
        if (!node) return
        node.pos = pos
        ;(window as any).app?.graph?.add(node)
        const mixWidget = node.widgets?.find((w: any) => w.name === 'mix')
        if (mixWidget) {
          mixWidget.value = mix.name
          mixWidget.callback?.(mix.name, null, null, null, node)
        }
        ;(window as any).app?.graph?.setDirtyCanvas(true, true)
      },
    }
  }

  async function exportMixZip() {
    setExporting(true)
    try {
      const zip = new JSZip()
      const referencedStyleIds = new Set(mix.styles.map((entry) => entry.style_id))
      const referencedStyles = styles.filter((style) => referencedStyleIds.has(style.id))
      const data = {
        styles: referencedStyles,
        mixes: [mix],
        current_mix_id: null,
      }

      zip.file('style_mixer_data.json', JSON.stringify(data, null, 2))

      if (mix.image_filename) {
        const imageResp = await fetch(mixImageUrl(mix.image_filename, mix.image_updated_at))
        if (imageResp.ok) {
          const imageBlob = await imageResp.blob()
          zip.file(`images/mixes/${mix.image_filename}`, imageBlob)
        }
      }

      for (const referencedStyle of referencedStyles) {
        if (!referencedStyle.image_filename) continue
        const styleResp = await fetch(styleImageUrl(referencedStyle.image_filename, referencedStyle.image_updated_at))
        if (!styleResp.ok) continue
        const styleBlob = await styleResp.blob()
        zip.file(`images/styles/${referencedStyle.image_filename}`, styleBlob)
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeName = (mix.name || 'mix').replace(/[^a-zA-Z0-9_-]/g, '_')
      a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Failed to export mix ZIP: ${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      style={{
        border: `2px solid ${styleDragOver ? '#88aaff' : isActive ? 'var(--p-primary-color, #6c6)' : 'var(--p-surface-border, #444)'}`,
        borderRadius: 8,
        padding: 10,
        background: styleDragOver ? 'rgba(100,130,255,0.07)' : 'var(--p-surface-section, #1e1e1e)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onClick={handleCardClick}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-immac-style-id')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setStyleDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setStyleDragOver(false)
      }}
      onDrop={(e) => {
        setStyleDragOver(false)
        const styleId = e.dataTransfer.getData('application/x-immac-style-id')
        if (styleId) {
          e.preventDefault()
          e.stopPropagation()
          addStyle(styleId)
        }
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Drag handle — only this element initiates the card drag */}
        <span
          {...dragHandleProps()}
          title="Drag to canvas"
          style={{ cursor: 'grab', color: '#666', fontSize: 14, flexShrink: 0, lineHeight: 1, userSelect: 'none' }}
        >
          ⠿
        </span>
        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false) }}
            style={inputStyle}
          />
        ) : (
          <span
            title="Double-click to rename"
            onDoubleClick={() => { setNameInput(mix.name); setEditingName(true) }}
            style={{ fontWeight: 600, flex: 1, cursor: 'text', fontSize: 13 }}
          >
            {mix.name}
          </span>
        )}

        {isDirty && (
          <button
            title="Pending node-cache changes — click to reload"
            onClick={(e) => { e.stopPropagation(); onRefreshCache() }}
            style={{
              ...iconBtn,
              color: '#f5a623',
              fontSize: 14,
              animation: 'immac-pulse 1.8s ease-in-out infinite',
            }}
          >
            <i className="pi pi-exclamation-circle" />
          </button>
        )}
        <button
          title={mix.favorite ? 'Remove bookmark' : 'Bookmark'}
          onClick={() => onUpdate({ ...mix, favorite: !mix.favorite })}
          style={iconBtn}
        >
          <i className={mix.favorite ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'} />
        </button>
        <button title="Duplicate mix" onClick={onDuplicate} style={{ ...iconBtn, color: 'var(--p-text-muted-color, #888)' }}>
          <i className="pi pi-copy" />
        </button>
        {(() => {
          const hasPrompt = mix.styles.some((e) => e.enabled && styles.find((s) => s.id === e.style_id)?.value)
          return (
            <button
              title={hasPrompt ? 'Copy combined prompt' : 'No enabled styles with prompt text'}
              onClick={(e) => { e.stopPropagation(); copyPrompt() }}
              disabled={!hasPrompt}
              style={{ ...iconBtn, color: copied ? '#6c6' : 'var(--p-text-muted-color, #888)', opacity: hasPrompt ? 1 : 0.35 }}
            >
              <i className={copied ? 'pi pi-check' : 'pi pi-clipboard'} />
            </button>
          )
        })()}
        <button
          title="Export mix ZIP (includes referenced styles and images)"
          onClick={(e) => { e.stopPropagation(); exportMixZip().catch(console.error) }}
          disabled={exporting}
          style={{ ...iconBtn, color: 'var(--p-text-muted-color, #888)', opacity: exporting ? 0.5 : 1 }}
        >
          <i className={exporting ? 'pi pi-spin pi-spinner' : 'pi pi-download'} />
        </button>
        <button title="Delete mix" onClick={() => setPendingDelete(true)} style={{ ...iconBtn, color: 'var(--p-text-muted-color, #888)' }}>
          <i className="pi pi-trash" />
        </button>
      </div>

      {/* Delete confirmation overlay */}
      {pendingDelete && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(20,20,20,0.92)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          zIndex: 10,
        }}>
          <i className="pi pi-trash" style={{ fontSize: 22, color: '#e55' }} />
          <span style={{ fontSize: 13, color: '#ddd', fontWeight: 600 }}>Delete "{mix.name}"?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPendingDelete(false)}
              style={{ ...overlayBtn }}
            >
              Cancel
            </button>
            <button
              onClick={onDelete}
              style={{ ...overlayBtn, background: '#c33', color: '#fff', borderColor: '#c33' }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Cover image */}
      <div
        style={{ position: 'relative', width: '100%', paddingBottom: '100%' }}
        onMouseEnter={() => setImageHovered(true)}
        onMouseLeave={() => setImageHovered(false)}
      >
        <div
          title="Click or drop an image to set mix cover"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) handleImageFile(file)
          }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 6,
            border: '1px dashed var(--p-surface-border, #555)',
            overflow: 'hidden',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--p-surface-ground, #141414)',
            fontSize: 11,
            color: '#888',
            flexShrink: 0,
          }}
        >
          {uploading ? (
            'Uploading…'
          ) : mix.image_filename ? (
            <img
              src={mixImageUrl(mix.image_filename, mix.image_updated_at)}
              alt={mix.name}
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
                transition: 'transform 0.3s ease',
                transform: imageHovered ? 'scale(1.05)' : 'scale(1)',
              }}
            />
          ) : (
            '+ cover image'
          )}
        </div>
        {!uploading && mix.image_filename && imageHovered && (
          <button
            title="View full size"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(true) }}
            style={magnifyBtn}
          >
            <i className="pi pi-search-plus" />
          </button>
        )}
      </div>

      {lightboxOpen && mix.image_filename && (
        <ImageLightbox
          src={mixImageUrl(mix.image_filename, mix.image_updated_at)}
          alt={mix.name}
          onClose={() => setLightboxOpen(false)}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleImageFile(file)
          e.target.value = ''
        }}
      />

      {/* Style entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
        {mix.styles.length === 0 && (
          <div style={{ fontSize: 11, color: '#666' }}>No styles added yet.</div>
        )}
        {mix.styles.map((entry, i) => {
          const style = styles.find((s) => s.id === entry.style_id)
          return (
            <div key={entry.style_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* ON/OFF toggle */}
              <button
                title={entry.enabled ? 'Disable' : 'Enable'}
                onClick={() => updateEntry(i, { enabled: !entry.enabled })}
                style={{
                  ...iconBtn,
                  fontSize: 11,
                  padding: '2px 5px',
                  border: '1px solid var(--p-surface-border, #555)',
                  borderRadius: 4,
                  background: entry.enabled ? 'var(--p-primary-color, #557755)' : 'transparent',
                  color: entry.enabled ? '#fff' : '#888',
                  minWidth: 32,
                }}
              >
                {entry.enabled ? 'ON' : 'OFF'}
              </button>

              <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {style?.name ?? entry.style_id}
              </span>

              {/* Weight input */}
              <BarInput
                value={entry.weight}
                onChange={(v) => updateEntry(i, { weight: v })}
                step={0.01}
                width={64}
              />

              <button title="Remove from mix" onClick={() => removeEntry(i)} style={{ ...iconBtn, color: '#e55', fontSize: 13 }}>
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {/* Add style dropdown — always visible */}
      <select
        value=""
        disabled={unusedStyles.length === 0}
        onChange={(e) => { if (e.target.value) addStyle(e.target.value) }}
        style={{
          ...inputStyle,
          cursor: unusedStyles.length === 0 ? 'not-allowed' : 'pointer',
          opacity: unusedStyles.length === 0 ? 0.45 : 1,
        }}
        title={unusedStyles.length === 0 ? 'All library styles are already in this mix' : 'Add a style to this mix'}
      >
        <option value="">
          {unusedStyles.length === 0 ? '— all styles already added —' : '+ add style…'}
        </option>
        {unusedStyles.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {/* Mix-level negative prompt */}
      <div style={{ borderTop: '1px solid var(--p-surface-border, #333)', paddingTop: 6 }}>
        <div style={{ fontSize: 10, color: '#666', marginBottom: 2, userSelect: 'none' }}>mix negative (override / extra)</div>
        {editingMixNegative ? (
          <textarea
            autoFocus
            value={mixNegativeInput}
            onChange={(e) => setMixNegativeInput(e.target.value)}
            onBlur={commitMixNegative}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditingMixNegative(false) }}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', width: '100%' }}
            placeholder="optional mix-level negative…"
          />
        ) : (
          <div
            title="Double-click to edit mix-level negative prompt"
            onDoubleClick={() => { setMixNegativeInput(mix.negative ?? ''); setEditingMixNegative(true) }}
            style={{ fontSize: 11, color: '#888', cursor: 'text', wordBreak: 'break-word', minHeight: 24 }}
          >
            {mix.negative || <span style={{ color: '#444' }}>double-click to add negative…</span>}
          </div>
        )}
      </div>
    </div>
  )
}

const overlayBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #666',
  borderRadius: 5,
  color: '#ccc',
  cursor: 'pointer',
  fontSize: 12,
  padding: '4px 12px',
}

const iconBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  padding: '0 2px',
  color: 'inherit',
  lineHeight: 1,
  flexShrink: 0,
}

const magnifyBtn: React.CSSProperties = {
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
}

const inputStyle: React.CSSProperties = {
  background: 'var(--p-surface-ground, #141414)',
  border: '1px solid var(--p-surface-border, #444)',
  borderRadius: 4,
  color: 'inherit',
  padding: '2px 4px',
  fontSize: 12,
  boxSizing: 'border-box',
}

// Inject pulse keyframe once.
;(() => {
  if (document.getElementById('immac-pulse-style')) return
  const s = document.createElement('style')
  s.id = 'immac-pulse-style'
  s.textContent = `@keyframes immac-pulse {
  0%,100% { opacity:1; transform:scale(1); }
  50%      { opacity:0.55; transform:scale(1.15); }
}`
  document.head.appendChild(s)
})()
