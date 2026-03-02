import { useRef, useState } from 'react'
import { Style } from '../types'
import { styleImageUrl, uploadStyleImage } from '../hooks/useStyleMixerData'
import ImageLightbox from './ImageLightbox'

interface Props {
  style: Style
  onUpdate: (updated: Style) => void
  onDelete: () => void
}

export default function StyleCard({ style, onUpdate, onDelete }: Props) {
  const [editingName, setEditingName] = useState(false)
  const [editingValue, setEditingValue] = useState(false)
  const [nameInput, setNameInput] = useState(style.name)
  const [valueInput, setValueInput] = useState(style.value)
  const [uploading, setUploading] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [imageHovered, setImageHovered] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function commitName() {
    setEditingName(false)
    if (nameInput.trim() !== style.name) onUpdate({ ...style, name: nameInput.trim() || style.name })
  }

  function commitValue() {
    setEditingValue(false)
    if (valueInput !== style.value) onUpdate({ ...style, value: valueInput })
  }

  async function handleImageDrop(file: File) {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const filename = await uploadStyleImage(file)
      onUpdate({ ...style, image_filename: filename })
    } catch (e) {
      console.error('[ImmacStyleMixer] Image upload failed', e)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--p-surface-border, #444)',
        borderRadius: 8,
        padding: 8,
        width: '100%',
        background: 'var(--p-surface-section, #1e1e1e)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Bookmark + Delete row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          title={style.favorite ? 'Remove bookmark' : 'Bookmark'}
          onClick={() => onUpdate({ ...style, favorite: !style.favorite })}
          style={iconBtn}
        >
          <i className={style.favorite ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'} />
        </button>
        <button title="Delete style" onClick={() => setPendingDelete(true)} style={{ ...iconBtn, color: 'var(--p-text-muted-color, #888)' }}>
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
          <span style={{ fontSize: 13, color: '#ddd', fontWeight: 600 }}>Delete "{style.name}"?</span>
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

      {/* Image area */}
      <div
        style={{ position: 'relative', width: '100%', paddingBottom: '100%' }}
        onMouseEnter={() => setImageHovered(true)}
        onMouseLeave={() => setImageHovered(false)}
      >
        <div
          title="Click or drop to upload image"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) handleImageDrop(file)
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
          }}
        >
          {uploading ? (
            'Uploading…'
          ) : style.image_filename ? (
            <img
              src={styleImageUrl(style.image_filename)}
              alt={style.name}
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                transition: 'transform 0.3s ease',
                transform: imageHovered ? 'scale(1.05)' : 'scale(1)',
              }}
            />
          ) : (
            '+ image'
          )}
        </div>
        {!uploading && style.image_filename && imageHovered && (
          <button
            title="View full size"
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(true) }}
            style={magnifyBtn}
          >
            <i className="pi pi-search-plus" />
          </button>
        )}
      </div>

      {lightboxOpen && style.image_filename && (
        <ImageLightbox
          src={styleImageUrl(style.image_filename)}
          alt={style.name}
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
          if (file) handleImageDrop(file)
          e.target.value = ''
        }}
      />

      {/* Name */}
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
        <div
          title="Click to rename"
          onDoubleClick={() => { setNameInput(style.name); setEditingName(true) }}
          style={{ fontWeight: 600, fontSize: 13, cursor: 'text', wordBreak: 'break-word' }}
        >
          {style.name}
        </div>
      )}

      {/* Value / prompt text */}
      {editingValue ? (
        <textarea
          autoFocus
          value={valueInput}
          onChange={(e) => setValueInput(e.target.value)}
          onBlur={commitValue}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditingValue(false) }}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      ) : (
        <div
          title="Click to edit prompt text"
          onDoubleClick={() => { setValueInput(style.value); setEditingValue(true) }}
          style={{ fontSize: 11, color: '#aaa', cursor: 'text', wordBreak: 'break-word', minHeight: 32 }}
        >
          {style.value || <span style={{ color: '#555' }}>double-click to add prompt…</span>}
        </div>
      )}
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
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--p-surface-ground, #141414)',
  border: '1px solid var(--p-primary-color, #6c6)',
  borderRadius: 4,
  color: 'inherit',
  padding: '2px 4px',
  fontSize: 12,
}
