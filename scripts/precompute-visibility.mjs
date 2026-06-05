#!/usr/bin/env node
/**
 * Precomputes visibility shadow polygons using real building heights from
 * Paris Open Data (volumesbatisparis) + vegetation from Overpass.
 *
 * Run with:  node scripts/precompute-visibility.mjs
 * Output:    public/visibility/<slug>.json
 *
 * Commit the output files so the map can skip the live API call.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR   = join(__dirname, '..', 'public', 'visibility')

// ── Geometry ──────────────────────────────────────────────────────────────────

function convexHull(pts) {
  if (pts.length < 3) return pts
  const s = [...pts].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1])
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

function radialShadow(eLat, eLng, eH, verts, bH) {
  if (bH <= 0 || verts.length < 3) return []
  const sf = Math.min(bH >= eH ? 25 : eH / (eH - bH), 25)
  const tips = verts.map(([lat, lng]) => [eLat + sf * (lat - eLat), eLng + sf * (lng - eLng)])
  return convexHull([...verts, ...tips])
}

function routeShadow(routePoints, eH, verts, bH) {
  if (bH <= 0 || verts.length < 3) return []
  const allPts = [...verts]
  for (const { lat, lng } of routePoints)
    allPts.push(...radialShadow(lat, lng, eH, verts, bH))
  return convexHull(allPts)
}

function directionalShadow(sunAzDeg, sunElDeg, verts, bH, centerLat, minH = 0) {
  if (bH < minH || verts.length < 3) return []
  const azRad = ((sunAzDeg + 180) % 360) * Math.PI / 180
  const len   = bH / Math.tan(sunElDeg * Math.PI / 180)
  const dlat  = Math.cos(azRad) / 111320
  const dlng  = Math.sin(azRad) / (111320 * Math.cos(centerLat * Math.PI / 180))
  const tips  = verts.map(([lat, lng]) => [lat + len * dlat, lng + len * dlng])
  return convexHull([...verts, ...tips])
}

// ── Paris Open Data — real building heights ───────────────────────────────────

async function fetchParisBuildings(lat, lng, radius) {
  const where = `distance(geo_point_2d,geom'POINT(${lng} ${lat})',${radius}m)`
  const url   =
    `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/volumesbatisparis/exports/json` +
    `?where=${encodeURIComponent(where)}&select=hauteur%2Cgeo_shape`

  process.stdout.write(`  Paris OD buildings (${radius}m)… `)
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Paris OD HTTP ${resp.status}`)
  const data = await resp.json()
  console.log(`${data.length} records`)

  const result = []
  for (const b of data) {
    if (!b.geo_shape) continue
    const height = typeof b.hauteur === 'number' && b.hauteur > 0 ? b.hauteur : 17
    let ring
    if (b.geo_shape.type === 'Polygon')      ring = b.geo_shape.coordinates[0]
    if (b.geo_shape.type === 'MultiPolygon') ring = b.geo_shape.coordinates[0]?.[0]
    if (!ring || ring.length < 3) continue
    // GeoJSON [lng, lat] → [lat, lng]
    result.push({ verts: ring.map(([lo, la]) => [la, lo]), height, isVeg: false })
  }
  return result
}

// ── Overpass — vegetation only ────────────────────────────────────────────────

async function fetchVegetation(lat, lng, radius) {
  const query =
    `[out:json][timeout:30];` +
    `(way["natural"="wood"](around:${radius},${lat},${lng});` +
    `way["landuse"="forest"](around:${radius},${lat},${lng});` +
    `way["leisure"="park"](around:${radius},${lat},${lng}););` +
    `out geom;`

  process.stdout.write(`  Overpass vegetation (${radius}m)… `)
  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }).toString(),
  })
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`)
  const data = await resp.json()
  console.log(`${data.elements.length} elements`)

  return data.elements
    .filter(el => el.geometry?.length >= 3)
    .map(el => ({
      verts: el.geometry.map(g => [g.lat, g.lon]),
      height: 12,
      isVeg: true,
    }))
}

// ── Event definitions ─────────────────────────────────────────────────────────

const EVENTS = [
  {
    slug:        'feux-artifice-14-juillet',
    fetchCenter: { lat: 48.8584, lng: 2.2945 },
    radius:      2500,
    compute:     (verts, h) => radialShadow(48.8584, 2.2945, 320, verts, h),
  },
  {
    slug:        'defile-14-juillet',
    fetchCenter: { lat: 48.8697, lng: 2.3081 },
    radius:      900,
    compute:     (verts, h) => routeShadow([
      { lat: 48.8737, lng: 2.2950 }, { lat: 48.8729, lng: 2.2976 },
      { lat: 48.8721, lng: 2.3002 }, { lat: 48.8713, lng: 2.3028 },
      { lat: 48.8705, lng: 2.3055 }, { lat: 48.8697, lng: 2.3081 },
      { lat: 48.8689, lng: 2.3107 }, { lat: 48.8681, lng: 2.3133 },
      { lat: 48.8673, lng: 2.3159 }, { lat: 48.8665, lng: 2.3185 },
      { lat: 48.8656, lng: 2.3212 },
    ], 5, verts, h),
  },
  {
    slug:        'eclipse-solaire-2026',
    fetchCenter: { lat: 48.8566, lng: 2.3522 },
    radius:      1500,
    // Sun 12 Aug 2026 11:24 local → az 219°, el 51°; only tall buildings matter
    compute:     (verts, h) => directionalShadow(219, 51, verts, h, 48.8566, 20),
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  for (const ev of EVENTS) {
    console.log(`\n▸ ${ev.slug}`)
    const { lat, lng } = ev.fetchCenter

    const [buildings, vegetation] = await Promise.allSettled([
      fetchParisBuildings(lat, lng, ev.radius),
      fetchVegetation(lat, lng, ev.radius),
    ])

    const obstacles = []
    for (const src of [buildings, vegetation]) {
      if (src.status !== 'fulfilled') { console.warn('  Source failed:', src.reason); continue }
      for (const { verts, height, isVeg } of src.value) {
        const shadow = ev.compute(verts, height)
        // Compact keys: f=footprint, s=shadow, v=vegetation flag
        obstacles.push({ f: verts, s: shadow, v: isVeg ? 1 : 0 })
      }
    }

    const json    = JSON.stringify(obstacles)
    const outPath = join(OUT_DIR, `${ev.slug}.json`)
    writeFileSync(outPath, json)
    const kb = Math.round(Buffer.byteLength(json) / 1024)
    console.log(`  ✓ ${obstacles.length} obstacles → ${ev.slug}.json (${kb} KB)`)
  }

  console.log('\n✓ Done — commit public/visibility/*.json')
}

main().catch(e => { console.error(e); process.exit(1) })
