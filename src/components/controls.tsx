import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  Satellite,
  Waves,
} from 'lucide-react'
import { useApp, SCENARIO_META, DEFAULT_CUSTOM } from '../store'
import { fmtClock } from '../lib/sim'
import { Chip, Drawer, Modal } from './ui'
import { SPECS } from '../data/specs'

export function Clock({ compact = false }: { compact?: boolean }) {
  const { scenario, simH, playing, speed, togglePlay, setSpeed } = useApp()
  return (
    <div className={`clock ${compact ? 'clock--compact' : ''}`}>
      <button className="play-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="clock-read">
        <strong>T+{simH.toFixed(1)} h</strong>
        <span>{fmtClock(scenario.t0, simH)} HKT</span>
      </div>
      <div className="speeds">
        {[1, 10, 60, 300].map((s) => (
          <button
            key={s}
            className={`speed ${speed === s ? 'is-on' : ''}`}
            onClick={() => setSpeed(s)}
            aria-label={`Speed ${s}x`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}

export function Timeline() {
  const { scenario, simH, setSimH, playing, togglePlay, speed, setSpeed } = useApp()
  return (
    <div className="timeline">
      <button className="play-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <div className="timeline-track">
        <div className="timeline-meta">
          <span>T+{simH.toFixed(1)} h</span>
          <span>{fmtClock(scenario.t0, simH)} HKT</span>
          <span className="muted">Scrub 0 – {scenario.durationHours} h</span>
        </div>
        <input
          type="range"
          min={0}
          max={scenario.durationHours}
          step={0.1}
          value={simH}
          onChange={(e) => setSimH(Number(e.target.value))}
          aria-label="Simulation time"
        />
        <div className="timeline-ticks">
          {Array.from({ length: Math.floor(scenario.durationHours / 6) + 1 }, (_, i) => (
            <span key={i} style={{ left: `${((i * 6) / scenario.durationHours) * 100}%` }}>
              {i * 6}h
            </span>
          ))}
        </div>
      </div>
      <div className="speeds">
        {[1, 10, 60, 300].map((s) => (
          <button key={s} className={`speed ${speed === s ? 'is-on' : ''}`} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}

export function ScenarioMenu() {
  const { scenario, scenarioId, mode, setMode, loadScenario, setView } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const label = mode === 'live' ? 'Live API' : scenarioId === 'custom' ? 'Custom (configure in Settings)' : scenario.name

  return (
    <div className="scenario-menu" ref={ref}>
      <button className="scenario-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="scenario-dot" data-live={mode === 'live'} />
        <span className="scenario-name">{label}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="scenario-pop" role="listbox">
          <div className="scenario-group">Live data</div>
          <button
            className={`scenario-item ${mode === 'live' ? 'is-on' : ''}`}
            onClick={() => {
              setMode('live')
              setOpen(false)
            }}
          >
            <Satellite size={14} />
            <span>
              <strong>Live API</strong>
              <em>HKO tide, rainfall and warnings</em>
            </span>
          </button>
          <div className="scenario-group">Preset scenarios</div>
          {SCENARIO_META.map((s) => (
            <button
              key={s.id}
              className={`scenario-item ${mode === 'preset' && scenarioId === s.id ? 'is-on' : ''}`}
              onClick={() => {
                setMode('preset')
                loadScenario(s.id)
                setOpen(false)
              }}
            >
              <Waves size={14} />
              <span>
                <strong>{s.name}</strong>
                <em>{s.subtitle}</em>
              </span>
            </button>
          ))}
          <div className="scenario-group">Custom</div>
          <button
            className={`scenario-item ${scenarioId === 'custom' ? 'is-on' : ''}`}
            onClick={() => {
              setView('settings')
              setOpen(false)
            }}
          >
            <RotateCcw size={14} />
            <span>
              <strong>Custom (configure in Settings)</strong>
              <em>{DEFAULT_CUSTOM.riskIds.length} default warning points · editable</em>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

export function M2ConflictModal() {
  const { m2Conflict, confirmRecall, cancelConflict } = useApp()
  return (
    <Modal
      open={!!m2Conflict}
      onClose={cancelConflict}
      title="M2 dual-use conflict"
      footer={
        <>
          <button className="btn btn--ghost" onClick={cancelConflict}>
            Cancel
          </button>
          <button className="btn btn--danger" onClick={() => void confirmRecall()}>
            Approve recall
          </button>
        </>
      }
    >
      <p className="modal-lead">
        Recalling M2 modules disrupts an active water-supply task. This deployment needs{' '}
        <strong>{m2Conflict?.need ?? 0} M2</strong>; only <strong>{m2Conflict?.free ?? 0}</strong> are free at base and{' '}
        <strong>{m2Conflict?.supply ?? 0}</strong> are committed to supply.
      </p>
      <ul className="modal-list">
        <li>
          <span>Recall committed M2</span>
          <em>+1.5 h preparation · water supply to the affected district pauses</em>
        </li>
        <li>
          <span>Dispatch new M2 from Yuen Long</span>
          <em>No supply disruption · longer land ETA, may miss the flood deadline</em>
        </li>
      </ul>
      <p className="modal-note">Approving the recall reallocates supply modules to flood defence immediately.</p>
    </Modal>
  )
}

export function SensorDrawer() {
  const { drawer, modules, openDrawer, recover } = useApp()
  const [picked, setPicked] = useState<string[]>([])
  const open = drawer === 'saturated' || drawer === 'damaged'
  const list = modules.filter((m) =>
    drawer === 'saturated' ? m.sensor === 'FULL' : m.sensor === 'DAMAGED' || m.sensor === 'UNREACHABLE',
  )
  useEffect(() => setPicked([]), [drawer])
  return (
    <Drawer
      open={open}
      onClose={() => openDrawer(null)}
      title={drawer === 'saturated' ? 'Saturated modules' : 'Damaged / unreachable modules'}
      sub={`${list.length} module(s) · sensor telemetry`}
      footer={
        <button
          className="btn btn--primary"
          disabled={!picked.length}
          onClick={() => recover(picked)}
          data-testid="batch-recover"
        >
          Batch recover to base ({picked.length})
        </button>
      }
    >
      {list.length === 0 && <div className="empty">No modules in this state</div>}
      <div className="drawer-list">
        {list.map((m) => (
          <label key={m.id} className="drawer-row">
            <input
              type="checkbox"
              checked={picked.includes(m.id)}
              onChange={(e) =>
                setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))
              }
            />
            <span className={`type-tag type-tag--${m.type}`}>{m.type}</span>
            <span className="drawer-main">
              <strong>{m.id}</strong>
              <em>
                {m.region} · {SPECS[m.type].name}
              </em>
            </span>
            <Chip tone={m.sensor === 'FULL' ? 'warn' : 'bad'}>{m.sensor}</Chip>
          </label>
        ))}
      </div>
    </Drawer>
  )
}
