"""
Genera la capa de Viviendas con fines turísticos (VFT) en Granada capital y
embebe un bloque agregado en cada sección censal.

Fuente: OpenRTA (Junta de Andalucía) — registro oficial del Registro de
Turismo de Andalucía. Endpoint JSON:
    https://datos.juntadeandalucia.es/api/v0/openrta/all?format=json

Filtros aplicados:
  - objects_type_id == "Vivienda de uso turístico"
    (nombre actual del tipo; en literatura/regulación también aparece como
    "Vivienda con fines turísticos" / VFT)
  - municipalities == "GRANADA"
Resultado: ~3.6k registros, ~99,7 % con coord_x/coord_y en EPSG:25830.

Denominador del ratio: viviendas familiares TOTALES por sección del
Censo 2021 (INE), columna `t18_1` del fichero de indicadores por
sección — parque completo, incluida vivienda secundaria y vacía.
Fallback al estimador pob/tamaño_medio_hogar (ADRH 31033) solo en las
secciones sin pareo censal (cambios de seccionado 2021↔cartografía
2026). El ratio mide "VFT por 100 viviendas (todo el parque)".

Salidas:
  - backend/data/secciones_censales.geojson  bloque `vft` + meta `vft_*`
  - raw-data/openrta_granada_vft.json  cache JSON filtrado (re-uso entre runs)

Nota de privacidad: NO se publica la geolocalización fina de cada VFT. La
presión turística se expone únicamente agregada por sección/barrio (densidad).
Los puntos individuales se usan solo en memoria para el spatial-join.
"""

import csv
import io
import json
import urllib.request
from datetime import date
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "backend" / "data"
RAW = ROOT / "raw-data"
SECCIONES = DATA / "secciones_censales.geojson"
CACHE = RAW / "openrta_granada_vft.json"
DEMOGRAFIA = DATA / "demografia.json"

OPENRTA_URL = "https://datos.juntadeandalucia.es/api/v0/openrta/all?format=json"
ADRH_URL = "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/31033.csv"
# Censo 2021 — indicadores por sección censal (toda España, ~8 MB). La col.
# t18_1 = viviendas familiares totales (validado: total 18087 = 141.257).
CENSO_URL = "https://www.ine.es/censos2021/C2021_Indicadores.csv"
CENSO_NATIONAL = RAW / "censo2021_indicadores_seccion.csv"  # descarga nacional
CENSO_CACHE = RAW / "censo2021_viviendas_granada.csv"       # subset Granada
MUNI_INE = "18087"  # Granada capital
MUNI_OPENRTA = "GRANADA"
VFT_TYPE = "Vivienda de uso turístico"  # nombre estable en OpenRTA
METRIC = 25830  # ETRS89 / UTM 30N — coincide con el SRID de OpenRTA

# ColorBrewer "PuRd" 7-class — secuencial morado→magenta, separa
# visualmente de la renta (OrRd) y de la población (Blues/Purples).
# Necesitamos 7 clases porque la cola alta del ratio VFT es muy pesada
# (Albaicín ~30 %, varios cascos ~15-20 %) y con menos bins lo "alto"
# y lo "extremo" se confunden visualmente.
RAMP = [
    "#f1eef6",  # <=1   testimonial / casi nulo
    "#d4b9da",  # 1-3   moderado
    "#c994c7",  # 3-7   notable
    "#df65b0",  # 7-12  alto (cruza el umbral del aviso 10 %)
    "#e7298a",  # 12-20 muy alto
    "#ce1256",  # 20-30 severo
    "#91003f",  # >30   extremo (núcleos del Albaicín / Realejo)
]
# Cortes fijos (no cuantiles): nos importa que cada bin tenga un
# significado de presión turística estable entre snapshots y entre
# nivel sección/barrio. Los cuantiles colapsaban la zona >3 % en un
# único color, escondiendo las diferencias dentro del casco histórico.
RATIO_BREAKS = [1, 3, 7, 12, 20, 30]


# ── Descarga + cache ────────────────────────────────────────────────────

def fetch_openrta_vfts() -> list[dict]:
    """Descarga OpenRTA, filtra VFTs Granada capital, cachea el subset.

    Usa el cache si existe — el RTA es un snapshot vivo pero no cambia
    drásticamente día a día; re-ejecutar el script no debería re-descargar
    50 MB cada vez. Borra `raw-data/openrta_granada_vft.json` para forzar
    refresh.
    """
    if CACHE.exists():
        try:
            return json.loads(CACHE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"[WARN] cache corrupto en {CACHE}, re-descargando")

    print(f"[INFO] descargando OpenRTA (~50 MB)…")
    req = urllib.request.Request(
        OPENRTA_URL, headers={"User-Agent": "GranadaDataExplorer/1.0"}
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        raw = resp.read()
    data = json.loads(raw.decode("utf-8", errors="replace"))

    vfts = [
        r for r in data
        if (r.get("objects_type_id") or "").startswith("Vivienda de uso tur")
        and (r.get("municipalities") or "").upper() == MUNI_OPENRTA
    ]
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(vfts, ensure_ascii=False), encoding="utf-8")
    print(f"[OK] OpenRTA filtrado: {len(vfts)} VFTs en {MUNI_OPENRTA}; "
          f"cache -> {CACHE.relative_to(ROOT)}")
    return vfts


# ── ADRH 31033: tamaño medio del hogar por sección ──────────────────────

def _open_csv(url: str) -> csv.reader:
    from _ine_cache import open_csv  # cache local (comparte el 31033 con build_secciones_poblacion)
    return open_csv(url)


def fetch_hogar_size() -> tuple[dict[str, float], int]:
    """{CUSEC: tamaño_medio_hogar} para el año más reciente disponible.

    El indicador llega con coma decimal ("1,9"). Devuelve (mapa, año).
    """
    reader = _open_csv(ADRH_URL)
    next(reader, None)
    rows: dict[str, dict[int, float]] = {}
    for row in reader:
        if len(row) < 6:
            continue
        muni, _, secc, indic, periodo, total = row[:6]
        if not muni.startswith(MUNI_INE) or indic.strip() != "Tamaño medio del hogar":
            continue
        if not secc.strip():
            continue
        try:
            year = int(periodo)
            value = float(total.strip().replace(",", "."))
        except ValueError:
            continue
        if value <= 0:
            continue
        rows.setdefault(secc[:10], {})[year] = value

    if not rows:
        return {}, 0
    latest = max(y for yrs in rows.values() for y in yrs)
    out = {cusec: yrs[latest] for cusec, yrs in rows.items() if latest in yrs}
    return out, latest


# ── Censo 2021: viviendas familiares totales por sección ─────────────────

def fetch_census_dwellings() -> dict[str, int]:
    """{CUSEC: viviendas familiares totales} del Censo 2021 (INE).

    Lee la columna `t18_1` (total de viviendas familiares) del fichero de
    indicadores por sección censal. Cachea un subset de Granada capital;
    descarga el fichero nacional (~8 MB) solo si el subset no existe.
    """
    if CENSO_CACHE.exists():
        with CENSO_CACHE.open(encoding="utf-8") as fh:
            return {r["CUSEC"]: int(r["viviendas_total"])
                    for r in csv.DictReader(fh)}

    if not CENSO_NATIONAL.exists():
        print("[INFO] descargando indicadores Censo 2021 por sección (~8 MB)…")
        req = urllib.request.Request(
            CENSO_URL, headers={"User-Agent": "GranadaDataExplorer/1.0"}
        )
        with urllib.request.urlopen(req, timeout=300) as resp:
            CENSO_NATIONAL.parent.mkdir(parents=True, exist_ok=True)
            CENSO_NATIONAL.write_bytes(resp.read())

    out: dict[str, int] = {}
    with CENSO_NATIONAL.open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["cpro"] == "18" and r["cmun"] == "087":
                cusec = r["cpro"] + r["cmun"] + r["dist"] + r["secc"]
                out[cusec] = int(r["t18_1"])

    with CENSO_CACHE.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["CUSEC", "viviendas_total"])
        for cusec, v in sorted(out.items()):
            w.writerow([cusec, v])
    print(f"[OK] Censo 2021 viviendas: {len(out)} secciones Granada; "
          f"cache -> {CENSO_CACHE.relative_to(ROOT)}")
    return out


# ── Parsing de puntos VFT ───────────────────────────────────────────────

def parse_coord(v) -> float | None:
    """OpenRTA usa coma como decimal: '447302,1479' → 447302.1479."""
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def parse_int(v) -> int:
    """Plazas/unidades vienen como int, float o string; defaultea a 0."""
    if v is None or v == "":
        return 0
    try:
        return int(round(float(str(v).replace(",", "."))))
    except (TypeError, ValueError):
        return 0


def parse_year(v) -> int | None:
    """`registration_date` viene como string YYYYMMDD; devolvemos el año."""
    if v is None:
        return None
    s = str(v).strip()
    if len(s) >= 4 and s[:4].isdigit():
        return int(s[:4])
    return None


def vft_points(vfts: list[dict]) -> gpd.GeoDataFrame:
    """Construye un GeoDataFrame de puntos en EPSG:25830.

    Descarta registros sin coordenada (≈0.3 % en Granada). No hacemos
    geocoding fallback para mantener el pipeline ligero — el sesgo es
    irrelevante a escala de sección.
    """
    rows = []
    geoms = []
    skipped = 0
    for r in vfts:
        x = parse_coord(r.get("coord_x"))
        y = parse_coord(r.get("coord_y"))
        srid = r.get("srid")
        if x is None or y is None or srid not in (25830, "25830"):
            skipped += 1
            continue
        rows.append({
            "name": r.get("name"),
            "registration_code": r.get("registration_code"),
            "postal_code": r.get("postal_code"),
            "plazas": parse_int(r.get("tot_gen_places")),
            "unidades": parse_int(r.get("tot_gen_ua")),
            "year": parse_year(r.get("registration_date")),
        })
        geoms.append(Point(x, y))
    gdf = gpd.GeoDataFrame(rows, geometry=geoms, crs=METRIC)
    print(f"[INFO] VFT geocoded: {len(gdf)} con coords, {skipped} sin coords/SRID")
    return gdf


# ── Pipeline principal ──────────────────────────────────────────────────

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


def main() -> None:
    if not SECCIONES.exists():
        raise SystemExit(f"Falta {SECCIONES} - ejecuta antes los scripts base")

    vfts = fetch_openrta_vfts()
    gdf = vft_points(vfts)

    secciones = gpd.read_file(SECCIONES).to_crs(METRIC)

    # Spatial join: cada VFT recibe el CUSEC de la sección que la contiene.
    # how='left' + predicate='within' es lo natural; los pocos VFTs fuera
    # de Granada capital (errores de geocoding propios de OpenRTA) caerán
    # con CUSEC nulo y no contarán en agregados.
    joined = gpd.sjoin(
        gdf, secciones[["CUSEC", "geometry"]],
        how="left", predicate="within"
    )

    agg: dict[str, dict[str, int]] = {}
    # Para la serie histórica: por sección guardamos los años de
    # registration_date de cada VFT que cae dentro.
    years_per_section: dict[str, list[int]] = {}
    for _, r in joined.iterrows():
        cusec = r.get("CUSEC")
        if not isinstance(cusec, str):
            continue
        a = agg.setdefault(cusec, {"n_vfts": 0, "n_plazas": 0})
        a["n_vfts"] += 1
        a["n_plazas"] += int(r["plazas"] or 0)
        yr = r.get("year")
        if isinstance(yr, (int, float)) and yr == yr:  # not NaN
            years_per_section.setdefault(cusec, []).append(int(yr))

    n_fuera = int(joined["CUSEC"].isna().sum())
    print(f"[INFO] VFTs asignadas a secciones: {len(gdf) - n_fuera}; "
          f"fuera de Granada capital o sin match: {n_fuera}")

    hogar, hogar_year = fetch_hogar_size()
    if not hogar:
        print("[WARN] sin datos de tamaño medio del hogar - fallback no disponible")
    else:
        print(f"[INFO] tamaño medio del hogar: {len(hogar)} secciones (año {hogar_year})")

    censo = fetch_census_dwellings()
    print(f"[INFO] viviendas totales Censo 2021: {len(censo)} secciones Granada")

    # Patch del geojson conservando foreign members.
    fc = json.loads(SECCIONES.read_text(encoding="utf-8"))

    # Año de población más reciente disponible en el geojson (último valor
    # de poblacion_anios — ya pooled CAP 2025).
    anios_pob = fc.get("poblacion_anios") or []
    last_year = anios_pob[-1] if anios_pob else None

    # Rango temporal de la serie VFT: alineado al del slider de población
    # para que el control de año funcione igual con cualquier métrica.
    # 2015 (primer año del slider) queda con 0 VFTs — RTA empezó a registrar
    # masivamente en 2016 (legislación andaluza VFT publicada 2016).
    serie_years = sorted(set(anios_pob)) if anios_pob else []

    ratios: list[float] = []
    matched = 0
    sin_denominador = 0
    estimadas = 0  # secciones que cayeron al fallback pob/hogar (sin censo)
    for feat in fc["features"]:
        props = feat["properties"]
        cusec = props.get("CUSEC")
        block = agg.get(cusec, {"n_vfts": 0, "n_plazas": 0})
        sec_years = years_per_section.get(cusec, [])

        # Serie acumulada por sección: cuántas VFTs de las activas hoy
        # estaban ya registradas a fin de ese año.
        serie: dict[str, int] = {}
        if serie_years:
            sorted_yrs = sorted(sec_years)
            cumulative = 0
            j = 0
            for y in serie_years:
                while j < len(sorted_yrs) and sorted_yrs[j] <= y:
                    cumulative += 1
                    j += 1
                serie[str(y)] = cumulative

        # Denominador: viviendas familiares TOTALES del Censo 2021 (parque
        # completo). Fallback al estimador pob/hogar solo donde no hay pareo
        # censal (cambios de seccionado). El denominador es fijo entre años:
        # la evolución del ratio refleja solo el crecimiento del numerador VFT.
        viv_censo = censo.get(cusec)
        pob = (props.get("poblaciones") or {}).get(str(last_year)) if last_year is not None else None
        tam = hogar.get(cusec)
        viviendas: int | None = None
        fuente: str | None = None
        if viv_censo and viv_censo > 0:
            viviendas, fuente = viv_censo, "censo2021"
        elif pob and tam and tam > 0:
            viviendas, fuente = max(1, round(pob / tam)), "estimada"
            estimadas += 1

        ratio: float | None = None
        if viviendas:
            ratio = round(block["n_vfts"] / viviendas * 100, 2)
            ratios.append(ratio)
        else:
            sin_denominador += 1

        props["vft"] = {
            "n_vfts": block["n_vfts"],
            "n_plazas": block["n_plazas"],
            "viviendas_total": viviendas,
            "viviendas_fuente": fuente,
            "ratio_vft_pct": ratio,
            "serie": serie,
        }
        if block["n_vfts"] > 0:
            matched += 1

    # Cortes fijos compartidos con build_barrios.py (consistencia visual
    # al alternar sección↔barrio en la coropleta).
    if ratios:
        fc["vft_breaks"] = list(RATIO_BREAKS)
        fc["vft_colors"] = RAMP
    fc["vft_fecha_descarga"] = date.today().isoformat()
    fc["vft_year_referencia"] = last_year
    fc["vft_hogar_year"] = hogar_year
    fc["vft_viviendas_censo_anio"] = 2021  # parque total: Censo de Viviendas 2021
    fc["vft_serie_anios"] = serie_years

    SECCIONES.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    # Privacidad: NO se escribe la capa de puntos VFT individuales (exponía la
    # geolocalización exacta de viviendas). Solo se publica la densidad agregada
    # por sección, ya embebida en secciones_censales.geojson (bloque `vft`).

    # Resumen.
    total_vfts = sum(a["n_vfts"] for a in agg.values())
    total_plazas = sum(a["n_plazas"] for a in agg.values())
    print(f"[OK] secciones con VFT > 0: {matched}/{len(fc['features'])}; "
          f"sin denominador: {sin_denominador}; "
          f"denom. estimado (sin censo): {estimadas}")
    print(f"  total: {total_vfts} VFTs · {total_plazas} plazas")
    if ratios:
        ratios_no0 = [r for r in ratios if r > 0]
        print(f"  ratio % VFT/viviendas - rango {min(ratios):.2f}-{max(ratios):.2f}, "
              f"mediana>0={sorted(ratios_no0)[len(ratios_no0)//2] if ratios_no0 else 0:.2f}")
        # Histograma simple por bin para verificar que ninguno se queda vacío.
        bins = [0] * (len(RATIO_BREAKS) + 1)
        for r in ratios:
            placed = False
            for i, b in enumerate(RATIO_BREAKS):
                if r <= b:
                    bins[i] += 1
                    placed = True
                    break
            if not placed:
                bins[-1] += 1
        labels = (
            [f"<={RATIO_BREAKS[0]}"] +
            [f"{RATIO_BREAKS[i-1]}-{RATIO_BREAKS[i]}" for i in range(1, len(RATIO_BREAKS))] +
            [f">{RATIO_BREAKS[-1]}"]
        )
        print(f"  cortes fijos: " + ", ".join(f"{l}={n}" for l, n in zip(labels, bins)))

    # ── Agregado municipal para el panel "Ciudad" ───────────────────────
    # Plazas por año: cada VFT aporta sus plazas (constantes) a partir del
    # año de registro. Acumulamos cronológicamente.
    #
    # IMPORTANTE: usamos el dataset *spatial-joined* (sólo VFTs que caen
    # dentro de alguna sección), NO la lista plana de puntos. De esta forma
    # el big-number del panel Ciudad y la suma de la coropleta del mapa
    # siempre coinciden — antes había una discrepancia de 18 VFTs cuyo
    # geocoding las colocaba fuera del polígono de Granada capital.
    municipal_serie: dict[str, dict[str, int]] = {}
    if serie_years:
        joined_in = joined[joined["CUSEC"].notna()]
        all_rows = list(zip(joined_in["year"].tolist(), joined_in["plazas"].tolist()))
        all_rows = [(int(y), int(p or 0)) for y, p in all_rows if y == y and y is not None]
        all_rows.sort(key=lambda r: r[0])
        viviendas_muni = sum(
            (props.get("vft") or {}).get("viviendas_total") or 0
            for f in fc["features"]
            for props in (f["properties"],)
        )
        idx = 0
        acc_vfts = 0
        acc_plazas = 0
        for y in serie_years:
            while idx < len(all_rows) and all_rows[idx][0] <= y:
                acc_vfts += 1
                acc_plazas += all_rows[idx][1]
                idx += 1
            ratio = (
                round(acc_vfts / viviendas_muni * 100, 2)
                if viviendas_muni > 0 else None
            )
            municipal_serie[str(y)] = {
                "vfts": acc_vfts,
                "plazas": acc_plazas,
                "ratio_vft_pct": ratio,
            }

        municipal = {
            "anios": list(serie_years),
            "vfts": [municipal_serie[str(y)]["vfts"] for y in serie_years],
            "plazas": [municipal_serie[str(y)]["plazas"] for y in serie_years],
            "ratio_vft_pct": [municipal_serie[str(y)]["ratio_vft_pct"] for y in serie_years],
            "viviendas_total": viviendas_muni,
            "fecha_descarga": fc["vft_fecha_descarga"],
            "hogar_year": hogar_year,
        }

        # Merge en demografia.json (si no existe, avisamos y omitimos sin
        # reventar — el frontend cae con gracia: no muestra el tab Turismo).
        if DEMOGRAFIA.exists():
            demo = json.loads(DEMOGRAFIA.read_text(encoding="utf-8"))
            demo["vft_municipal"] = municipal
            DEMOGRAFIA.write_text(json.dumps(demo, ensure_ascii=False), encoding="utf-8")
            print(f"[OK] municipal VFT serie {serie_years[0]}-{serie_years[-1]}: "
                  f"{municipal['vfts'][0]} -> {municipal['vfts'][-1]} VFTs · "
                  f"{municipal['plazas'][-1]:,} plazas · "
                  f"ratio final {municipal['ratio_vft_pct'][-1]}% sobre "
                  f"{viviendas_muni:,} viviendas")
            print(f"  inyectado en {DEMOGRAFIA.relative_to(ROOT)}")
        else:
            print(f"[WARN] {DEMOGRAFIA.name} no existe - ejecuta build_demografia.py "
                  "antes para incluir la serie municipal de VFTs en el panel Ciudad")

    print("[NOTA] Re-ejecuta build_barrios.py para agregar VFT a barrios.")


if __name__ == "__main__":
    main()
