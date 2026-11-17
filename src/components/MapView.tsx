import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { useApp } from '../store'
import { SPECS } from '../data/specs'
import { BASE } from '../data/specs'
import {
  hexGrid,
  moduleFootprint,
  snapModule,
  squareGrid,
} from '../lib/geo'
import { depthWith, depthWithout } from '../lib/sim'
import type { ModuleType } from '../types'

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

const SEA_HINTS: [number, number][][] = [
  [
    [114.085, 22.284],
    [114.255, 22.3],
    [114.255, 22.268],
    [114.085, 22.268],
  ],
  [
    [113.93, 22.4],
    [114.02, 22.53],
    [114.02, 22.44],
    [113.95, 22.375],
  ],
  [
    [114.14, 22.41],
    [114.31, 22.47],
    [114.31, 22.4],
    [114.14, 22.4],
  ],
  [
    [113.88, 22.14],
    [114.36, 22.14],
    [114.36, 22.24],
    [113.88, 22.24],
  ],
]

function inPolygon(p: [number, number], poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const hit = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1) + xi
    if (hit) inside = !inside
  }
  return inside
}

export function MapView({
  variant = 'full',
  compare = 'with',
  allowPlacement = false,
  onRiskClick,
  onModuleClick,
  className = '',
  focus,
  zoomLevel,
}: {
  variant?: 'full' | 'mini'
  compare?: 'with' | 'without'
  allowPlacement?: boolean
  onRiskClick?: (id: string) => void
  onModuleClick?: (id: string) => void
  className?: string
  focus?: [number, number]
  zoomLevel?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const waterLayers = useRef<string[]>([])
  const markersRef = useRef<maplibregl.Marker[]>([])
  const cbRef = useRef({ onRiskClick, onModuleClick })
  cbRef.current = { onRiskClick, onModuleClick }
  const [ready, setReady] = useState(false)
  const store = useApp()
  const { risks, modules, orders, simH, layers, placing, wave, selectedRisk } = store

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: ref.current,
      style: STYLE_URL,
      center: focus ?? [114.02, 22.33],
      zoom: zoomLevel ?? (variant === 'mini' ? 9.8 : 10.7),
      interactive: variant !== 'mini',
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.on('load', () => {
      const style = map.getStyle()
      waterLayers.current = (style.layers ?? [])
        .filter((l: any) => l.type === 'fill' && /water|ocean|sea/i.test(l.id))
        .map((l: any) => l.id)
      map.addSource('flood', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'flood-fill',
        type: 'fill',
        source: 'flood',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'depth'],
            0.15,
            '#2a8ba8',
            0.5,
            '#39b6cd',
            1,
            '#ffc247',
            1.5,
            '#ff7a5c',
            2.2,
            '#ff4d6d',
          ],
          'fill-opacity': ['get', 'opacity'],
        },
      })
      map.addLayer({
        id: 'flood-edge',
        type: 'line',
        source: 'flood',
        paint: { 'line-color': '#7ee0da', 'line-width': 0.6, 'line-opacity': 0.35 },
      })
      map.addSource('routes', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'routes-solid',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'mode'], 'land'],
        paint: {
          'line-color': ['get', 'colour'],
          'line-width': 2,
          'line-opacity': 0.9,
        },
      })
      map.addLayer({
        id: 'routes-dash',
        type: 'line',
        source: 'routes',
        filter: ['!=', ['get', 'mode'], 'land'],
        paint: {
          'line-color': ['get', 'colour'],
          'line-width': 1.8,
          'line-dasharray': [2, 1.6],
          'line-opacity': 0.9,
        },
      })
      map.addSource('grid', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'grid-line',
        type: 'line',
        source: 'grid',
        paint: { 'line-color': '#9fd9d4', 'line-width': 0.7, 'line-opacity': 0.35, 'line-dasharray': [2, 2] },
      })
      map.addSource('ghost', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'ghost-fill',
        type: 'fill',
        source: 'ghost',
        paint: { 'fill-color': ['get', 'colour'], 'fill-opacity': 0.42 },
      })
      map.addLayer({
        id: 'ghost-line',
        type: 'line',
        source: 'ghost',
        paint: { 'line-color': ['get', 'colour'], 'line-width': 1.6 },
      })
      setReady(true)
      requestAnimationFrame(() => map.resize())
    })
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [variant, focus?.[0], focus?.[1], zoomLevel])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('flood') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    if (!layers.flood) {
      src.setData(EMPTY)
      return
    }
    const features: GeoJSON.Feature[] = []
    for (const r of risks) {
      const d = compare === 'with' ? depthWith(r, simH, modules) : depthWithout(r, simH)
      if (d < 0.14) continue
      // Flood extent is a function of depth: deeper water spreads further inland.
      const radius = 900 + Math.min(2.6, d) * 1500
      // Depth contours: outer bands are shallow (blue), the core carries the peak depth (amber/red).
      const bands = [
        { k: 1.0, f: 0.3, o: 0.34 },
        { k: 0.72, f: 0.62, o: 0.4 },
        { k: 0.44, f: 1.0, o: 0.5 },
      ]
      for (const band of bands) {
        features.push({
          type: 'Feature',
          properties: { depth: Math.max(0.12, d * band.f), opacity: band.o, id: r.id },
          geometry: { type: 'Polygon', coordinates: [blob(r.coord, radius * band.k, hashSeed(r.id))] },
        })
      }
    }
    src.setData({ type: 'FeatureCollection', features })
  }, [ready, risks, modules, simH, layers.flood, compare])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('routes') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    if (!layers.routes) {
      src.setData(EMPTY)
      return
    }
    const features: GeoJSON.Feature[] = []
    for (const o of orders) {
      if (!o.route) continue
      features.push({
        type: 'Feature',
        properties: {
          mode: o.route.mode === 'land' ? 'land' : 'sea',
          colour: o.route.mode === 'land' ? '#7ee0da' : '#f4b860',
        },
        geometry: { type: 'LineString', coordinates: o.route.geometry },
      })
    }
    src.setData({ type: 'FeatureCollection', features })
  }, [ready, orders, layers.routes])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []
    const add = (el: HTMLElement, coord: [number, number], anchor: any = 'center') => {
      el.classList.add('map-marker')
      const mk = new maplibregl.Marker({ element: el, anchor }).setLngLat(coord).addTo(map)
      markersRef.current.push(mk)
    }

    if (layers.risks) {
      const placed: { x: number; y: number }[] = []
      let severeIdx = 0
      for (const r of risks) {
        const d = compare === 'with' ? depthWith(r, simH, modules) : depthWithout(r, simH)
        const el = document.createElement('button')
        el.type = 'button'
        const flip = r.level === 'severe' && severeIdx++ % 2 === 1
        el.className = `map-pulse map-pulse--${r.level} ${flip ? 'tag-flip' : ''} ${selectedRisk === r.id ? 'is-selected' : ''}`
        el.innerHTML = `<span class="pulse-ring"></span><span class="pulse-core"></span><span class="pulse-tag">${r.name}<em>${d.toFixed(2)} m</em></span>`
        el.title = `${r.name} · ${d.toFixed(2)} m`
        el.onclick = (e) => {
          e.stopPropagation()
          cbRef.current.onRiskClick?.(r.id)
        }
        // Label declutter: suppress a permanent label when it would collide with one already placed.
        const px = map.project(r.coord)
        const collide = placed.some((q) => Math.abs(q.x - px.x) < 150 && Math.abs(q.y - px.y) < 15)
        if (px.x > (ref.current?.clientWidth ?? 900) - 168 && !el.classList.contains('tag-flip')) {
          el.classList.add('tag-flip')
        }
        if (collide || variant === 'mini') el.classList.add('tag-off')
        else placed.push({ x: px.x, y: px.y })
        add(el, r.coord)
      }
    }

    if (layers.modules) {
      // Modules sharing a coordinate (a supply task in the same district) would sit
      // exactly on top of each other; fan them out on a small ring.
      const seen = new Map<string, number>()
      for (const m of modules) {
        if (m.state === 'standby') continue
        const el = document.createElement('button')
        el.type = 'button'
        el.className = `map-mod map-mod--${m.type} ${m.sensor === 'FULL' ? 'is-full' : ''} ${m.sensor === 'DAMAGED' ? 'is-damaged' : ''}`
        el.title = `${m.id} · ${SPECS[m.type].name}`
        el.innerHTML = `<span>${m.type}</span>`
        el.onclick = (e) => {
          e.stopPropagation()
          cbRef.current.onModuleClick?.(m.id)
        }
        const key = `${m.coord[0].toFixed(4)},${m.coord[1].toFixed(4)}`
        const n = seen.get(key) ?? 0
        seen.set(key, n + 1)
        const coord: [number, number] =
          n === 0
            ? m.coord
            : [m.coord[0] + Math.cos(n * 2.1) * 0.0016 * n, m.coord[1] + Math.sin(n * 2.1) * 0.0013 * n]
        add(el, coord)
      }
    }

    if (layers.base) {
      const el = document.createElement('div')
      el.className = 'map-base'
      el.innerHTML = `<span class="base-dot"></span><span class="base-label">Yuen Long Base</span>`
      add(el, BASE)
    }

  }, [ready, risks, modules, layers, simH, selectedRisk, compare, variant])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const el = ref.current
    if (!el) return
    if (!allowPlacement || !placing) {
      el.classList.remove('is-placing')
      return
    }
    el.classList.add('is-placing')

    const setPreview = (coord: [number, number]) => {
      const snapped = snapModule(coord, placing)
      const water = isWater(map, snapped)
      const valid = placing === 'M3' ? water : true
      const fp = moduleFootprint(snapped, placing)
      ;(map.getSource('ghost') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { colour: valid ? '#42d392' : '#ff5d6c' },
            geometry: { type: 'Polygon', coordinates: [fp] },
          },
        ],
      })
      const cells =
        placing === 'M2' ? squareGrid(snapped, 9, 4) : hexGrid(snapped, 15, 2)
      ;(map.getSource('grid') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: cells.map((c) => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: c },
        })),
      })
      void valid
    }

    const clear = () => {
      ;(map.getSource('ghost') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY)
      ;(map.getSource('grid') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY)
    }

    const onMove = (e: maplibregl.MapMouseEvent) => setPreview([e.lngLat.lng, e.lngLat.lat])
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const coord = snapModule([e.lngLat.lng, e.lngLat.lat], placing)
      const valid = placing === 'M3' ? isWater(map, coord) : true
      useApp.getState().placeModule(coord, valid)
      clear()
    }
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (!e.dataTransfer) return
      const rect = el.getBoundingClientRect()
      const ll = map.unproject([e.clientX - rect.left, e.clientY - rect.top])
      setPreview([ll.lng, ll.lat])
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const type = (e.dataTransfer?.getData('text/module') || placing) as ModuleType
      if (!type) return
      const rect = el.getBoundingClientRect()
      const ll = map.unproject([e.clientX - rect.left, e.clientY - rect.top])
      const coord = snapModule([ll.lng, ll.lat], type)
      const valid = type === 'M3' ? isWater(map, coord) : true
      useApp.getState().startPlacing(type)
      useApp.getState().placeModule(coord, valid)
      clear()
    }

    map.on('mousemove', onMove)
    map.on('click', onClick)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)
    return () => {
      map.off('mousemove', onMove)
      map.off('click', onClick)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
      clear()
    }
  }, [ready, placing, allowPlacement])

  return (
    <div className={`map-shell map-shell--${variant} ${className}`}>
      <div ref={ref} className="map-canvas" />
      {wave && variant !== 'mini' && <div className="wave-overlay" aria-hidden />}
      {variant !== 'mini' && (
        <div className="map-legend">
          <span>
            <i className="dot dot--severe" /> Severe
          </span>
          <span>
            <i className="dot dot--warning" /> Warning
          </span>
          <span>
            <i className="dot dot--watch" /> Watch
          </span>
          <span>
            <i className="line line--solid" /> Land route
          </span>
          <span>
            <i className="line line--dash" /> Sea / indicative
          </span>
        </div>
      )}
    </div>
  )
}

function isWater(map: maplibregl.Map, coord: [number, number]) {
  try {
    const ids = waterLayersOf(map)
    if (ids.length) {
      const p = map.project(coord as any)
      const feats = map.queryRenderedFeatures(p, { layers: ids })
      if (feats.length) return true
    }
  } catch {
    /* fall through */
  }
  return SEA_HINTS.some((poly) => inPolygon(coord, poly))
}

let cached: { map: maplibregl.Map | null; ids: string[] } = { map: null, ids: [] }
function waterLayersOf(map: maplibregl.Map) {
  if (cached.map === map) return cached.ids
  const style = map.getStyle()
  const ids = (style.layers ?? [])
    .filter((l: any) => l.type === 'fill' && /water|ocean|sea/i.test(l.id))
    .map((l: any) => l.id)
  cached = { map, ids }
  return ids
}

/** Deterministic seed from an id so flood blobs stay stable between renders. */
function hashSeed(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h % 100000)
}

/** Irregular coastal flood polygon: radial noise on a circle keeps it from looking like a bubble. */
function blob(center: [number, number], radiusM: number, seed: number, steps = 48) {
  let s = seed || 7
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const phase = rand() * Math.PI * 2
  const pts: [number, number][] = []
  const latRad = (center[1] * Math.PI) / 180
  const mPerDegLat = 111320
  const mPerDegLng = 111320 * Math.cos(latRad)
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const wav = 1 + 0.075 * Math.sin(a * 3 + phase) + 0.045 * Math.sin(a * 5 - phase * 1.6) + 0.02 * Math.sin(a * 9 + phase)
    const r = radiusM * wav
    pts.push([center[0] + (Math.cos(a) * r) / mPerDegLng, center[1] + (Math.sin(a) * r) / mPerDegLng])
  }
  pts.push(pts[0])
  return pts
}
