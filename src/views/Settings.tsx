import { useState } from 'react'
import { Check, ExternalLink, Loader2, Play, Sliders } from 'lucide-react'
import { useApp, ALL_RISKS } from '../store'
import { Chip, Panel } from '../components/ui'
import { apiRows } from '../lib/api'
import { SPECS } from '../data/specs'

export function SettingsView() {
  const { settings, updateSettings, apiChecks, checkApi, custom, setCustom, applyCustom, setView, scenarioId } = useApp()
  const rows = apiRows()
  const [saved, setSaved] = useState(false)

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1>Settings &amp; data sources</h1>
          <p>Fleet assumptions, live API endpoints and the custom scenario builder.</p>
        </div>
        <Chip tone="muted">{scenarioId === 'custom' ? 'Custom profile active' : 'Preset profile active'}</Chip>
      </div>

      <div className="settings-grid">
        <Panel title="Fleet & logistics" sub="Values propagate to ETAs, KPIs and the capacity widget">
          <div className="form-grid form-grid--three">
            {(['M1', 'M2', 'M3'] as const).map((t) => (
              <label className="field" key={t}>
                <span>{SPECS[t].name} inventory</span>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={settings.fleet[t]}
                  onChange={(e) => updateSettings({ fleet: { ...settings.fleet, [t]: Number(e.target.value) } })}
                />
              </label>
            ))}
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Land transport speed (km/h)</span>
              <input
                type="number"
                min={5}
                max={100}
                value={settings.landSpeed}
                onChange={(e) => updateSettings({ landSpeed: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Sea tow speed (knots)</span>
              <input
                type="number"
                min={1}
                max={20}
                value={settings.seaSpeed}
                onChange={(e) => updateSettings({ seaSpeed: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="settings-foot">
            <span className="muted">Stored locally in this browser · settings persist between sessions.</span>
            <button
              className="btn btn--tiny btn--ghost"
              onClick={() => {
                setSaved(true)
                setTimeout(() => setSaved(false), 1600)
              }}
            >
              {saved ? <><Check size={12} /> Saved</> : 'Save'}
            </button>
          </div>
        </Panel>

        <Panel title="API connections" sub="All endpoints are public and key-free; test from this browser">
          <table className="table api-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Endpoint</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const check = apiChecks[r.key]
                const status = check?.status ?? 'idle'
                return (
                  <tr key={r.key}>
                    <td>
                      <strong>{r.name}</strong>
                      <em className="table-sub">{r.detail}</em>
                    </td>
                    <td>
                      <code className="endpoint">{r.endpoint}</code>
                    </td>
                    <td>
                      {status === 'testing' && <Chip tone="muted"><Loader2 size={11} className="spin" /> Testing</Chip>}
                      {status === 'ok' && <Chip tone="ok">Connected · {check?.latency} ms</Chip>}
                      {status === 'restricted' && <Chip tone="warn">CORS restricted</Chip>}
                      {status === 'fail' && <Chip tone="bad">Failed</Chip>}
                      {status === 'idle' && <Chip tone="muted">Not tested</Chip>}
                      {check?.message && <em className="table-sub">{check.message}</em>}
                    </td>
                    <td className="table-actions">
                      <button className="btn btn--tiny btn--ghost" onClick={() => void checkApi(r.key, r.endpoint)}>
                        <Play size={11} /> Test
                      </button>
                      <a className="icon-link" href={r.endpoint} target="_blank" rel="noreferrer" title="Open endpoint">
                        <ExternalLink size={13} />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="settings-note">
            HKO endpoints send <code>Access-Control-Allow-Origin: *</code>, so they can be tested directly. DATA.GOV.HK is
            public but does not expose CORS headers to browsers — use the open link to inspect the dataset.
          </p>
        </Panel>

        <Panel
          title="Custom scenario builder"
          sub="Pick warning points and intensity; the baseline is regenerated from preset curves"
          action={<Sliders size={15} />}
        >
          <div className="form-grid">
            <label className="field">
              <span>Scenario name</span>
              <input value={custom.name} onChange={(e) => setCustom({ name: e.target.value })} />
            </label>
            <label className="field">
              <span>Duration (hours)</span>
              <input
                type="number"
                min={12}
                max={72}
                value={custom.durationHours}
                onChange={(e) => setCustom({ durationHours: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="form-grid form-grid--three">
            <label className="field">
              <span>Peak rainfall (mm/h)</span>
              <input
                type="range"
                min={20}
                max={180}
                step={5}
                value={custom.peakRainfall}
                onChange={(e) => setCustom({ peakRainfall: Number(e.target.value) })}
              />
              <em className="field-value">{custom.peakRainfall} mm/h</em>
            </label>
            <label className="field">
              <span>Peak tide (m)</span>
              <input
                type="range"
                min={1}
                max={4.5}
                step={0.1}
                value={custom.peakTide}
                onChange={(e) => setCustom({ peakTide: Number(e.target.value) })}
              />
              <em className="field-value">{custom.peakTide.toFixed(1)} m</em>
            </label>
            <label className="field">
              <span>Peak timing (h)</span>
              <input
                type="range"
                min={4}
                max={36}
                step={1}
                value={custom.peakHour}
                onChange={(e) => setCustom({ peakHour: Number(e.target.value) })}
              />
              <em className="field-value">T+{custom.peakHour} h</em>
            </label>
          </div>
          <div className="risk-picker">
            <span className="mini-label">Warning points ({custom.riskIds.length} selected)</span>
            <div className="risk-tags">
              {ALL_RISKS.map((r) => (
                <button
                  key={r.id}
                  className={`risk-tag ${custom.riskIds.includes(r.id) ? 'is-on' : ''}`}
                  onClick={() =>
                    setCustom({
                      riskIds: custom.riskIds.includes(r.id)
                        ? custom.riskIds.filter((x) => x !== r.id)
                        : [...custom.riskIds, r.id],
                    })
                  }
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn btn--primary"
            onClick={() => {
              applyCustom()
              setView('lab')
            }}
          >
            Generate and open in Simulation Lab
          </button>
        </Panel>

        <Panel title="About this prototype" sub="Studio 6 · Smart and Sustainable Urban Development">
          <div className="about-block">
            <img src="./brand/sponge-shift-group3.png" alt="SPONGE SHIFT GROUP 3" className="about-logo" />
            <p>
              A decision-support prototype for deploying modular sponge, connection and breakwater units ahead of storm
              surge and pluvial flooding in Hong Kong. Preset scenarios run fully offline; live mode reads public HKO
              feeds without an API key.
            </p>
            <div className="about-meta">
              <span>Version 1.0 · static build</span>
              <span>MapLibre GL + CARTO dark basemap</span>
              <span>Routing: OSRM demo server + digitised sea lanes</span>
            </div>
          </div>
        </Panel>
      </div>

      <footer className="settings-footer">Developed by Juliana Tseng</footer>
    </div>
  )
}
