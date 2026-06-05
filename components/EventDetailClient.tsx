'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SunCompass } from '@/components/SunCompass'
import type { OuRegarderEvent, ViewingSpot } from '@/types'

const EventMap = dynamic(
  () => import('@/components/EventMap').then((m) => m.EventMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[420px] rounded-xl bg-gray-100 animate-pulse flex items-center justify-center text-gray-400 text-sm">
        Chargement de la carte…
      </div>
    ),
  }
)

const rankConfig = {
  best: { label: 'Meilleur spot', badgeClass: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500' },
  good: { label: 'Bon spot', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
  acceptable: { label: 'Acceptable', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
}

interface Props {
  event: OuRegarderEvent
}

export function EventDetailClient({ event }: Props) {
  const [selectedSpot, setSelectedSpot] = useState<string | null>(
    event.viewingSpots[0]?.id || null
  )
  const [saved, setSaved] = useState(false)

  const currentSpot = event.viewingSpots.find((s) => s.id === selectedSpot)

  return (
    <div className="space-y-8">
      {/* Map */}
      <section>
        <h2 className="text-lg font-semibold text-[#1a1a2e] mb-3 flex items-center gap-2">
          <MapPin size={18} className="text-[#c8a96e]" />
          Carte des spots
        </h2>
        <EventMap
          event={event}
          selectedSpot={selectedSpot}
          onSpotSelect={setSelectedSpot}
        />

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#0f1e3c] border border-[#c8a96e] inline-block" />
            Lieu de l'événement
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-600 inline-block" />
            Meilleur spot
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
            Bon spot
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-600 inline-block" />
            Acceptable
          </span>
        </div>
      </section>

      {/* Spots list */}
      <section>
        <h2 className="text-lg font-semibold text-[#1a1a2e] mb-3">Spots recommandés</h2>
        <div className="space-y-3">
          {event.viewingSpots.map((spot: ViewingSpot) => {
            const cfg = rankConfig[spot.rank]
            const isSelected = spot.id === selectedSpot
            return (
              <button
                key={spot.id}
                onClick={() => setSelectedSpot(spot.id)}
                className={cn(
                  'w-full text-left rounded-xl border p-4 transition-all duration-150',
                  isSelected
                    ? 'border-[#c8a96e] bg-amber-50 shadow-sm'
                    : 'border-gray-100 bg-white hover:border-gray-200'
                )}
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2.5 h-2.5 rounded-full mt-0.5 shrink-0', cfg.dot)} />
                    <span className="font-semibold text-[#1a1a2e] text-sm">{spot.name}</span>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0',
                      cfg.badgeClass
                    )}
                  >
                    {cfg.label}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed pl-4">{spot.notes}</p>
                <div className="flex gap-4 mt-2 pl-4 text-xs text-gray-400">
                  <span>↗ {spot.direction}</span>
                  <span>· {spot.distance}</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Selected spot detail */}
      {currentSpot && (
        <section className="bg-[#0f1e3c] text-white rounded-xl p-5">
          <h3 className="text-[#c8a96e] text-xs font-semibold uppercase tracking-wide mb-1">
            Spot sélectionné
          </h3>
          <h4 className="font-bold text-lg mb-2">{currentSpot.name}</h4>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">{currentSpot.notes}</p>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-gray-400 text-xs">Direction</span>
              <p className="font-medium">{currentSpot.direction}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Distance</span>
              <p className="font-medium">{currentSpot.distance}</p>
            </div>
          </div>
        </section>
      )}

      {/* Sun compass (only for sun events with a fixed datetime) */}
      {event.sunEvent && event.eventDateTime && (
        <SunCompass
          eventDateTime={event.eventDateTime}
          lat={event.location.lat}
          lng={event.location.lng}
          eventName={event.name}
        />
      )}

      {/* Sun event without fixed time */}
      {event.sunEvent && !event.eventDateTime && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
          <h3 className="font-semibold text-[#1a1a2e] mb-2 flex items-center gap-2">
            ☀️ Événement solaire
          </h3>
          <p className="text-sm text-gray-600">
            Cet événement dépend de la position du soleil. Utilisez une application comme{' '}
            <strong>PhotoPills</strong> ou <strong>SunSurveyor</strong> pour calculer
            précisément l'azimut et l'heure selon la date choisie.
          </p>
        </div>
      )}

      {/* Viewing tips */}
      {event.viewingTips.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-[#1a1a2e] mb-3">
            💡 Conseils pratiques
          </h2>
          <ul className="space-y-2">
            {event.viewingTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                <span className="text-[#c8a96e] font-bold mt-0.5 shrink-0">→</span>
                {tip}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Placeholder: Bar/venue filters */}
      <section className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
          🍻 Bars & Établissements à proximité
        </h2>
        <p className="text-sm text-gray-400 italic">
          Fonctionnalité à venir — Trouvez les bars qui retransmettent l'événement,
          avec filtre par budget et note.
        </p>
      </section>

      {/* Placeholder: Geolocation */}
      <section className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
          📍 Spots près de vous
        </h2>
        <p className="text-sm text-gray-400 italic">
          Fonctionnalité à venir — Activez la géolocalisation pour voir les spots
          classés par proximité.
        </p>
      </section>

      {/* Save button */}
      <button
        onClick={() => setSaved(!saved)}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200',
          saved
            ? 'bg-[#c8a96e] text-white'
            : 'bg-white border-2 border-[#c8a96e] text-[#c8a96e] hover:bg-[#c8a96e] hover:text-white'
        )}
      >
        <Heart size={16} className={saved ? 'fill-white' : ''} />
        {saved ? 'Spot enregistré !' : 'Enregistrer ce spot'}
      </button>
    </div>
  )
}
