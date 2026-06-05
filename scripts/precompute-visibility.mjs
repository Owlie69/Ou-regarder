#!/usr/bin/env node
/**
 * Precomputes building/vegetation shadow polygons for visibility analysis.
 * Run once (or after event data changes) with:
 *   node scripts/precompute-visibility.mjs
 * Output: public/visibility/<slug>.json
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'visibility')

// ── Geometry ──────────────────────────────────────────────────────────────────

function convexHull(pts) {
  if (pts.length < 3) return pts
  const s = [...pts].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1])
  const cross = (o, a, b) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function heightFromTags(tags = {}) {
  const pf = v => (v ? parseFloat(v) : NaN)
  const h = pf(tags.height) || pf(tags['building:height'])
  if (!isNaN(h) && h > 0) return h
  const lvl = parseInt(tags['building:levels'] || tags.levels || '')
  if (!isNaN(lvl) && lvl > 0) return lvl * 3.5
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 15
  return 17 // Haussmann default
}

/** Radial shadow from a point source (fireworks, parade position). */
function radialShadow(eLat, eLng, eH, verts, bH) {
  if (bH <= 0 || verts.length < 3) return []
  const sf = Math.min(bH >= eH ? 25 : eH / (eH - bH), 25)
  const tips = verts.map(([lat, lng]) => [eLat + sf * (lat - eLat), eLng + sf * (lng - eLng)])
  return convexHull([...verts, ...tips])
}

/**
 * Directional shadow from sun.
 * Only computed for buildings taller than minHeightM to avoid thousands
 * of tiny shadows cluttering the eclipse map.
 */
function directionalShadow(sunAzDeg, sunElDeg, verts, bH, centerLat, minHeightM = 0) {
  if (bH <= minHeightM || verts.length < 3) return []
  const shadowAzRad = ((sunAzDeg + 180) % 360) * (Math.PI / 180)
  const shadowLen = bH / Math.tan(sunElDeg * (Math.PI / 180)) // metres
  const dlatM = Math.cos(shadowAzRad) / 111320
  const dlngM = Math.sin(shadowAzRad) / (111320 * Math.cos(centerLat * Math.PI / 180))
  const tips = verts.map(([lat, lng]) => [lat + shadowLen * dlatM, lng + shadowLen * dlngM])
  return convexHull([...verts, ...tips])
}

// ── Overpass API ──────────────────────────────────────────────────────────────

async function fetchBuildings(lat, lng, radius) {
  const query =
    `[out:json][timeout:60];` +
    `(way["building"](around:${radius},${lat},${lng});` +
    `way["natural"="wood"](around:${radius},${lat},${lng});` +
    `way["landuse"="forest"](around:${radius},${lat},${lng}););` +
    `out geom;`
  process.stdout.write(`  Querying Overpass (${radius}m radius)… `)
  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }).toString(),
  })
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`)
  const data = await resp.json()
  console.log(`${data.elements.length} elements`)
  return data.elements
}

// ── Event configurations ───────────────────────────────────────────────────────

const EVENTS = [
  {
    slug: 'feux-artifice-14-juillet',
    fetchCenter: { lat: 48.8584, lng: 2.2945 },
    radius: 2500,
    compute: (verts, bH) =>
      radialShadow(48.8584, 2.2945, 320, verts, bH),
  },
  {
    slug: 'defile-14-juillet',
    fetchCenter: { lat: 48.8697, lng: 2.3081 }, // midpoint of Champs-Élysées
    radius: 900,
    compute: (verts, bH) => {
      // Union shadow from 11 points along Arc de Triomphe → Place de la Concorde
      const sources = [
        [48.8737, 2.2950], [48.8729, 2.2976], [48.8721, 2.3002],
        [48.8713, 2.3028], [48.8705, 2.3055], [48.8697, 2.3081],
        [48.8689, 2.3107], [48.8681, 2.3133], [48.8673, 2.3159],
        [48.8665, 2.3185], [48.8656, 2.3212],
      ]
      const allPts = [...verts]
      for (const [sLat, sLng] of sources) {
        const s = radialShadow(sLat, sLng, 5, verts, bH)
        allPts.push(...s)
      }
      return convexHull(allPts)
    },
  },
  {
    slug: 'eclipse-solaire-2026',
    fetchCenter: { lat: 48.8566, lng: 2.3522 },
    radius: 2000,
    // Sun: 2026-08-12 11:24 local (09:24 UTC), Paris → azimuth 219°, elevation 51°
    // Only buildings > 25 m cast visible shadows (shadow len = 25/tan(51°) ≈ 20 m)
    compute: (verts, bH) =>
      directionalShadow(219, 51, verts, bH, 48.8566, 25),
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  for (const ev of EVENTS) {
    console.log(`\n▸ ${ev.slug}`)
    const elements = await fetchBuildings(ev.fetchCenter.lat, ev.fetchCenter.lng, ev.radius)

    const obstacles = []
    for (const el of elements) {
      if (!el.geometry || el.geometry.length < 3) continue
      const verts = el.geometry.map(g => [g.lat, g.lon])
      const isVeg = el.tags?.natural === 'wood' || el.tags?.landuse === 'forest'
      const bH = isVeg ? 15 : heightFromTags(el.tags ?? {})
      const shadow = ev.compute(verts, bH)
      obstacles.push({ f: verts, s: shadow, v: isVeg ? 1 : 0 })
    }

    const outPath = join(OUT_DIR, `${ev.slug}.json`)
    writeFileSync(outPath, JSON.stringify(obstacles))
    const kb = Math.round(Buffer.byteLength(JSON.stringify(obstacles)) / 1024)
    console.log(`  ✓ ${obstacles.length} obstacles written → ${ev.slug}.json (${kb} KB)`)
  }

  console.log('\n✓ All done')
}

main().catch(e => { console.error(e); process.exit(1) })
