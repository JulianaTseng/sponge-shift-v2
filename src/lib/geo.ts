import type { RiskPoint } from '../types'

export const HK_CENTER: [number, number] = [114.06, 22.36]
export const M_PER_DEG_LAT = 111_320
export const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180)

export const offsetCoord = (c: [number, number], dx: number, dy: number): [number, number] => [
  c[0] + dx / mPerDegLng(c[1]),
  c[1] + dy / M_PER_DEG_LAT,
]

export function distanceKm(a: [number, number], b: [number, number]) {
  const R = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function polygonRing(points: [number, number][]): [number, number][] {
  return [...points, points[0]]
}

export function hexPolygon(center: [number, number], diameterM: number, rotationDeg = 0): [number, number][] {
  const R = diameterM / 2
  const pts: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const angle = ((60 * i - 30 + rotationDeg) * Math.PI) / 180
    pts.push(offsetCoord(center, R * Math.cos(angle), R * Math.sin(angle)))
  }
  return polygonRing(pts)
}

export function rectPolygon(
  center: [number, number],
  lengthM: number,
  widthM: number,
  bearingDeg = 0,
): [number, number][] {
  const a = (bearingDeg * Math.PI) / 180
  const dir = (dx: number, dy: number): [number, number] => [
    dx * Math.cos(a) - dy * Math.sin(a),
    dx * Math.sin(a) + dy * Math.cos(a),
  ]
  const corners: [number, number][] = [
    [-lengthM / 2, -widthM / 2],
    [lengthM / 2, -widthM / 2],
    [lengthM / 2, widthM / 2],
    [-lengthM / 2, widthM / 2],
  ].map(([x, y]) => {
    const [rx, ry] = dir(x, y)
    return offsetCoord(center, rx, ry)
  })
  return polygonRing(corners)
}

export function circlePolygon(center: [number, number], radiusM: number, steps = 48): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    pts.push(offsetCoord(center, radiusM * Math.cos(a), radiusM * Math.sin(a)))
  }
  return polygonRing(pts)
}

export function moduleFootprint(
  center: [number, number],
  type: 'M1' | 'M2' | 'M3',
): [number, number][] {
  if (type === 'M2') return rectPolygon(center, 9, 2)
  return hexPolygon(center, 15)
}

/* ---------- hex grid snapping (pointy-top, circumradius = R) ---------- */

function cubeRound(q: number, r: number) {
  let x = q
  let z = r
  let y = -x - z
  let rx = Math.round(x)
  let ry = Math.round(y)
  let rz = Math.round(z)
  const dx = Math.abs(rx - x)
  const dy = Math.abs(ry - y)
  const dz = Math.abs(rz - z)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dy > dz) ry = -rx - rz
  else rz = -rx - ry
  return { q: rx, r: rz }
}

export function snapToHex(coord: [number, number], diameterM: number): [number, number] {
  const R = diameterM / 2
  const lat0 = 22.36
  const x = (coord[0] - HK_CENTER[0]) * mPerDegLng(lat0)
  const y = (coord[1] - HK_CENTER[1]) * M_PER_DEG_LAT
  const q = ((2 / 3) * x) / R
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / R
  const { q: cq, r: cr } = cubeRound(q, r)
  const cx = 1.5 * R * cq
  const cy = Math.sqrt(3) * R * (cr + cq / 2)
  return [HK_CENTER[0] + cx / mPerDegLng(lat0), HK_CENTER[1] + cy / M_PER_DEG_LAT]
}

export function snapToSquare(coord: [number, number], cellM: number): [number, number] {
  const lat0 = 22.36
  const x = (coord[0] - HK_CENTER[0]) * mPerDegLng(lat0)
  const y = (coord[1] - HK_CENTER[1]) * M_PER_DEG_LAT
  const sx = Math.round(x / cellM) * cellM
  const sy = Math.round(y / cellM) * cellM
  return [HK_CENTER[0] + sx / mPerDegLng(lat0), HK_CENTER[1] + sy / M_PER_DEG_LAT]
}

export function snapModule(coord: [number, number], type: 'M1' | 'M2' | 'M3'): [number, number] {
  return type === 'M2' ? snapToSquare(coord, 9) : snapToHex(coord, 15)
}

export function hexGrid(center: [number, number], diameterM: number, rings = 2): [number, number][][] {
  const R = diameterM / 2
  const lat0 = 22.36
  const cells: [number, number][][] = []
  const cq = Math.round(((2 / 3) * ((center[0] - HK_CENTER[0]) * mPerDegLng(lat0))) / R)
  const cr = Math.round(
    ((-1 / 3) * ((center[0] - HK_CENTER[0]) * mPerDegLng(lat0)) +
      (Math.sqrt(3) / 3) * ((center[1] - HK_CENTER[1]) * M_PER_DEG_LAT)) /
      R,
  )
  for (let dq = -rings; dq <= rings; dq++) {
    for (let dr = Math.max(-rings, -dq - rings); dr <= Math.min(rings, -dq + rings); dr++) {
      const cx = 1.5 * R * (cq + dq)
      const cy = Math.sqrt(3) * R * (cr + dr + (cq + dq) / 2)
      const c: [number, number] = [
        HK_CENTER[0] + cx / mPerDegLng(lat0),
        HK_CENTER[1] + cy / M_PER_DEG_LAT,
      ]
      cells.push(hexPolygon(c, diameterM))
    }
  }
  return cells
}

export function squareGrid(center: [number, number], cellM: number, n = 4): [number, number][][] {
  const cells: [number, number][][] = []
  const lat0 = 22.36
  const x0 = (center[0] - HK_CENTER[0]) * mPerDegLng(lat0)
  const y0 = (center[1] - HK_CENTER[1]) * M_PER_DEG_LAT
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const cx = x0 + i * cellM
      const cy = y0 + j * cellM
      const c: [number, number] = [
        HK_CENTER[0] + cx / mPerDegLng(lat0),
        HK_CENTER[1] + cy / M_PER_DEG_LAT,
      ]
      cells.push(rectPolygon(c, cellM, cellM))
    }
  }
  return cells
}

export function nearestRisk(coord: [number, number], risks: RiskPoint[]) {
  let best: RiskPoint | null = null
  let bestD = Infinity
  for (const r of risks) {
    const d = distanceKm(coord, r.coord)
    if (d < bestD) {
      bestD = d
      best = r
    }
  }
  return { risk: best, km: bestD }
}

export function interactive(coord: [number, number], risks: RiskPoint[], radiusKm: number) {
  void coord
  void risks
  void radiusKm
}

export function interpolateSeries(series: { t: number; v: number }[], t: number) {
  if (!series.length) return 0
  if (t <= series[0].t) return series[0].v
  const last = series[series.length - 1]
  if (t >= last.t) return last.v
  for (let i = 1; i < series.length; i++) {
    if (series[i].t >= t) {
      const a = series[i - 1]
      const b = series[i]
      const f = (t - a.t) / (b.t - a.t || 1)
      return a.v + (b.v - a.v) * f
    }
  }
  return last.v
}

export function interpolateDepth(series: { t: number; depth: number }[], t: number) {
  if (!series.length) return 0
  if (t <= series[0].t) return series[0].depth
  const last = series[series.length - 1]
  if (t >= last.t) return last.depth
  for (let i = 1; i < series.length; i++) {
    if (series[i].t >= t) {
      const a = series[i - 1]
      const b = series[i]
      const f = (t - a.t) / (b.t - a.t || 1)
      return a.depth + (b.depth - a.depth) * f
    }
  }
  return last.depth
}

export function pointAlong(line: [number, number][], fraction: number): [number, number] {
  if (line.length === 0) return HK_CENTER
  if (line.length === 1) return line[0]
  const f = Math.min(1, Math.max(0, fraction))
  const segs: number[] = []
  let total = 0
  for (let i = 1; i < line.length; i++) {
    const d = distanceKm(line[i - 1], line[i])
    segs.push(d)
    total += d
  }
  let target = total * f
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const k = segs[i] === 0 ? 0 : target / segs[i]
      return [
        line[i][0] + (line[i + 1][0] - line[i][0]) * k,
        line[i][1] + (line[i + 1][1] - line[i][1]) * k,
      ]
    }
    target -= segs[i]
  }
  return line[line.length - 1]
}

export function routeLengthKm(line: [number, number][]) {
  let d = 0
  for (let i = 1; i < line.length; i++) d += distanceKm(line[i - 1], line[i])
  return d
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}
