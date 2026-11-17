import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Route as RouteIcon, XCircle } from 'lucide-react'
import { useApp, SEA_LAUNCH } from '../store'
import { MapView } from '../components/MapView'
import { Chip, Empty, Modal, Panel, Sparkline } from '../components/ui'
import { SPECS } from '../data/specs'
import { depthWith, fmtHours } from '../lib/sim'
import { distanceKm } from '../lib/geo'
import { seaRoute } from '../lib/routing'

export function ApprovalQueue() {
  const { risks, modules, simH, approve, reject, settings, routing, scenario } = useApp()
  const queue = risks.filter((r) => r.status === 'pending')
  const [activeId, setActiveId] = useState<string | null>(queue[0]?.id ?? null)
  const [modify, setModify] = useState(false)
  const [draft, setDraft] = useState({ M1: 0, M2: 0, M3: 0 })

  useEffect(() => {
    if (!queue.find((r) => r.id === activeId)) setActiveId(queue[0]?.id ?? null)
  }, [queue, activeId])

  const risk = risks.find((r) => r.id === activeId) ?? null

  const etas = useMemo(() => {
    if (!risk) return { land: 0, sea: 0 }
    return {
      land: distanceKm([114.0325, 22.4445], risk.coord) / settings.landSpeed + 0.2,
      sea: seaRoute(SEA_LAUNCH, risk.coord).distanceKm / (settings.seaSpeed * 1.852) + 0.2,
    }
  }, [risk, settings])

  const remaining = risk ? risk.arriveByHours - simH : 0
  const feasible = Math.min(etas.land, etas.sea) <= remaining

  const free = (t: 'M1' | 'M2' | 'M3') =>
    modules.filter((m) => m.type === t && m.state === 'standby' && m.usage !== 'supply').length
  const supplyM2 = modules.filter((m) => m.type === 'M2' && m.usage === 'supply').length

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1>Approval queue</h1>
          <p>AI recommendations wait for a human decision. Nothing is dispatched automatically.</p>
        </div>
        <Chip tone={queue.length ? 'warn' : 'ok'} dot>
          {queue.length} awaiting decision
        </Chip>
      </div>

      <div className="approval-layout">
        <Panel title="Queue" sub="Priority by arrival deadline" className="queue-panel">
          <div className="queue-list">
            {queue.length === 0 && <Empty>Queue cleared — no pending approvals</Empty>}
            {queue.map((r) => {
              const left = r.arriveByHours - simH
              return (
                <button
                  key={r.id}
                  className={`queue-card ${activeId === r.id ? 'is-on' : ''}`}
                  onClick={() => setActiveId(r.id)}
                >
                  <span className="queue-top">
                    <strong>{r.name}</strong>
                    <Chip tone={r.level === 'severe' ? 'bad' : r.level === 'warning' ? 'warn' : 'muted'}>{r.level}</Chip>
                  </span>
                  <span className="queue-meta">
                    <em>{r.region}</em>
                    <em>{r.peakDepth.toFixed(2)} m peak</em>
                  </span>
                  <span className={`queue-count ${left < 2 ? 'is-critical' : ''}`}>
                    <Clock3 size={12} /> {left > 0 ? `${left.toFixed(1)} h left` : 'deadline passed'}
                  </span>
                </button>
              )
            })}
          </div>
        </Panel>

        {risk ? (
          <div className="approval-detail">
            <Panel
              title={risk.name}
              sub={`${risk.region} · ${risk.type}`}
              action={<Chip tone={risk.level === 'severe' ? 'bad' : 'warn'}>{risk.level}</Chip>}
            >
              <div className="detail-metrics">
                <div>
                  <span>Forecast peak</span>
                  <strong>{risk.peakDepth.toFixed(2)} m</strong>
                  <em>T+{risk.peakHour.toFixed(0)} h</em>
                </div>
                <div>
                  <span>Current depth</span>
                  <strong>{depthWith(risk, simH, modules).toFixed(2)} m</strong>
                  <em>with deployed modules</em>
                </div>
                <div>
                  <span>Deadline</span>
                  <strong>T+{risk.arriveByHours.toFixed(1)} h</strong>
                  <em>{remaining > 0 ? `${remaining.toFixed(1)} h remaining` : 'passed'}</em>
                </div>
                <div>
                  <span>Verdict</span>
                  <strong className={feasible ? 'text-ok' : 'text-bad'}>{feasible ? 'Feasible' : 'At risk'}</strong>
                  <em>earliest arrival {fmtHours(Math.min(etas.land, etas.sea))}</em>
                </div>
              </div>

              <div className="chart-row">
                <div>
                  <span className="mini-label">Predicted depth · baseline (dashed) vs deployed</span>
                  <Sparkline data={risk.series.map((p) => ({ t: p.t, v: p.depth }))} width={420} height={90} color="#ff8a5c" />
                </div>
                <div>
                  <span className="mini-label">Tide at Tai O · 0–{scenario.durationHours} h</span>
                  <Sparkline data={scenario.series.tide} width={220} height={90} color="#3fd0c9" />
                </div>
              </div>

              <div className="recommend-block">
                <div>
                  <span className="mini-label">Recommended mix</span>
                  <div className="mix-row">
                    {(['M1', 'M2', 'M3'] as const).map((t) => (
                      <span key={t} className={`mix mix--${t}`}>
                        {t} × {risk.recommended[t]}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mini-label">Source inventory</span>
                  <div className="mix-row">
                    {(['M1', 'M2', 'M3'] as const).map((t) => (
                      <span key={t} className="source-pill">
                        {t}: {free(t)} free
                      </span>
                    ))}
                    <span className="source-pill source-pill--warn">M2 supply: {supplyM2}</span>
                  </div>
                </div>
              </div>

              <div className="route-preview">
                <RouteIcon size={14} />
                <span>Land from Yuen Long · {fmtHours(etas.land)}</span>
                <span>Sea from Tuen Mun launch · {fmtHours(etas.sea)}</span>
                <span className="muted">M3 always routed by sea</span>
              </div>

              <div className="action-bar">
                <button className="btn btn--ghost btn--lg" onClick={() => { setDraft(risk.recommended); setModify(true) }}>
                  Modify mix
                </button>
                <button className="btn btn--danger btn--lg" onClick={() => reject(risk.id)}>
                  <XCircle size={16} /> Reject
                </button>
                <button
                  className="btn btn--primary btn--lg"
                  onClick={() => void approve(risk.id)}
                  disabled={routing}
                >
                  <CheckCircle2 size={16} /> {routing ? 'Routing…' : 'Approve & dispatch'}
                </button>
              </div>
            </Panel>

            <div className="approval-side">
              <Panel title="Route preview" sub="Yuen Long base and sea launch">
                <MapView variant="mini" className="mini-map" />
              </Panel>
              <Panel title="AI rationale" sub="Explainable trigger">
                <p className="rationale">{risk.rationale}</p>
                <ul className="why-list">
                  <li>Trigger rule: forecast depth ≥ 0.5 m at the shoreline</li>
                  <li>Data: HKO tide + rainfall nowcast, DSD blackspot geometry</li>
                  <li>Confidence: medium · linear extrapolation, not a hydrodynamic model</li>
                </ul>
                {supplyM2 > 0 && (
                  <div className="warn-note">
                    M2 dual-use: {supplyM2} module(s) are on water-supply tasks. Approving this deployment may trigger a recall prompt.
                  </div>
                )}
              </Panel>
            </div>
          </div>
        ) : (
          <Panel title="No selection">
            <Empty>Select a risk point from the queue</Empty>
          </Panel>
        )}
      </div>

      <Modal
        open={modify}
        onClose={() => setModify(false)}
        title={`Modify mix · ${risk?.name ?? ''}`}
        footer={
          <>
            <button className="btn btn--ghost btn--lg" onClick={() => setModify(false)}>Cancel</button>
            <button
              className="btn btn--primary btn--lg"
              onClick={() => {
                setModify(false)
                if (risk) void approve(risk.id, draft)
              }}
            >
              Approve modified
            </button>
          </>
        }
      >
        <div className="form-grid">
          {(['M1', 'M2', 'M3'] as const).map((t) => (
            <label className="field" key={t}>
              <span>{SPECS[t].name}</span>
              <input
                type="number"
                min={0}
                max={12}
                value={draft[t]}
                onChange={(e) => setDraft({ ...draft, [t]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}
