/**
 * BarInput – a draggable number bar that mimics the ComfyUI node number widget.
 *
 * - Displays a filled bar (0–1 clamped for the visual fill, but no clamping on value).
 * - Left-click + drag horizontally to change the value.
 * - Double-click (or single-click when already focused) to switch to a text input
 *   for typing any number.
 * - Press Enter / blur to commit; Escape to cancel.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  onChange: (v: number) => void
  /**
   * Lower bound for drag interaction and bar fill (default 0).
   * Values outside this range are still accepted via direct text input.
   */
  dragMin?: number
  /**
   * Upper bound for drag interaction and bar fill (default 1).
   * Values outside this range are still accepted via direct text input.
   */
  dragMax?: number
  step?: number
  /** Pixels of horizontal drag required to move one step (default 2). */
  pixelsPerStep?: number
  width?: number | string
  decimals?: number
}

export default function BarInput({
  value,
  onChange,
  dragMin = 0,
  dragMax = 1,
  step = 0.01,
  pixelsPerStep = 2,
  width = 72,
  decimals = 2,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Commit text input
  const commit = useCallback(() => {
    const parsed = parseFloat(draft)
    if (!isNaN(parsed)) onChange(parsed)
    setEditing(false)
  }, [draft, onChange])

  // Focus the text input when editing starts
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // ── Drag logic ────────────────────────────────────────────────────────────
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartValue = useRef(0)
  const hasDragged = useRef(false)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (editing) return
      e.currentTarget.setPointerCapture(e.pointerId)
      dragging.current = true
      hasDragged.current = false
      dragStartX.current = e.clientX
      // Clamp start value to drag range so drag always begins inside 0–1
      dragStartValue.current = Math.max(dragMin, Math.min(dragMax, value))
    },
    [editing, value, dragMin, dragMax],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return
      const dx = e.clientX - dragStartX.current
      if (Math.abs(dx) > 2) hasDragged.current = true
      const steps = dx / pixelsPerStep
      const raw = dragStartValue.current + steps * step
      // Round to avoid floating-point drift, then clamp to drag range
      const rounded = Math.round(raw / step) * step
      const clamped = parseFloat(Math.max(dragMin, Math.min(dragMax, rounded)).toFixed(decimals))
      onChange(clamped)
    },
    [step, pixelsPerStep, decimals, dragMin, dragMax, onChange],
  )

  const onPointerUp = useCallback(() => {
    if (dragging.current && !hasDragged.current) {
      // It was a plain click with no drag → switch to text input
      setDraft(value.toFixed(decimals))
      setEditing(true)
    }
    dragging.current = false
  }, [value, decimals])

  // ── Visual fill – anchored to drag range (0 = empty, dragMax = full) ────
  const fillPct = Math.max(0, Math.min(1, (value - dragMin) / (dragMax - dragMin))) * 100

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        style={{
          width,
          background: 'var(--p-surface-ground, #141414)',
          border: '1px solid var(--p-primary-color, #6c6)',
          borderRadius: 4,
          color: 'inherit',
          padding: '2px 4px',
          fontSize: 12,
          boxSizing: 'border-box',
          textAlign: 'center',
          outline: 'none',
        }}
      />
    )
  }

  return (
    <div
      draggable={false}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => e.stopPropagation()}
      style={{
        position: 'relative',
        width,
        height: 20,
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'ew-resize',
        userSelect: 'none',
        flexShrink: 0,
        border: '1px solid var(--p-surface-border, #555)',
        background: 'var(--p-surface-ground, #141414)',
        boxSizing: 'border-box',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Filled portion */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: `${fillPct}%`,
          background: 'var(--p-primary-color, #4a7a4a)',
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      />
      {/* Value label */}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: 'var(--p-text-color, #ddd)',
          pointerEvents: 'none',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value.toFixed(decimals)}
      </span>
    </div>
  )
}
