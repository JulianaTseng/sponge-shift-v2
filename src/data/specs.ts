import type { ModuleSpec, ModuleType } from '../types'

export const BASE: [number, number] = [114.0325, 22.4445]

export const SPECS: Record<ModuleType, ModuleSpec> = {
  M1: {
    type: 'M1',
    name: 'M1 Sponge',
    shape: 'hexagon',
    sizeLabel: '15 m diameter · 3.5 m high',
    diameter: 15,
    height: 3.5,
    area: 145,
    environment: 'Coastal land + sea',
    capacity: 420,
    absorbRate: 26,
    colour: '#3fd0c9',
  },
  M2: {
    type: 'M2',
    name: 'M2 Connection',
    shape: 'rectangle',
    sizeLabel: '9 m × 2 m · 3.5 m high',
    length: 9,
    width: 2,
    height: 3.5,
    area: 18,
    environment: 'Land + temporary sea transfer',
    capacity: 54,
    absorbRate: 9,
    colour: '#6ea8fe',
  },
  M3: {
    type: 'M3',
    name: 'M3 Breakwater',
    shape: 'hexagon',
    sizeLabel: '15 m diameter · 6.5 m high',
    diameter: 15,
    height: 6.5,
    area: 145,
    environment: 'Sea only',
    capacity: 560,
    absorbRate: 32,
    colour: '#f4b860',
  },
}

export const MODULE_TYPES: ModuleType[] = ['M1', 'M2', 'M3']

export const STATE_LABEL: Record<string, string> = {
  standby: 'Standby',
  assigned: 'Assigned',
  in_transit: 'In transit',
  deploying: 'Deploying',
  operating: 'Operating',
  saturated: 'Saturated',
  damaged: 'Damaged',
  maintenance: 'Maintenance',
}

export const SENSOR_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted'> = {
  HEALTHY: 'ok',
  FULL: 'warn',
  DAMAGED: 'bad',
  UNREACHABLE: 'muted',
}

export const RISK_COLOUR: Record<string, string> = {
  severe: '#ff5d6c',
  warning: '#ffb020',
  watch: '#ffd166',
}

export const LAYERS = [
  { key: 'flood', label: 'Flood forecast' },
  { key: 'risks', label: 'Risk pulses' },
  { key: 'modules', label: 'Module positions' },
  { key: 'routes', label: 'Transport routes' },
  { key: 'blackspots', label: 'Flood blackspots' },
  { key: 'stations', label: 'Tide stations' },
  { key: 'base', label: 'Yuen Long base' },
] as const

export const TIDE_STATIONS: { name: string; coord: [number, number] }[] = [
  { name: 'Tai O', coord: [113.864, 22.254] },
  { name: 'Tsim Bei Tsui', coord: [114.009, 22.489] },
  { name: 'Quarry Bay', coord: [114.214, 22.291] },
  { name: 'Tai Po Kau', coord: [114.183, 22.443] },
  { name: 'Cheung Chau', coord: [114.027, 22.211] },
]

export const BLACKSPOTS: { name: string; coord: [number, number] }[] = [
  { name: 'Yuen Long Town', coord: [114.039, 22.445] },
  { name: 'Tai Po Market', coord: [114.168, 22.448] },
  { name: 'Tsuen Wan', coord: [114.104, 22.371] },
  { name: 'Wong Tai Sin', coord: [114.195, 22.342] },
  { name: 'Chai Wan', coord: [114.237, 22.264] },
]
