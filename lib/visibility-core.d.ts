export type Ring = [number, number][]
export type Polygon = Ring[]
export type MultiPolygon = Polygon[]

export interface VisibilityFeature {
  verts: [number, number][]
  height: number
}

export interface AnalysisLike {
  type: 'radial' | 'route' | 'directional'
  eventHeightMeters?: number
  routePoints?: { lat: number; lng: number }[]
  sunAzimuthDeg?: number
  sunElevationDeg?: number
  minShadowHeightMeters?: number
}

export function convexHull(pts: [number, number][]): [number, number][]

export function computeBlockedZone(
  analysis: AnalysisLike,
  source: { lat: number; lng: number },
  features: VisibilityFeature[],
): MultiPolygon
