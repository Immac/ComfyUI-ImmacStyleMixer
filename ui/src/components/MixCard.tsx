import { useRef, useState } from 'react'
import { Mix, MixEntry, Style } from '../types'
import { mixImageUrl, uploadMixImage } from '../hooks/useStyleMixerData'
import ImageLightbox from './ImageLightbox'

interface Props {
  mix: Mix
  styles: Style[]
  isActive: boolean
  onActivate: () => void
  onUpdate: (updated: Mix) => void
  onDelete: () => void
  onDuplicate: () => void
}

export default function MixCard({ mix, styles, isActive, onActivate, onUpdate, onDelete, onDuplicate }: Props) {
  function handleCardClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('button, input, select, textarea, a')) onActivate()
  }

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(mix.name)
  const [uploading, setUploading] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [imageHovered, setImageHovered] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const filename = await uploadMixImage(file)
      onUpdate({ ...mix, image_filename: filename })
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

  function updateEntry(index: number, patch: Partial<MixEntry>) {
    const next = mix.styles.map((e, i) => (i === index ? { ...e, ...patch } : e))
    onUpdate({ ...mix, styles: next })
  }

  function removeEntry(index: number) {
    onUpdate({ ...mix, styles: mix.styles.filter((_, i) => i !== index) })
  }

  function addStyle(styleId: string) {
    if (mix.styles.some((e) => e.style_id === styleId)) return
    onUpdate({ ...mix, styles: [...mix.styles, { style_id: styleId, weight: 1.0, enabled: true }] })
  }

  const unusedStyles = styles.filter((s) => !mix.styles.some((e) => e.style_id === s.id))

  return (
    <div
      style={{
        border: `2px solid ${isActive ? 'var(--p-primary-color, #6c6)' : 'var(--p-surface-border, #444)'}`,
        borderRadius: 8,
        padding: 10,
        background: 'var(--p-surface-section, #1e1e1e)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
      onClick={handleCardClick}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
              src={mixImageUrl(mix.image_filename)}
              alt={mix.name}
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
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
          src={mixImageUrl(mix.image_filename)}
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
              <input
                type="number"
                min={0}
                max={2}
                step={0.05}
                value={entry.weight}
                onChange={(e) => updateEntry(i, { weight: parseFloat(e.target.value) || 0 })}
                style={{ ...inputStyle, width: 52, textAlign: 'right' }}
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
