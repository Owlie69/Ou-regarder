'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { OuRegarderEvent, ViewingSpot } from '@/types'

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
  const mapInstanceRef = useRef<unknown>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    let map: ReturnType<typeof import('leaflet')['map']> | null = null

    import('leaflet').then((L) => {
      if (!mapRef.current) return

      // Fix default icon paths for Next.js
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      map = L.map(mapRef.current!, {
        center: [event.location.lat, event.location.lng],
        zoom: 14,
        zoomControl: true,
      })

      // CartoDB Positron — clean minimal tiles with transit lines, then greyscaled
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
          '© <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      // Apply greyscale + slight contrast boost to the tile layer
      const tilePane = map.getPane('tilePane')
      if (tilePane) {
        tilePane.style.filter = 'grayscale(1) contrast(1.15)'
      }

      // Event location marker (star)
      const eventIcon = L.divIcon({
        html: `<div style="
          width: 36px; height: 36px;
          background: #0f1e3c;
          border: 2.5px solid #c8a96e;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        ">⭐</div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

      L.marker([event.location.lat, event.location.lng], { icon: eventIcon })
        .addTo(map)
        .bindPopup(`<strong>${event.location.name}</strong><br><em>Lieu de l'événement</em>`)

      // Viewing spot markers
      event.viewingSpots.forEach((spot: ViewingSpot) => {
        const cfg = rankConfig[spot.rank]
        const isSelected = spot.id === selectedSpot

        const spotIcon = L.divIcon({
          html: `<div style="
            width: ${isSelected ? 44 : 34}px;
            height: ${isSelected ? 44 : 34}px;
            background: ${cfg.color};
            border: ${isSelected ? '3px solid #c8a96e' : '2px solid white'};
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: ${isSelected ? 20 : 15}px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.35);
            transition: all 0.2s;
          ">${cfg.emoji}</div>`,
          className: '',
          iconSize: [isSelected ? 44 : 34, isSelected ? 44 : 34],
          iconAnchor: [isSelected ? 22 : 17, isSelected ? 22 : 17],
        })

        const marker = L.marker([spot.lat, spot.lng], { icon: spotIcon }).addTo(map!)
        marker.bindPopup(`
          <div style="min-width: 200px;">
            <strong style="font-size: 14px;">${spot.name}</strong>
            <div style="margin: 4px 0;">
              <span style="
                background: ${cfg.color}22;
                color: ${cfg.color};
                padding: 2px 8px;
                border-radius: 99px;
                font-size: 11px;
                font-weight: 600;
              ">${cfg.label}</span>
            </div>
            <p style="font-size: 12px; color: #666; margin: 6px 0;">${spot.notes}</p>
            <p style="font-size: 11px; color: #888;">${spot.direction} · ${spot.distance}</p>
          </div>
        `)

        marker.on('click', () => {
          onSpotSelect?.(spot.id)
        })
      })

      mapInstanceRef.current = map
    })

    return () => {
      if (map) {
        map.remove()
        mapInstanceRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={mapRef}
      className="w-full rounded-xl overflow-hidden"
      style={{ height: '520px' }}
    />
  )
}
