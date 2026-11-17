import { useEffect, useMemo, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Panel({
  title,
  action,
  children,
  className = '',
  sub,
}: {
  title?: string
  sub?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel-head">
          <div>
            {title && <h3 className="panel-title">{title}</h3>}
            {sub && <p className="panel-sub">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Chip({
  children,
  tone = 'muted',
  dot,
}: {
  children: ReactNode
  tone?: 'ok' | 'warn' | 'bad' | 'muted' | 'brand' | 'info'
  dot?: boolean
}) {
  return (
    <span className={`chip chip--${tone}`}>
      {dot && <i className="chip-dot" />}
      {children}
    </span>
  )
}

export function Bar({
  value,
  max = 100,
  tone = 'brand',
  height = 6,
}: {
  value: number
  max?: number
  tone?: 'brand' | 'warn' | 'bad' | 'ok'
  height?: number
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))
  return (
    <div className="bar" style={{ height }}>
      <span className={`bar-fill bar-fill--${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Sparkline({
  data,
  width = 160,
  height = 44,
  color = '#3fd0c9',
  fill = true,
  baseline,
}: {
  data: { t: number; v: number }[]
  width?: number
  height?: number
  color?: string
  fill?: boolean
  baseline?: number
}) {
  const { line, area, id } = useMemo(() => {
    const vals = data.map((d) => d.v)
    const min = Math.min(0, ...vals)
    const max = Math.max(0.5, ...vals)
    const pad = 4
    const n = Math.max(1, data.length - 1)
    const pts = data.map((d, i) => {
      const x = pad + (i / n) * (width - pad * 2)
      const y = height - pad - ((d.v - min) / (max - min || 1)) * (height - pad * 2)
      return [x, y] as const
    })
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    const area = `${line} L${pts[pts.length - 1]?.[0] ?? width},${height - pad} L${pts[0]?.[0] ?? 0},${height - pad} Z`
    return { line, area, id: `sp-${Math.random().toString(36).slice(2, 7)}` }
  }, [data, width, height])

  return (
    <svg width={width} height={height} className="spark" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {baseline != null && (
        <line
          x1="0"
          x2={width}
          y1={height - 4 - (baseline / Math.max(0.5, Math.max(...data.map((d) => d.v)))) * (height - 8)}
          y2={height - 4 - (baseline / Math.max(0.5, Math.max(...data.map((d) => d.v)))) * (height - 8)}
          stroke="#ff5d6c"
          strokeDasharray="3 3"
          strokeWidth="1"
          opacity="0.6"
        />
      )}
      {fill && <path d={area} fill={`url(#${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {hint && <em>{hint}</em>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`switch ${on ? 'is-on' : ''}`}
        onClick={() => onChange(!on)}
      >
        <i />
      </button>
    </label>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function Drawer({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  sub?: string
  children: ReactNode
  footer?: ReactNode
}) {
  if (!open) return null
  return (
    <div className="drawer-wrap">
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal>
        <header className="drawer-head">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  onClick,
  testId,
}: {
  label: string
  value: string | number
  unit?: string
  sub?: string
  tone?: 'default' | 'warn' | 'bad' | 'ok'
  onClick?: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      className={`kpi ${tone ? `kpi--${tone}` : ''} ${onClick ? 'is-clickable' : ''}`}
      onClick={onClick}
      data-testid={testId}
    >
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">
        {value}
        {unit && <em>{unit}</em>}
      </span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </button>
  )
}
