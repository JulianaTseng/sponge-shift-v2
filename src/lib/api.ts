import type { LiveData } from '../types'

const HKO = 'https://data.weather.gov.hk/weatherAPI'

export const hkoTideUrl = (station = 'TAO') => {
  const now = new Date(Date.now() + 8 * 3600_000)
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  const d = now.getUTCDate()
  return `${HKO}/opendata/opendata.php?dataType=HHOT&station=${station}&year=${y}&month=${m}&day=${d}&rformat=json&lang=en`
}

export interface ApiRow {
  key: string
  name: string
  detail: string
  endpoint: string
  cors: boolean
  tested: boolean
}

export const apiRows = (): ApiRow[] => [
  {
    key: 'warnings',
    name: 'HKO Weather Warnings',
    detail: 'Warning summary · JSON · no key required',
    endpoint: `${HKO}/opendata/weather.php?dataType=warningInfo&lang=en`,
    cors: true,
    tested: true,
  },
  {
    key: 'rainfall',
    name: 'HKO Rainfall (rhrread)',
    detail: 'District rainfall in the past hour · JSON',
    endpoint: `${HKO}/opendata/weather.php?dataType=rhrread&lang=en`,
    cors: true,
    tested: true,
  },
  {
    key: 'tide',
    name: 'HKO Tide (Tai O, hourly)',
    detail: 'Predicted astronomical tide for today · JSON',
    endpoint: hkoTideUrl('TAO'),
    cors: true,
    tested: true,
  },
  {
    key: 'datagov',
    name: 'DATA.GOV.HK · Flooding Blackspots',
    detail: 'DSD flooding blackspot dataset · CKAN search API',
    endpoint:
      'https://data.gov.hk/en-data/api/3/action/package_search?q=flooding%20blackspots&rows=1',
    cors: false,
    tested: true,
  },
]

async function timedFetch(url: string, timeout = 10000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  const started = performance.now()
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    const ms = Math.round(performance.now() - started)
    if (!res.ok) return { ok: false, ms, status: res.status, json: null as any }
    const json = await res.json()
    return { ok: true, ms, status: res.status, json }
  } catch (e: any) {
    return { ok: false, ms: Math.round(performance.now() - started), status: 0, json: null, error: e?.name || 'error' }
  } finally {
    clearTimeout(timer)
  }
}

export async function testApi(endpoint: string) {
  const r = await timedFetch(endpoint)
  if (r.ok) return { status: 'ok' as const, latency: r.ms, message: 'Connected · valid JSON received' }
  if (r.error === 'AbortError') return { status: 'fail' as const, latency: r.ms, message: 'Timed out' }
  if (r.status === 0)
    return {
      status: 'restricted' as const,
      latency: r.ms,
      message: 'Portal reachable, but the browser is blocked by CORS. Open the dataset in a new tab.',
    }
  return { status: 'fail' as const, latency: r.ms, message: `HTTP ${r.status}` }
}

export async function loadLive(): Promise<LiveData> {
  const rows = apiRows()
  const [warn, rain, tide] = await Promise.all([
    timedFetch(rows[0].endpoint),
    timedFetch(rows[1].endpoint),
    timedFetch(rows[2].endpoint),
  ])
  const warnings: string[] = []
  if (warn.ok && warn.json) {
    const arr = warn.json.warningStatement ?? warn.json.details ?? []
    for (const w of Array.isArray(arr) ? arr : []) {
      if (w?.warningStatementCode) warnings.push(w.warningStatementCode)
    }
  }
  let rainfall: number | null = null
  if (rain.ok && rain.json?.rainfall?.data) {
    const list = rain.json.rainfall.data as { place: string; max: number }[]
    const yl = list.find((x) => /yuen long/i.test(x.place)) ?? list[0]
    rainfall = typeof yl?.max === 'number' ? yl.max : null
  }
  let tideVal: number | null = null
  if (tide.ok && tide.json?.fields && tide.json?.data?.[0]) {
    const fields: string[] = tide.json.fields
    const row: string[] = tide.json.data[0]
    const hkt = new Date(Date.now() + 8 * 3600_000)
    const hour = Math.min(24, hkt.getUTCHours() + 1)
    const idx = fields.indexOf(String(hour).padStart(2, '0'))
    if (idx > -1) tideVal = Number(row[idx])
  }
  const okAny = warn.ok || rain.ok || tide.ok
  return {
    status: okAny ? 'ok' : 'error',
    tide: tideVal,
    tideStation: 'Tai O',
    rainfall,
    warnings,
    updatedAt: Date.now(),
    error: okAny ? undefined : 'All HKO endpoints unreachable',
  }
}
