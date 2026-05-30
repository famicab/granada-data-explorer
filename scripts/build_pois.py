"""
Genera 6 capas de equipamientos a partir de raw-data/GIS/Puntos de
Interes.geojson y añade un bloque `equipamientos` a cada sección censal:
cuántos POIs hay dentro y, si no hay, distancia al más cercano.

Categorías:
  - sanidad      (farmacias, hospitales, clínicas, médicos)
  - educacion    (escuelas, guarderías, universidades, bibliotecas)
  - agua         (fuentes potables y ornamentales)
  - reciclaje    (puntos de reciclaje y residuos)
  - aparcabicis  (parking bici)
  - patrimonio   (museos, miradores, atracciones, monumentos OSM)

Filosofía:
  - Excluimos restaurantes/bares/hoteles y POIs de bajo valor analítico
    (bench, papelera, parking-coche).
  - Geometrías no-Point (alguna línea/polígono) se reducen al centroide.
  - Tras ejecutar este script, re-ejecuta build_barrios.py para que los
    barrios incluyan el agregado de equipamientos.
"""

import json
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "backend" / "data"
POI_IN = ROOT / "raw-data" / "GIS" / "Puntos de Interes.geojson"
SECCIONES = DATA / "secciones_censales.geojson"

METRIC = 25830  # ETRS89 / UTM 30N


# Orden de prioridad: el primero que matchea gana, así un POI clasificado
# como museum (tourism) no acabe en patrimonio si también es church.
CATEGORY_ORDER = [
    "sanidad",
    "educacion",
    "agua",
    "reciclaje",
    "aparcabicis",
    "patrimonio",
]

CATEGORIES: dict[str, dict[str, list[str]]] = {
    "sanidad": {
        "amenity": ["pharmacy", "hospital", "clinic", "doctors"],
    },
    "educacion": {
        "amenity": ["school", "kindergarten", "college", "university", "library"],
    },
    "agua": {
        "amenity": ["drinking_water", "fountain"],
    },
    "reciclaje": {
        "amenity": ["recycling", "waste_disposal"],
    },
    "aparcabicis": {
        "amenity": ["bicycle_parking"],
    },
    "patrimonio": {
        "tourism": ["museum", "gallery", "viewpoint", "attraction"],
        "historic": ["castle", "palace", "church", "citywalls", "city_gate", "monument"],
    },
}


def classify(props: dict) -> tuple[str, str] | None:
    """Devuelve (categoria, subtype) o None si no encaja en ninguna."""
    for cat in CATEGORY_ORDER:
        for key, values in CATEGORIES[cat].items():
            v = props.get(key)
            if v in values:
                return cat, v
    return None


def to_point_coords(geom: dict) -> list[float] | None:
    """Si el feature ya es Point, devuelve sus coords; si no, calcula el
    centroide vía shapely. Devuelve [lon, lat]."""
    if not geom:
        return None
    if geom.get("type") == "Point":
        return list(geom["coordinates"])
    try:
        g = shape(geom)
    except Exception:
        return None
    if g.is_empty:
        return None
    c = g.centroid
    return [float(c.x), float(c.y)]


def classify_and_write_layers() -> dict[str, list[dict]]:
    """Lee Puntos de Interes y escribe 6 GeoJSONs. Devuelve los features
    clasificados por categoría (para uso posterior con secciones)."""
    poi_fc = json.loads(POI_IN.read_text(encoding="utf-8"))
    classified: dict[str, list[dict]] = {cat: [] for cat in CATEGORY_ORDER}

    for f in poi_fc.get("features", []):
        props = f.get("properties") or {}
        match = classify(props)
        if not match:
            continue
        cat, subtype = match

        coords = to_point_coords(f.get("geometry"))
        if not coords:
            continue

        feat = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": coords},
            "properties": {
                "name": props.get("name"),
                "kind": subtype,
                "categoria": cat,
                "osm_id": props.get("@id"),
            },
        }
        classified[cat].append(feat)

    for cat, feats in classified.items():
        out = DATA / f"poi_{cat}.geojson"
        out.write_text(
            json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"[OK] {cat:12} {len(feats):4} POIs -> {out.relative_to(ROOT)}")

    return classified


def patch_sections(classified: dict[str, list[dict]]) -> None:
    """Añade el bloque `equipamientos` a cada feature de secciones."""
    if not SECCIONES.exists():
        print(f"[WARN] Falta {SECCIONES} - omito indicadores de seccion")
        return

    secs_gdf = gpd.read_file(SECCIONES).to_crs(METRIC)
    secs_fc = json.loads(SECCIONES.read_text(encoding="utf-8"))

    # Construye un GeoDataFrame en CRS métrico por categoría para `within`/distancia.
    poi_gdfs: dict[str, gpd.GeoDataFrame | None] = {}
    for cat in CATEGORY_ORDER:
        feats = classified.get(cat, [])
        if not feats:
            poi_gdfs[cat] = None
            continue
        pts = [Point(*f["geometry"]["coordinates"]) for f in feats]
        names = [
            (f["properties"].get("name") or f["properties"].get("kind"))
            for f in feats
        ]
        gdf = gpd.GeoDataFrame(
            {"name": names}, geometry=pts, crs=4326
        ).to_crs(METRIC)
        poi_gdfs[cat] = gdf

    # Indexa secciones por CUSEC para patch posterior.
    sec_geoms = {row["CUSEC"]: row.geometry for _, row in secs_gdf.iterrows()}

    eq_by_cusec: dict[str, dict] = {}
    for cusec, g in sec_geoms.items():
        if g is None or g.is_empty:
            continue
        c = g.centroid
        block: dict[str, dict] = {}
        for cat in CATEGORY_ORDER:
            gdf = poi_gdfs.get(cat)
            if gdf is None or gdf.empty:
                block[cat] = {"n_dentro": 0}
                continue
            inside = gdf[gdf.geometry.within(g)]
            n = int(len(inside))
            entry: dict = {"n_dentro": n}
            if n == 0:
                dists = gdf.geometry.distance(c)
                idx = dists.idxmin()
                entry["mas_cercana_m"] = int(round(float(dists.loc[idx])))
                nm = gdf.loc[idx, "name"]
                if isinstance(nm, str) and nm:
                    entry["mas_cercana_name"] = nm
            block[cat] = entry
        eq_by_cusec[cusec] = block

    matched = 0
    for feat in secs_fc["features"]:
        cusec = (feat.get("properties") or {}).get("CUSEC")
        if cusec in eq_by_cusec:
            feat["properties"]["equipamientos"] = eq_by_cusec[cusec]
            matched += 1

    SECCIONES.write_text(json.dumps(secs_fc, ensure_ascii=False), encoding="utf-8")

    # Resumen útil: cuántas secciones tienen algún POI dentro.
    any_inside = sum(
        1
        for v in eq_by_cusec.values()
        if any(c.get("n_dentro", 0) > 0 for c in v.values())
    )
    print(f"[OK] equipamientos embebidos en {matched} secciones "
          f"({any_inside} con al menos 1 POI dentro)")


def main() -> None:
    if not POI_IN.exists():
        raise SystemExit(f"Falta input: {POI_IN}")

    classified = classify_and_write_layers()
    patch_sections(classified)
    print("[NOTA] Re-ejecuta build_barrios.py para agregar equipamientos a barrios.")


if __name__ == "__main__":
    main()
