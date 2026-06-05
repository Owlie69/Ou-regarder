'use client'

import { useEffect, useState } from 'react'
import { azimuthToLabel } from '@/lib/sun'

interface SunData {
  azimuthDeg: number
  elevationDeg: number
  label: string
  isVisible: boolean
}

interface Props {
  eventDateTime: string
  lat: number
  lng: number
  eventName: string
}

export function SunCompass({ eventDateTime, lat, lng, eventName }: Props) {
  const [sun, setSun] = useState<SunData | null>(null)

  useEffect(() => {
    import('suncalc').then((SunCalc) => {
      const date = new Date(eventDateTime)
      const pos = SunCalc.default.getPosition(date, lat, lng)

      // suncalc azimuth: 0 = south, going westward
      // Convert to compass bearing: N=0, E=90, S=180, W=270
      const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180 + 360) % 360
      const elevationDeg = (pos.altitude * 180) / Math.PI
      const isVisible = elevationDeg > 0

      setSun({
        azimuthDeg,
        elevationDeg,
        label: azimuthToLabel(azimuthDeg),
        isVisible,
      })
    })
  }, [eventDateTime, lat, lng])

  if (!sun) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        Calcul en cours…
      </div>
    )
  }

  const needleRotation = sun.azimuthDeg

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="font-semibold text-[#1a1a2e] mb-4 text-sm uppercase tracking-wide">
        ☀️ Position du soleil
      </h3>

      <div className="flex items-center gap-6">
        {/* Compass rose */}
        <div className="relative w-24 h-24 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Outer circle */}
            <circle cx="50" cy="50" r="47" fill="#f8f8f6" stroke="#e5e7eb" strokeWidth="2" />
            {/* Cardinal points */}
            <text x="50" y="12" textAnchor="middle" fontSize="9" fontWeight="700" fill="#374151">N</text>
            <text x="50" y="94" textAnchor="middle" fontSize="9" fontWeight="700" fill="#374151">S</text>
            <text x="8" y="54" textAnchor="middle" fontSize="9" fontWeight="700" fill="#374151">O</text>
            <text x="92" y="54" textAnchor="middle" fontSize="9" fontWeight="700" fill="#374151">E</text>
            {/* Tick marks */}
            {Array.from({ length: 8 }, (_, i) => {
              const angle = (i * 45 * Math.PI) / 180
              const x1 = 50 + 40 * Math.sin(angle)
              const y1 = 50 - 40 * Math.cos(angle)
              const x2 = 50 + 44 * Math.sin(angle)
              const y2 = 50 - 44 * Math.cos(angle)
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d1d5db" strokeWidth="1.5" />
            })}
            {/* Sun needle */}
            <g transform={`rotate(${needleRotation}, 50, 50)`}>
              <line x1="50" y1="50" x2="50" y2="12" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="50" cy="12" r="4" fill="#f59e0b" />
              <line x1="50" y1="50" x2="50" y2="80" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" />
            </g>
            {/* Center dot */}
            <circle cx="50" cy="50" r="4" fill="#0f1e3c" />
          </svg>
        </div>

        {/* Data */}
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-gray-500 text-xs">Direction</span>
            <p className="font-semibold text-[#1a1a2e]">
              {sun.label} ({Math.round(sun.azimuthDeg)}°)
            </p>
          </div>
          <div>
            <span className="text-gray-500 text-xs">Élévation</span>
            <p className="font-semibold text-[#1a1a2e]">
              {Math.round(sun.elevationDeg)}° au-dessus de l'horizon
            </p>
          </div>
          <div>
            <span className="text-gray-500 text-xs">Visibilité</span>
            <p className={`font-semibold ${sun.isVisible ? 'text-green-600' : 'text-gray-500'}`}>
              {sun.isVisible ? '☀️ Soleil visible' : "🌙 Sous l'horizon"}
            </p>
          </div>
        </div>
      </div>

      {sun.isVisible && (
        <p className="mt-4 text-xs text-gray-500 bg-amber-50 rounded-lg p-3 border border-amber-100">
          À l'heure de l'événement, le soleil sera en direction{' '}
          <strong>{sun.label}</strong> à{' '}
          <strong>{Math.round(sun.elevationDeg)}°</strong> d'élévation.
          Positionnez-vous en ayant le soleil dans cette direction.
        </p>
      )}
    </div>
  )
}
