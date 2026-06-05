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
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Radial shadow: project footprint away from a point source. */
function radialShadow(
  eLat: number, eLng: number, eH: number,
  verts: [number, number][], bH: number,
): [number, number][] {
  if (bH <= 0 || verts.length < 3) return []
  const sf = Math.min(bH >= eH ? 25 : eH / (eH - bH), 25)
  const tips: [number, number][] = verts.map(([lat, lng]) => [
    eLat + sf * (lat - eLat),
    eLng + sf * (lng - eLng),
  ])
  return convexHull([...verts, ...tips])
}

/**
 * Route shadow: union of radial shadows from every point on the parade route.
 * Returns the convex hull of all individual shadows.
 */
function routeShadow(
  routePoints: { lat: number; lng: number }[],
  eH: number,
  verts: [number, number][],
  bH: number,
): [number, number][] {
  if (bH <= 0 || verts.length < 3 || routePoints.length === 0) return []
  const allPts: [number, number][] = [...verts]
  for (const { lat, lng } of routePoints) {
    allPts.push(...radialShadow(lat, lng, eH, verts, bH))
  }
  return convexHull(allPts)
}

/**
 * Directional shadow: project footprint along sun shadow direction.
 * Shadow direction = azimuth + 180°. Length = bH / tan(elevation).
 */
function directionalShadow(
  sunAzDeg: number,
  sunElDeg: number,
  verts: [number, number][],
  bH: number,
  centerLat: number,
): [number, number][] {
  if (bH <= 0 || verts.length < 3) return []
  const shadowAzRad = ((sunAzDeg + 180) % 360) * (Math.PI / 180)
  const shadowLen = bH / Math.tan(sunElDeg * (Math.PI / 180))
  const dlatM = Math.cos(shadowAzRad) / 111320
  const dlngM = Math.sin(shadowAzRad) / (111320 * Math.cos((centerLat * Math.PI) / 180))
  const tips: [number, number][] = verts.map(([lat, lng]) => [
    lat + shadowLen * dlatM,
    lng + shadowLen * dlngM,
  ])
  return convexHull([...verts, ...tips])
}

function computeShadow(
  analysis: VisibilityAnalysis,
  fetchCenter: { lat: number; lng: number },
  verts: [number, number][],
  bH: number,
): [number, number][] {
  if (analysis.type === 'radial') {
    return radialShadow(fetchCenter.lat, fetchCenter.lng, analysis.eventHeightMeters ?? 10, verts, bH)
  }
  if (analysis.type === 'route' && analysis.routePoints) {
    return routeShadow(analysis.routePoints, analysis.eventHeightMeters ?? 5, verts, bH)
  }
  if (analysis.type === 'directional') {
    const minH = analysis.minShadowHeightMeters ?? 0
    if (bH < minH) return []
    return directionalShadow(
      analysis.sunAzimuthDeg ?? 0,
      analysis.sunElevationDeg ?? 45,
      verts, bH, fetchCenter.lat,
    )
  }
  return []
}

// ── Data fetching ─────────────────────────────────────────────────────────────

interface ParisBuilding {
  hauteur: number | null
  geo_shape: {
    type: string
    coordinates: number[][][] | number[][][][]
  }
}

/**
 * Fetch building footprints + measured heights from Paris Open Data 3D.
 * Uses the volumesbatisparis dataset — actual LiDAR-measured heights.
 * GeoJSON coords are [lng, lat]; we flip to [lat, lng] for Leaflet.
 */
async function fetchParisBuildings(
  lat: number,
  lng: number,
  radius: number,
): Promise<Array<{ verts: [number, number][]; height: number }>> {
  const where = `distance(geo_point_2d,geom'POINT(${lng} ${lat})',${radius}m)`
  const url =
    `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/volumesbatisparis/exports/json` +
    `?where=${encodeURIComponent(where)}&select=hauteur%2Cgeo_shape`

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Paris OD ${resp.status}`)
  const data: ParisBuilding[] = await resp.json()

  const result: Array<{ verts: [number, number][]; height: number }> = []

  for (const b of data) {
    if (!b.geo_shape) continue
    const height = typeof b.hauteur === 'number' && b.hauteur > 0 ? b.hauteur : 17

    // Handle Polygon and MultiPolygon; take outer ring of first polygon
    let ring: number[][] | undefined
    if (b.geo_shape.type === 'Polygon') {
      ring = (b.geo_shape.coordinates as number[][][])[0]
    } else if (b.geo_shape.type === 'MultiPolygon') {
      ring = (b.geo_shape.coordinates as number[][][][])[0]?.[0]
    }
    if (!ring || ring.length < 3) continue

    // GeoJSON is [lng, lat] → flip to [lat, lng] for Leaflet
    const verts: [number, number][] = ring.map(([lo, la]) => [la, lo])
    result.push({ verts, height })
  }

  return result
}

interface OverpassNode { lat: number; lon: number }
interface OverpassElement {
  type: string
  geometry?: OverpassNode[]
  tags?: Record<string, string>
}

/** Fetch trees / wooded areas from Overpass (not in Paris OD dataset). */
async function fetchVegetation(
  lat: number,
  lng: number,
  radius: number,
): Promise<Array<{ verts: [number, number][]; height: number }>> {
  const query =
    `[out:json][timeout:30];` +
    `(way["natural"="wood"](around:${radius},${lat},${lng});` +
    `way["landuse"="forest"](around:${radius},${lat},${lng});` +
    `way["leisure"="park"](around:${radius},${lat},${lng}););` +
    `out geom;`

  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }).toString(),
  })
  if (!resp.ok) throw new Error(`Overpass ${resp.status}`)
  const data: { elements: OverpassElement[] } = await resp.json()

  return data.elements
    .filter((el) => el.geometry && el.geometry.length >= 3)
    .map((el) => ({
      verts: el.geometry!.map((g) => [g.lat, g.lon] as [number, number]),
      height: 12,
    }))
}

// ── Component ─────────────────────────────────────────────────────────────────

const rankConfig = {
  best:       { color: '#16a34a', label: 'Meilleur spot', emoji: '🥇' },
  good:       { color: '#2563eb', label: 'Bon spot',      emoji: '🥈' },
  acceptable: { color: '#d97706', label: 'Acceptable',    emoji: '🥉' },
}

interface Props {
  event: OuRegarderEvent
  selectedSpot?: string | null
  onSpotSelect?: (id: string) => void
}

export function EventMap({ event, selectedSpot, onSpotSelect }: Props) {
  const mapRef         = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const visLayerRef    = useRef<LayerGroup | null>(null)
  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [visibilityOn,  setVisibilityOn]  = useState(true)

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

      // Light desaturation — keeps colored overlays vivid
      const tilePane = map.getPane('tilePane')
      if (tilePane) tilePane.style.filter = 'grayscale(0.5) brightness(1.1)'

      // Event marker
      L.marker([event.location.lat, event.location.lng], {
        icon: L.divIcon({
          html: `<div style="width:36px;height:36px;background:#0f1e3c;border:2.5px solid #c8a96e;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 10px rgba(0,0,0,0.4)">⭐</div>`,
          className: '', iconSize: [36, 36], iconAnchor: [18, 18],
        }),
      })
        .addTo(map)
        .bindPopup(`<strong>${event.location.name}</strong><br><em>Lieu de l'événement</em>`)

      // Parade route polyline
      if (event.visibilityAnalysis?.type === 'route' && event.visibilityAnalysis.routePoints) {
        const pts = event.visibilityAnalysis.routePoints.map(
          ({ lat, lng }): [number, number] => [lat, lng],
        )
        L.polyline(pts, { color: '#c8a96e', weight: 5, opacity: 0.85, dashArray: '8 4' }).addTo(map)
      }

      // Viewing spot markers
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

    return () => {
      map?.remove()
      mapInstanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Visibility analysis — auto-runs on mount ────────────────────────────────
  useEffect(() => {
    if (!event.visibilityAnalysis) return
    const analysis = event.visibilityAnalysis

    const run = async () => {
      // Wait for the Leaflet map to initialise
      for (let i = 0; i < 15; i++) {
        if (mapInstanceRef.current) break
        await new Promise((r) => setTimeout(r, 300))
      }
      if (!mapInstanceRef.current) return

      setAnalysisState('loading')

      try {
        const { lat, lng } = event.location
        const radius = analysis.radiusMeters ?? 2000

        const fetchCenter =
          analysis.type === 'route' && analysis.routePoints?.length
            ? analysis.routePoints[Math.floor(analysis.routePoints.length / 2)]
            : { lat, lng }

        // Fetch buildings (real heights) + vegetation in parallel
        const [buildings, vegetation] = await Promise.allSettled([
          fetchParisBuildings(fetchCenter.lat, fetchCenter.lng, radius),
          fetchVegetation(fetchCenter.lat, fetchCenter.lng, radius),
        ])

        const allObstacles: Array<{ verts: [number, number][]; height: number; isVeg: boolean }> = []

        if (buildings.status === 'fulfilled') {
          for (const b of buildings.value) {
            allObstacles.push({ ...b, isVeg: false })
          }
        }
        if (vegetation.status === 'fulfilled') {
          for (const v of vegetation.value) {
            allObstacles.push({ ...v, isVeg: true })
          }
        }

        if (allObstacles.length === 0) throw new Error('No obstacle data returned')

        const L   = await import('leaflet')
        const map = mapInstanceRef.current
        if (!map) return

        if (visLayerRef.current) visLayerRef.current.remove()
        const layer = L.layerGroup().addTo(map)
        visLayerRef.current = layer

        for (const { verts, height, isVeg } of allObstacles) {
          // Building / vegetation footprint
          L.polygon(verts, {
            color:       isVeg ? '#15803d' : '#374151',
            weight:      0.6,
            fillColor:   isVeg ? '#16a34a' : '#6b7280',
            fillOpacity: isVeg ? 0.22 : 0.38,
          }).addTo(layer)

          // Shadow polygon
          const shadow = computeShadow(analysis, fetchCenter, verts, height)
          if (shadow.length >= 3) {
            L.polygon(shadow, {
              color:       'transparent',
              weight:      0,
              fillColor:   '#dc2626',
              fillOpacity: 0.16,
            }).addTo(layer)
          }
        }

        setAnalysisState('done')
      } catch (err) {
        console.error('Visibility analysis:', err)
        setAnalysisState('error')
      }
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
              Analyse de visibilité en cours…
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

              {visibilityOn && (
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-sm bg-red-600 opacity-60 inline-block" />
                    Vue bloquée
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-sm bg-gray-500 opacity-80 inline-block" />
                    Bâtiment
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2.5 rounded-sm bg-green-600 opacity-60 inline-block" />
                    Végétation
                  </span>
                  <span className="text-gray-400">· zones claires = vue dégagée</span>
                </div>
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
