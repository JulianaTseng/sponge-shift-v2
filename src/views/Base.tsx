import { useApp } from '../store'
import { MapView } from '../components/MapView'
import { Chip, Empty, Panel } from '../components/ui'
import { BASE, SPECS } from '../data/specs'
import { fmtHours } from '../lib/sim'

export function BaseOps() {
  const { modules, orders, events, simH } = useApp()
  const resident = modules.filter((m) => m.state === 'standby')
  const dispatchable = resident.filter((m) => m.sensor === 'HEALTHY')
  const maintenance = modules.filter((m) => m.state === 'damaged' || m.state === 'maintenance')
  const outbound = orders.filter((o) => o.status === 'in_transit')
  const logs = [
    ...outbound.map((o) => ({
      id: o.id,
      time: fmtHours(Math.max(0, o.departAt)),
      dir: 'Outbound',
      detail: `${o.moduleIds.join(', ')} → ${o.riskName}`,
      mode: o.mode,
    })),
    ...events
      .filter((e) => e.kind === 'transport' || e.kind === 'system')
      .slice(0, 6)
      .map((e) => ({
        id: e.id,
        time: new Date(e.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        dir: 'Log',
        detail: e.message,
        mode: '',
      })),
  ]

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1>Yuen Long base operations</h1>
          <p>All modules are stored, maintained and dispatched from this site unless already assigned.</p>
        </div>
        <Chip tone="brand" dot>Base online</Chip>
      </div>

      <div className="kpi-row kpi-row--four">
        <div className="stat-block">
          <span>Resident modules</span>
          <strong>{resident.length}</strong>
          <em>Across three storage zones</em>
        </div>
        <div className="stat-block">
          <span>Dispatchable now</span>
          <strong>{dispatchable.length}</strong>
          <em>Healthy sensor · standby</em>
        </div>
        <div className="stat-block stat-block--warn">
          <span>Under maintenance</span>
          <strong>{maintenance.length}</strong>
          <em>Damaged or flagged</em>
        </div>
        <div className="stat-block stat-block--ok">
          <span>M3 launch point</span>
          <strong>Open</strong>
          <em>Tuen Mun sea access</em>
        </div>
      </div>

      <div className="base-grid">
        <Panel title="Base layout" sub={`${BASE[1].toFixed(4)}°N, ${BASE[0].toFixed(4)}°E`} className="base-map">
          <MapView variant="mini" focus={BASE} zoomLevel={12.6} />
        </Panel>

        <Panel title="Storage zones" sub="By module type" className="base-zones">
          {(['M1', 'M2', 'M3'] as const).map((t) => {
            const list = resident.filter((m) => m.type === t)
            const cap = t === 'M3' ? 18 : 30
            return (
              <div key={t} className="zone-row">
                <span className={`type-tag type-tag--${t}`}>{t}</span>
                <span className="zone-name">{SPECS[t].name}</span>
                <div className="zone-slots">
                  {Array.from({ length: Math.min(cap, 24) }, (_, i) => (
                    <i key={i} className={i < list.length ? 'is-filled' : ''} />
                  ))}
                </div>
                <span className="mono">{list.length}/{cap}</span>
              </div>
            )
          })}
          <p className="side-note">M3 uses the floating pontoon; recovery is tide-window dependent.</p>
        </Panel>

        <Panel title="Inbound / outbound log" sub="Most recent 12 movements" className="base-log">
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Direction</th><th>Detail</th><th>Mode</th></tr>
            </thead>
            <tbody>
              {logs.slice(0, 12).map((l) => (
                <tr key={l.id}>
                  <td className="mono">{l.time}</td>
                  <td><Chip tone={l.dir === 'Outbound' ? 'info' : 'muted'}>{l.dir}</Chip></td>
                  <td>{l.detail}</td>
                  <td className="mono">{l.mode || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && <Empty>No movements recorded</Empty>}
        </Panel>

        <Panel title="Outbound queue" sub="Awaiting departure">
          <div className="stack">
            {outbound.length === 0 && <Empty>No modules awaiting departure</Empty>}
            {outbound.map((o) => (
              <div key={o.id} className="queue-line">
                <span className="mono">{o.id}</span>
                <span>{o.moduleIds.join(', ')}</span>
                <span className="muted">→ {o.riskName}</span>
                <span className="mono">{fmtHours(Math.max(0, o.departAt - simH))}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
