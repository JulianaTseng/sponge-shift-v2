import type { Route } from '../types'
import { distanceKm, routeLengthKm } from './geo'

const OSRM = 'https://router.project-osrm.org/route/v1/driving'

const cache = new Map<string, Route>()

const SEA_NODES: Record<string, [number, number]> = {
  yl_launch: [113.962, 22.388],
  deep_bay: [113.955, 22.458],
  tbt: [114.005, 22.487],
  lau_fau: [113.985, 22.468],
  lantau_nw: [113.905, 22.32],
  tai_o: [113.872, 22.256],
  lantau_s: [113.995, 22.225],
  cheung_chau: [114.028, 22.205],
  harbour_w: [114.095, 22.292],
  harbour_c: [114.17, 22.291],
  lym: [114.236, 22.286],
  tko: [114.268, 22.3],
  tolo: [114.205, 22.437],
  saikung: [114.285, 22.365],
  south: [114.16, 22.2],
  stanley: [114.22, 22.215],
  mui_wo: [114.0, 22.262],
  peng_chau: [114.04, 22.288],
}

const SEA_EDGES: [string, string, [number, number][]][] = [
  ['yl_launch', 'deep_bay', [[113.965, 22.42]]],
  ['deep_bay', 'tbt', [[113.988, 22.478]]],
  ['deep_bay', 'lau_fau', []],
  ['yl_launch', 'lantau_nw', [[113.935, 22.352]]],
  ['lantau_nw', 'tai_o', [[113.89, 22.285]]],
  ['lantau_nw', 'mui_wo', []],
  ['lantau_nw', 'peng_chau', []],
  ['peng_chau', 'harbour_w', [[114.07, 22.29]]],
  ['harbour_w', 'harbour_c', [[114.13, 22.292]]],
  ['harbour_c', 'lym', []],
  ['lym', 'tko', [[114.255, 22.295]]],
  ['lym', 'south', [[114.21, 22.245]]],
  ['south', 'stanley', []],
  ['south', 'cheung_chau', [[114.09, 22.2]]],
  ['cheung_chau', 'lantau_s', []],
  ['lantau_s', 'mui_wo', []],
  ['harbour_c', 'tolo', [[114.19, 22.36]]],
  ['tolo', 'saikung', [[114.25, 22.4]]],
  ['saikung', 'tko', []],
  ['tai_o', 'cheung_chau', [[113.95, 22.222]]],
]

function nearestNode(coord: [number, number]) {
  let best = 'yl_launch'
  let bestD = Infinity
  for (const [k, v] of Object.entries(SEA_NODES)) {
    const d = distanceKm(coord, v)
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  return { key: best, km: bestD }
}

function dijkstra(start: string, end: string): string[] {
  const dist: Record<string, number> = {}
  const prev: Record<string, string | null> = {}
  const visited = new Set<string>()
  for (const k of Object.keys(SEA_NODES)) {
    dist[k] = Infinity
    prev[k] = null
  }
  dist[start] = 0
  while (true) {
    let u: string | null = null
    let best = Infinity
    for (const k of Object.keys(SEA_NODES)) {
      if (!visited.has(k) && dist[k] < best) {
        best = dist[k]
        u = k
      }
    }
    if (!u) break
    if (u === end) break
    visited.add(u)
    for (const [a, b] of SEA_EDGES) {
      let v: string | null = null
      if (a === u) v = b
      else if (b === u) v = a
      if (!v) continue
      const w = distanceKm(SEA_NODES[a], SEA_NODES[b])
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w
        prev[v] = u
      }
    }
  }
  const path: string[] = []
  let cur: string | null = end
  while (cur) {
    path.unshift(cur)
    cur = prev[cur]
  }
  return path[0] === start ? path : [start, end]
}

function edgePolyline(a: string, b: string): [number, number][] {
  const e = SEA_EDGES.find(([x, y]) => (x === a && y === b) || (x === b && y === a))
  const mid = e ? e[2] : []
  const pts: [number, number][] = [SEA_NODES[a], ...mid, SEA_NODES[b]]
  return a === (e?.[0] ?? a) ? pts : [...pts].reverse()
}

export function seaRoute(from: [number, number], to: [number, number]): Route {
  const a = nearestNode(from)
  const b = nearestNode(to)
  const path = dijkstra(a.key, b.key)
  const line: [number, number][] = []
  for (let i = 0; i < path.length; i++) {
    if (i === 0) line.push(SEA_NODES[path[0]])
    else line.push(...edgePolyline(path[i - 1], path[i]).slice(1))
  }
  if (distanceKm(from, SEA_NODES[a.key]) > 0.05) line.unshift(from)
  if (distanceKm(SEA_NODES[b.key], to) > 0.05) line.push(to)
  const km = routeLengthKm(line)
  return {
    geometry: line,
    distanceKm: km,
    durationH: 0,
    mode: 'sea',
    label: `Sea lane · ${km.toFixed(1)} km`,
  }
}

export function indicativeRoute(from: [number, number], to: [number, number]): Route {
  const km = distanceKm(from, to) * 1.18
  return {
    geometry: [from, to],
    distanceKm: km,
    durationH: 0,
    mode: 'indicative',
    label: `Indicative · ${km.toFixed(1)} km`,
  }
}

export async function landRoute(
  from: [number, number],
  to: [number, number],
): Promise<Route | null> {
  const key = `${from.join(',')}|${to.join(',')}`
  if (cache.has(key)) return cache.get(key) ?? null
  const url = `${OSRM}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 9000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const data = await res.json()
    const r = data?.routes?.[0]
    if (!r?.geometry?.coordinates?.length) throw new Error('No route')
    const geometry = r.geometry.coordinates as [number, number][]
    const km = (r.distance ?? 0) / 1000
    const route: Route = {
      geometry,
      distanceKm: km,
      durationH: (r.duration ?? 0) / 3600,
      mode: 'land',
      label: `Road network · ${km.toFixed(1)} km`,
    }
    cache.set(key, route)
    return route
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function buildRoute(
  mode: 'land' | 'sea',
  from: [number, number],
  to: [number, number],
  landSpeedKmh: number,
  seaSpeedKnots: number,
): Promise<Route> {
  if (mode === 'sea') {
    const r = seaRoute(from, to)
    r.durationH = r.distanceKm / (seaSpeedKnots * 1.852)
    return r
  }
  const road = await landRoute(from, to)
  if (road) {
    road.durationH = road.distanceKm / Math.max(5, landSpeedKmh)
    return road
  }
  const fallback = indicativeRoute(from, to)
  fallback.durationH = fallback.distanceKm / Math.max(5, landSpeedKmh)
  return fallback
}
