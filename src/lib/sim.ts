import type { CustomParams, Module, RiskPoint, Scenario, Settings } from '../types'
import { clamp, interpolateDepth, interpolateSeries, distanceKm } from './geo'

export const EFFECT: Record<string, number> = { M1: 0.16, M2: 0.09, M3: 0.2 }

export function depthWithout(risk: RiskPoint, t: number) {
  return interpolateDepth(risk.series, t)
}

export function attenuation(risk: RiskPoint, modules: Module[]) {
  let cut = 0
  for (const m of modules) {
    if (m.state !== 'operating' && m.state !== 'saturated') continue
    if (m.usage === 'supply') continue
    // Modules protect where they physically sit; an explicit task assignment adds intent.
    const d = distanceKm(m.coord, risk.coord)
    if (d > 0.9) continue
    const proximity = 1 - d / 0.9
    const assigned = m.riskId === risk.id ? 1.3 : 1
    cut += (EFFECT[m.type] ?? 0.1) * Math.max(0.32, proximity) * assigned
  }
  return clamp(cut, 0, 0.62)
}

export function depthWith(risk: RiskPoint, t: number, modules: Module[]) {
  return depthWithout(risk, t) * (1 - attenuation(risk, modules))
}

export function levelFor(depth: number): 'severe' | 'warning' | 'watch' | 'calm' {
  if (depth >= 1.0) return 'severe'
  if (depth >= 0.5) return 'warning'
  if (depth >= 0.2) return 'watch'
  return 'calm'
}

export function hoursToFull(m: Module, rates: Record<string, number>) {
  const rate = rates[m.type] ?? 20
  return Math.max(0, (m.capacity - m.absorbed) / rate)
}

export function fullAt(m: Module, rates: Record<string, number>) {
  return hoursToFull(m, rates)
}

export function inventory(modules: Module[]) {
  const out = {
    M1: { total: 0, standby: 0, transit: 0, deployed: 0, saturated: 0, damaged: 0 },
    M2: { total: 0, standby: 0, transit: 0, deployed: 0, saturated: 0, damaged: 0 },
    M3: { total: 0, standby: 0, transit: 0, deployed: 0, saturated: 0, damaged: 0 },
  }
  for (const m of modules) {
    const row = out[m.type]
    row.total++
    if (m.state === 'standby') row.standby++
    else if (m.state === 'in_transit' || m.state === 'assigned') row.transit++
    else if (m.state === 'saturated') row.saturated++
    else if (m.state === 'damaged') row.damaged++
    else row.deployed++
  }
  return out
}

export function supplyUsage(modules: Module[]) {
  const m2 = modules.filter((m) => m.type === 'M2' && m.usage === 'supply')
  return { count: m2.length, volume: m2.reduce((s, m) => s + (m.supplyTask ? m.capacity : 0), 0) }
}

export function forecastPeak(risk: RiskPoint, modules: Module[], t: number) {
  let peak = 0
  let at = t
  for (let h = Math.max(0, Math.floor(t)); h <= risk.series[risk.series.length - 1].t; h++) {
    const d = depthWith(risk, h, modules)
    if (d > peak) {
      peak = d
      at = h
    }
  }
  return { peak, atH: at }
}

export function seriesAt(risk: RiskPoint, t: number, modules: Module[]) {
  return {
    withModules: Array.from({ length: Math.ceil(risk.series[risk.series.length - 1].t) + 1 }, (_, h) => ({
      t: h,
      v: depthWith(risk, h, modules),
    })),
    without: risk.series.map((p) => ({ t: p.t, v: p.depth })),
    now: depthWith(risk, t, modules),
    nowWithout: depthWithout(risk, t),
  }
}

export function tideNow(scenario: Scenario, t: number) {
  return interpolateSeries(scenario.series.tide, t)
}

export function rainfallNow(scenario: Scenario, t: number) {
  return interpolateSeries(scenario.series.rainfall, t)
}

export function windNow(scenario: Scenario, t: number) {
  return interpolateSeries(scenario.series.windSpeed, t)
}

export function buildCustomScenario(base: Scenario, p: CustomParams): Scenario {
  const selected = base.riskPoints.filter((r) => p.riskIds.includes(r.id))
  const risks: RiskPoint[] = selected.map((r, i) => {
    const surgeFactor = p.peakTide / 3.2
    const rainFactor = p.peakRainfall / 90
    const raw = (r.type === 'pluvial' ? 0.72 * rainFactor : 0.55 * surgeFactor + 0.32 * rainFactor) * (r.peakDepth > 1 ? 1.4 : 1)
    const depth = clamp(raw + (i % 3) * 0.04, 0.15, 3.2)
    const ph = clamp(p.peakHour, 2, p.durationHours - 2)
    const series = Array.from({ length: p.durationHours + 1 }, (_, t) => ({
      t,
      depth: Number((depth * shapeCurve(t, ph, 5.2)).toFixed(3)),
    }))
    return {
      ...r,
      peakDepth: Number(depth.toFixed(2)),
      peakHour: ph,
      arriveByHours: Math.max(1, Number((ph - 4.5).toFixed(1))),
      series,
      level: depth >= 1 ? 'severe' : depth >= 0.5 ? 'warning' : 'watch',
      rationale:
        p.peakTide >= 3
          ? 'Custom profile: surge-driven inundation with rainfall compounding at the shoreline.'
          : 'Custom profile: rainfall-driven flooding with limited tidal contribution.',
      recommended:
        depth >= 1 ? { M1: 6, M2: 4, M3: 4 } : depth >= 0.5 ? { M1: 4, M2: 2, M3: 2 } : { M1: 2, M2: 1, M3: 1 },
    }
  })
  return {
    ...base,
    id: 'custom',
    name: p.name || 'Custom scenario',
    subtitle: `User profile · ${p.durationHours} h · peak tide ${p.peakTide.toFixed(1)} m · peak rainfall ${Math.round(p.peakRainfall)} mm/h`,
    durationHours: p.durationHours,
    riskPoints: risks,
    series: {
      rainfall: makeSeries(p.durationHours, p.peakRainfall, p.peakHour, 2, 5),
      tide: makeSeries(p.durationHours, p.peakTide, p.peakHour, 1.3, 7),
      windSpeed: makeSeries(p.durationHours, 120, p.peakHour, 10, 8),
      windDir: Array.from({ length: p.durationHours + 1 }, (_, t) => ({ t, v: 80 })),
    },
  }
}

function shapeCurve(t: number, peak: number, fall: number) {
  if (t <= 0) return 0.04
  if (t < peak) return Math.max(0.04, (t / peak) ** 1.65)
  return Math.max(0.02, Math.exp(-(((t - peak) / fall) ** 1.45)))
}

function makeSeries(dur: number, peak: number, at: number, base: number, fall: number) {
  return Array.from({ length: dur + 1 }, (_, t) => ({
    t,
    v: Number(Math.max(0, base + (peak - base) * shapeCurve(t, at, fall)).toFixed(3)),
  }))
}

export function eatNow(settings: Settings) {
  return {
    landSpeed: settings.landSpeed || 40,
    seaSpeed: settings.seaSpeed || 6,
  }
}

export function fmtHours(h: number | null) {
  if (h == null || !isFinite(h)) return '—'
  if (h <= 0) return '0 h'
  if (h < 1) return `${Math.round(h * 60)} min`
  return `${h.toFixed(1)} h`
}

export function fmtClock(t0: string, hours: number) {
  const d = new Date(new Date(t0).getTime() + hours * 3600_000)
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function fmtNum(n: number, digits = 0) {
  return n.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}


export function timeAgo(t: number) {
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
