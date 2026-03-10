interface Props {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ title, message, confirmText = 'OK', cancelText = 'Cancel', onConfirm, onCancel }: Props) {
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
          padding: 20,
          maxWidth: 500,
          width: '90%',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
          {title}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#ccc', whiteSpace: 'pre-wrap' }}>
          {message}
        </p>

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
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
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
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
