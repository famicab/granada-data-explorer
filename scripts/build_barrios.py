"""
Build backend/data/barrios.geojson — capa de los 32 barrios oficiales de
Granada (admin_level=10 en OSM) con métricas agregadas a partir de las
secciones censales.

Por qué: las secciones censales tienen identificadores opacos
("Distrito 1 · sec 03") mientras que los nombres de barrio
("Albaicín", "Sacromonte", "Realejo") son culturalmente reconocibles.
Esta capa actúa como una vista de nivel medio entre distritos (5) y
secciones (~130).

Pipeline:
  1. Carga Barrios.geojson (OSM) y reproyecta a EPSG:25830.
  2. Para cada sección, encuentra el barrio con mayor área de intersección
     (regla de precedencia). Eso evita doble conteo en solapes OSM.
  3. Agrega por barrio: poblaciones (suma), verde (suma con desglose),
     NO₂ (media ponderada por población), estación principal (la que cubre
     más población dentro del barrio).
  4. Calcula cuantiles pooled (sección×año) para poblaciones y verde/hab,
     embebe paletas y cortes en el FeatureCollection.

Salida: backend/data/barrios.geojson en formato análogo al de secciones.
"""

import json
from pathlib import Path

import geopandas as gpd
from shapely.geometry import mapping

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "backend" / "data"
RAW = ROOT / "raw-data" / "GIS"
BARRIOS_IN = RAW / "Barrios.geojson"
SECCIONES = DATA / "secciones_censales.geojson"
OUT = DATA / "barrios.geojson"

METRIC = 25830  # ETRS89 / UTM 30N — Granada

# Paleta secuencial Purples (ColorBrewer 5-class) — distinta a Blues de
# secciones para que se distinga visualmente cuál capa está activa. El
# tono se alinea con el del toggle "Barrios" (#7c3aed).
POP_RAMP = ["#f2f0f7", "#cbc9e2", "#9e9ac8", "#756bb1", "#54278f"]
# Verde y NO₂ conservan sus rampas semánticas (rojo↔verde, bandas UE):
# no dependen de la capa.
VERDE_HAB_COLORS = ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"]
NO2_BREAKS = [20, 40]
NO2_COLORS = ["#22c55e", "#f59e0b", "#ef4444"]
# Renta: misma rampa OrRd que en secciones (sequencial cálido).
RENTA_RAMP = ["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#b30000"]
# VFT: 7 clases PuRd con cortes semánticos fijos — mismos que en
# build_vft.py para que la leyenda no cambie al alternar sección/barrio.
VFT_RAMP = [
    "#f1eef6", "#d4b9da", "#c994c7", "#df65b0",
    "#e7298a", "#ce1256", "#91003f",
]
VFT_BREAKS = [1, 3, 7, 12, 20, 30]


def slugify(name: str) -> str:
    """'Plaza Toros - Doctores - San Lázaro' → 'plaza-toros-doctores-san-lazaro'."""
    import re
    import unicodedata

    nfkd = unicodedata.normalize("NFKD", name)
    no_acc = "".join(c for c in nfkd if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]+", "-", no_acc.lower()).strip("-")
    return s or "barrio"


def quantile_breaks(values: list[float], classes: int = 5) -> list[float]:
    s = sorted(values)
    n = len(s)
    out = []
    for k in range(1, classes):
        pos = k / classes * (n - 1)
        lo = int(pos)
        frac = pos - lo
        out.append(s[lo] + (s[min(lo + 1, n - 1)] - s[lo]) * frac)
    return out


def assign_sections(secciones: gpd.GeoDataFrame, barrios: gpd.GeoDataFrame) -> dict[str, int]:
    """{CUSEC: idx_barrio} por mayor área de intersección."""
    out: dict[str, int] = {}
    for _, sec in secciones.iterrows():
        g = sec.geometry
        if g is None or g.is_empty:
            continue
        best_idx, best_area = None, 0.0
        for bi, br in barrios.iterrows():
            bg = br.geometry
            if bg is None or bg.is_empty:
                continue
            try:
                inter = g.intersection(bg)
            except Exception:
                continue
            if inter.is_empty:
                continue
            a = float(inter.area)
            if a > best_area:
                best_area = a
                best_idx = bi
        if best_idx is not None:
            out[sec["CUSEC"]] = best_idx
    return out


def main() -> None:
    if not BARRIOS_IN.exists():
        raise SystemExit(f"Falta input: {BARRIOS_IN}")
    if not SECCIONES.exists():
        raise SystemExit(f"Falta {SECCIONES} - ejecuta antes build_secciones_indicadores")

    barrios = gpd.read_file(BARRIOS_IN).reset_index(drop=True).to_crs(METRIC)
    secciones = gpd.read_file(SECCIONES).to_crs(METRIC)

    secs_fc = json.loads(SECCIONES.read_text(encoding="utf-8"))
    secs_by_cusec = {f["properties"]["CUSEC"]: f["properties"] for f in secs_fc["features"]}
    estaciones_no2 = secs_fc.get("estaciones_no2", {})
    anios = secs_fc.get("poblacion_anios", []) or []
    vft_fecha_descarga = secs_fc.get("vft_fecha_descarga")
    vft_year_referencia = secs_fc.get("vft_year_referencia")
    vft_serie_anios = secs_fc.get("vft_serie_anios") or []

    sec_to_barrio = assign_sections(secciones, barrios)

    # Bucket de secciones por barrio.
    barrio_to_secs: dict[int, list[str]] = {}
    for cusec, bi in sec_to_barrio.items():
        barrio_to_secs.setdefault(bi, []).append(cusec)

    # Construir features finales (geometría en WGS84).
    barrios_wgs = barrios.to_crs(4326)
    features: list[dict] = []

    for bi, row in barrios_wgs.iterrows():
        cusecs = barrio_to_secs.get(bi, [])
        if not cusecs:
            continue
        name = row.get("name") or "(sin nombre)"

        pob: dict[str, int] = {}
        verde = {"parques": 0.0, "jardines": 0.0, "arbolado": 0.0}
        station_pop_total: dict[str, int] = {}
        # Suma de POIs por categoría que caen dentro de las secciones del
        # barrio. Solo se agrega si las secciones lo traen.
        equip_totals: dict[str, int] = {}
        # Renta agregada, por variante: {key: {año: [(valor, pob), ...]}} para
        # media ponderada por población. OJO: la mediana por unidad de consumo
        # así agregada es una APROXIMACIÓN a nivel barrio (media ponderada de
        # medianas de sección); la UI lo advierte.
        renta_samples: dict[str, dict[str, list[tuple[int, int]]]] = {
            "renta_med_uc": {}, "renta_hogar": {}, "renta_persona": {}
        }
        # VFT agregado: sumamos VFTs, plazas y viviendas estimadas de
        # las secciones (denominador ya está pre-calculado por sección).
        vft_n = 0
        vft_plazas = 0
        vft_viviendas = 0
        vft_any_section_con_denominador = False
        # Serie histórica: suma año-a-año de los acumulados por sección.
        vft_serie_acum: dict[str, int] = {str(y): 0 for y in vft_serie_anios}

        for cusec in cusecs:
            p = secs_by_cusec.get(cusec, {})
            secc_pobs = p.get("poblaciones") or {}
            for y, v in secc_pobs.items():
                pob[y] = pob.get(y, 0) + int(v)
            desg = p.get("superficie_verde_desglose") or {}
            for sub in verde:
                verde[sub] += float(desg.get(sub, 0))
            est = (p.get("estacion_cercana") or {}).get("name")
            if est and anios:
                last = secc_pobs.get(str(anios[-1])) or 0
                station_pop_total[est] = station_pop_total.get(est, 0) + int(last)
            eq = p.get("equipamientos") or {}
            for cat, info in eq.items():
                equip_totals[cat] = equip_totals.get(cat, 0) + int(
                    (info or {}).get("n_dentro", 0)
                )
            # Renta: muestreamos cada variante por año, ponderada por población.
            for key in renta_samples:
                for y, r in (p.get(key) or {}).items():
                    pob_y = secc_pobs.get(y)
                    if isinstance(r, (int, float)) and pob_y and pob_y > 0:
                        renta_samples[key].setdefault(y, []).append((int(r), int(pob_y)))
            # VFT: agregamos absolutos y dejamos el ratio para el final
            # con el denominador real (suma de viviendas por sección).
            vft = p.get("vft") or {}
            vft_n += int(vft.get("n_vfts") or 0)
            vft_plazas += int(vft.get("n_plazas") or 0)
            vivs = vft.get("viviendas_total")
            if isinstance(vivs, (int, float)) and vivs > 0:
                vft_viviendas += int(vivs)
                vft_any_section_con_denominador = True
            for y, n in (vft.get("serie") or {}).items():
                if y in vft_serie_acum and isinstance(n, (int, float)):
                    vft_serie_acum[y] += int(n)

        # NO₂ por año: media ponderada por población de la sección, usando
        # la estación más cercana de cada sección.
        no2_serie: dict[str, float] = {}
        for y in anios:
            num = den = 0.0
            for cusec in cusecs:
                p = secs_by_cusec.get(cusec, {})
                pob_sec = (p.get("poblaciones") or {}).get(str(y))
                est = (p.get("estacion_cercana") or {}).get("name")
                if not (pob_sec and est):
                    continue
                no2 = estaciones_no2.get(est, {}).get(str(y))
                if no2 is None:
                    continue
                num += pob_sec * no2
                den += pob_sec
            if den > 0:
                no2_serie[str(y)] = round(num / den, 1)

        principal = (
            max(station_pop_total, key=station_pop_total.get)
            if station_pop_total
            else None
        )
        c = row.geometry.centroid

        props = {
            "id": slugify(name),
            "name": name,
            "n_secciones": len(cusecs),
            "poblaciones": pob,
            "superficie_verde_m2": round(sum(verde.values())),
            "superficie_verde_desglose": {k: round(v) for k, v in verde.items()},
            "no2_serie": no2_serie,
            "estacion_principal": principal,
            "centroide": [round(float(c.x), 6), round(float(c.y), 6)],
        }
        if equip_totals:
            props["equipamientos"] = {
                cat: {"n_dentro_total": equip_totals[cat]}
                for cat in equip_totals
            }
        # Media ponderada por población, por variante (peso = población de la
        # sección ese año). Solo se incluye si hubo al menos una sección con dato.
        for key, per_year in renta_samples.items():
            renta_year: dict[str, int] = {}
            for y, samples in per_year.items():
                num = sum(r * w for r, w in samples)
                den = sum(w for _, w in samples)
                if den > 0:
                    renta_year[y] = round(num / den)
            if renta_year:
                props[key] = renta_year
        # Alias de compatibilidad: `renta` = variante por defecto (mediana UC).
        if props.get("renta_med_uc"):
            props["renta"] = props["renta_med_uc"]
        if vft_any_section_con_denominador and vft_viviendas > 0:
            vft_ratio = round(vft_n / vft_viviendas * 100, 2)
        else:
            vft_ratio = None
        props["vft"] = {
            "n_vfts": vft_n,
            "n_plazas": vft_plazas,
            "viviendas_total": vft_viviendas if vft_viviendas > 0 else None,
            "ratio_vft_pct": vft_ratio,
            "serie": vft_serie_acum,
        }
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": mapping(row.geometry),
        })

    # Cuantiles pooled (32 barrios × ~11 años ≈ 350 valores).
    pop_vals = [v for f in features for v in f["properties"]["poblaciones"].values()]
    pop_breaks = [round(b) for b in quantile_breaks(pop_vals)] if pop_vals else []

    vh_vals: list[float] = []
    for f in features:
        g = f["properties"].get("superficie_verde_m2", 0) or 0
        for v in (f["properties"].get("poblaciones") or {}).values():
            if v > 0 and g > 0:
                vh_vals.append(g / v)
    vh_breaks = [round(b, 1) for b in quantile_breaks(vh_vals)] if vh_vals else []

    # Renta: pooled sobre (barrio, año) por variante — alineado con secciones
    # para que la leyenda sea consistente al cambiar de nivel territorial.
    RENTA_KEYS = ("renta_med_uc", "renta_hogar", "renta_persona")
    renta_breaks_by_key: dict[str, list[int]] = {}
    for key in RENTA_KEYS:
        vals = [
            int(v)
            for f in features
            for v in (f["properties"].get(key) or {}).values()
            if isinstance(v, (int, float))
        ]
        if vals:
            renta_breaks_by_key[key] = [round(b) for b in quantile_breaks(vals)]
    renta_anios = sorted(
        {int(y) for f in features for y in (f["properties"].get("renta_med_uc") or {})}
    )

    fc = {
        "type": "FeatureCollection",
        "features": features,
        "poblacion_breaks": pop_breaks,
        "poblacion_colors": POP_RAMP,
        "poblacion_anios": anios,
        "verde_hab_breaks": vh_breaks,
        "verde_hab_colors": VERDE_HAB_COLORS,
        "no2_breaks": NO2_BREAKS,
        "no2_colors": NO2_COLORS,
    }
    for key, brks in renta_breaks_by_key.items():
        fc[f"{key}_breaks"] = brks
        fc[f"{key}_colors"] = RENTA_RAMP
    if renta_breaks_by_key:
        fc["renta_anios"] = renta_anios
        # Alias de compatibilidad: `renta` = variante por defecto (mediana UC).
        fc["renta_breaks"] = renta_breaks_by_key.get("renta_med_uc", [])
        fc["renta_colors"] = RENTA_RAMP

    # VFT: cortes fijos (no cuantiles) compartidos con secciones — así el
    # mismo color significa la misma franja de presión turística al
    # alternar nivel territorial.
    vft_ratios = [
        float(f["properties"]["vft"]["ratio_vft_pct"])
        for f in features
        if (f["properties"].get("vft") or {}).get("ratio_vft_pct") is not None
    ]
    if vft_ratios:
        fc["vft_breaks"] = list(VFT_BREAKS)
        fc["vft_colors"] = VFT_RAMP
    if vft_fecha_descarga:
        fc["vft_fecha_descarga"] = vft_fecha_descarga
    if vft_year_referencia:
        fc["vft_year_referencia"] = vft_year_referencia
    if vft_serie_anios:
        fc["vft_serie_anios"] = list(vft_serie_anios)
    OUT.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    total_secs = len(secciones)
    assigned = len(sec_to_barrio)
    barrios_con_secs = len(barrio_to_secs)
    print(
        f"[OK] {len(features)} barrios escritos "
        f"({barrios_con_secs}/{len(barrios)} con secciones asignadas)"
    )
    print(f"  secciones asignadas: {assigned}/{total_secs}")
    if anios:
        print(f"  anios: {anios[0]}-{anios[-1]} ({len(anios)} anios)")
    print(f"  pop  breaks: {pop_breaks}")
    print(f"  v/h  breaks: {vh_breaks}")
    if renta_breaks_by_key:
        n_barrios_renta = sum(
            1 for f in features if f["properties"].get("renta_med_uc")
        )
        print(
            f"  renta {renta_anios[0]}-{renta_anios[-1]} "
            f"({n_barrios_renta} barrios · 3 variantes, ponderada por poblacion)"
        )
        print(f"  renta breaks med_uc: {renta_breaks_by_key.get('renta_med_uc')}")
    if vft_ratios:
        n_b_vft = sum(
            1 for f in features
            if (f["properties"].get("vft") or {}).get("n_vfts", 0) > 0
        )
        total_vfts_b = sum(
            int((f["properties"].get("vft") or {}).get("n_vfts") or 0)
            for f in features
        )
        print(
            f"  vft: {n_b_vft} barrios con VFT (total {total_vfts_b}), "
            f"breaks {fc['vft_breaks']}"
        )
    print(f"  output: {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
