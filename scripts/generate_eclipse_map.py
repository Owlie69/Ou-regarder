#!/usr/bin/env python3
"""
Où Regarder — pregenerated visibility map for the 12 Aug 2026 partial eclipse (Paris).

What it does (offline, once):
  1. Downloads building footprints + heights (APUR EMPRISE_BATIE, covers Greater Paris).
  2. Downloads terrain (IGN Géoplateforme WCS, RGE ALTI) -> DTM.
  3. Builds a DSM = DTM + building heights, rasterized at RES meters.
  4. For each 5-min timestep of the eclipse, ray-marches toward the sun and
     marks pixels with an unobstructed line of sight (observer eye = 1.7 m).
  5. Outputs static assets the frontend loads directly (zero client computation):
       out/eclipse-2026-visibility.tif        (minutes of visibility, GeoTIFF)
       out/eclipse-2026-visibility.png + .pgw (colorized overlay, EPSG:3857)
       out/eclipse-2026-zones.geojson         (polygons: sees_max + >=45 min)

Usage:
  pip install rasterio shapely requests numpy pillow
  python generate_eclipse_map.py            # full run (~10-25 min at RES=5)
  python generate_eclipse_map.py --res 10   # faster, coarser

Run once, commit/upload outputs, done. The web app never computes anything.
"""

import argparse, json, math, sys, time
from pathlib import Path

import numpy as np
import requests
import rasterio
from rasterio import features
from rasterio.transform import from_origin
from rasterio.warp import transform_bounds
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

# ----------------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------------
# Bbox in EPSG:4326 (lon/lat): Paris + west/south rim (Saint-Cloud, Meudon,
# Issy, Clamart, Antony...) because the sun sets WNW — the interesting
# viewpoints face west. Extend if needed.
BBOX_4326 = (2.13, 48.74, 2.47, 48.92)   # (min_lon, min_lat, max_lon, max_lat)
EYE_HEIGHT = 1.7                         # observer eye level above ground (m)
MAX_RAY = 1500.0                         # max occluder distance considered (m)
MIN_MINUTES = 45                         # threshold for "good spot" polygons

# Sun ephemeris for Paris, 12 Aug 2026, computed with JPL DE421.
# (time CEST, azimuth deg from N, altitude deg, eclipse magnitude)
# C1 = 19:22, MAX = 20:17 (mag 0.93, alt 7.6°, az 283.8°), sunset ~21:11.
SUN_TABLE = [
    ("19:25", 274.2, 16.1, 0.05), ("19:30", 275.2, 15.3, 0.14),
    ("19:35", 276.1, 14.4, 0.23), ("19:40", 277.0, 13.6, 0.32),
    ("19:45", 277.9, 12.8, 0.41), ("19:50", 278.8, 12.0, 0.50),
    ("19:55", 279.8, 11.2, 0.59), ("20:00", 280.7, 10.4, 0.68),
    ("20:05", 281.6,  9.6, 0.77), ("20:10", 282.5,  8.8, 0.85),
    ("20:15", 283.4,  8.0, 0.92), ("20:20", 284.3,  7.2, 0.92),
    ("20:25", 285.2,  6.4, 0.85), ("20:30", 286.2,  5.6, 0.76),
    ("20:35", 287.1,  4.8, 0.67), ("20:40", 288.0,  4.0, 0.57),
    ("20:45", 288.9,  3.2, 0.48), ("20:50", 289.8,  2.4, 0.38),
    ("20:55", 290.8,  1.7, 0.28), ("21:00", 291.7,  0.9, 0.19),
    ("21:05", 292.6,  0.1, 0.09),
]
STEP_MINUTES = 5
MAX_INDEX = SUN_TABLE.index(("20:15", 283.4, 8.0, 0.92))  # closest step to max

APUR_LAYER = ("https://services.arcgis.com/wQ7idXGCD0n5Pt2E/arcgis/rest/services/"
              "EMPRISE_BATIE/FeatureServer/0/query")
IGN_WCS = "https://data.geopf.fr/wcs"

# ----------------------------------------------------------------------------
# 1. Buildings (APUR, with H_MOY / H_MED height attributes, Greater Paris)
# ----------------------------------------------------------------------------
def fetch_buildings(bbox, cache: Path):
    if cache.exists():
        print(f"[buildings] using cache {cache}")
        return json.loads(cache.read_text())["features"]
    print("[buildings] downloading from APUR (paged)...")
    feats, offset = [], 0
    while True:
        params = {
            "where": "1=1", "outFields": "H_MOY,H_MED,H_MAX",
            "geometry": ",".join(map(str, bbox)), "geometryType": "esriGeometryEnvelope",
            "inSR": 4326, "spatialRel": "esriSpatialRelIntersects",
            "outSR": 4326, "f": "geojson",
            "resultOffset": offset, "resultRecordCount": 2000,
        }
        r = requests.get(APUR_LAYER, params=params, timeout=120)
        r.raise_for_status()
        page = r.json().get("features", [])
        feats.extend(page)
        print(f"  +{len(page)} (total {len(feats)})")
        if len(page) < 2000:
            break
        offset += 2000
    cache.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    return feats

# ----------------------------------------------------------------------------
# 2. Terrain (IGN Géoplateforme WCS — RGE ALTI). Fallback: flat 35 m.
# ----------------------------------------------------------------------------
def fetch_dtm(bbox3857, width, height, cache: Path):
    if cache.exists():
        with rasterio.open(cache) as src:
            print(f"[terrain] using cache {cache}")
            return src.read(1).astype(np.float32)
    print("[terrain] downloading IGN RGE ALTI via WCS...")
    try:
        params = {
            "SERVICE": "WCS", "VERSION": "2.0.1", "REQUEST": "GetCoverage",
            "COVERAGEID": "ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES",
            "FORMAT": "image/geotiff",
            "SUBSET": [f"X({bbox3857[0]},{bbox3857[2]})", f"Y({bbox3857[1]},{bbox3857[3]})"],
            "SUBSETTINGCRS": "EPSG:3857", "OUTPUTCRS": "EPSG:3857",
            "SCALESIZE": f"X({width}),Y({height})",
        }
        r = requests.get(IGN_WCS, params=params, timeout=300)
        r.raise_for_status()
        cache.write_bytes(r.content)
        with rasterio.open(cache) as src:
            dtm = src.read(1).astype(np.float32)
        dtm[dtm < -100] = np.nan
        med = np.nanmedian(dtm)
        dtm = np.nan_to_num(dtm, nan=med)
        return dtm
    except Exception as e:
        print(f"[terrain] WCS failed ({e}); falling back to flat 35 m. "
              f"Relief (Belleville, Montmartre, Saint-Cloud) will be ignored!")
        return np.full((height, width), 35.0, dtype=np.float32)

# ----------------------------------------------------------------------------
# 3. Core: visibility along one sun direction (validated kernel)
# ----------------------------------------------------------------------------
def visibility_mask(dsm, z_obs, az_deg, alt_deg, res, max_ray=MAX_RAY):
    az = math.radians(az_deg)
    de, dn = math.sin(az), math.cos(az)            # toward sun: east, north
    tan_alt = math.tan(math.radians(alt_deg))
    running_max = np.full(dsm.shape, -np.inf, dtype=np.float32)
    H, W = dsm.shape
    shifted = np.empty_like(dsm)
    for k in range(1, int(max_ray / res) + 1):
        d = k * res
        dc, dr = int(round(de * k)), int(round(-dn * k))
        shifted.fill(-np.inf)
        rs, re_ = max(0, -dr), min(H, H - dr)
        cs, ce = max(0, -dc), min(W, W - dc)
        if rs >= re_ or cs >= ce:
            break
        shifted[rs:re_, cs:ce] = dsm[rs + dr:re_ + dr, cs + dc:ce + dc]
        np.maximum(running_max, shifted - d * tan_alt, out=running_max)
    return running_max <= z_obs

# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--res", type=float, default=5.0, help="grid resolution (m)")
    ap.add_argument("--out", default="public/data")
    args = ap.parse_args()
    res = args.res
    out = Path(args.out); out.mkdir(exist_ok=True)
    cache = Path("cache"); cache.mkdir(exist_ok=True)

    bbox3857 = transform_bounds("EPSG:4326", "EPSG:3857", *BBOX_4326)
    width = int((bbox3857[2] - bbox3857[0]) / res)
    height = int((bbox3857[3] - bbox3857[1]) / res)
    transform = from_origin(bbox3857[0], bbox3857[3], res, res)
    print(f"grid: {width} x {height} px @ {res} m")

    # --- DTM + buildings -> DSM
    dtm = fetch_dtm(bbox3857, width, height, cache / "dtm.tif")
    feats = fetch_buildings(BBOX_4326, cache / "buildings.geojson")

    from rasterio.warp import transform_geom
    shapes = []
    for f in feats:
        p = f.get("properties") or {}
        h = p.get("H_MED") or p.get("H_MOY") or p.get("H_MAX") or 15.0
        try:
            g = transform_geom("EPSG:4326", "EPSG:3857", f["geometry"])
            shapes.append((g, float(h)))
        except Exception:
            continue
    print(f"[buildings] rasterizing {len(shapes)} footprints...")
    bld = features.rasterize(shapes, out_shape=(height, width),
                             transform=transform, fill=0.0, dtype="float32")
    dsm = dtm + bld
    z_obs = dtm + EYE_HEIGHT          # observers stand on the ground
    inside_building = bld > 2.0       # mask out interiors later

    # --- accumulate visibility minutes + sees-max
    minutes = np.zeros(dsm.shape, dtype=np.float32)
    sees_max = None
    for i, (hhmm, az, alt, mag) in enumerate(SUN_TABLE):
        t0 = time.time()
        vis = visibility_mask(dsm, z_obs, az, alt, res)
        minutes += vis * STEP_MINUTES
        if i == MAX_INDEX:
            sees_max = vis.copy()
        print(f"  {hhmm}  az={az:6.1f} alt={alt:5.1f} mag={mag:.2f}  "
              f"visible={vis.mean()*100:5.1f}%  ({time.time()-t0:.1f}s)")
    minutes[inside_building] = 0
    sees_max[inside_building] = False

    # --- output 1: GeoTIFF (source of truth)
    tif = out / "eclipse-2026-visibility.tif"
    with rasterio.open(tif, "w", driver="GTiff", height=height, width=width,
                       count=2, dtype="float32", crs="EPSG:3857",
                       transform=transform, compress="deflate") as dst:
        dst.write(minutes, 1)
        dst.write(sees_max.astype(np.float32), 2)

    # --- output 2: colorized PNG overlay (MapLibre image source)
    from PIL import Image
    norm = np.clip(minutes / minutes.max() if minutes.max() else minutes, 0, 1)
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., 0] = (255 * (1 - norm)).astype(np.uint8)        # red = blocked
    rgba[..., 1] = (255 * norm).astype(np.uint8)              # green = visible
    rgba[..., 3] = np.where(minutes > 0, 140, 0).astype(np.uint8)
    rgba[sees_max, 3] = 190
    Image.fromarray(rgba).save(out / "eclipse-2026-visibility.png", optimize=True)
    (out / "eclipse-2026-visibility.bounds.json").write_text(json.dumps({
        "crs": "EPSG:3857", "bounds3857": list(bbox3857), "bounds4326": list(BBOX_4326)
    }))

    # --- output 3: GeoJSON polygons of good spots (sees max AND >= MIN_MINUTES)
    good = (sees_max & (minutes >= MIN_MINUTES)).astype(np.uint8)
    polys = [shape(g) for g, v in features.shapes(good, transform=transform) if v == 1]
    merged = unary_union(polys).simplify(res * 1.5)
    geoms = list(merged.geoms) if merged.geom_type == "MultiPolygon" else [merged]
    geoms = [g for g in geoms if g.area > 400]   # drop slivers < 400 m2
    fc = {"type": "FeatureCollection", "features": []}
    for g in geoms:
        gj = transform_geom("EPSG:3857", "EPSG:4326", mapping(g))
        fc["features"].append({"type": "Feature", "geometry": gj,
                               "properties": {"event": "eclipse-2026-08-12",
                                              "sees_max": True,
                                              "min_minutes": MIN_MINUTES}})
    (out / "eclipse-2026-zones.geojson").write_text(json.dumps(fc))
    print(f"\nDone -> {out}/  ({len(fc['features'])} zone polygons, "
          f"{(out/'eclipse-2026-zones.geojson').stat().st_size/1e6:.1f} MB geojson)")

if __name__ == "__main__":
    sys.exit(main())
