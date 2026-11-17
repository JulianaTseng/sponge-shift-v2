import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useApp } from '../store'
import { Chip, Empty, Panel } from '../components/ui'
import type { EventKind } from '../types'
import { timeAgo } from '../lib/sim'

const FILTERS: { key: EventKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'risk', label: 'Risk' },
  { key: 'approval', label: 'Approvals' },
  { key: 'transport', label: 'Transport' },
  { key: 'sensor', label: 'Sensors' },
  { key: 'api', label: 'Data feeds' },
  { key: 'system', label: 'System' },
]

export function Alerts() {
  const { events, setView, selectModule, selectRisk } = useApp()
  const [kind, setKind] = useState<EventKind | 'all'>('all')
  const list = events.filter((e) => kind === 'all' || e.kind === kind)

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1>Alerts &amp; notifications</h1>
          <p>Weather warnings, approvals, module anomalies and data-feed health.</p>
        </div>
        <Chip tone="warn" dot>{events.filter((e) => e.severity === 'critical').length} critical</Chip>
      </div>

      <div className="filter-chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={`filter-chip ${kind === f.key ? 'is-on' : ''}`} onClick={() => setKind(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <Panel title="Notification feed" sub={`${list.length} entries`}>
        <div className="alert-feed">
          {list.length === 0 && <Empty>No notifications in this category</Empty>}
          {list.map((e) => (
            <div key={e.id} className={`alert-row alert-row--${e.severity}`}>
              <span className="alert-dot" />
              <span className="alert-body">
                <strong>{e.message}</strong>
                <em>
                  {timeAgo(e.t)}
                  {' · '}
                  {e.kind}
                </em>
              </span>
              {e.moduleId && (
                <button
                  className="btn btn--tiny btn--ghost"
                  onClick={() => {
                    selectModule(e.moduleId!)
                    setView('registry')
                  }}
                >
                  Open registry <ArrowUpRight size={12} />
                </button>
              )}
              {e.riskId && (
                <button
                  className="btn btn--tiny btn--ghost"
                  onClick={() => {
                    selectRisk(e.riskId!)
                    setView('map')
                  }}
                >
                  Open risk map <ArrowUpRight size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
