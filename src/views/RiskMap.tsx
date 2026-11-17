import { useState } from 'react'
import { Crosshair, Layers, ShieldAlert, Timer, Waves } from 'lucide-react'
import { useApp, SEA_LAUNCH } from '../store'
import { MapView } from '../components/MapView'
import { Timeline } from '../components/controls'
import { Chip, Modal, Sparkline, Toggle } from '../components/ui'
import { LAYERS, SPECS } from '../data/specs'
import { depthWith, depthWithout, fmtHours } from '../lib/sim'
import { distanceKm } from '../lib/geo'
import { seaRoute } from '../lib/routing'

export function RiskMap() {
  const {
    risks,
    modules,
    simH,
    selectedRisk,
    selectRisk,
    placing,
    startPlacing,
    approve,
    reject,
    layers,
    setLayer,
    wave,
    toggleWave,
    settings,
    routing,
  } = useApp()
  const risk = risks.find((r) => r.id === selectedRisk) ?? null
  const [modify, setModify] = useState(false)
  const [draft, setDraft] = useState({ M1: 0, M2: 0, M3: 0 })

  const depth = risk ? depthWith(risk, simH, modules) : 0
  const baseline = risk ? depthWithout(risk, simH) : 0
  const remaining = risk ? risk.arriveByHours - simH : 0
  const seaEta = risk ? seaRoute(SEA_LAUNCH, risk.coord).distanceKm / (settings.seaSpeed * 1.852) : 0
  const landEta = risk ? distanceKm([114.0325, 22.4445], risk.coord) / settings.landSpeed : 0
  const feasible = Math.min(landEta, seaEta) + 0.4 <= remaining

  return (
    <div className="view view--map">
      <div className="map-layout">
        <div className="map-main">
          <MapView
            allowPlacement
            onRiskClick={(id) => selectRisk(id)}
            className="map-main-canvas"
          />

          <div className="map-toolbar">
            <div className="toolbar-group">
              <span className="toolbar-label">Deploy</span>
              {(['M1', 'M2', 'M3'] as const).map((t) => (
                <button
                  key={t}
                  className={`palette-btn palette-btn--${t} ${placing === t ? 'is-on' : ''}`}
                  onClick={() => startPlacing(placing === t ? null : t)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/module', t)
                    startPlacing(t)
                  }}
                  title={`${SPECS[t].name} · ${SPECS[t].sizeLabel} · ${SPECS[t].environment}`}
                >
                  <span className={`shape shape--${SPECS[t].shape}`} />
                  <span className="palette-text">
                    <strong>{t}</strong>
                    <em>{SPECS[t].sizeLabel.split(' · ')[0]}</em>
                  </span>
                </button>
              ))}
            </div>
            <div className="toolbar-group toolbar-group--right">
              <button className={`tool-btn ${wave ? 'is-on' : ''}`} onClick={toggleWave} title="Realistic water and wave layer">
                <Waves size={14} /> Water &amp; wave
              </button>
            </div>
          </div>

          {placing && (
            <div className="placing-hint">
              <Crosshair size={14} />
              <span>
                Drag or click on the map to place <strong>{placing}</strong>.{' '}
                {placing === 'M3' ? 'Sea surface only.' : 'Green outline = valid position.'} Snaps to the 15 m grid.
              </span>
              <button className="btn btn--tiny btn--ghost" onClick={() => startPlacing(null)}>
                Cancel
              </button>
            </div>
          )}

          {risk && (
            <div className="approval-card">
              <header>
                <div>
                  <span className={`risk-dot risk-dot--${risk.level}`} />
                  <strong>{risk.name}</strong>
                  <Chip tone={risk.level === 'severe' ? 'bad' : risk.level === 'warning' ? 'warn' : 'muted'}>
                    {risk.level}
                  </Chip>
                </div>
                <button className="icon-btn" onClick={() => selectRisk(null)} aria-label="Close">
                  ×
                </button>
              </header>
              <div className="approval-body">
                <div className="approval-metrics">
                  <div>
                    <span>Predicted depth</span>
                    <strong>{depth.toFixed(2)} m</strong>
                    <em>baseline {baseline.toFixed(2)} m</em>
                  </div>
                  <div>
                    <span>Peak at</span>
                    <strong>T+{risk.peakHour.toFixed(0)} h</strong>
                    <em>arrival deadline T+{risk.arriveByHours.toFixed(1)} h</em>
                  </div>
                  <div>
                    <span>Time left</span>
                    <strong className={remaining < 2 ? 'text-bad' : ''}>{fmtHours(remaining)}</strong>
                    <em>{feasible ? 'window feasible' : 'window tight'}</em>
                  </div>
                </div>
                <Sparkline
                  data={[
                    ...risk.series.map((p) => ({ t: p.t, v: p.depth })),
                  ]}
                  width={300}
                  height={52}
                  color="#ff8a5c"
                  baseline={0.5}
                />
                <div className="recommend">
                  <span className="mini-label">Recommended mix</span>
                  {(['M1', 'M2', 'M3'] as const).map((t) => (
                    <span key={t} className={`mix mix--${t}`}>
                      {t} × {risk.recommended[t]}
                    </span>
                  ))}
                </div>
                <p className="rationale">{risk.rationale}</p>
              </div>
              <footer>
                <button className="btn btn--ghost" onClick={() => { setDraft(risk.recommended); setModify(true) }}>
                  Modify
                </button>
                <button className="btn btn--ghost" onClick={() => reject(risk.id)}>
                  Reject
                </button>
                <button
                  className="btn btn--primary"
                  onClick={() => void approve(risk.id)}
                  disabled={routing}
                  data-testid="quick-approve"
                >
                  {routing ? 'Routing…' : 'Quick approve'}
                </button>
              </footer>
            </div>
          )}

          <Timeline />
        </div>

        <aside className="map-side">
          <div className="side-block">
            <div className="side-title">
              <Layers size={14} /> Layers
            </div>
            {LAYERS.map((l) => (
              <label key={l.key} className="check-row">
                <input
                  type="checkbox"
                  checked={!!layers[l.key]}
                  onChange={(e) => setLayer(l.key, e.target.checked)}
                />
                <span>{l.label}</span>
              </label>
            ))}
            <div className="side-divider" />
            <Toggle on={wave} onChange={toggleWave} label="Realistic water" hint="Shader-free animated surface · visual only" />
          </div>

          <div className="side-block">
            <div className="side-title">
              <ShieldAlert size={14} /> Fleet at a glance
            </div>
            {(['M1', 'M2', 'M3'] as const).map((t) => {
              const n = modules.filter((m) => m.type === t)
              const deployed = n.filter((m) => m.state === 'operating' || m.state === 'saturated').length
              return (
                <div key={t} className="fleet-row">
                  <span className={`type-tag type-tag--${t}`}>{t}</span>
                  <span className="fleet-bar">
                    <i style={{ width: `${(deployed / Math.max(1, n.length)) * 100}%` }} />
                  </span>
                  <span className="fleet-count">{deployed}/{n.length}</span>
                </div>
              )
            })}
            <p className="side-note">
              <Timer size={12} /> Land {settings.landSpeed} km/h · sea {settings.seaSpeed} kn
            </p>
          </div>

          <div className="side-block side-block--hint">
            <div className="side-title">How to deploy</div>
            <ol>
              <li>Pick a module from the palette.</li>
              <li>Move over the map — the dashed grid previews the snapped cell.</li>
              <li>Green outline confirms a valid environment; red is rejected.</li>
              <li>M3 is sea-only; M1 and M2 accept coastal land or water.</li>
            </ol>
          </div>
        </aside>
      </div>

      <Modal
        open={modify}
        onClose={() => setModify(false)}
        title={`Modify deployment · ${risk?.name ?? ''}`}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setModify(false)}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
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
        <p className="modal-lead">Adjust the module mix. ETA is recalculated from fleet capacity and the selected transport mode.</p>
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
        <div className="modal-note">
          M3 will be towed from the Tuen Mun sea launch; M1/M2 depart by road from Yuen Long. M2 supply conflicts trigger a recall prompt.
        </div>
      </Modal>
    </div>
  )
}
