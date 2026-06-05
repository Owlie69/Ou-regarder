export interface SunPosition {
  azimuthDeg: number
  elevationDeg: number
  azimuthLabel: string
}

export function getSunPosition(date: Date, lat: number, lng: number): SunPosition {
  // Dynamically loaded on client side — stub for server-side references
  // Real calculation happens in the client SunCompass component via suncalc
  return {
    azimuthDeg: 0,
    elevationDeg: 0,
    azimuthLabel: '',
  }
}

export function azimuthToLabel(deg: number): string {
  const directions = [
    { label: 'Nord', min: 337.5, max: 360 },
    { label: 'Nord', min: 0, max: 22.5 },
    { label: 'Nord-Nord-Est', min: 22.5, max: 45 },
    { label: 'Nord-Est', min: 45, max: 67.5 },
    { label: 'Est-Nord-Est', min: 67.5, max: 90 },
    { label: 'Est', min: 90, max: 112.5 },
    { label: 'Est-Sud-Est', min: 112.5, max: 135 },
    { label: 'Sud-Est', min: 135, max: 157.5 },
    { label: 'Sud-Sud-Est', min: 157.5, max: 180 },
    { label: 'Sud', min: 180, max: 202.5 },
    { label: 'Sud-Sud-Ouest', min: 202.5, max: 225 },
    { label: 'Sud-Ouest', min: 225, max: 247.5 },
    { label: 'Ouest-Sud-Ouest', min: 247.5, max: 270 },
    { label: 'Ouest', min: 270, max: 292.5 },
    { label: 'Ouest-Nord-Ouest', min: 292.5, max: 315 },
    { label: 'Nord-Ouest', min: 315, max: 337.5 },
  ]
  const d = ((deg % 360) + 360) % 360
  for (const dir of directions) {
    if (dir.min <= d && d < dir.max) return dir.label
  }
  return 'Nord'
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
