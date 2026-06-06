#!/usr/bin/env node
/**
 * Precomputes visibility shadow polygons for every event with visibilityAnalysis.
 *
 * Building data: Paris Open Data (volumesbatisparis, real LiDAR heights) with
 *   automatic Overpass fallback when Paris OD is unavailable from CI.
 * Vegetation: Overpass API only.
 *
 * Run:  node scripts/precompute-visibility.mjs
 * CI:   called in .github/workflows/deploy.yml before Next.js build
 * Out:  public/visibility/<slug>.json
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR   = join(__dirname, '..', 'public', 'visibility')

// ── Geometry ──────────────────────────────────────────────────────────────────

const r5 = ([lat, lng]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]

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
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].map(r5)
}

function radialShadow(eLat, eLng, eH, verts, bH) {
  if (bH <= 0 || verts.length < 3) return []
  const sf = Math.min(bH >= eH ? 25 : eH / (eH - bH), 25)
  return convexHull([...verts, ...verts.map(([lat, lng]) => [eLat + sf * (lat - eLat), eLng + sf * (lng - eLng)])])
}

function routeShadow(routePoints, eH, verts, bH) {
  if (bH <= 0 || verts.length < 3) return []
  const all = [...verts]
  for (const { lat, lng } of routePoints) all.push(...radialShadow(lat, lng, eH, verts, bH))
  return convexHull(all)
}

function directionalShadow(sunAzDeg, sunElDeg, verts, bH, centerLat) {
  if (bH <= 0 || verts.length < 3) return []
  const azRad = ((sunAzDeg + 180) % 360) * Math.PI / 180
  const len   = bH / Math.tan(sunElDeg * Math.PI / 180)
  const dlat  = Math.cos(azRad) / 111320
  const dlng  = Math.sin(azRad) / (111320 * Math.cos(centerLat * Math.PI / 180))
  return convexHull([...verts, ...verts.map(([lat, lng]) => [lat + len * dlat, lng + len * dlng])])
}

// ── Height helpers ─────────────────────────────────────────────────────────────

function extractHeight(tags = {}) {
  if (tags.height) { const h = parseFloat(tags.height); if (h > 0) return h }
  if (tags['building:levels']) { const f = parseInt(tags['building:levels']); if (f > 0) return Math.round(f * 3.5) }
  return 17  // Haussmann baseline
}

// ── Paris Open Data — LiDAR building heights ──────────────────────────────────

async function fetchParisBuildings(lat, lng, radius) {
  const where = `distance(geo_point_2d,geom'POINT(${lng} ${lat})',${radius})`
  const url =
    'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/volumesbatisparis/exports/json' +
    `?where=${encodeURIComponent(where)}&select=hauteur%2Cgeo_shape&limit=100000`

  process.stdout.write(`  Paris OD buildings (${radius} m)… `)
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'ou-regarder-precompute/1.0' },
    signal: AbortSignal.timeout(90_000),
  })
  if (!resp.ok) throw new Error(`Paris OD HTTP ${resp.status}`)
  const data = await resp.json()
  console.log(`${data.length} buildings`)
  if (data.length === 0) throw new Error('Paris OD returned 0 buildings')

  const out = []
  for (const b of data) {
    if (!b.geo_shape) continue
    const height = typeof b.hauteur === 'number' && b.hauteur > 0 ? b.hauteur : 17
    let ring
    if      (b.geo_shape.type === 'Polygon')      ring = b.geo_shape.coordinates[0]
    else if (b.geo_shape.type === 'MultiPolygon') ring = b.geo_shape.coordinates[0]?.[0]
    if (!ring || ring.length < 3) continue
    out.push({ verts: ring.map(([lo, la]) => r5([la, lo])), height, isVeg: false })
  }
  return out
}

// ── Overpass — buildings (fallback) + vegetation ──────────────────────────────

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

async function overpassPost(query, label) {
  process.stdout.write(`  Overpass ${label}… `)
  let lastErr
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept':        'application/json',
          'User-Agent':    'ou-regarder-precompute/1.0',
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(90_000),
      })
      if (!resp.ok) { lastErr = new Error(`Overpass HTTP ${resp.status} (${endpoint})`); continue }
      const json = await resp.json()
      console.log(`${json.elements.length} elements`)
      return json.elements
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

async function fetchOverpassBuildings(lat, lng, radius) {
  const query =
    `[out:json][timeout:60];` +
    `way["building"](around:${radius},${lat},${lng});` +
    `out body geom qt;`
  const elements = await overpassPost(query, `buildings fallback (${radius} m)`)
  return elements
    .filter(el => el.geometry?.length >= 3)
    .map(el => ({
      verts:  el.geometry.map(g => r5([g.lat, g.lon])),
      height: extractHeight(el.tags),
      isVeg:  false,
    }))
}

async function fetchVegetation(lat, lng, radius) {
  const query =
    `[out:json][timeout:40];` +
    `(way["natural"="wood"](around:${radius},${lat},${lng});` +
    `way["landuse"="forest"](around:${radius},${lat},${lng});` +
    `way["leisure"="park"](around:${radius},${lat},${lng}););` +
    `out body geom;`
  const elements = await overpassPost(query, `vegetation (${radius} m)`)
  return elements
    .filter(el => el.geometry?.length >= 3)
    .map(el => ({
      verts:  el.geometry.map(g => r5([g.lat, g.lon])),
      height: 12,
      isVeg:  true,
    }))
}

// ── Event definitions ─────────────────────────────────────────────────────────

const ROUTE_CHAMPS = [
  { lat: 48.8737, lng: 2.2950 }, { lat: 48.8729, lng: 2.2976 },
  { lat: 48.8721, lng: 2.3002 }, { lat: 48.8713, lng: 2.3028 },
  { lat: 48.8705, lng: 2.3055 }, { lat: 48.8697, lng: 2.3081 },
  { lat: 48.8689, lng: 2.3107 }, { lat: 48.8681, lng: 2.3133 },
  { lat: 48.8673, lng: 2.3159 }, { lat: 48.8665, lng: 2.3185 },
  { lat: 48.8656, lng: 2.3212 },
]

/**
 * To add a new event:
 *   1. Add an entry here with slug, fetchCenter, radius, and compute function.
 *   2. Add visibilityAnalysis to data/events.json.
 *   3. Run this script — public/visibility/<slug>.json is generated.
 */
const EVENTS = [
  {
    slug:        'feux-artifice-14-juillet',
    fetchCenter: { lat: 48.8584, lng: 2.2945 },
    radius:      2500,
    compute:     (v, h) => radialShadow(48.8584, 2.2945, 320, v, h),
  },
  {
    slug:        'defile-14-juillet',
    fetchCenter: { lat: 48.8697, lng: 2.3081 },
    radius:      900,
    compute:     (v, h) => routeShadow(ROUTE_CHAMPS, 5, v, h),
  },
  {
    slug:        'eclipse-solaire-2026',
    // 12 Aug 2026, 11:24 local → sun azimuth 219°, elevation 51°
    // 8 m building → 6.5 m shadow (covers a full sidewalk); 17 m → 13.8 m (full street width)
    fetchCenter: { lat: 48.8566, lng: 2.3522 },
    radius:      1500,
    compute:     (v, h) => directionalShadow(219, 51, v, h, 48.8566),
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  for (const ev of EVENTS) {
    console.log(`\n▸ ${ev.slug}`)
    const { lat, lng } = ev.fetchCenter

    // Buildings: Paris OD (real LiDAR heights) with Overpass fallback
    let buildings = []
    try {
      buildings = await fetchParisBuildings(lat, lng, ev.radius)
    } catch (e) {
      console.warn(`  Paris OD failed (${e.message}), trying Overpass buildings…`)
      try {
        buildings = await fetchOverpassBuildings(lat, lng, ev.radius)
      } catch (e2) {
        console.warn(`  Overpass buildings also failed: ${e2.message}`)
      }
    }

    // Vegetation: Overpass only
    let vegetation = []
    try {
      vegetation = await fetchVegetation(lat, lng, ev.radius)
    } catch (e) {
      console.warn(`  Vegetation failed: ${e.message}`)
    }

    const obstacles = []
    for (const { verts, height } of buildings)
      obstacles.push({ f: verts, s: ev.compute(verts, height), v: 0, h: Math.round(height) })
    for (const { verts, height } of vegetation)
      obstacles.push({ f: verts, s: ev.compute(verts, height), v: 1, h: Math.round(height) })

    const json    = JSON.stringify(obstacles)
    const outPath = join(OUT_DIR, `${ev.slug}.json`)
    writeFileSync(outPath, json)
    const kb = Math.round(Buffer.byteLength(json) / 1024)
    console.log(`  ✓ ${obstacles.length} obstacles (${buildings.length} buildings, ${vegetation.length} vegetation) → ${ev.slug}.json (${kb} KB)`)
  }

  console.log('\n✓ All done — commit public/visibility/*.json')
}

main().catch(e => { console.error(e); process.exit(1) })
