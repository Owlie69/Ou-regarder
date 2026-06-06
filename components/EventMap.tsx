'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, LayerGroup } from 'leaflet'
import type { OuRegarderEvent, ViewingSpot, VisibilityAnalysis } from '@/types'

// ── Geometry ──────────────────────────────────────────────────────────────────

function convexHull(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts
  const s = [...pts].sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]))
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function radialShadow(
  eLat: number, eLng: number, eH: number,
  verts: [number, number][], bH: number,
): [number, number][] {
  if (bH <= 0 || verts.length < 3) return []
  const sf = Math.min(bH >= eH ? 25 : eH / (eH - bH), 25)
  return convexHull([
    ...verts,
    ...verts.map(([lat, lng]): [number, number] => [eLat + sf * (lat - eLat), eLng + sf * (lng - eLng)]),
  ])
}

function routeShadow(
  routePoints: { lat: number; lng: number }[], eH: number,
  verts: [number, number][], bH: number,
): [number, number][] {
  if (bH <= 0 || verts.length < 3) return []
  const all: [number, number][] = [...verts]
  for (const { lat, lng } of routePoints) all.push(...radialShadow(lat, lng, eH, verts, bH))
  return convexHull(all)
}

function directionalShadow(
  sunAzDeg: number, sunElDeg: number,
  verts: [number, number][], bH: number, centerLat: number,
): [number, number][] {
  if (bH <= 0 || verts.length < 3) return []
  const azRad = ((sunAzDeg + 180) % 360) * (Math.PI / 180)
  const len   = bH / Math.tan(sunElDeg * (Math.PI / 180))
  const dlat  = Math.cos(azRad) / 111320
  const dlng  = Math.sin(azRad) / (111320 * Math.cos(centerLat * Math.PI / 180))
  return convexHull([
    ...verts,
    ...verts.map(([lat, lng]): [number, number] => [lat + len * dlat, lng + len * dlng]),
  ])
}

function computeShadow(
  analysis: VisibilityAnalysis,
  source: { lat: number; lng: number },
  verts: [number, number][],
  bH: number,
): [number, number][] {
  if (analysis.type === 'radial')
    return radialShadow(source.lat, source.lng, analysis.eventHeightMeters ?? 10, verts, bH)
  if (analysis.type === 'route' && analysis.routePoints)
    return routeShadow(analysis.routePoints, analysis.eventHeightMeters ?? 5, verts, bH)
  if (analysis.type === 'directional') {
    if (bH < (analysis.minShadowHeightMeters ?? 0)) return []
    return directionalShadow(
      analysis.sunAzimuthDeg ?? 0, analysis.sunElevationDeg ?? 45,
      verts, bH, source.lat,
    )
  }
  return []
}

// ── Data fetching ─────────────────────────────────────────────────────────────

interface RawFeature { verts: [number, number][]; height: number; isVeg: boolean }
interface Obstacle   { verts: [number, number][]; shadow: [number, number][]; isVeg: boolean; height: number }

function extractHeight(tags: Record<string, string>): number {
  if (tags.height) { const h = parseFloat(tags.height); if (h > 0) return h }
  if (tags['building:levels']) { const f = parseInt(tags['building:levels']); if (f > 0) return Math.round(f * 3.5) }
  return 17  // Haussmann baseline (5–6 floors)
}

/**
 * Try loading a precomputed visibility file written by scripts/precompute-visibility.mjs.
 * Returns null if the file is missing, empty, or malformed — live fetch takes over.
 */
async function loadPrecomputed(slug: string): Promise<Obstacle[] | null> {
  try {
    const base = typeof window !== 'undefined'
      ? window.location.pathname.split('/events/')[0].replace(/\/$/, '')
      : ''
    const resp = await fetch(`${base}/visibility/${slug}.json`)
    if (!resp.ok) return null
    const raw = await resp.json() as Array<{ f: [number,number][]; s: [number,number][]; v: 0|1; h?: number }>
    if (!Array.isArray(raw) || raw.length === 0) return null
    return raw.map(d => ({ verts: d.f, shadow: d.s, isVeg: d.v === 1, height: d.h ?? 17 }))
  } catch { return null }
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

interface OverpassNode    { lat: number; lon: number }
interface OverpassElement { geometry?: OverpassNode[]; tags?: Record<string, string> }

/**
 * Single Overpass query: buildings + vegetation in one request.
 * Buildings use OSM height/building:levels tags; fall back to 17 m Haussmann default.
 * Works from any browser (Overpass has CORS *, 3-endpoint failover for reliability).
 */
async function fetchOverpass(lat: number, lng: number, radius: number): Promise<RawFeature[]> {
  const query =
    `[out:json][timeout:60];` +
    `(way["building"](around:${radius},${lat},${lng});` +
    `way["natural"="wood"](around:${radius},${lat},${lng});` +
    `way["landuse"="forest"](around:${radius},${lat},${lng});` +
    `way["leisure"="park"](around:${radius},${lat},${lng});` +
    `);out body geom qt;`

  let lastErr: unknown
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept':        'application/json',
          'User-Agent':    'ou-regarder/1.0',
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(60_000),
      })
      if (!resp.ok) { lastErr = new Error(`Overpass ${resp.status} (${endpoint})`); continue }
      const data: { elements: OverpassElement[] } = await resp.json()
      return data.elements
        .filter(el => el.geometry && el.geometry.length >= 3)
        .map(el => {
          const isVeg = !el.tags?.building
          return {
            verts:  el.geometry!.map(g => [g.lat, g.lon] as [number, number]),
            height: isVeg ? 12 : extractHeight(el.tags ?? {}),
            isVeg,
          }
        })
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function shadowOpacity(bHeight: number, analysis: VisibilityAnalysis): number {
  if (analysis.type === 'directional') return 0.50
  const eH = analysis.eventHeightMeters ?? 10
  return Math.max(Math.min(bHeight / eH, 1) * 0.50, 0.08)
}

/**
 * Two-pass render: shadows first (below), building footprints on top (always visible).
 * Clears the layer before drawing so it's safe to call repeatedly.
 */
function renderObstacles(
  obstacles: Obstacle[],
  layer: LayerGroup,
  L: typeof import('leaflet'),
  analysis: VisibilityAnalysis,
) {
  layer.clearLayers()
  for (const { shadow, height } of obstacles) {
    if (shadow.length >= 3)
      L.polygon(shadow, {
        color: '#dc2626', weight: 0,
        fillColor: '#dc2626', fillOpacity: shadowOpacity(height, analysis),
      }).addTo(layer)
  }
  for (const { verts, isVeg } of obstacles)
    L.polygon(verts, {
      color:       isVeg ? '#15803d' : '#374151',
      weight:      0.6,
      fillColor:   isVeg ? '#16a34a' : '#6b7280',
      fillOpacity: isVeg ? 0.22 : 0.38,
    }).addTo(layer)
}

// ── Component ─────────────────────────────────────────────────────────────────

const rankConfig = {
  best:       { color: '#16a34a', label: 'Meilleur spot', emoji: '🥇' },
  good:       { color: '#2563eb', label: 'Bon spot',      emoji: '🥈' },
  acceptable: { color: '#d97706', label: 'Acceptable',    emoji: '🥉' },
}

interface Props {
  event:         OuRegarderEvent
  selectedSpot?: string | null
  onSpotSelect?: (id: string) => void
}

export function EventMap({ event, selectedSpot, onSpotSelect }: Props) {
  const mapRef         = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const visLayerRef    = useRef<LayerGroup | null>(null)

  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [visibilityOn,  setVisibilityOn]  = useState(true)
  const [dataSource,    setDataSource]    = useState<'precomputed' | 'live' | null>(null)
  const [isStreetLevel, setIsStreetLevel] = useState(false)
  const [buildingCount, setBuildingCount] = useState(0)
  const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1')

  // ── Base map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    let map: LeafletMap | null = null

    import('leaflet').then((L) => {
      if (!mapRef.current) return

      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      map = L.map(mapRef.current!, {
        center: [event.location.lat, event.location.lng],
        zoom: 14,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, ' +
          '© <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      const tilePane = map.getPane('tilePane')
      if (tilePane) tilePane.style.filter = 'grayscale(0.5) brightness(1.1)'

      L.marker([event.location.lat, event.location.lng], {
        icon: L.divIcon({
          html: `<div style="width:36px;height:36px;background:#0f1e3c;border:2.5px solid #c8a96e;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 10px rgba(0,0,0,0.4)">⭐</div>`,
          className: '', iconSize: [36, 36], iconAnchor: [18, 18],
        }),
      }).addTo(map).bindPopup(`<strong>${event.location.name}</strong><br><em>Lieu de l'événement</em>`)

      if (event.visibilityAnalysis?.type === 'route' && event.visibilityAnalysis.routePoints) {
        L.polyline(
          event.visibilityAnalysis.routePoints.map(({ lat, lng }): [number, number] => [lat, lng]),
          { color: '#c8a96e', weight: 5, opacity: 0.85, dashArray: '8 4' },
        ).addTo(map)
      }

      event.viewingSpots.forEach((spot: ViewingSpot) => {
        const cfg = rankConfig[spot.rank]
        const sel = spot.id === selectedSpot
        const sz  = sel ? 44 : 34
        L.marker([spot.lat, spot.lng], {
          icon: L.divIcon({
            html: `<div style="width:${sz}px;height:${sz}px;background:${cfg.color};border:${sel ? '3px solid #c8a96e' : '2px solid white'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${sel ? 20 : 15}px;box-shadow:0 2px 10px rgba(0,0,0,0.35)">${cfg.emoji}</div>`,
            className: '', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
          }),
        })
          .addTo(map!)
          .bindPopup(
            `<div style="min-width:200px">` +
            `<strong style="font-size:14px">${spot.name}</strong>` +
            `<div style="margin:4px 0"><span style="background:${cfg.color}22;color:${cfg.color};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600">${cfg.label}</span></div>` +
            `<p style="font-size:12px;color:#666;margin:6px 0">${spot.notes}</p>` +
            `<p style="font-size:11px;color:#888">${spot.direction} · ${spot.distance}</p>` +
            `</div>`,
          )
          .on('click', () => onSpotSelect?.(spot.id))
      })

      mapInstanceRef.current = map
    })

    return () => { map?.remove(); mapInstanceRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Visibility analysis — runs once on mount ────────────────────────────────
  useEffect(() => {
    if (!event.visibilityAnalysis) return
    const analysis = event.visibilityAnalysis

    const run = async () => {
      // Wait for map to initialise
      for (let i = 0; i < 20; i++) {
        if (mapInstanceRef.current) break
        await new Promise(r => setTimeout(r, 200))
      }
      if (!mapInstanceRef.current) return

      const L   = await import('leaflet')
      const map = mapInstanceRef.current

      if (visLayerRef.current) visLayerRef.current.remove()
      const layer = L.layerGroup().addTo(map)
      visLayerRef.current = layer

      // For radial/route: shadows project from the fixed event source (Tour Eiffel, parade midpoint…).
      // For directional: source.lat is used only as trig correction for the longitude scale factor.
      const eventSource =
        analysis.type === 'route' && analysis.routePoints?.length
          ? analysis.routePoints[Math.floor(analysis.routePoints.length / 2)]
          : { lat: event.location.lat, lng: event.location.lng }
      const radius = analysis.radiusMeters ?? 2000

      const toObstacles = (raw: RawFeature[], shadowSrc: { lat: number; lng: number }): Obstacle[] =>
        raw.map(({ verts, height, isVeg }) => ({
          verts,
          shadow: computeShadow(analysis, shadowSrc, verts, height),
          isVeg,
          height,
        }))

      // ── Initial load: precomputed JSON → Overpass live fallback ─────────────
      let overviewObstacles: Obstacle[] = []
      let overviewSource: 'precomputed' | 'live' = 'live'
      setAnalysisState('loading')

      try {
        const precomp = await loadPrecomputed(event.slug)
        if (precomp?.length) {
          overviewObstacles = precomp
          overviewSource = 'precomputed'
        } else {
          // Precomputed file missing or empty — fetch live from Overpass
          const raw = await fetchOverpass(eventSource.lat, eventSource.lng, radius)
          overviewObstacles = toObstacles(raw, eventSource)
          if (overviewObstacles.length === 0) throw new Error('Overpass returned 0 elements')
          overviewSource = 'live'
        }
        renderObstacles(overviewObstacles, layer, L, analysis)
        setBuildingCount(overviewObstacles.length)
        setDataSource(overviewSource)
        setAnalysisState('done')
      } catch (err) {
        console.error('[EventMap] Initial load failed:', err)
        setAnalysisState('error')
        return
      }

      // ── Viewport-level refresh at zoom ≥ 15 ─────────────────────────────────
      // Fetches only buildings visible in the current viewport, recomputing shadows
      // from the fixed event source. Zooming out restores the overview layer.
      let debounce: ReturnType<typeof setTimeout> | null = null
      let lastKey = ''
      let streetLevel = false

      map.on('zoomend moveend', () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(async () => {
          const zoom = map.getZoom()

          if (zoom < 15) {
            if (!streetLevel) return
            streetLevel = false
            lastKey = ''
            setIsStreetLevel(false)
            renderObstacles(overviewObstacles, layer, L, analysis)
            setBuildingCount(overviewObstacles.length)
            setDataSource(overviewSource)
            setAnalysisState('done')
            return
          }

          // Radius = viewport half-diagonal + 150 m margin (covers all visible buildings)
          const center = map.getCenter()
          const { lat, lng } = center
          const ne = map.getBounds().getNorthEast()
          const latM = Math.abs(ne.lat - lat) * 111320
          const lngM = Math.abs(ne.lng - lng) * 111320 * Math.cos(lat * Math.PI / 180)
          const vpRadius = Math.ceil(Math.sqrt(latM * latM + lngM * lngM)) + 150

          const key = `${lat.toFixed(3)},${lng.toFixed(3)},${zoom}`
          if (key === lastKey) return
          lastKey = key
          streetLevel = true
          setIsStreetLevel(true)
          setAnalysisState('loading')

          try {
            const raw = await fetchOverpass(lat, lng, vpRadius)
            if (!visLayerRef.current || !mapInstanceRef.current) return
            // Directional: use viewport lat for trig correction only (sun angle is global).
            // Radial / route: always project from the fixed event source.
            const shadowSrc = analysis.type === 'directional' ? { lat, lng } : eventSource
            const obs = toObstacles(raw, shadowSrc)
            renderObstacles(obs, layer, L, analysis)
            setBuildingCount(obs.length)
            setDataSource('live')
            setAnalysisState('done')
          } catch (e) {
            console.warn('[EventMap] Viewport refresh failed:', e)
            // Non-fatal: existing layer stays visible, no error shown to user
            setAnalysisState('done')
          }
        }, 700)
      })
    }

    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleVisibility = () => {
    if (!visLayerRef.current || !mapInstanceRef.current) return
    if (visibilityOn) {
      visLayerRef.current.remove()
      setVisibilityOn(false)
    } else {
      visLayerRef.current.addTo(mapInstanceRef.current)
      setVisibilityOn(true)
    }
  }

  return (
    <div>
      <div ref={mapRef} className="w-full rounded-xl overflow-hidden" style={{ height: '520px' }} />

      {event.visibilityAnalysis && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {analysisState === 'loading' && (
            <span className="inline-flex items-center gap-2 text-xs text-gray-500">
              <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              {isStreetLevel ? 'Chargement du détail rue…' : 'Analyse de visibilité en cours…'}
            </span>
          )}

          {analysisState === 'done' && (
            <>
              <button
                onClick={toggleVisibility}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  visibilityOn
                    ? 'bg-[#0f1e3c] text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {visibilityOn ? "👁 Masquer l'analyse" : "👁 Afficher l'analyse"}
              </button>

              {isStreetLevel && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700 font-medium">
                  📍 Niveau rue
                </span>
              )}

              {visibilityOn && (
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-sm bg-red-600 opacity-60 inline-block" />
                    Ombre — intensité ∝ hauteur/événement
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-sm bg-gray-500 opacity-80 inline-block" />
                    Bâtiment
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-sm bg-green-600 opacity-60 inline-block" />
                    Végétation
                  </span>
                  <span className="text-gray-400 hidden sm:inline">· zones claires = vue dégagée</span>
                  {!isStreetLevel && (
                    <span className="text-gray-400 hidden sm:inline">· zoomez rue par rue pour le détail</span>
                  )}
                </div>
              )}

              {visibilityOn && (
                <div className="w-full text-[10px] text-gray-400 -mt-1">
                  Ombre légère = bâtiment plus court que l&apos;événement (vue possible par-dessus) · Ombre dense = obstruction totale
                </div>
              )}

              {event.visibilityAnalysis?.type === 'directional' && visibilityOn && (
                <div className="w-full mt-1 text-xs text-gray-500 flex items-center gap-1.5">
                  <span className="text-yellow-500">☀</span>
                  <span>
                    Direction soleil : <strong>SSO (219°)</strong> à <strong>51° de hauteur</strong> — regardez vers le sud-sud-ouest. Zones rouges = bâtiment bloque le soleil.
                  </span>
                </div>
              )}

              {isDebug && (
                <span className="text-[10px] font-mono text-gray-400 ml-auto">
                  [debug] {buildingCount} obstacles · {dataSource ?? '—'}{isStreetLevel ? ' · street' : ' · overview'}
                </span>
              )}
            </>
          )}

          {analysisState === 'error' && (
            <span className="text-xs text-red-400">
              Données indisponibles — vérifiez votre connexion
            </span>
          )}
        </div>
      )}
    </div>
  )
}
