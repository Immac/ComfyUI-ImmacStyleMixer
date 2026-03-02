import { useState } from 'react'
import { Style } from '../types'
import StyleCard from './StyleCard'

interface Props {
  styles: Style[]
  onUpdate: (updated: Style) => void
  onDelete: (id: string) => void
  onAdd: (name: string) => void
  currentMixStyleIds?: Set<string>
  onAddToMix?: (id: string) => void
  onRemoveFromMix?: (id: string) => void
}

export default function StyleGallery({ styles, onUpdate, onDelete, onAdd, currentMixStyleIds, onAddToMix, onRemoveFromMix }: Props) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  function handleAdd() {
    const name = newName.trim()
    if (!name) return
    onAdd(name)
    setNewName('')
    setAdding(false)
  }

  const favorites = styles.filter((s) => s.favorite)
  const rest = styles.filter((s) => !s.favorite)
  const sorted = [...favorites, ...rest]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {sorted.map((s) => (
          <StyleCard
            key={s.id}
            style={s}
            onUpdate={onUpdate}
            onDelete={() => onDelete(s.id)}
            inCurrentMix={currentMixStyleIds?.has(s.id)}
            onAddToMix={onAddToMix ? () => onAddToMix(s.id) : undefined}
            onRemoveFromMix={onRemoveFromMix ? () => onRemoveFromMix(s.id) : undefined}
          />
        ))}

        {/* Add new style card */}
        {adding ? (
          <div
            style={{
              border: '1px dashed var(--p-primary-color, #6c6)',
              borderRadius: 8,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              background: 'var(--p-surface-section, #1e1e1e)',
              flexShrink: 0,
            }}
          >
            <input
              autoFocus
              placeholder="Style name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleAdd} style={actionBtn}>Add</button>
              <button onClick={() => { setAdding(false); setNewName('') }} style={{ ...actionBtn, background: 'transparent', color: '#aaa' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button
            title="Add a new style"
            onClick={() => setAdding(true)}
            style={{
              width: '100%',
              minHeight: 80,
              border: '1px dashed var(--p-surface-border, #555)',
              borderRadius: 8,
              background: 'transparent',
              color: '#666',
              cursor: 'pointer',
              fontSize: 24,
            }}
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--p-surface-ground, #141414)',
  border: '1px solid var(--p-primary-color, #6c6)',
  borderRadius: 4,
  color: 'inherit',
  padding: '4px 6px',
  fontSize: 13,
}

const actionBtn: React.CSSProperties = {
  flex: 1,
  background: 'var(--p-primary-color, #557755)',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  padding: '4px 8px',
  fontSize: 12,
}
