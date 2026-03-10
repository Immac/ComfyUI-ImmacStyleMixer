import { useState } from 'react'

export interface ConflictItem {
  id: string
  name: string
  existingName: string
  type: 'style' | 'mix'
}

interface Props {
  conflicts: ConflictItem[]
  onConfirm: (resolutions: Record<string, 'rename' | 'replace'>) => void
  onCancel: () => void
}

export default function ConflictResolutionDialog({ conflicts, onConfirm, onCancel }: Props) {
  const [resolutions, setResolutions] = useState<Record<string, 'rename' | 'replace'>>(() => {
    const initial: Record<string, 'rename' | 'replace'> = {}
    conflicts.forEach(c => initial[c.id] = 'rename')
    return initial
  })

  function handleResolutionChange(id: string, resolution: 'rename' | 'replace') {
    setResolutions(prev => ({ ...prev, [id]: resolution }))
  }

  function handleConfirm() {
    onConfirm(resolutions)
  }

  return (
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
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: '#1e1e1e',
          border: '1px solid #444',
          borderRadius: 4,
          padding: 16,
          maxWidth: 600,
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
          Import Conflicts Detected
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#aaa' }}>
          {conflicts.length} {conflicts.length === 1 ? 'item' : 'items'} already exist. 
          Choose how to resolve each conflict:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {conflicts.map(conflict => (
            <div
              key={conflict.id}
              style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: 4,
                padding: 12,
              }}
            >
              <div style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 13, color: '#fff' }}>
                  {conflict.name}
                </strong>
                <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                  ({conflict.type})
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>
                Existing: <span style={{ color: '#ccc' }}>{conflict.existingName}</span>
              </div>
              
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                }}>
                  <input
                    type="radio"
                    name={`conflict-${conflict.id}`}
                    value="rename"
                    checked={resolutions[conflict.id] === 'rename'}
                    onChange={() => handleResolutionChange(conflict.id, 'rename')}
                    style={{ cursor: 'pointer' }}
                  />
                  Rename (auto-number)
                </label>
                
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  marginLeft: 16,
                }}>
                  <input
                    type="radio"
                    name={`conflict-${conflict.id}`}
                    value="replace"
                    checked={resolutions[conflict.id] === 'replace'}
                    onChange={() => handleResolutionChange(conflict.id, 'replace')}
                    style={{ cursor: 'pointer' }}
                  />
                  Replace existing
                </label>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
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
          <button
            onClick={handleConfirm}
            style={{
              padding: '6px 16px',
              fontSize: 13,
              backgroundColor: '#0066cc',
              border: '1px solid #0066cc',
              borderRadius: 4,
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Import ({conflicts.length} items)
          </button>
        </div>
      </div>
    </div>
  )
}
