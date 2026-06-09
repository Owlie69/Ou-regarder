/**
 * Shared visibility geometry — used by BOTH the browser (components/EventMap.tsx)
 * and the CI precompute script (scripts/precompute-visibility.mjs).
 *
 * The headline output is a single "blocked zone": the union of every building's
 * occlusion shadow = the entire area from which the event cannot be seen.
 *
 * Coordinate convention throughout: [lat, lng] (matches Leaflet).
 * polygon-clipping is purely topological, so using lat/lng as x/y is fine.
 */

import polygonClipping from 'polygon-clipping'

// ── Convex hull (Andrew's monotone chain) ──────────────────────────────────────

export function convexHull(pts) {
  if (pts.length < 3) return pts
  const s = [...pts].sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]))
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of s) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

// ── Per-building occlusion shadows ──────────────────────────────────────────────

/**
 * Radial (point-source) umbra. An observer behind a building can see an event of
 * height eH at point E iff their sight-line clears the building top.
 * The umbra extends to distance r_B · eH/(eH−bH) from E (capped to avoid infinities
 * when bH ≈ eH). For a tall event (e.g. 320 m fireworks) short buildings barely
 * cast any shadow → almost everywhere can see it, which is physically correct.
 */
function radialShadow(eLat, eLng, eH, verts, bH) {
  if (bH <= 0 || verts.length < 3) return []
  const sf = Math.min(bH >= eH ? 40 : eH / (eH - bH), 40)
  return convexHull([
    ...verts,
    ...verts.map(([lat, lng]) => [eLat + sf * (lat - eLat), eLng + sf * (lng - eLng)]),
  ])
}

/**
 * Directional (solar) shadow. shadowLen = bH / tan(elevation), cast in the
 * anti-sun azimuth. The union of these is exactly where the sun (and thus a
 * partial eclipse) is hidden behind buildings.
 */
function directionalShadow(sunAzDeg, sunElDeg, verts, bH, centerLat) {
  if (bH <= 0 || verts.length < 3) return []
  const azRad = ((sunAzDeg + 180) % 360) * Math.PI / 180
  const len   = bH / Math.tan(sunElDeg * Math.PI / 180)
  const dlat  = Math.cos(azRad) / 111320
  const dlng  = Math.sin(azRad) / (111320 * Math.cos(centerLat * Math.PI / 180))
  return convexHull([
    ...verts,
    ...verts.map(([lat, lng]) => [lat + len * dlat, lng + len * dlng]),
  ])
}

// ── Boolean polygon ops (robust, batched) ──────────────────────────────────────

const r5 = ([lat, lng]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]

/** Round a MultiPolygon to ~1 m and drop consecutive duplicate vertices. */
function roundMultiPolygon(mp) {
  return mp.map(poly =>
    poly.map(ring => {
      const out = []
      for (const p of ring) {
        const q = r5(p)
        const last = out[out.length - 1]
        if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q)
      }
      return out
    }).filter(ring => ring.length >= 3),
  ).filter(poly => poly.length > 0)
}

/**
 * Union an array of rings into one MultiPolygon, hierarchically in small batches
 * so polygon-clipping never has to swallow thousands of polygons at once.
 * If any batch throws on degenerate input, its members are kept un-merged so the
 * blocked area is never silently lost.
 */
function unionRings(rings) {
  let level = rings.filter(r => r.length >= 3).map(r => [r]) // each → Polygon [ring]
  if (level.length === 0) return []
  const BATCH = 60
  while (level.length > 1) {
    const next = []
    for (let i = 0; i < level.length; i += BATCH) {
      const slice = level.slice(i, i + BATCH)
      try {
        next.push(polygonClipping.union(slice[0], ...slice.slice(1)))
      } catch {
        for (const s of slice) next.push(s)
      }
    }
    level = next
  }
  return level[0]
}

function intersect(a, b) {
  if (!a.length || !b.length) return []
  try { return polygonClipping.intersection(a, b) } catch { return [] }
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Compute the unified blocked zone (a MultiPolygon of [lat,lng] rings) for an
 * event given its analysis config, a shadow source, and the surrounding features.
 *
 * @param analysis  { type, eventHeightMeters?, routePoints?, sunAzimuthDeg?, sunElevationDeg?, minShadowHeightMeters? }
 * @param source    { lat, lng } — fixed event position (radial) or trig-correction lat (directional)
 * @param features  [{ verts: [lat,lng][], height: number }]
 * @returns MultiPolygon — array of polygons, each [outerRing, ...holes]
 */
export function computeBlockedZone(analysis, source, features) {
  if (analysis.type === 'directional') {
    const az = analysis.sunAzimuthDeg ?? 0
    const el = analysis.sunElevationDeg ?? 45
    const minH = analysis.minShadowHeightMeters ?? 0
    const rings = []
    for (const f of features) {
      if (f.height < minH) continue
      const s = directionalShadow(az, el, f.verts, f.height, source.lat)
      if (s.length >= 3) rings.push(s)
    }
    return roundMultiPolygon(unionRings(rings))
  }

  if (analysis.type === 'route' && analysis.routePoints?.length) {
    // Observer can't see the parade only if blocked from EVERY route point →
    // intersection over route points of (union of shadows from that point).
    const eH = analysis.eventHeightMeters ?? 5
    // Sub-sample very long routes to keep the boolean ops tractable.
    const pts = sampleRoute(analysis.routePoints, 8)
    let acc = null
    for (const rp of pts) {
      const rings = []
      for (const f of features) {
        const s = radialShadow(rp.lat, rp.lng, eH, f.verts, f.height)
        if (s.length >= 3) rings.push(s)
      }
      const mp = unionRings(rings)
      acc = acc === null ? mp : intersect(acc, mp)
      if (!acc.length) break
    }
    return roundMultiPolygon(acc ?? [])
  }

  // radial
  const eH = analysis.eventHeightMeters ?? 10
  const rings = []
  for (const f of features) {
    const s = radialShadow(source.lat, source.lng, eH, f.verts, f.height)
    if (s.length >= 3) rings.push(s)
  }
  return roundMultiPolygon(unionRings(rings))
}

function sampleRoute(points, max) {
  if (points.length <= max) return points
  const step = (points.length - 1) / (max - 1)
  const out = []
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)])
  return out
}
