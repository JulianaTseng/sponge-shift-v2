import { create } from 'zustand'
import type {
  ApiCheck,
  CustomParams,
  EventItem,
  EventKind,
  LiveData,
  Module,
  ModuleType,
  Order,
  RiskPoint,
  Scenario,
  Settings,
  Toast,
} from './types'
import { BASE, SPECS } from './data/specs'
import { moduleFootprint, nearestRisk, offsetCoord, pointAlong, distanceKm } from './lib/geo'
import { buildRoute, seaRoute } from './lib/routing'
import { buildCustomScenario, hoursToFull, inventory, supplyUsage } from './lib/sim'
import { loadLive, testApi } from './lib/api'
import mangkhut from './data/scenarios/mangkhut.json'
import hato from './data/scenarios/hato.json'
import rainstorm from './data/scenarios/black-rainstorm.json'

export const SEA_LAUNCH: [number, number] = [113.962, 22.388]
export const RATES: Record<string, number> = { M1: 26, M2: 9, M3: 32 }

const RAW: Record<string, Scenario> = {
  mangkhut: mangkhut as unknown as Scenario,
  hato: hato as unknown as Scenario,
  'black-rainstorm': rainstorm as unknown as Scenario,
}

export const ALL_RISKS: RiskPoint[] = (RAW.mangkhut as Scenario).riskPoints

export const SCENARIO_META = [
  { id: 'mangkhut', name: 'Typhoon Mangkhut (2018)', subtitle: 'Signal No. 10 · record surge, 48 h' },
  { id: 'hato', name: 'Typhoon Hato (2017)', subtitle: 'Rapid intensification · 36 h' },
  { id: 'black-rainstorm', name: 'Black Rainstorm', subtitle: 'Pluvial flooding · no surge, 24 h' },
]

export const DEFAULT_SETTINGS: Settings = {
  fleet: { M1: 26, M2: 20, M3: 14 },
  landSpeed: 40,
  seaSpeed: 6,
}

export const DEFAULT_CUSTOM: CustomParams = {
  name: 'Custom scenario',
  durationHours: 36,
  peakRainfall: 110,
  peakTide: 3.2,
  peakHour: 14,
  riskIds: ['tai-o', 'yuen-long-nw', 'tsim-bei-tsui', 'lei-yue-mun', 'heng-fa-chuen', 'south-horizons', 'tko-south', 'kennedy-town'],
}

type View =
  | 'overview'
  | 'map'
  | 'approval'
  | 'dispatch'
  | 'lab'
  | 'registry'
  | 'base'
  | 'alerts'
  | 'settings'

interface M2Conflict {
  riskId: string
  override: { M1: number; M2: number; M3: number }
  need: number
  free: number
  supply: number
}

interface State {
  view: View
  scenario: Scenario
  scenarioId: string
  mode: 'preset' | 'live'
  custom: CustomParams
  settings: Settings
  simH: number
  playing: boolean
  speed: number
  modules: Module[]
  orders: Order[]
  events: EventItem[]
  risks: RiskPoint[]
  selectedRisk: string | null
  selectedModule: string | null
  drawer: 'saturated' | 'damaged' | null
  placing: ModuleType | null
  layers: Record<string, boolean>
  wave: boolean
  compareFull: boolean
  toasts: Toast[]
  m2Conflict: M2Conflict | null
  routing: boolean
  live: LiveData
  apiChecks: Record<string, ApiCheck>
  setView: (v: View) => void
  loadScenario: (id: string) => void
  applyCustom: () => void
  setMode: (m: 'preset' | 'live') => void
  setSimH: (h: number) => void
  togglePlay: () => void
  setSpeed: (s: number) => void
  tick: (dtSec: number) => void
  startPlacing: (t: ModuleType | null) => void
  placeModule: (coord: [number, number], valid: boolean) => void
  selectRisk: (id: string | null) => void
  selectModule: (id: string | null) => void
  openDrawer: (d: 'saturated' | 'damaged' | null) => void
  setLayer: (k: string, v: boolean) => void
  toggleWave: () => void
  setCompareFull: (v: boolean) => void
  pushToast: (message: string, tone?: Toast['tone']) => void
  dropToast: (id: string) => void
  approve: (riskId: string, override?: { M1: number; M2: number; M3: number }) => Promise<void>
  confirmRecall: () => Promise<void>
  cancelConflict: () => void
  reject: (riskId: string) => void
  recover: (ids: string[]) => void
  syncLayout: () => void
  updateSettings: (patch: Partial<Settings>) => void
  setCustom: (patch: Partial<CustomParams>) => void
  refreshLive: () => Promise<void>
  checkApi: (key: string, endpoint: string) => Promise<void>
}

const STORAGE_KEY = 'ssg3.settings.v1'
const CUSTOM_KEY = 'ssg3.custom.v1'

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`

const firedRisk = new Set<string>()
const firedFull = new Set<string>()
const firedArrive = new Set<string>()

function pushEvent(
  list: EventItem[],
  kind: EventKind,
  message: string,
  severity: EventItem['severity'],
  extra: Partial<EventItem> = {},
): EventItem[] {
  const item: EventItem = {
    id: uid('ev'),
    t: Date.now(),
    kind,
    message,
    severity,
    ...extra,
  }
  return [item, ...list].slice(0, 120)
}

function buildModules(sc: Scenario, settings: Settings): Module[] {
  const mods: Module[] = []
  for (const type of ['M1', 'M2', 'M3'] as ModuleType[]) {
    const n = settings.fleet[type]
    for (let i = 1; i <= n; i++) {
      mods.push({
        id: `${type}-${String(i).padStart(2, '0')}`,
        type,
        state: 'standby',
        coord: offsetCoord(BASE, (i % 6) * 14 - 35, Math.floor(i / 6) * 12 - 20),
        region: 'Yuen Long Base',
        absorbed: 0,
        capacity: SPECS[type].capacity,
        sensor: 'HEALTHY',
        usage: 'idle',
        updatedAt: 0,
      })
    }
  }
  for (const d of sc.deployed ?? []) {
    const m = mods.find((x) => x.id === d.id)
    if (!m) continue
    const full = d.absorbed >= m.capacity
    m.state = full ? 'saturated' : 'operating'
    m.coord = d.coord
    m.absorbed = d.absorbed
    m.sensor = full ? 'FULL' : 'HEALTHY'
    m.usage = d.supply ? 'supply' : 'flood'
    m.supplyTask = d.supply ?? undefined
    const nr = nearestRisk(d.coord, sc.riskPoints)
    if (!d.supply && nr.km < 0.9) m.riskId = nr.risk?.id
    m.region = nr.risk?.region ?? 'Yuen Long'
  }
  const victim = mods.find((m) => m.type === 'M2' && m.state === 'standby')
  if (victim) {
    victim.state = 'damaged'
    victim.sensor = 'DAMAGED'
    victim.note = 'Sensor link lost at 03:40'
  }
  const pool = mods.filter((m) => m.type === 'M2' && m.state === 'standby')
  for (const task of sc.supplyTasks ?? []) {
    for (let i = 0; i < task.count; i++) {
      const m = pool.shift()
      if (!m) break
      m.usage = 'supply'
      m.supplyTask = task.region
      m.state = 'operating'
      m.region = task.region
      m.coord = DISTRICT_COORD[task.region] ?? offsetCoord(BASE, 60, -40)
    }
  }
  return mods
}

const DISTRICT_COORD: Record<string, [number, number]> = {
  'Tuen Mun': [113.978, 22.39],
  'Sha Tin': [114.19, 22.38],
  'Kwai Tsing': [114.13, 22.36],
  'Yuen Long': [114.03, 22.44],
}

function initialOrders(sc: Scenario, modules: Module[], settings: Settings): Order[] {
  const risk = sc.riskPoints.find((r) => r.level === 'severe') ?? sc.riskPoints[0]
  const m3 = modules.find((m) => m.type === 'M3' && m.state === 'standby')
  if (!risk || !m3) return []
  const route = seaRoute(SEA_LAUNCH, risk.coord)
  route.durationH = route.distanceKm / (settings.seaSpeed * 1.852)
  const depart = sc.startOffsetHours + 0.4
  m3.state = 'in_transit'
  m3.coord = route.geometry[0]
  m3.usage = 'flood'
  m3.riskId = risk.id
  m3.orderId = 'ORD-1001'
  m3.route = route.geometry
  m3.routeStart = depart
  m3.routeEnd = depart + route.durationH
  return [
    {
      id: 'ORD-1001',
      riskId: risk.id,
      riskName: risk.name,
      moduleIds: [m3.id],
      mode: 'sea',
      route,
      requestedAt: Date.now() - 3600_000,
      departAt: depart,
      etaH: route.durationH,
      floodAt: risk.peakHour,
      status: 'in_transit',
      lateMin: Math.max(0, Math.round((depart + route.durationH - risk.arriveByHours) * 60)),
    },
  ]
}

function boot(id: string, settings: Settings) {
  const sc = RAW[id] ?? RAW.mangkhut
  const modules = buildModules(sc, settings)
  const orders = initialOrders(sc, modules, settings)
  firedRisk.clear()
  firedFull.clear()
  firedArrive.clear()
  // Seed the feed with the run-up to the current simTime so the Alerts view and the
  // overview event strip are populated the moment the prototype opens.
  const top = sc.riskPoints[0]
  const second = sc.riskPoints[1] ?? top
  const third = sc.riskPoints[2] ?? top
  const mins = (n: number) => Date.now() - n * 60_000
  const events: EventItem[] = [
    {
      id: uid('ev'),
      t: mins(0),
      kind: 'system',
      message: `Scenario loaded: ${sc.name} · ${sc.durationHours} h`,
      severity: 'info',
    },
    {
      id: uid('ev'),
      t: mins(4),
      kind: 'risk',
      message: `${top?.name ?? 'Coastal point'} crossed the 1.0 m forecast threshold`,
      severity: 'critical',
      riskId: top?.id,
    },
    {
      id: uid('ev'),
      t: mins(9),
      kind: 'sensor',
      message: 'M2-01 sensor link lost · maintenance flag raised',
      severity: 'warn',
      moduleId: 'M2-01',
    },
    {
      id: uid('ev'),
      t: mins(14),
      kind: 'approval',
      message: `Dispatch requested for ${second?.name ?? 'coastal point'} · awaiting decision`,
      severity: 'warn',
      riskId: second?.id,
    },
    {
      id: uid('ev'),
      t: mins(21),
      kind: 'api',
      message: 'HKO tide feed re-synced · 12 stations reporting',
      severity: 'info',
    },
    {
      id: uid('ev'),
      t: mins(28),
      kind: 'transport',
      message: `${orders[0]?.moduleIds[0] ?? 'M3-01'} departed Yuen Long for ${orders[0]?.riskName ?? 'the coast'}`,
      severity: 'info',
      moduleId: orders[0]?.moduleIds[0],
    },
    {
      id: uid('ev'),
      t: mins(36),
      kind: 'sensor',
      message: 'M1-11 absorption reached 100% · SENSOR_FULL',
      severity: 'warn',
      moduleId: 'M1-11',
    },
    {
      id: uid('ev'),
      t: mins(47),
      kind: 'risk',
      message: `${third?.name ?? 'Coastal point'} forecast revised upward · depth +0.18 m`,
      severity: 'warn',
      riskId: third?.id,
    },
    {
      id: uid('ev'),
      t: mins(58),
      kind: 'api',
      message: 'DATA.GOV.HK blackspot layer refreshed · 26 areas',
      severity: 'info',
    },
    {
      id: uid('ev'),
      t: mins(72),
      kind: 'system',
      message: `Settings saved · land ${settings.landSpeed} km/h · sea ${settings.seaSpeed} kn`,
      severity: 'info',
    },
    {
      id: uid('ev'),
      t: mins(88),
      kind: 'approval',
      message: `${second?.name ?? 'Coastal point'} deployment approved · 6× M1, 4× M2, 4× M3`,
      severity: 'info',
      riskId: second?.id,
    },
    {
      id: uid('ev'),
      t: mins(104),
      kind: 'risk',
      message: 'Storm surge warning issued · Signal No. 8 expected within 12 h',
      severity: 'critical',
      riskId: top?.id,
    },
  ]
  return { scenario: sc, modules, orders, events, risks: sc.riskPoints.map((r) => ({ ...r, status: 'pending' as const })) }
}

export const useApp = create<State>((set, get) => {
  const settings = readStored<Settings>(STORAGE_KEY, DEFAULT_SETTINGS)
  const custom = readStored<CustomParams>(CUSTOM_KEY, DEFAULT_CUSTOM)
  const initial = boot('mangkhut', settings)

  return {
    view: 'overview',
    scenario: initial.scenario,
    scenarioId: 'mangkhut',
    mode: 'preset',
    custom,
    settings,
    simH: initial.scenario.startOffsetHours,
    playing: false,
    speed: 60,
    modules: initial.modules,
    orders: initial.orders,
    events: initial.events,
    risks: initial.risks,
    selectedRisk: null,
    selectedModule: null,
    drawer: null,
    placing: null,
    layers: {
      flood: true,
      risks: true,
      modules: true,
      routes: true,
      blackspots: false,
      stations: false,
      base: true,
    },
    wave: false,
    compareFull: false,
    toasts: [],
    m2Conflict: null,
    routing: false,
    live: { status: 'idle', tide: null, tideStation: 'Tai O', rainfall: null, warnings: [], updatedAt: null },
    apiChecks: {},

    setView: (view) => set({ view }),

    loadScenario: (id) => {
      const s = get()
      const sc = RAW[id] ?? RAW.mangkhut
      const modules = buildModules(sc, s.settings)
      const orders = initialOrders(sc, modules, s.settings)
      firedRisk.clear()
      firedFull.clear()
      firedArrive.clear()
      set({
        scenario: sc,
        scenarioId: id,
        modules,
        orders,
        risks: sc.riskPoints.map((r) => ({ ...r, status: 'pending' })),
        simH: sc.startOffsetHours,
        playing: false,
        selectedRisk: null,
        m2Conflict: null,
        events: pushEvent(s.events, 'system', `Scenario loaded: ${sc.name}`, 'info'),
      })
    },

    applyCustom: () => {
      const s = get()
      const sc = buildCustomScenario(RAW.mangkhut, s.custom)
      const modules = buildModules(sc, s.settings)
      try {
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(s.custom))
      } catch {
        /* ignore */
      }
      firedRisk.clear()
      firedFull.clear()
      set({
        scenario: sc,
        scenarioId: 'custom',
        modules,
        orders: [],
        risks: sc.riskPoints.map((r) => ({ ...r, status: 'pending' })),
        simH: 0,
        playing: false,
        events: pushEvent(s.events, 'system', `Custom scenario generated · ${sc.riskPoints.length} warning points`, 'success'),
      })
    },

    setMode: (mode) => {
      set({ mode })
      if (mode === 'live') void get().refreshLive()
    },

    setSimH: (h) => set({ simH: Math.max(0, Math.min(get().scenario.durationHours, h)) }),
    togglePlay: () => set({ playing: !get().playing }),
    setSpeed: (speed) => set({ speed }),

    tick: (dtSec) => {
      const s = get()
      if (!s.playing) return
      let next = s.simH + (dtSec * s.speed) / 60
      let playing: boolean = s.playing
      if (next >= s.scenario.durationHours) {
        next = s.scenario.durationHours
        playing = false
      }
      const dh = next - s.simH
      let events = s.events
      const modules = s.modules.map((m) => {
        if (m.state === 'operating' && m.usage !== 'supply') {
          const absorbed = Math.min(m.capacity, m.absorbed + (RATES[m.type] ?? 20) * dh)
          const full = absorbed >= m.capacity - 0.01
          if (full && !firedFull.has(m.id)) {
            firedFull.add(m.id)
            events = pushEvent(events, 'sensor', `${m.id} saturated (${m.capacity} m³) · sensor FULL`, 'warn', { moduleId: m.id })
          }
          return {
            ...m,
            absorbed,
            state: full ? ('saturated' as const) : m.state,
            sensor: full ? ('FULL' as const) : m.sensor,
          }
        }
        if (m.state === 'in_transit' && m.route && m.routeStart != null && m.routeEnd != null) {
          const f = (next - m.routeStart) / Math.max(0.01, m.routeEnd - m.routeStart)
          if (f >= 1 && !firedArrive.has(m.id)) {
            firedArrive.add(m.id)
            events = pushEvent(events, 'transport', `${m.id} arrived and deployed at target`, 'success', { moduleId: m.id })
            return { ...m, state: 'operating' as const, coord: m.route[m.route.length - 1], absorbed: 0 }
          }
          return { ...m, coord: pointAlong(m.route, Math.min(1, Math.max(0, f))) }
        }
        return m
      })

      for (const r of s.risks) {
        const d = r.series.find((p) => p.t >= Math.floor(next))?.depth ?? 0
        if (d >= 0.5 && !firedRisk.has(r.id)) {
          firedRisk.add(r.id)
          events = pushEvent(events, 'risk', `${r.name} forecast depth ${d.toFixed(2)} m · deadline T+${r.arriveByHours} h`, 'critical', { riskId: r.id })
        }
      }

      set({ simH: next, playing, modules, events })

      const land = s.orders.filter((o) => o.status === 'in_transit' && o.mode === 'land').length
      const sea = s.orders.filter((o) => o.status === 'in_transit' && o.mode === 'sea').length
      const trucks = Math.max(4, Math.ceil(s.settings.fleet.M1 / 4 + s.settings.fleet.M2 / 4))
      const tugs = Math.max(2, Math.ceil(s.settings.fleet.M3 / 3))
      if ((land > trucks || sea > tugs) && !s.toasts.some((t) => t.message.includes('capacity'))) {
        get().pushToast('Fleet capacity exceeded · expect transport delays', 'warn')
      }
    },

    startPlacing: (placing) => set({ placing }),

    placeModule: (coord, valid) => {
      const s = get()
      if (!s.placing) return
      if (!valid) {
        get().pushToast(
          s.placing === 'M3' ? 'M3 Restricted to Sea — deploy on water only' : 'Invalid placement — outside the allowed environment',
          'error',
        )
        return
      }
      const type = s.placing
      // Connection rule: M1 and M3 must form a chain through a nearby M2 (≈25 m).
      // M2 can always be placed. Isolated M1/M3 without an M2 within range are blocked.
      const LINK_KM = 0.025
      const near = (wanted: ModuleType) =>
        s.modules.some(
          (m) =>
            m.type === wanted &&
            (m.state === 'operating' || m.state === 'saturated' || m.state === 'deploying') &&
            distanceKm(m.coord, coord) <= LINK_KM,
        )

      if (type === 'M1') {
        const hasM2 = near('M2')
        if (!hasM2) {
          get().pushToast('Rule: M1 must connect to M3 via M2 — place an M2 within ~25 m first (or next to this spot).', 'error')
          return
        }
      }
      if (type === 'M3') {
        const hasM2 = near('M2')
        if (!hasM2) {
          get().pushToast('Rule: M3 must connect to M1 via M2 — place an M2 within ~25 m first (or next to this spot).', 'error')
          return
        }
      }

      const n = s.modules.filter((m) => m.type === type).length + 1
      const id = `${type}-${String(n).padStart(2, '0')}`
      const nr = nearestRisk(coord, s.risks)
      const mod: Module = {
        id,
        type,
        state: 'operating',
        coord,
        region: nr.risk?.region ?? 'Manual placement',
        absorbed: 0,
        capacity: SPECS[type].capacity,
        sensor: 'HEALTHY',
        usage: 'flood',
        riskId: nr.km < 0.9 ? nr.risk?.id : undefined,
        manual: true,
        updatedAt: Date.now(),
      }
      set({
        modules: [...s.modules, mod],
        placing: null,
        events: pushEvent(s.events, 'system', `${type} ${id} manually deployed at ${nr.risk?.name ?? 'custom point'}`, 'success'),
      })
      get().pushToast(`${id} deployed · ${nr.risk?.name ?? 'custom point'}`, 'success')
    },

    selectRisk: (selectedRisk) => set({ selectedRisk }),
    selectModule: (selectedModule) => set({ selectedModule }),
    openDrawer: (drawer) => set({ drawer }),
    setLayer: (k, v) => set({ layers: { ...get().layers, [k]: v } }),
    toggleWave: () => set({ wave: !get().wave }),
    setCompareFull: (compareFull) => set({ compareFull }),

    pushToast: (message, tone = 'info') => {
      const id = uid('toast')
      set({ toasts: [...get().toasts, { id, message, tone }] })
      setTimeout(() => {
        set({ toasts: get().toasts.filter((t) => t.id !== id) })
      }, 5000)
    },
    dropToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    approve: async (riskId, override) => {
      const s = get()
      const risk = s.risks.find((r) => r.id === riskId)
      if (!risk) return
      const rec = override ?? risk.recommended
      const freeOf = (type: ModuleType) =>
        s.modules.filter((m) => m.type === type && m.state === 'standby' && m.usage !== 'supply')
      const supplyM2 = s.modules.filter((m) => m.type === 'M2' && m.usage === 'supply')
      const shortage = Math.max(0, rec.M2 - freeOf('M2').length)
      if (shortage > 0 && supplyM2.length >= shortage) {
        set({ m2Conflict: { riskId, override: rec, need: rec.M2, free: freeOf('M2').length, supply: supplyM2.length } })
        return
      }
      await dispatch(set, get, risk, rec, false)
    },

    confirmRecall: async () => {
      const s = get()
      const c = s.m2Conflict
      if (!c) return
      const risk = s.risks.find((r) => r.id === c.riskId)
      set({ m2Conflict: null })
      if (risk) await dispatch(set, get, risk, c.override, true)
    },

    cancelConflict: () => set({ m2Conflict: null }),

    reject: (riskId) => {
      const s = get()
      const risk = s.risks.find((r) => r.id === riskId)
      set({
        risks: s.risks.map((r) => (r.id === riskId ? { ...r, status: 'rejected' } : r)),
        selectedRisk: null,
        events: pushEvent(s.events, 'approval', `Recommendation rejected for ${risk?.name ?? riskId}`, 'warn', { riskId }),
      })
    },

    recover: (ids) => {
      const s = get()
      if (!ids.length) return
      const setIds = new Set(ids)
      set({
        modules: s.modules.map((m) =>
          setIds.has(m.id)
            ? {
                ...m,
                state: 'standby',
                coord: offsetCoord(BASE, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30),
                absorbed: 0,
                sensor: 'HEALTHY',
                usage: 'idle',
                riskId: undefined,
                route: undefined,
                manual: false,
                region: 'Yuen Long Base',
                updatedAt: Date.now(),
              }
            : m,
        ),
        drawer: null,
        selectedModule: null,
        events: pushEvent(s.events, 'system', `${ids.length} module(s) recovered to Yuen Long base`, 'success'),
      })
      get().pushToast(`${ids.length} module(s) recovered to base`, 'success')
    },

    syncLayout: () => {
      const s = get()
      const manual = s.modules.filter((m) => m.manual && m.state === 'operating')
      if (!manual.length) {
        get().pushToast('No manual placements in the simulation to sync', 'warn')
        return
      }
      const byRisk = new Map<string, Module[]>()
      for (const m of manual) {
        const riskId = m.riskId ?? nearestRisk(m.coord, s.risks).risk?.id ?? s.risks[0]?.id
        if (!riskId) continue
        byRisk.set(riskId, [...(byRisk.get(riskId) ?? []), m])
      }
      const orders: Order[] = []
      for (const [riskId, mods] of byRisk) {
        const risk = s.risks.find((r) => r.id === riskId)
        if (!risk) continue
        orders.push({
          id: `ORD-${2000 + orders.length + 1}`,
          riskId,
          riskName: risk.name,
          moduleIds: mods.map((m) => m.id),
          mode: mods.some((m) => m.type === 'M3') ? 'sea' : 'land',
          route: null,
          requestedAt: Date.now(),
          departAt: s.simH,
          etaH: 0,
          floodAt: risk.peakHour,
          status: 'pending',
          lateMin: 0,
        })
      }
      const ids = new Set(manual.map((m) => m.id))
      set({
        orders: [...s.orders, ...orders],
        modules: s.modules.map((m) => (ids.has(m.id) ? { ...m, state: 'assigned', manual: false } : m)),
        events: pushEvent(s.events, 'approval', `${manual.length} simulated placements synced to dispatch as pending orders`, 'success'),
      })
      get().pushToast(`${manual.length} placement(s) converted to ${orders.length} pending order(s)`, 'success')
    },

    updateSettings: (patch) => {
      const next = { ...get().settings, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      set({ settings: next })
    },

    setCustom: (patch) => {
      const custom = { ...get().custom, ...patch }
      try {
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom))
      } catch {
        /* ignore */
      }
      set({ custom })
    },

    refreshLive: async () => {
      set({ live: { ...get().live, status: 'loading' } })
      const live = await loadLive()
      set({ live })
      set({ events: pushEvent(get().events, 'api', live.status === 'ok' ? `Live feeds refreshed · tide ${live.tide ?? '—'} m at ${live.tideStation}` : 'Live feeds unreachable · preset mode unaffected', live.status === 'ok' ? 'success' : 'warn') })
    },

    checkApi: async (key, endpoint) => {
      set({ apiChecks: { ...get().apiChecks, [key]: { status: 'testing' } } })
      const res = await testApi(endpoint)
      set({
        apiChecks: {
          ...get().apiChecks,
          [key]: { ...res, checkedAt: Date.now() },
        },
      })
    },
  }
})

async function dispatch(
  set: (partial: Partial<State>) => void,
  get: () => State,
  risk: RiskPoint,
  rec: { M1: number; M2: number; M3: number },
  allowRecall: boolean,
) {
  const s = get()
  const freeOf = (type: ModuleType) =>
    s.modules.filter((m) => m.type === type && m.state === 'standby' && m.usage !== 'supply')
  const supplyM2 = s.modules.filter((m) => m.type === 'M2' && m.usage === 'supply')

  const picks: Module[] = []
  picks.push(...freeOf('M1').slice(0, rec.M1))
  const freeM2 = freeOf('M2')
  picks.push(...freeM2.slice(0, rec.M2))
  if (allowRecall) {
    picks.push(...supplyM2.slice(0, Math.max(0, rec.M2 - freeM2.length)))
  }
  picks.push(...freeOf('M3').slice(0, rec.M3))

  if (!picks.length) {
    get().pushToast('No standby modules available for this deployment', 'error')
    return
  }

  set({ routing: true })
  const recalled = picks.filter((m) => m.usage === 'supply').length
  const prep = recalled > 0 ? 1.5 : 0.2
  const land = picks.filter((m) => m.type !== 'M3')
  const sea = picks.filter((m) => m.type === 'M3')

  const groups: { mode: 'land' | 'sea'; mods: Module[]; from: [number, number] }[] = []
  if (land.length) groups.push({ mode: 'land', mods: land, from: BASE })
  if (sea.length) groups.push({ mode: 'sea', mods: sea, from: SEA_LAUNCH })

  const results = await Promise.all(
    groups.map(async (g) => ({
      ...g,
      route: await buildRoute(g.mode, g.from, risk.coord, s.settings.landSpeed, s.settings.seaSpeed),
    })),
  )

  const orders: Order[] = []
  const picksById = new Map<string, { start: number; end: number; route: [number, number][] }>()
  results.forEach((g, i) => {
    const depart = s.simH + prep
    const eta = g.route.durationH
    orders.push({
      id: `ORD-${1100 + s.orders.length + i + 1}`,
      riskId: risk.id,
      riskName: risk.name,
      moduleIds: g.mods.map((m) => m.id),
      mode: g.mode,
      route: g.route,
      requestedAt: Date.now(),
      departAt: depart,
      etaH: eta,
      floodAt: risk.peakHour,
      status: 'in_transit',
      lateMin: Math.max(0, Math.round((depart + eta - risk.arriveByHours) * 60)),
    })
    g.mods.forEach((m) => picksById.set(m.id, { start: depart, end: depart + eta, route: g.route.geometry }))
  })

  const picksSet = new Map(picks.map((m) => [m.id, m]))
  const modules = s.modules.map((m) => {
    const p = picksById.get(m.id)
    if (!p) return m
    return {
      ...m,
      state: 'in_transit' as const,
      usage: 'flood' as const,
      riskId: risk.id,
      supplyTask: undefined,
      absorbed: 0,
      sensor: 'HEALTHY' as const,
      coord: p.route[0],
      route: p.route,
      routeStart: p.start,
      routeEnd: p.end,
      orderId: orders.find((o) => o.moduleIds.includes(m.id))?.id,
      updatedAt: Date.now(),
    }
  })
  void picksSet

  const total = orders.reduce((n, o) => n + o.moduleIds.length, 0)
  const late = orders.some((o) => o.lateMin > 0)
  set({
    modules,
    orders: [...s.orders, ...orders],
    routing: false,
    selectedRisk: null,
    risks: s.risks.map((r) => (r.id === risk.id ? { ...r, status: 'approved' } : r)),
    events: pushEvent(
      s.events,
      'approval',
      `Approved ${risk.name}: ${total} module(s) dispatched${recalled ? ` · ${recalled} M2 recalled from supply (+1.5 h)` : ''}`,
      late ? 'warn' : 'success',
      { riskId: risk.id },
    ),
  })
  get().pushToast(
    `${total} module(s) dispatched to ${risk.name}${late ? ' · arrival after deadline' : ''}`,
    late ? 'warn' : 'success',
  )

  const landCount = orders.filter((o) => o.mode === 'land').reduce((n, o) => n + o.moduleIds.length, 0)
  const seaCount = orders.filter((o) => o.mode === 'sea').reduce((n, o) => n + o.moduleIds.length, 0)
  const trucks = Math.max(4, Math.ceil(s.settings.fleet.M1 / 4 + s.settings.fleet.M2 / 4))
  const tugs = Math.max(2, Math.ceil(s.settings.fleet.M3 / 3))
  if (landCount / 2 > trucks || seaCount / 2 > tugs) {
    get().pushToast('Approvals exceed fleet capacity · transport delays expected', 'warn')
  }
}

export const selectors = {
  inventory,
  supplyUsage,
  hoursToFull,
  moduleFootprint,
  distanceKm,
  uid,
}
