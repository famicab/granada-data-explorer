"""
Pre-compute per-section indicators for the SeccionPanel:
  - superficie_verde_m2: total area (m²) of Zonas verdes (parques + jardines +
    arbolado) that intersect the section polygon.
  - estacion_cercana: {name, distancia_m} of the closest air-quality station,
    measured from the section centroid.

All metric maths happens in EPSG:25830 (ETRS89 / UTM 30N — Granada), so areas
are in m² and distances in metres. Foreign members of the FeatureCollection
(leyenda, poblacion_*) are preserved by editing the raw JSON.
"""

import json
from pathlib import Path

import geopandas as gpd
from shapely.ops import unary_union

DATA = Path(__file__).resolve().parent.parent / "backend" / "data"
OUT = DATA / "secciones_censales.geojson"
GREEN_FILES = ["parques.geojson", "jardines.geojson", "arbolado.geojson"]
STATIONS_FILE = DATA / "estaciones_aire.geojson"
METRIC = 25830  # ETRS89 / UTM 30N

# Rampa diverging RdYlGn (5 clases): rojo = poco verde/hab, verde = mucho.
VERDE_HAB_COLORS = ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"]

# Mismas bandas que las estaciones de calidad del aire: <20 verde, 20-40
# ámbar, >40 rojo (límite anual UE).
NO2_BREAKS = [20, 40]
NO2_COLORS = ["#22c55e", "#f59e0b", "#ef4444"]


def quantile_breaks(values: list[float], classes: int = 5) -> list[float]:
    s = sorted(values)
    n = len(s)
    breaks = []
    for k in range(1, classes):
        pos = k / classes * (n - 1)
        lo = int(pos)
        frac = pos - lo
        val = s[lo] + (s[min(lo + 1, n - 1)] - s[lo]) * frac
        breaks.append(val)
    return breaks


SUBTYPES = ["parques", "jardines", "arbolado"]  # orden de precedencia (parques manda)


def green_area_per_section(secciones: gpd.GeoDataFrame) -> dict[str, dict[str, float]]:
    """{CUSEC: {parques, jardines, arbolado} en m²} con precedencia para evitar
    doble conteo en solapes OSM: cualquier área cubierta por parques cuenta
    como parques; el resto cubierto por jardines cuenta como jardines; el
    resto cubierto por arbolado cuenta como arbolado.
    """
    geoms: dict[str, object | None] = {}
    for sub in SUBTYPES:
        p = DATA / f"{sub}.geojson"
        if not p.exists():
            geoms[sub] = None
            continue
        gdf = gpd.read_file(p).to_crs(METRIC)
        polys = [g for g in gdf.geometry if g is not None and not g.is_empty]
        geoms[sub] = unary_union(polys) if polys else None

    # Aplicar precedencia restando los superiores.
    resolved: dict[str, object | None] = {}
    consumed = None
    for sub in SUBTYPES:
        g = geoms[sub]
        if g is None:
            resolved[sub] = None
            continue
        resolved[sub] = g if consumed is None else g.difference(consumed)
        consumed = resolved[sub] if consumed is None else consumed.union(resolved[sub])

    out: dict[str, dict[str, float]] = {}
    for _, sec in secciones.iterrows():
        sub_areas = {s: 0.0 for s in SUBTYPES}
        if sec.geometry is not None and not sec.geometry.is_empty:
            for sub in SUBTYPES:
                g = resolved[sub]
                if g is None or g.is_empty:
                    continue
                inter = sec.geometry.intersection(g)
                if not inter.is_empty:
                    sub_areas[sub] = float(inter.area)
        out[sec["CUSEC"]] = sub_areas
    return out


def no2_series_by_station() -> dict[str, dict[str, float]]:
    """{nombre_estación: {año: NO2_media_anual}} desde el geojson de estaciones."""
    if not STATIONS_FILE.exists():
        return {}
    data = json.loads(STATIONS_FILE.read_text(encoding="utf-8"))
    out: dict[str, dict[str, float]] = {}
    for f in data.get("features", []):
        props = f.get("properties") or {}
        name = props.get("name")
        series = (props.get("series") or {}).get("NO2") or []
        if name and series:
            out[name] = {str(p["anio"]): p["valor"] for p in series}
    return out


def nearest_station_per_section(secciones: gpd.GeoDataFrame) -> dict[str, dict]:
    if not STATIONS_FILE.exists():
        return {}
    est = gpd.read_file(STATIONS_FILE).to_crs(METRIC)
    out: dict[str, dict] = {}
    for _, sec in secciones.iterrows():
        if sec.geometry is None or sec.geometry.is_empty:
            continue
        c = sec.geometry.centroid
        best_d, best_name = None, None
        for _, st in est.iterrows():
            d = c.distance(st.geometry)
            if best_d is None or d < best_d:
                best_d, best_name = d, st["name"]
        if best_name is not None:
            out[sec["CUSEC"]] = {"name": str(best_name), "distancia_m": round(float(best_d))}
    return out


def main() -> None:
    if not OUT.exists():
        raise SystemExit(f"Base layer missing: {OUT}")

    secciones = gpd.read_file(OUT).to_crs(METRIC)
    green = green_area_per_section(secciones)
    nearest = nearest_station_per_section(secciones)
    no2_series = no2_series_by_station()

    # Centroides en WGS84 para que el frontend pueda hacer flyTo al pulsar
    # una sección desde el panel de rankings.
    centroides: dict[str, list[float]] = {}
    for _, row in secciones.to_crs(4326).iterrows():
        if row.geometry is None or row.geometry.is_empty:
            continue
        c = row.geometry.centroid
        centroides[row["CUSEC"]] = [round(float(c.x), 6), round(float(c.y), 6)]

    # Re-leer como JSON crudo para preservar foreign members (leyenda, etc.).
    fc = json.loads(OUT.read_text(encoding="utf-8"))
    for feat in fc["features"]:
        cusec = feat["properties"].get("CUSEC")
        sub = green.get(cusec) or {s: 0.0 for s in SUBTYPES}
        feat["properties"]["superficie_verde_desglose"] = {
            s: round(sub[s]) for s in SUBTYPES
        }
        feat["properties"]["superficie_verde_m2"] = round(sum(sub.values()))
        feat["properties"]["estacion_cercana"] = nearest.get(cusec)
        if cusec in centroides:
            feat["properties"]["centroide"] = centroides[cusec]

    # Coropleta derivada "verde por habitante": cortes pooled sobre TODOS los
    # pares (sección, año), así el slider revela cambios reales y los colores
    # son comparables entre años.
    ratios: list[float] = []
    for feat in fc["features"]:
        g = feat["properties"].get("superficie_verde_m2", 0)
        pobs = feat["properties"].get("poblaciones") or {}
        for pob in pobs.values():
            if pob and pob > 0:
                ratios.append(g / pob)
    if ratios:
        vh_breaks = [round(b, 1) for b in quantile_breaks(ratios)]
        fc["verde_hab_breaks"] = vh_breaks
        fc["verde_hab_colors"] = VERDE_HAB_COLORS

    # Exposición aproximada a NO2: serie anual por estación, asignada a la
    # sección vía nearest-neighbor (Voronoi-like). Cada sección lee el valor
    # de su `estacion_cercana` en el año del slider.
    if no2_series:
        fc["estaciones_no2"] = no2_series
        fc["no2_breaks"] = NO2_BREAKS
        fc["no2_colors"] = NO2_COLORS

    OUT.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    totals_by_sub = {s: sum(d[s] for d in green.values()) for s in SUBTYPES}
    total_v = sum(totals_by_sub.values())
    with_v = sum(1 for d in green.values() if sum(d.values()) > 0)
    print(f"✓ Superficie verde: {with_v}/{len(secciones)} secciones con zonas verdes")
    print(f"  total {round(total_v):,} m² ({total_v / 10_000:.1f} ha) | "
          + " · ".join(f"{s} {totals_by_sub[s] / 10_000:.0f} ha" for s in SUBTYPES))
    print(f"✓ Estación más cercana asignada a {len(nearest)} secciones")
    if ratios:
        print(f"✓ Verde/hab: {len(ratios)} ratios (pooled), "
              f"rango {min(ratios):.1f}–{max(ratios):.0f} m²/hab")
        print(f"  cortes (cuantiles): " + ", ".join(f"≤{b}" for b in vh_breaks))
    if no2_series:
        st_summary = ", ".join(
            f"{name} ({len(yrs)} años)" for name, yrs in no2_series.items()
        )
        print(f"✓ NO2 por estación embebido: {st_summary}")
        print(f"  cortes: <{NO2_BREAKS[0]} verde, "
              f"{NO2_BREAKS[0]}–{NO2_BREAKS[1]} ámbar, >{NO2_BREAKS[1]} rojo")


if __name__ == "__main__":
    main()
