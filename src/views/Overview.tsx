import { ArrowRight, Bot, CheckCircle2, AlertTriangle, Ship, Truck, Radio } from 'lucide-react'
import { useApp } from '../store'
import { MapView } from '../components/MapView'
import { Chip, Empty, Panel, Sparkline, Stat } from '../components/ui'
import { SPECS } from '../data/specs'
import { inventory, depthWith, fmtHours, fmtClock, timeAgo, tideNow, rainfallNow, fmtNum } from '../lib/sim'

export function Overview() {
  const {
    scenario,
    risks,
    modules,
    orders,
    events,
    simH,
    setView,
    selectRisk,
    openDrawer,
    settings,
  } = useApp()

  const active = risks.filter((r) => r.status !== 'rejected')
  const pending = risks.filter((r) => r.status === 'pending')
  const severe = active.filter((r) => r.level === 'severe')
  const inTransit = orders.filter((o) => o.status === 'in_transit')
  const land = inTransit.filter((o) => o.mode === 'land')
  const sea = inTransit.filter((o) => o.mode === 'sea')
  const inv = inventory(modules)
  const deployed = inv.M1.deployed + inv.M1.saturated + inv.M2.deployed + inv.M2.saturated + inv.M3.deployed + inv.M3.saturated
  const supplyM2 = modules.filter((m) => m.type === 'M2' && m.usage === 'supply').length
  const supplyPct = Math.round((supplyM2 / Math.max(1, settings.fleet.M2)) * 100)
  const saturated = modules.filter((m) => m.sensor === 'FULL')
  const damaged = modules.filter((m) => m.sensor === 'DAMAGED' || m.sensor === 'UNREACHABLE')
  const sorted = [...active].sort((a, b) => a.arriveByHours - b.arriveByHours)

  // Simple AI-style recommendation logic (follows poster flow: risk → storage → mode → human approve)
  const topRisk = sorted[0]
  const hasUrgent = pending.length > 0 || severe.length > 0
  const hasCapacityIssue = saturated.length > 0 || supplyPct > 70

  let aiTitle = 'All systems nominal'
  let aiDesc = 'No urgent actions required. Continue monitoring tide and rainfall feeds.'
  let primaryLabel = 'Open risk map'
  let primaryAction = () => setView('map')
  let secondaryLabel = 'View inventory'
  let secondaryAction = () => setView('registry')
  let tone: 'ok' | 'warn' | 'bad' = 'ok'

  if (pending.length > 0) {
    tone = 'warn'
    aiTitle = 'AI recommends: review pending approvals'
    aiDesc = `${pending.length} risk point${pending.length > 1 ? 's' : ''} still need a decision. Highest priority is ${topRisk?.name ?? 'the next deadline'}. Approve or adjust module mix before the arrival window closes.`
    primaryLabel = 'Go to Approval Queue'
    primaryAction = () => setView('approval')
    secondaryLabel = topRisk ? `Focus on ${topRisk.name}` : 'Open risk map'
    secondaryAction = () => {
      if (topRisk) {
        selectRisk(topRisk.id)
        setView('map')
      } else {
        setView('map')
      }
    }
  } else if (severe.length > 0) {
    tone = 'bad'
    aiTitle = 'AI flags severe risk points'
    aiDesc = `${severe.length} location${severe.length > 1 ? 's are' : ' is'} at severe level. Consider shifting additional M1/M3 modules or reviewing breakwater layout.`
    primaryLabel = 'Open risk map'
    primaryAction = () => setView('map')
    secondaryLabel = 'Dispatch & transport'
    secondaryAction = () => setView('dispatch')
  } else if (hasCapacityIssue) {
    tone = 'warn'
    aiTitle = 'AI recommends: free capacity'
    aiDesc = saturated.length
      ? `${saturated.length} module${saturated.length > 1 ? 's are' : ' is'} saturated. Recover or rotate units so storage remains available for the next peak.`
      : `M2 supply utilisation is high (${supplyPct}%). Consider recovering unused connection modules.`
    primaryLabel = 'Recover saturated'
    primaryAction = () => openDrawer('saturated')
    secondaryLabel = 'Asset registry'
    secondaryAction = () => setView('registry')
  }

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1>Operations overview</h1>
          <p>
            {scenario.name} · {scenario.subtitle}
          </p>
        </div>
        <button className="btn btn--ghost" onClick={() => setView('map')}>
          Open risk map <ArrowRight size={16} />
        </button>
      </div>

      {/* AI Suggestions – primary guidance block */}
      <div className="ai-suggest">
        <div className="ai-suggest-head">
          <div>
            <div className="ai-suggest-title">
              <Bot size={18} />
              AI Suggestion
              <span>{tone === 'ok' ? 'Stable' : tone === 'warn' ? 'Action needed' : 'High priority'}</span>
            </div>
            <p className="ai-suggest-desc" style={{ marginTop: 8 }}>
              <strong style={{ color: 'var(--text)' }}>{aiTitle}</strong>
              <br />
              {aiDesc}
            </p>
            <div className="ai-suggest-meta">
              {pending.length > 0 && (
                <span className="ai-pill ai-pill--warn">
                  <AlertTriangle size={13} /> <strong>{pending.length}</strong> pending approval
                </span>
              )}
              {severe.length > 0 && (
                <span className="ai-pill ai-pill--bad">
                  <strong>{severe.length}</strong> severe risk
                </span>
              )}
              {saturated.length > 0 && (
                <span className="ai-pill ai-pill--warn">
                  <strong>{saturated.length}</strong> saturated
                </span>
              )}
              {tone === 'ok' && (
                <span className="ai-pill ai-pill--ok">
                  <CheckCircle2 size={13} /> Monitoring
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="ai-suggest-actions">
          <button className="btn btn--primary btn--lg" onClick={primaryAction}>
            {primaryLabel}
          </button>
          <button className="btn btn--lg" onClick={secondaryAction}>
            {secondaryLabel}
          </button>
          <button className="btn btn--ghost" onClick={() => setView('lab')}>
            Open Simulation Lab
          </button>
        </div>
      </div>

      <div className="kpi-row">
        <Stat label="Active risk points" value={active.length} sub={`${severe.length} severe`} testId="kpi-risks" />
        <Stat label="Pending approvals" value={pending.length} sub="Decision required" tone={pending.length ? 'warn' : 'default'} testId="kpi-pending" />
        <Stat label="In transit" value={inTransit.reduce((n, o) => n + o.moduleIds.length, 0)} sub={`${land.length} land · ${sea.length} sea`} testId="kpi-transit" />
        <Stat label="Deployed modules" value={deployed} sub={`of ${settings.fleet.M1 + settings.fleet.M2 + settings.fleet.M3} in fleet`} testId="kpi-deployed" />
        <Stat label="M2 supply utilisation" value={`${supplyPct}%`} sub={`${supplyM2} of ${settings.fleet.M2} committed`} tone={supplyPct > 45 ? 'warn' : 'default'} testId="kpi-supply" />
        <Stat label="Saturated modules" value={saturated.length} sub="Sensor reports FULL" tone={saturated.length ? 'warn' : 'default'} onClick={() => openDrawer('saturated')} testId="kpi-saturated" />
        <Stat label="Damaged modules" value={damaged.length} sub="Sensor lost / flagged" tone={damaged.length ? 'bad' : 'default'} onClick={() => openDrawer('damaged')} testId="kpi-damaged" />
      </div>

      <div className="overview-grid">
        <Panel
          title="Live risk map"
          sub="Forecast flood extent and module positions at simulation time"
          className="overview-map"
          action={<Chip tone="brand">{fmtClock(scenario.t0, simH)} HKT</Chip>}
        >
          <MapView variant="mini" onRiskClick={(id) => { setView('map'); selectRisk(id) }} />
        </Panel>

        <Panel title="Risk points" sub="Sorted by arrival deadline" className="overview-risks">
          <div className="risk-list">
            {sorted.length === 0 && <Empty>No active risk points</Empty>}
            {sorted.map((r) => {
              const depth = depthWith(r, simH, modules)
              const eta = r.arriveByHours - simH
              return (
                <button
                  key={r.id}
                  className="risk-row"
                  onClick={() => {
                    selectRisk(r.id)
                    setView('map')
                  }}
                >
                  <span className={`risk-dot risk-dot--${r.level}`} />
                  <span className="risk-name">
                    <strong>{r.name}</strong>
                    <em>{r.region} · {r.type}</em>
                  </span>
                  <span className="risk-figures">
                    <b>{depth.toFixed(2)} m</b>
                    <i>peak {r.peakDepth.toFixed(2)} m</i>
                  </span>
                  <span className={`risk-eta ${eta < 2 ? 'is-critical' : ''}`}>
                    <b>{eta > 0 ? `${eta.toFixed(1)} h` : 'Due now'}</b>
                    <i>to deadline</i>
                  </span>
                </button>
              )
            })}
          </div>
        </Panel>

        <Panel
          title="Transport status"
          sub="Live land and sea movements"
          className="overview-transport"
          action={<Chip tone="muted">{inTransit.length} active</Chip>}
        >
          {inTransit.length === 0 ? (
            <Empty>No units currently in transit</Empty>
          ) : (
            <div className="transport-list">
              {inTransit.map((o) => (
                <div key={o.id} className="transport-row">
                  <span className="transport-icon">
                    {o.mode === 'sea' ? <Ship size={14} /> : <Truck size={14} />}
                  </span>
                  <div className="transport-body">
                    <strong>{o.id}</strong>
                    <em>
                      {o.riskName} · {o.mode}
                    </em>
                  </div>
                  <div className="transport-eta">
                    <b>{fmtHours(o.etaH - simH)}</b>
                    <i>{o.lateMin > 0 ? `+${o.lateMin} min late` : 'on time'}</i>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Module inventory" sub="Standby / transit / deployed / saturated" className="overview-inventory">
          <div className="inv-grid">
            {(['M1', 'M2', 'M3'] as const).map((t) => {
              const s = inv[t]
              const total = settings.fleet[t]
              return (
                <div key={t} className="inv-row">
                  <span className={`type-tag type-tag--${t}`}>{t}</span>
                  <div className="inv-meta">
                    <strong>{SPECS[t].name}</strong>
                    <span className="muted">{s.standby + s.transit + s.deployed + s.saturated} / {total}</span>
                  </div>
                  <div className="inv-bars">
                    <div className="inv-bar">
                      <i style={{ width: `${(s.standby / Math.max(1, total)) * 100}%`, background: '#5a7a84' }} />
                      <i style={{ width: `${(s.transit / Math.max(1, total)) * 100}%`, background: '#6ea8fe' }} />
                      <i style={{ width: `${(s.deployed / Math.max(1, total)) * 100}%`, background: '#3fd0c9' }} />
                      <i style={{ width: `${(s.saturated / Math.max(1, total)) * 100}%`, background: '#f4b860' }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="inv-legend">
            <span><i style={{ background: '#5a7a84' }} /> Standby</span>
            <span><i style={{ background: '#6ea8fe' }} /> Transit</span>
            <span><i style={{ background: '#3fd0c9' }} /> Deployed</span>
            <span><i style={{ background: '#f4b860' }} /> Saturated</span>
          </div>
        </Panel>

        <Panel title="Event feed" sub="Latest system activity" className="overview-events">
          <div className="event-list">
            {events.slice(0, 8).map((e) => (
              <div key={e.id} className="event-row">
                <span className="event-time">{timeAgo(e.t)}</span>
                <span className={`event-dot event-dot--${e.severity || 'info'}`} />
                <span className="event-msg">{e.message}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Tide and rainfall" sub="Scenario forcing at current time" className="overview-forcing">
          <div className="forcing-grid">
            <div>
              <div className="forcing-label">TIDE (TAI O)</div>
              <div className="forcing-value">{fmtNum(tideNow(scenario, simH), 2)} m</div>
              <Sparkline data={scenario.series.tide} height={36} />
            </div>
            <div>
              <div className="forcing-label">RAINFALL</div>
              <div className="forcing-value">{fmtNum(rainfallNow(scenario, simH), 0)} mm/h</div>
              <Sparkline data={scenario.series.rainfall} height={36} color="#6ea8fe" />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
