import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useApp } from '../store'
import { Bar, Chip, Empty, Panel } from '../components/ui'
import { SPECS, STATE_LABEL } from '../data/specs'
import type { Sensor } from '../types'

export function Registry() {
  const { modules, selectedModule, selectModule, recover, setView } = useApp()
  const [type, setType] = useState<'all' | 'M1' | 'M2' | 'M3'>('all')
  const [sensor, setSensor] = useState<'all' | Sensor>('all')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  const filtered = useMemo(
    () =>
      modules.filter((m) => {
        if (type !== 'all' && m.type !== type) return false
        if (sensor !== 'all' && m.sensor !== sensor) return false
        if (q && !`${m.id} ${m.region}`.toLowerCase().includes(q.toLowerCase())) return false
        return true
      }),
    [modules, type, sensor, q],
  )

  const detail = modules.find((m) => m.id === selectedModule) ?? null

  useEffect(() => setPicked([]), [type, sensor, q])

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1>Asset registry</h1>
          <p>{modules.length} modules · sensor health, fill level and assignment</p>
        </div>
        <div className="head-chips">
          <Chip tone="ok" dot>{modules.filter((m) => m.sensor === 'HEALTHY').length} healthy</Chip>
          <Chip tone="warn" dot>{modules.filter((m) => m.sensor === 'FULL').length} full</Chip>
          <Chip tone="bad" dot>{modules.filter((m) => m.sensor === 'DAMAGED').length} damaged</Chip>
        </div>
      </div>

      <Panel
        title="Fleet inventory"
        className="registry-panel"
        sub="Select rows for batch recovery"
        action={
          <div className="filter-row">
            <div className="seg-control">
              {(['all', 'M1', 'M2', 'M3'] as const).map((t) => (
                <button key={t} className={type === t ? 'is-on' : ''} onClick={() => setType(t)}>
                  {t === 'all' ? 'All types' : t}
                </button>
              ))}
            </div>
            <select value={sensor} onChange={(e) => setSensor(e.target.value as any)} className="select">
              <option value="all">All sensors</option>
              <option value="HEALTHY">Healthy</option>
              <option value="FULL">Full</option>
              <option value="DAMAGED">Damaged</option>
              <option value="UNREACHABLE">Unreachable</option>
            </select>
            <label className="search">
              <Search size={13} />
              <input placeholder="Search ID or district" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
        }
      >
        <div className="table-wrap">
          <table className="table table--registry">
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && picked.length === filtered.length}
                    onChange={(e) => setPicked(e.target.checked ? filtered.map((m) => m.id) : [])}
                    aria-label="Select all"
                  />
                </th>
                <th>Module</th>
                <th>Type</th>
                <th>State</th>
                <th>Sensor</th>
                <th>District</th>
                <th>Fill</th>
                <th>Assignment</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const pct = Math.round((m.absorbed / m.capacity) * 100)
                const isPicked = picked.includes(m.id)
                return (
                  <tr
                    key={m.id}
                    className={`${detail?.id === m.id ? 'is-active' : ''} ${isPicked ? 'is-picked' : ''}`}
                    onClick={() => selectModule(m.id)}
                  >
                    <td className="col-check" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isPicked}
                        onChange={(e) =>
                          setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))
                        }
                        aria-label={`Select ${m.id}`}
                      />
                    </td>
                    <td className="mono">{m.id}</td>
                    <td><span className={`type-tag type-tag--${m.type}`}>{m.type}</span></td>
                    <td><Chip tone={m.state === 'operating' ? 'ok' : m.state === 'saturated' ? 'warn' : m.state === 'damaged' ? 'bad' : 'muted'}>{STATE_LABEL[m.state]}</Chip></td>
                    <td><Chip tone={m.sensor === 'HEALTHY' ? 'ok' : m.sensor === 'FULL' ? 'warn' : 'bad'}>{m.sensor}</Chip></td>
                    <td>{m.region}</td>
                    <td className="fill-cell">
                      <Bar value={pct} tone={pct >= 100 ? 'bad' : pct > 70 ? 'warn' : 'brand'} />
                      <span className="mono">{pct}%</span>
                    </td>
                    <td className="mono">{m.orderId ?? m.supplyTask ?? '—'}</td>
                    <td className="muted mono">{m.updatedAt ? new Date(m.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <Empty>No modules match these filters</Empty>}
        </div>

        {picked.length > 0 && (
          <div className="batch-bar">
            <span>{picked.length} selected</span>
            <button className="btn btn--tiny btn--ghost" onClick={() => setPicked([])}>
              <X size={12} /> Clear
            </button>
            <button className="btn btn--tiny btn--primary" onClick={() => recover(picked)} data-testid="registry-recover">
              Batch recover to base
            </button>
          </div>
        )}
      </Panel>

      {detail && (
        <div className="registry-detail">
          <Panel
            title={`${detail.id} · ${SPECS[detail.type].name}`}
            sub={`${SPECS[detail.type].sizeLabel} · ${SPECS[detail.type].environment}`}
            action={
              <button className="icon-btn" onClick={() => selectModule(null)} aria-label="Close detail">
                <X size={14} />
              </button>
            }
          >
            <div className="detail-grid">
              <div><span>State</span><strong>{STATE_LABEL[detail.state]}</strong></div>
              <div><span>Sensor</span><strong>{detail.sensor}</strong></div>
              <div><span>District</span><strong>{detail.region}</strong></div>
              <div><span>Capacity</span><strong>{detail.capacity} m³</strong></div>
              <div><span>Absorbed</span><strong>{Math.round(detail.absorbed)} m³</strong></div>
              <div><span>Usage</span><strong>{detail.usage}</strong></div>
            </div>
            <div className="timeline-history">
              <span className="mini-label">State history</span>
              <div className="history-row"><span>03:40</span><em>Sensor {detail.sensor.toLowerCase()} reported</em></div>
              <div className="history-row"><span>02:10</span><em>Deployed at {detail.region}</em></div>
              <div className="history-row"><span>00:20</span><em>Dispatched from Yuen Long base</em></div>
            </div>
            <div className="action-bar">
              <button className="btn btn--ghost" onClick={() => setView('dispatch')}>View movement</button>
              <button className="btn btn--primary" onClick={() => recover([detail.id])}>Recover to base</button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
