export type View =
  | 'overview'
  | 'map'
  | 'approval'
  | 'dispatch'
  | 'lab'
  | 'registry'
  | 'base'
  | 'alerts'
  | 'settings'

export type ModuleType = 'M1' | 'M2' | 'M3'
export type Sensor = 'HEALTHY' | 'FULL' | 'DAMAGED' | 'UNREACHABLE'
export type ModuleState =
  | 'standby'
  | 'assigned'
  | 'in_transit'
  | 'deploying'
  | 'operating'
  | 'saturated'
  | 'damaged'
  | 'maintenance'
export type Usage = 'flood' | 'supply' | 'idle'
export type RiskLevel = 'severe' | 'warning' | 'watch'
export type RiskType = 'surge' | 'overtopping' | 'pluvial'

export interface SeriesPoint {
  t: number
  v: number
}

export interface DepthPoint {
  t: number
  depth: number
}

export interface RiskPoint {
  id: string
  name: string
  region: string
  type: RiskType
  coord: [number, number]
  level: RiskLevel
  peakDepth: number
  peakHour: number
  arriveByHours: number
  series: DepthPoint[]
  recommended: { M1: number; M2: number; M3: number }
  rationale: string
  status?: 'pending' | 'approved' | 'rejected'
}

export interface Scenario {
  id: string
  name: string
  subtitle: string
  durationHours: number
  startOffsetHours: number
  t0: string
  series: {
    rainfall: SeriesPoint[]
    tide: SeriesPoint[]
    windSpeed: SeriesPoint[]
    windDir: SeriesPoint[]
  }
  riskPoints: RiskPoint[]
  inventory: { M1: number; M2: number; M3: number }
  supplyTasks: { region: string; count: number; volume: number }[]
  deployed?: { id: string; type: ModuleType; coord: [number, number]; absorbed: number; supply: string | null }[]
}

export interface ModuleSpec {
  type: ModuleType
  name: string
  shape: 'hexagon' | 'rectangle'
  sizeLabel: string
  diameter?: number
  length?: number
  width?: number
  height: number
  area: number
  environment: string
  capacity: number
  absorbRate: number
  colour: string
}

export interface Module {
  id: string
  type: ModuleType
  state: ModuleState
  coord: [number, number]
  region: string
  absorbed: number
  capacity: number
  sensor: Sensor
  usage: Usage
  supplyTask?: string
  riskId?: string
  orderId?: string
  manual?: boolean
  route?: [number, number][]
  routeStart?: number
  routeEnd?: number
  updatedAt: number
  note?: string
}

export interface Route {
  geometry: [number, number][]
  distanceKm: number
  durationH: number
  mode: 'land' | 'sea' | 'indicative'
  label: string
}

export interface Order {
  id: string
  riskId: string
  riskName: string
  moduleIds: string[]
  mode: 'land' | 'sea'
  route: Route | null
  requestedAt: number
  departAt: number
  etaH: number
  floodAt: number
  status: 'pending' | 'approved' | 'in_transit' | 'delivered' | 'recalled'
  lateMin: number
  recalledM2?: number
}

export type EventKind =
  | 'risk'
  | 'approval'
  | 'transport'
  | 'sensor'
  | 'api'
  | 'system'

export interface EventItem {
  id: string
  t: number
  kind: EventKind
  message: string
  severity: 'info' | 'warn' | 'critical' | 'success'
  moduleId?: string
  riskId?: string
}

export interface Settings {
  fleet: { M1: number; M2: number; M3: number }
  landSpeed: number
  seaSpeed: number
}

export interface CustomParams {
  name: string
  durationHours: number
  peakRainfall: number
  peakTide: number
  peakHour: number
  riskIds: string[]
}

export interface LiveData {
  status: 'idle' | 'loading' | 'ok' | 'error'
  tide: number | null
  tideStation: string
  rainfall: number | null
  warnings: string[]
  updatedAt: number | null
  error?: string
}

export interface Toast {
  id: string
  message: string
  tone: 'info' | 'warn' | 'error' | 'success'
}

export interface ApiCheck {
  status: 'idle' | 'testing' | 'ok' | 'restricted' | 'fail'
  latency?: number
  message?: string
  checkedAt?: number
}
