'use client'

import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { OuRegarderEvent, ViewingSpot } from '@/types'

type Status = 'loading' | 'ready' | 'no-data' | 'error'

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

export function EclipseMap({ event, selectedSpot, onSpotSelect }: Props) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const [status,        setStatus]        = useState<Status>('loading')
  const [heatmapOn,     setHeatmapOn]     = useState(false)
  const [heatmapExists, setHeatmapExists] = useState(false)
  const [zoneCount,     setZoneCount]     = useState(0)
  const mapRef          = useRef<import('maplibre-gl').Map | null>(null)

  const assets = event.visibilityAnalysis?.pregeneratedAssets
  const base   = typeof window !== 'undefined'
    ? window.location.pathname.split('/events/')[0].replace(/\/$/, '')
    : ''

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !assets) return

    const zonesUrl  = `${base}/${assets.zonesPath}`
    const heatUrl   = assets.heatmapPath ? `${base}/${assets.heatmapPath}` : null
    const boundsUrl = assets.boundsPath  ? `${base}/${assets.boundsPath}`  : null

    let map: import('maplibre-gl').Map | null = null

    import('maplibre-gl').then((mgl) => {
      if (!containerRef.current || mapRef.current) return

      map = new mgl.Map({
        container: containerRef.current,
        style:     { version: 8, sources: {}, layers: [] },
        center:    [event.location.lng, event.location.lat],
        zoom:      11,
        attributionControl: false,
      })
      mapRef.current = map

      map.addControl(new mgl.NavigationControl({ showCompass: false }), 'top-left')
      map.addControl(new mgl.AttributionControl({ compact: true }), 'bottom-right')

      map.on('load', async () => {
        if (!map) return

        // ── CartoDB Positron raster tiles (matches the Leaflet maps) ──────────
        map.addSource('carto', {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, © <a href="https://carto.com/attributions">CARTO</a>',
        })
        map.addLayer({ id: 'basemap', type: 'raster', source: 'carto',
          paint: { 'raster-saturation': -0.5, 'raster-brightness-max': 1.1 } })

        // ── Load zones GeoJSON ─────────────────────────────────────────────────
        let zones: GeoJSON.FeatureCollection
        try {
          const resp = await fetch(zonesUrl)
          if (!resp.ok) throw new Error(`${resp.status}`)
          zones = await resp.json() as GeoJSON.FeatureCollection
        } catch {
          setStatus('error')
          return
        }

        const hasZones = Array.isArray(zones.features) && zones.features.length > 0
        setZoneCount(zones.features?.length ?? 0)

        if (!hasZones) {
          setStatus('no-data')
          // Still show the base map with markers — data just isn't generated yet
        }

        // ── Visibility zones (green = can see eclipse) ─────────────────────────
        map.addSource('zones', { type: 'geojson', data: zones })
        map.addLayer({
          id: 'zones-fill', type: 'fill', source: 'zones',
          paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.38 },
        })
        map.addLayer({
          id: 'zones-line', type: 'line', source: 'zones',
          paint: { 'line-color': '#16a34a', 'line-width': 1.2, 'line-opacity': 0.7 },
        })

        // ── Heatmap PNG overlay (minutes of visibility) ────────────────────────
        if (heatUrl && boundsUrl) {
          try {
            const b = await fetch(boundsUrl).then(r => r.json()) as { bounds4326: [number,number,number,number] }
            const [W, S, E, N] = b.bounds4326
            map.addSource('heatmap', {
              type: 'image',
              url: heatUrl,
              coordinates: [[W, N], [E, N], [E, S], [W, S]],
            })
            map.addLayer({
              id: 'heatmap-layer', type: 'raster', source: 'heatmap',
              paint: { 'raster-opacity': 0 },
            })
            setHeatmapExists(true)
          } catch { /* no heatmap, not fatal */ }
        }

        if (hasZones) setStatus('ready')

        // ── Sun direction indicator ────────────────────────────────────────────
        const az = event.visibilityAnalysis?.sunAzimuthDeg ?? 284
        const el = event.visibilityAnalysis?.sunElevationDeg ?? 7.6
        const sunEl = document.createElement('div')
        sunEl.className = 'sun-direction-label'
        sunEl.innerHTML = `
          <div style="background:rgba(255,200,0,0.92);color:#1a1a00;padding:4px 8px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3)">
            ☀ Soleil : ${az}° ONO · ${el}° hauteur
          </div>`
        new mgl.Marker({ element: sunEl, anchor: 'center' })
          .setLngLat([event.location.lng, event.location.lat])
          .addTo(map)
      })

      // ── Event location marker ──────────────────────────────────────────────
      const evEl = document.createElement('div')
      evEl.style.cssText = 'width:36px;height:36px;background:#0f1e3c;border:2.5px solid #c8a96e;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 10px rgba(0,0,0,0.4);cursor:pointer'
      evEl.textContent = '⭐'
      new mgl.Marker({ element: evEl, anchor: 'center' })
        .setLngLat([event.location.lng, event.location.lat])
        .setPopup(
          new mgl.Popup({ offset: 20 })
            .setHTML(`<strong>${event.location.name}</strong><br><em>Maximum de l'éclipse · 20h17 CEST</em>`)
        )
        .addTo(map)

      // ── Viewing spot markers ───────────────────────────────────────────────
      event.viewingSpots.forEach((spot: ViewingSpot) => {
        const cfg = rankConfig[spot.rank]
        const sel = spot.id === selectedSpot
        const sz  = sel ? 44 : 34
        const el  = document.createElement('div')
        el.style.cssText = `width:${sz}px;height:${sz}px;background:${cfg.color};border:${sel ? '3px solid #c8a96e' : '2px solid white'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${sel ? 20 : 15}px;box-shadow:0 2px 10px rgba(0,0,0,0.35);cursor:pointer`
        el.textContent = cfg.emoji
        el.addEventListener('click', () => onSpotSelect?.(spot.id))
        new mgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([spot.lng, spot.lat])
          .setPopup(
            new mgl.Popup({ offset: 20, maxWidth: '240px' })
              .setHTML(
                `<div style="padding:2px 0">` +
                `<strong style="font-size:13px">${spot.name}</strong>` +
                `<div style="margin:4px 0"><span style="background:${cfg.color}22;color:${cfg.color};padding:1px 6px;border-radius:99px;font-size:10px;font-weight:700">${cfg.label}</span></div>` +
                `<p style="font-size:11px;color:#555;margin:4px 0 2px">${spot.notes}</p>` +
                `<p style="font-size:10px;color:#888">${spot.direction}</p>` +
                `</div>`
              )
          )
          .addTo(map!)
      })
    })

    return () => {
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync heatmap opacity when toggled
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('heatmap-layer')) return
    map.setPaintProperty('heatmap-layer', 'raster-opacity', heatmapOn ? 0.55 : 0)
  }, [heatmapOn])

  return (
    <div>
      <div ref={containerRef} className="w-full rounded-xl overflow-hidden" style={{ height: '520px' }} />

      {/* Status + controls */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {status === 'loading' && (
          <span className="inline-flex items-center gap-2 text-xs text-gray-500">
            <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Chargement de la carte…
          </span>
        )}

        {status === 'no-data' && (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            <strong>Données de visibilité non encore générées.</strong> Exécutez{' '}
            <code className="bg-amber-100 px-1 rounded font-mono">
              npm run generate:eclipse
            </code>{' '}
            pour calculer les zones (nécessite Python + rasterio + shapely).
          </div>
        )}

        {status === 'error' && (
          <span className="text-xs text-red-400">Impossible de charger les données — vérifiez votre connexion</span>
        )}

        {(status === 'ready' || status === 'no-data') && (
          <>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2.5 rounded-sm bg-green-600 opacity-60 inline-block" />
                Zone de visibilité {zoneCount > 0 ? `(${zoneCount} polygones)` : ''}
              </span>
              <span className="flex items-center gap-1.5 text-gray-400">
                zones non colorées = vue bloquée par les bâtiments
              </span>
            </div>

            {heatmapExists && (
              <button
                onClick={() => setHeatmapOn(v => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  heatmapOn
                    ? 'bg-amber-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                🌡 {heatmapOn ? 'Masquer' : 'Voir'} la carte de chaleur (minutes de visibilité)
              </button>
            )}

            <div className="w-full text-xs text-gray-500 flex items-center gap-1.5">
              <span className="text-yellow-500 text-base">☀</span>
              <span>
                12 août 2026 · maximum à <strong>20h17 CEST</strong> · soleil à{' '}
                <strong>284° (ONO)</strong>, <strong>7,6° de hauteur</strong> ·
                {' '}92 % de couverture · vue libre vers l&apos;horizon ONO indispensable
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
