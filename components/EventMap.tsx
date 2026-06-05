'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, LayerGroup } from 'leaflet'
import type { OuRegarderEvent, ViewingSpot } from '@/types'

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Andrew's monotone chain — returns convex hull of [lat, lng] points. */
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

/** Estimate obstacle height from OSM tags. Defaults to Haussmann average for Paris. */
function heightFromTags(tags: Record<string, string>): number {
  const pf = (v?: string) => (v ? parseFloat(v) : NaN)
  const h = pf(tags.height) || pf(tags['building:height'])
  if (!isNaN(h) && h > 0) return h
  const lvl = parseInt(tags['building:levels'] || tags.levels || '')
  if (!isNaN(lvl) && lvl > 0) return lvl * 3.5
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 15
  return 17 // typical Haussmann block, Paris
}

/**
 * Compute the shadow polygon cast by a building onto the ground plane,
 * where the "light source" is the event at (eLat, eLng) at height eH metres.
 *
 * For a viewer at ground level looking toward the event, any point inside
 * this polygon may have their line of sight blocked by this building.
 *
 * Shadow scale factor:  sf = eH / (eH − bH)
 *   • bH < eH → sf > 1, shadow extends moderately past the building
 *   • bH ≥ eH → complete occlusion; shadow reaches to "infinity" (capped at 25×)
 *
 * The result is the convex hull of (original footprint ∪ projected shadow tips).
 */
function shadowPolygon(
  eLat: number,
  eLng: number,
  eH: number,
  verts: [number, number][],
  bH: number,
): [number, number][] {
  if (bH <= 0 || verts.length < 3) return []
  const sf = Math.min(bH >= eH ? 25 : eH / (eH - bH), 25)
  const tips: [number, number][] = verts.map(([lat, lng]) => [
    eLat + sf * (lat - eLat),
    eLng + sf * (lng - eLng),
  ])
  return convexHull([...verts, ...tips])
}

// ── Map component ─────────────────────────────────────────────────────────────

interface OverpassNode { lat: number; lon: number }
interface OverpassElement {
  type: string
  id: number
  geometry?: OverpassNode[]
  tags?: Record<string, string>
}

const rankConfig = {
  best: { color: '#16a34a', label: 'Meilleur spot', emoji: '🥇' },
  good: { color: '#2563eb', label: 'Bon spot', emoji: '🥈' },
  acceptable: { color: '#d97706', label: 'Acceptable', emoji: '🥉' },
}

interface Props {
  event: OuRegarderEvent
  selectedSpot?: string | null
  onSpotSelect?: (id: string) => void
}

export function EventMap({ event, selectedSpot, onSpotSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const visLayerRef = useRef<LayerGroup | null>(null)
  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [visibilityOn, setVisibilityOn] = useState(false)

  // ── Base map setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    let map: LeafletMap | null = null

    import('leaflet').then((L) => {
      if (!mapRef.current) return

      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      map = L.map(mapRef.current!, {
        center: [event.location.lat, event.location.lng],
        zoom: 14,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
          '© <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      // B&W tile layer
      const tilePane = map.getPane('tilePane')
      if (tilePane) tilePane.style.filter = 'grayscale(1) contrast(1.15)'

      // Event location marker
      L.marker([event.location.lat, event.location.lng], {
        icon: L.divIcon({
          html: `<div style="width:36px;height:36px;background:#0f1e3c;border:2.5px solid #c8a96e;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 10px rgba(0,0,0,0.4)">⭐</div>`,
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      })
        .addTo(map)
        .bindPopup(`<strong>${event.location.name}</strong><br><em>Lieu de l'événement</em>`)

      // Viewing spot markers
      event.viewingSpots.forEach((spot: ViewingSpot) => {
        const cfg = rankConfig[spot.rank]
        const sel = spot.id === selectedSpot
        const sz = sel ? 44 : 34
        L.marker([spot.lat, spot.lng], {
          icon: L.divIcon({
            html: `<div style="width:${sz}px;height:${sz}px;background:${cfg.color};border:${sel ? '3px solid #c8a96e' : '2px solid white'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${sel ? 20 : 15}px;box-shadow:0 2px 10px rgba(0,0,0,0.35)">${cfg.emoji}</div>`,
            className: '',
            iconSize: [sz, sz],
            iconAnchor: [sz / 2, sz / 2],
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

  // ── Visibility analysis ───────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (!event.visibilityAnalysis || !mapInstanceRef.current) return
    setAnalysisState('loading')
    setVisibilityOn(true)

    try {
      const { lat, lng } = event.location
      const eH = event.visibilityAnalysis.eventHeightMeters
      const radius = event.visibilityAnalysis.radiusMeters ?? 2000

      const query =
        `[out:json][timeout:35];` +
        `(way["building"](around:${radius},${lat},${lng});` +
        `way["natural"="wood"](around:${radius},${lat},${lng});` +
        `way["landuse"="forest"](around:${radius},${lat},${lng}););` +
        `out geom;`

      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
      })
      if (!resp.ok) throw new Error(`Overpass ${resp.status}`)
      const data: { elements: OverpassElement[] } = await resp.json()

      const L = await import('leaflet')
      const map = mapInstanceRef.current
      if (!map) return

      if (visLayerRef.current) visLayerRef.current.remove()
      const layer = L.layerGroup().addTo(map)
      visLayerRef.current = layer

      for (const el of data.elements) {
        if (!el.geometry || el.geometry.length < 3) continue
        // Overpass geometry uses lon; Leaflet polygon takes [lat, lng]
        const verts: [number, number][] = el.geometry.map((g) => [g.lat, g.lon])
        const isVeg = el.tags?.natural === 'wood' || el.tags?.landuse === 'forest'
        const bH = isVeg ? 15 : heightFromTags(el.tags ?? {})

        // Building / vegetation footprint
        L.polygon(verts, {
          color: isVeg ? '#15803d' : '#374151',
          weight: 0.8,
          fillColor: isVeg ? '#16a34a' : '#6b7280',
          fillOpacity: isVeg ? 0.3 : 0.45,
        }).addTo(layer)

        // Shadow zone: area where the building blocks line-of-sight to the event
        const shadow = shadowPolygon(lat, lng, eH, verts, bH)
        if (shadow.length >= 3) {
          L.polygon(shadow, {
            color: 'transparent',
            weight: 0,
            fillColor: '#dc2626',
            fillOpacity: 0.15,
          }).addTo(layer)
        }
      }

      setAnalysisState('done')
    } catch (err) {
      console.error('Visibility analysis:', err)
      setAnalysisState('error')
    }
  }, [event])

  const toggleVisibility = () => {
    if (analysisState === 'idle') {
      runAnalysis()
      return
    }
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
          <button
            onClick={toggleVisibility}
            disabled={analysisState === 'loading'}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-wait ${
              visibilityOn && analysisState === 'done'
                ? 'bg-[#0f1e3c] text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {analysisState === 'loading' ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Chargement des bâtiments…
              </>
            ) : visibilityOn ? (
              '👁 Masquer l\'analyse'
            ) : (
              '🔍 Analyser la visibilité'
            )}
          </button>

          {analysisState === 'done' && visibilityOn && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-sm bg-red-600 opacity-60 inline-block" />
                Zone bloquée
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-sm bg-gray-500 opacity-80 inline-block" />
                Bâtiment
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-sm bg-green-600 opacity-60 inline-block" />
                Végétation
              </span>
              <span className="text-gray-400">
                · zones claires = vue dégagée
              </span>
            </div>
          )}

          {analysisState === 'error' && (
            <button
              onClick={runAnalysis}
              className="text-xs text-red-500 hover:text-red-700 underline"
            >
              Erreur — réessayer
            </button>
          )}
        </div>
      )}
    </div>
  )
}
