#!/usr/bin/env node
/**
 * Precomputes the unified "blocked zone" (where the event cannot be seen) for
 * every event with a visibilityAnalysis.
 *
 * Building data: Paris Open Data (volumesbatisparis, real LiDAR heights) with an
 *   automatic Overpass fallback. Vegetation: Overpass.
 * The blocked zone (union of all occlusion shadows) is computed by the shared
 *   lib/visibility-core.mjs — the exact same code the browser uses live.
 *
 * Run:  node scripts/precompute-visibility.mjs
 * CI:   called in .github/workflows/deploy.yml before the Next.js build
 * Out:  public/visibility/<slug>.json  →  { z: MultiPolygon, b: [{f,v}] }
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { computeBlockedZone } from '../lib/visibility-core.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR   = join(__dirname, '..', 'public', 'visibility')

const r5 = ([lat, lng]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]

function extractHeight(tags = {}) {
  if (tags.height) { const h = parseFloat(tags.height); if (h > 0) return h }
  if (tags['building:levels']) { const f = parseInt(tags['building:levels']); if (f > 0) return Math.round(f * 3.5) }
  return 17 // Haussmann baseline
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
    signal: AbortSignal.timeout(120_000),
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
        signal: AbortSignal.timeout(120_000),
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
    `[out:json][timeout:120];` +
    `way["building"](around:${radius},${lat},${lng});` +
    `out body geom qt;`
  const elements = await overpassPost(query, `buildings fallback (${radius} m)`)
  return elements
    .filter(el => el.geometry?.length >= 3)
    .map(el => ({ verts: el.geometry.map(g => r5([g.lat, g.lon])), height: extractHeight(el.tags), isVeg: false }))
}

async function fetchVegetation(lat, lng, radius) {
  const query =
    `[out:json][timeout:60];` +
    `(way["natural"="wood"](around:${radius},${lat},${lng});` +
    `way["landuse"="forest"](around:${radius},${lat},${lng});` +
    `way["leisure"="park"](around:${radius},${lat},${lng}););` +
    `out body geom;`
  const elements = await overpassPost(query, `vegetation (${radius} m)`)
  return elements
    .filter(el => el.geometry?.length >= 3)
    .map(el => ({ verts: el.geometry.map(g => r5([g.lat, g.lon])), height: 12, isVeg: true }))
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
 *   1. Add an entry here (slug, fetchCenter, radius, analysis).
 *   2. Add the matching visibilityAnalysis to data/events.json.
 *   3. Run this script → public/visibility/<slug>.json is regenerated.
 *
 * `analysis` is passed verbatim to computeBlockedZone, so the precomputed zone
 * is identical to what the browser would compute live.
 */
const EVENTS = [
  {
    slug:        'feux-artifice-14-juillet',
    fetchCenter: { lat: 48.8584, lng: 2.2945 },
    radius:      3500,
    source:      { lat: 48.8584, lng: 2.2945 },
    analysis:    { type: 'radial', eventHeightMeters: 320 },
  },
  {
    slug:        'defile-14-juillet',
    fetchCenter: { lat: 48.8697, lng: 2.3081 },
    radius:      900,
    source:      { lat: 48.8697, lng: 2.3081 },
    analysis:    { type: 'route', eventHeightMeters: 5, routePoints: ROUTE_CHAMPS },
  },
  {
    slug:        'eclipse-solaire-2026',
    // 12 Aug 2026, 11:24 local → sun azimuth 219°, elevation 51°
    fetchCenter: { lat: 48.8566, lng: 2.3522 },
    radius:      2500,
    source:      { lat: 48.8566, lng: 2.3522 },
    analysis:    { type: 'directional', sunAzimuthDeg: 219, sunElevationDeg: 51 },
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  for (const ev of EVENTS) {
    console.log(`\n▸ ${ev.slug}`)
    const { lat, lng } = ev.fetchCenter

    let buildings = []
    try {
      buildings = await fetchParisBuildings(lat, lng, ev.radius)
    } catch (e) {
      console.warn(`  Paris OD failed (${e.message}), trying Overpass buildings…`)
      try { buildings = await fetchOverpassBuildings(lat, lng, ev.radius) }
      catch (e2) { console.warn(`  Overpass buildings also failed: ${e2.message}`) }
    }

    let vegetation = []
    try { vegetation = await fetchVegetation(lat, lng, ev.radius) }
    catch (e) { console.warn(`  Vegetation failed: ${e.message}`) }

    const features = [...buildings, ...vegetation]
    process.stdout.write(`  Computing blocked zone from ${features.length} features… `)
    const zone = computeBlockedZone(ev.analysis, ev.source, features)
    console.log(`${zone.length} polygons`)

    const b = features.map(f => ({ f: f.verts, v: f.isVeg ? 1 : 0 }))
    const json = JSON.stringify({ z: zone, b })
    writeFileSync(join(OUT_DIR, `${ev.slug}.json`), json)
    const kb = Math.round(Buffer.byteLength(json) / 1024)
    console.log(`  ✓ ${b.length} buildings, zone of ${zone.length} polygons → ${ev.slug}.json (${kb} KB)`)
  }

  console.log('\n✓ All done — commit public/visibility/*.json')
}

main().catch(e => { console.error(e); process.exit(1) })
