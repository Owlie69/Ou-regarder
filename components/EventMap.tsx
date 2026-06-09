'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, LayerGroup, LatLngBounds } from 'leaflet'
import type { OuRegarderEvent, ViewingSpot } from '@/types'
import type { MultiPolygon } from '@/lib/visibility-core'

// ── Data fetching ─────────────────────────────────────────────────────────────

interface RawFeature { verts: [number, number][]; height: number; isVeg: boolean }
interface Building   { verts: [number, number][]; isVeg: boolean }
interface Scene      { zone: MultiPolygon; buildings: Building[] }

function extractHeight(tags: Record<string, string>): number {
  if (tags.height) { const h = parseFloat(tags.height); if (h > 0) return h }
  if (tags['building:levels']) { const f = parseInt(tags['building:levels']); if (f > 0) return Math.round(f * 3.5) }
  return 17 // Haussmann baseline
}

/**
 * Load a precomputed visibility file: { z: MultiPolygon, b: [{f, v}] }.
 * Returns null if missing / empty / legacy-format so the live path takes over.
 */
async function loadPrecomputed(slug: string): Promise<Scene | null> {
  try {
    const base = typeof window !== 'undefined'
      ? window.location.pathname.split('/events/')[0].replace(/\/$/, '')
      : ''
    const resp = await fetch(`${base}/visibility/${slug}.json`)
    if (!resp.ok) return null
    const raw = await resp.json() as { z?: MultiPolygon; b?: Array<{ f: [number,number][]; v: 0|1 }> }
    if (!raw || !Array.isArray(raw.z) || !Array.isArray(raw.b)) return null
    if (raw.z.length === 0 && raw.b.length === 0) return null
    return {
      zone: raw.z,
      buildings: raw.b.map(d => ({ verts: d.f, isVeg: d.v === 1 })),
    }
  } catch { return null }
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

interface OverpassNode    { lat: number; lon: number }
interface OverpassElement { geometry?: OverpassNode[]; tags?: Record<string, string> }

/** Buildings + vegetation in one Overpass request (CORS-friendly, 3-endpoint failover). */
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
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

/**
 * Single-pass scene render:
 *  • one red MultiPolygon = the whole blocked zone (where the event is hidden)
 *  • building / vegetation footprints on top, but only at street zoom and only
 *    inside the current viewport (keeps thousands of polygons from rendering at once)
 */
function renderScene(
  scene: Scene,
  showBuildings: boolean,
  bounds: LatLngBounds | null,
  layer: LayerGroup,
  L: typeof import('leaflet'),
) {
  layer.clearLayers()

  if (scene.zone.length)
    L.polygon(scene.zone, {
      color: '#dc2626', weight: 0,
      fillColor: '#dc2626', fillOpacity: 0.32,
    }).addTo(layer)

  if (showBuildings) {
    for (const b of scene.buildings) {
      if (bounds && !b.verts.some(([la, ln]) => bounds.contains([la, ln]))) continue
      L.polygon(b.verts, {
        color:       b.isVeg ? '#15803d' : '#374151',
        weight:      0.5,
        fillColor:   b.isVeg ? '#16a34a' : '#6b7280',
        fillOpacity: b.isVeg ? 0.18 : 0.28,
      }).addTo(layer)
    }
  }
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

      map = L.map(mapRef.current!, { center: [event.location.lat, event.location.lng], zoom: 14 })

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

  // ── Visibility analysis — load once, render the unified blocked zone ─────────
  useEffect(() => {
    if (!event.visibilityAnalysis) return
    const analysis = event.visibilityAnalysis

    const run = async () => {
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

      const eventSource =
        analysis.type === 'route' && analysis.routePoints?.length
          ? analysis.routePoints[Math.floor(analysis.routePoints.length / 2)]
          : { lat: event.location.lat, lng: event.location.lng }
      const radius = analysis.radiusMeters ?? 2000

      // Load once: precomputed JSON, else compute live from Overpass with the SAME
      // shared core the precompute script uses. Everything then lives in memory.
      let scene: Scene
      let source: 'precomputed' | 'live'
      setAnalysisState('loading')
      try {
        const pre = await loadPrecomputed(event.slug)
        if (pre) {
          scene = pre
          source = 'precomputed'
        } else {
          const raw = await fetchOverpass(eventSource.lat, eventSource.lng, radius)
          if (raw.length === 0) throw new Error('Overpass returned 0 elements')
          const { computeBlockedZone } = await import('@/lib/visibility-core')
          scene = {
            zone: computeBlockedZone(analysis, eventSource, raw),
            buildings: raw.map(r => ({ verts: r.verts, isVeg: r.isVeg })),
          }
          source = 'live'
        }
      } catch (err) {
        console.error('[EventMap] Load failed:', err)
        setAnalysisState('error')
        return
      }

      // Draw = re-filter buildings to the current viewport. The zone is constant,
      // so pan/zoom never triggers any network or geometry work — it's instant.
      const draw = () => {
        const showBuildings = map.getZoom() >= 15
        const bounds = showBuildings ? map.getBounds().pad(0.3) : null
        renderScene(scene, showBuildings, bounds, layer, L)
        setBuildingCount(scene.buildings.length)
        setIsStreetLevel(showBuildings)
        setDataSource(source)
        setAnalysisState('done')
      }

      draw()
      let debounce: ReturnType<typeof setTimeout> | null = null
      map.on('zoomend moveend', () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(draw, 120)
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
              Chargement de la zone de visibilité… (une seule fois, puis instantané)
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
                    <span className="w-3 h-2.5 rounded-sm bg-red-600 opacity-50 inline-block" />
                    Zone rouge = vue bloquée
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-400">
                    zones claires = vue dégagée
                  </span>
                  {isStreetLevel && (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-2.5 rounded-sm bg-gray-500 opacity-80 inline-block" />
                        Bâtiment
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-2.5 rounded-sm bg-green-600 opacity-60 inline-block" />
                        Végétation
                      </span>
                    </>
                  )}
                  {!isStreetLevel && (
                    <span className="text-gray-400 hidden sm:inline">· zoomez pour voir les bâtiments</span>
                  )}
                </div>
              )}

              {event.visibilityAnalysis?.type === 'directional' && visibilityOn && (
                <div className="w-full mt-1 text-xs text-gray-500 flex items-center gap-1.5">
                  <span className="text-yellow-500">☀</span>
                  <span>
                    Direction soleil : <strong>SSO (219°)</strong> à <strong>51° de hauteur</strong> — regardez vers le sud-sud-ouest. Zones rouges = bâtiment devant le soleil.
                  </span>
                </div>
              )}

              {isDebug && (
                <span className="text-[10px] font-mono text-gray-400 ml-auto">
                  [debug] {buildingCount} bâtiments · {dataSource ?? '—'}{isStreetLevel ? ' · street' : ' · overview'}
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
