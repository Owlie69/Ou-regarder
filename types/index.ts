export type EventCategory = 'bientot' | 'atemporel' | 'passe'
export type SpotRank = 'best' | 'good' | 'acceptable'

export interface ViewingSpot {
  id: string
  name: string
  rank: SpotRank
  lat: number
  lng: number
  direction: string
  distance: string
  notes: string
}

export interface EventLocation {
  lat: number
  lng: number
  name: string
}

export interface VisibilityAnalysis {
  /** 'radial': event at a point (fireworks). 'route': event along a path (parade). 'directional': sun-based (eclipse). */
  type: 'radial' | 'route' | 'directional'
  /** Height of the event above ground in metres (fireworks burst, parade floats, …). Radial + route only. */
  eventHeightMeters?: number
  /** Radius around fetch center to query buildings, metres. Default 2000. */
  radiusMeters?: number
  /** Route source points for 'route' type (parade path). */
  routePoints?: { lat: number; lng: number }[]
  /** Sun azimuth from North in degrees, for 'directional'. */
  sunAzimuthDeg?: number
  /** Sun elevation above horizon in degrees, for 'directional'. */
  sunElevationDeg?: number
  /** Minimum building height (m) to render a shadow. Useful for 'directional' to avoid micro-shadows. */
  minShadowHeightMeters?: number
}

export interface OuRegarderEvent {
  id: string
  slug: string
  name: string
  shortDescription: string
  longDescription: string
  category: EventCategory
  published: boolean
  date: string | null
  time: string | null
  recurrence: string | null
  imageUrl: string
  location: EventLocation
  viewingSpots: ViewingSpot[]
  sunEvent: boolean
  eventDateTime: string | null
  viewingTips: string[]
  seoTitle: string
  seoDescription: string
  tags: string[]
  venueFilterPlaceholder?: boolean
  visibilityAnalysis?: VisibilityAnalysis
}
