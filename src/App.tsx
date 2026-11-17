import { useEffect } from 'react'
import {
  Bell,
  Boxes,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  Map as MapIcon,
  Settings as SettingsIcon,
  Truck,
  Warehouse,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useApp } from './store'
import { Clock, M2ConflictModal, ScenarioMenu, SensorDrawer } from './components/controls'
import { Chip } from './components/ui'
import { Overview } from './views/Overview'
import { RiskMap } from './views/RiskMap'
import { ApprovalQueue } from './views/Approval'
import { Dispatch } from './views/Dispatch'
import { SimulationLab } from './views/SimulationLab'
import { Registry } from './views/Registry'
import { BaseOps } from './views/Base'
import { Alerts } from './views/Alerts'
import { SettingsView } from './views/Settings'

const NAV = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'map', label: 'Risk map', icon: MapIcon },
  { key: 'approval', label: 'Approval queue', icon: ClipboardList },
  { key: 'dispatch', label: 'Dispatch & transport', icon: Truck },
  { key: 'lab', label: 'Simulation lab', icon: FlaskConical },
  { key: 'registry', label: 'Asset registry', icon: Boxes },
  { key: 'base', label: 'Yuen Long base', icon: Warehouse },
  { key: 'alerts', label: 'Alerts', icon: Bell },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
] as const

const TITLES: Record<string, string> = {
  overview: 'Operations overview',
  map: 'Risk map · primary work surface',
  approval: 'Approval queue',
  dispatch: 'Dispatch & transport',
  lab: 'Simulation lab',
  registry: 'Asset registry',
  base: 'Yuen Long base operations',
  alerts: 'Alerts & notifications',
  settings: 'Settings & data sources',
}

export default function App() {
  const { view, setView, risks, mode, live, toasts, dropToast, selectModule, selectRisk, playing } = useApp()

  useEffect(() => {
    const id = setInterval(() => useApp.getState().tick(0.5), 500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const v = params.get('view')
    if (v && TITLES[v]) setView(v as any)
    const m = params.get('module')
    if (m) {
      selectModule(m)
      setView('registry')
    }
    const r = params.get('risk')
    if (r) {
      selectRisk(r)
      setView('map')
    }
  }, [setView, selectModule, selectRisk])

  const active = risks.filter((r) => r.status !== 'rejected')
  const worst = active.some((r) => r.level === 'severe')
    ? 'severe'
    : active.some((r) => r.level === 'warning')
      ? 'warning'
      : 'watch'

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="./brand/sponge-shift-group3.png" alt="SPONGE SHIFT GROUP 3" className="brand-logo" />
          <img src="./brand/mark.png" alt="SPONGE SHIFT" className="brand-mark" />
        </div>

        <nav className="nav">
          {NAV.map((n) => {
            const Icon = n.icon
            const isOn = view === n.key
            return (
              <button
                key={n.key}
                className={`nav-item ${isOn ? 'is-on' : ''} ${n.key === 'lab' ? 'nav-item--accent' : ''}`}
                onClick={() => setView(n.key as any)}
              >
                <Icon size={16} />
                <span>{n.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-foot">
          <div className={`source-state ${mode === 'live' ? 'is-live' : ''}`}>
            {mode === 'live' && live.status === 'ok' ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span>
              {mode === 'live'
                ? live.status === 'ok'
                  ? `Live · tide ${live.tide?.toFixed(2) ?? '—'} m`
                  : live.status === 'loading'
                    ? 'Connecting…'
                    : 'Live unreachable'
                : 'Preset data · offline safe'}
            </span>
          </div>
          <div className="attribution">Developed by Juliana Tseng</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h2>{TITLES[view]}</h2>
            <span className={`live-dot ${playing ? 'is-on' : ''}`} />
          </div>
          <div className="topbar-right">
            <Chip tone={worst === 'severe' ? 'bad' : worst === 'warning' ? 'warn' : 'muted'} dot>
              Global risk · {worst}
            </Chip>
            <ScenarioMenu />
            <Clock compact />
          </div>
        </header>

        <main className="content">
          {view === 'overview' && <Overview />}
          {view === 'map' && <RiskMap />}
          {view === 'approval' && <ApprovalQueue />}
          {view === 'dispatch' && <Dispatch />}
          {view === 'lab' && <SimulationLab />}
          {view === 'registry' && <Registry />}
          {view === 'base' && <BaseOps />}
          {view === 'alerts' && <Alerts />}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>

      <SensorDrawer />
      <M2ConflictModal />

      <div className="toasts">
        {toasts.map((t) => (
          <button key={t.id} className={`toast toast--${t.tone}`} onClick={() => dropToast(t.id)}>
            {t.message}
          </button>
        ))}
      </div>
    </div>
  )
}
