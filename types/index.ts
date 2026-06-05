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
  eventHeightMeters: number
  radiusMeters?: number
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
