import { Ship, Truck as TruckIcon } from 'lucide-react'
import { useApp } from '../store'
import { MapView } from '../components/MapView'
import { Chip, Empty, Panel, Bar } from '../components/ui'
import { fmtHours, fmtClock } from '../lib/sim'
import { distanceKm } from '../lib/geo'
import { BASE } from '../data/specs'

export function Dispatch() {
  const { orders, modules, risks, simH, scenario, settings, recover, setView, selectRisk } = useApp()
  const inTransit = orders.filter((o) => o.status === 'in_transit')
  const trucksUsed = inTransit.filter((o) => o.mode === 'land').length
  const tugsUsed = inTransit.filter((o) => o.mode === 'sea').length
  const trucksTotal = Math.max(4, Math.ceil(settings.fleet.M1 / 4 + settings.fleet.M2 / 4))
  const tugsTotal = Math.max(2, Math.ceil(settings.fleet.M3 / 3))
  const m2 = modules.filter((m) => m.type === 'M2')
  const duration = scenario.durationHours
  // Pending recommendations are plotted as planned windows so the timeline shows
  // what still has to fit before each deadline, not only what is already moving.
  const planned = risks
    .filter((r) => r.status !== 'approved' && r.status !== 'rejected')
    .sort((a, b) => a.arriveByHours - b.arriveByHours)
    .slice(0, 5)
    .map((r) => {
      const km = distanceKm(BASE, r.coord)
      const etaH = Math.max(0.5, km / settings.landSpeed + 0.25)
      return { risk: r, start: simH, etaH }
    })

  // A 12-hour rolling window keeps hour-scale movements legible; a full 48-hour
  // axis compresses every transit into a one-pixel sliver.
  const winStart = Math.max(0, Math.min(Math.max(0, duration - 12), simH - 1))
  const winEnd = Math.min(duration, winStart + 12)
  const span = Math.max(1, winEnd - winStart)
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - winStart) / span) * 100))
  const ticks: number[] = []
  for (let t = Math.ceil(winStart); t <= winEnd; t += 2) ticks.push(t)

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1>Dispatch &amp; transport</h1>
          <p>Land routes follow the OSRM road network; M3 is towed along digitised sea lanes.</p>
        </div>
        <div className="head-chips">
          <Chip tone={trucksUsed > trucksTotal ? 'bad' : 'ok'} dot>
            Trucks {trucksUsed}/{trucksTotal}
          </Chip>
          <Chip tone={tugsUsed > tugsTotal ? 'bad' : 'ok'} dot>
            Tugs {tugsUsed}/{tugsTotal}
          </Chip>
        </div>
      </div>

      <div className="dispatch-layout">
        <Panel title="Transport network" sub="Solid = road · dashed = sea lane / indicative" className="dispatch-map">
          <MapView variant="full" onRiskClick={(id) => { selectRisk(id); setView('map') }} />
        </Panel>

        <div className="dispatch-side">
          <Panel title="Fleet capacity" sub="Concurrent movements vs available assets">
            <div className="capacity-row">
              <span className="capacity-icon"><TruckIcon size={16} /></span>
              <div className="capacity-main">
                <div className="capacity-top">
                  <strong>Land convoys</strong>
                  <span>{trucksUsed} / {trucksTotal}</span>
                </div>
                <Bar value={trucksUsed} max={trucksTotal} tone={trucksUsed > trucksTotal ? 'bad' : 'brand'} />
              </div>
            </div>
            <div className="capacity-row">
              <span className="capacity-icon"><Ship size={16} /></span>
              <div className="capacity-main">
                <div className="capacity-top">
                  <strong>Sea tugs</strong>
                  <span>{tugsUsed} / {tugsTotal}</span>
                </div>
                <Bar value={tugsUsed} max={tugsTotal} tone={tugsUsed > tugsTotal ? 'bad' : 'brand'} />
              </div>
            </div>
            {(trucksUsed > trucksTotal || tugsUsed > tugsTotal) && (
              <div className="warn-note">
                Approvals exceed capacity. New deployments will queue and may miss their flood deadline.
              </div>
            )}
            <p className="side-note">Land {settings.landSpeed} km/h · sea {settings.seaSpeed} knots · base at Yuen Long ({BASE[1].toFixed(3)}°N)</p>
          </Panel>

          <Panel title="M2 dual-use" sub="Supply tasks vs flood defence">
            <div className="m2-list">
              {m2.slice(0, 8).map((m) => (
                <div key={m.id} className="m2-row">
                  <span className="type-tag type-tag--M2">M2</span>
                  <span className="m2-main">
                    <strong>{m.id}</strong>
                    <em>{m.usage === 'supply' ? `Supply · ${m.supplyTask ?? 'district task'}` : m.usage === 'flood' ? 'Flood defence' : 'Idle'}</em>
                  </span>
                  <Chip tone={m.usage === 'supply' ? 'info' : m.usage === 'flood' ? 'brand' : 'muted'}>{m.usage}</Chip>
                  {m.usage === 'supply' && (
                    <button className="btn btn--tiny btn--ghost" onClick={() => recover([m.id])}>
                      Release
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel
          title="Deployment timeline"
          sub={`T+${winStart.toFixed(0)} h → T+${winEnd.toFixed(0)} h · red = target flood time`}
          className="dispatch-gantt"
        >
          <div className="gantt">
            <div className="gantt-head">
              <span>Order / plan</span>
              <div className="gantt-scale">
                {ticks.map((t) => (
                  <span key={t} style={{ left: `${pct(t)}%` }}>
                    T+{t}h
                  </span>
                ))}
              </div>
            </div>
            {orders.length === 0 && planned.length === 0 && (
              <Empty>No orders yet — approve a recommendation first</Empty>
            )}
            {orders.map((o) => {
              const a = o.departAt
              const b = o.departAt + o.etaH
              if (b < winStart || a > winEnd) return null
              return (
                <div className="gantt-row" key={o.id}>
                  <span className="gantt-label">
                    <strong>{o.id}</strong>
                    <em>{o.riskName}</em>
                  </span>
                  <div className="gantt-track">
                    <span
                      className={`gantt-bar gantt-bar--${o.mode}`}
                      style={{ left: `${pct(a)}%`, width: `${Math.max(1.5, pct(b) - pct(a))}%` }}
                      title={`${o.moduleIds.length} module(s) · ${o.etaH.toFixed(1)} h transit · ${o.mode}`}
                    >
                      {o.moduleIds.length}×
                    </span>
                    <span
                      className="gantt-flood"
                      style={{ left: `${pct(o.floodAt)}%` }}
                      title={`Flood time T+${o.floodAt} h`}
                    />
                  </div>
                </div>
              )
            })}
            {planned.map(({ risk, start, etaH }) => {
              if (start + etaH < winStart || start > winEnd) return null
              return (
                <div className="gantt-row gantt-row--planned" key={'plan-' + risk.id}>
                  <span className="gantt-label">
                    <strong>PLAN</strong>
                    <em>{risk.name}</em>
                  </span>
                  <div className="gantt-track">
                    {/* Slack: everything between now and the moment the modules must be in place. */}
                    <span
                      className="gantt-window"
                      style={{
                        left: `${pct(start)}%`,
                        width: `${Math.max(1, pct(risk.arriveByHours) - pct(start))}%`,
                      }}
                      title={`Dispatch window · ${(risk.arriveByHours - start).toFixed(1)} h of slack`}
                    />
                    <span
                      className="gantt-bar gantt-bar--planned"
                      style={{
                        left: `${pct(start)}%`,
                        width: `${Math.max(1.2, pct(start + etaH) - pct(start))}%`,
                      }}
                      title={`Planned dispatch · ${etaH.toFixed(1)} h transit`}
                    />
                    <span
                      className="gantt-flood gantt-flood--deadline"
                      style={{ left: `${pct(risk.arriveByHours)}%` }}
                      title={`Must be in place by T+${risk.arriveByHours} h`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel title="Movements" sub="In transit and recently delivered" className="dispatch-table">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Modules</th>
                <th>Mode</th>
                <th>Destination</th>
                <th>ETA</th>
                <th>Status</th>
                <th>Late</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={7} className="table-empty">No movements recorded</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id}</td>
                  <td className="mono">{o.moduleIds.join(', ')}</td>
                  <td>
                    <Chip tone={o.mode === 'land' ? 'info' : 'warn'}>{o.mode}</Chip>
                  </td>
                  <td>{o.riskName}</td>
                  <td className="mono">{o.route ? fmtHours(Math.max(0, o.departAt + o.etaH - simH)) : '—'}</td>
                  <td><Chip tone={o.status === 'delivered' ? 'ok' : o.status === 'pending' ? 'muted' : 'brand'}>{o.status}</Chip></td>
                  <td className={o.lateMin > 0 ? 'text-bad mono' : 'mono'}>{o.lateMin > 0 ? `+${o.lateMin} min` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  )
}
