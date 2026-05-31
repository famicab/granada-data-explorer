"""
Enriquece la capa de secciones con indicadores de renta del INE ADRH
(Atlas de Distribución de Renta de los Hogares), tabla 31025 "Indicadores de
renta media y mediana", cubriendo 2015-2023.

La tabla 31025 trae varios indicadores; el proyecto usa tres, alternables en
la UI:
  - renta_med_uc  → "Mediana de la renta por unidad de consumo"  (titular: robusto)
  - renta_hogar   → "Renta neta media por hogar"                 (intuitivo)
  - renta_persona → "Renta neta media por persona"               (per cápita, el histórico)

Para cada uno: cuantiles pooled sobre (sección, año) → mismos cortes de color
entre años. Se embebe `<key>[año]` por feature + `<key>_breaks/_colors` en el
FeatureCollection, más `renta_anios` compartido.
"""

import csv
import io
import json
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "backend" / "data" / "secciones_censales.geojson"

RENTA_URL = "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/31025.csv"
MUNI = "18087"  # Granada capital

# Clave embebida → nombre exacto del indicador en la tabla 31025.
INDICADORES = {
    "renta_med_uc": "Mediana de la renta por unidad de consumo",
    "renta_hogar": "Renta neta media por hogar",
    "renta_persona": "Renta neta media por persona",
}
# Variante por defecto (titular del coropleta y alias `renta` para compatibilidad).
DEFAULT_KEY = "renta_med_uc"

# ColorBrewer OrRd 5-class: secuencial cálido. Distinto de Blues/Purples
# (población) y de RdYlGn (verde/hab). Más oscuro = más renta.
RAMP = ["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#b30000"]


def _open_csv(url: str) -> csv.reader:
    from _ine_cache import open_csv  # cache local en raw-data/ine_cache/
    return open_csv(url)


def fetch_renta() -> dict[str, dict[str, dict[int, int]]]:
    """{key: {CUSEC: {año: valor_€}}} para los 3 indicadores, ADRH 2015-2023."""
    by_name = {name: key for key, name in INDICADORES.items()}
    reader = _open_csv(RENTA_URL)
    next(reader, None)  # cabecera: Municipios;Distritos;Secciones;Indicadores...;Periodo;Total
    out: dict[str, dict[str, dict[int, int]]] = {k: {} for k in INDICADORES}
    for row in reader:
        if len(row) < 6:
            continue
        muni, _dist, sec, indic, periodo, total = (
            row[0], row[1], row[2], row[3].strip(), row[4], row[5])
        if not muni.startswith(MUNI):
            continue
        key = by_name.get(indic)
        if key is None or not sec.strip():
            continue  # otro indicador, o fila de agregado (municipio/distrito)
        try:
            year = int(periodo)
            value = int(total.strip().replace(".", ""))  # "20.650" → 20650
        except ValueError:
            continue
        out[key].setdefault(sec[:10], {})[year] = value
    return out


def quantile_breaks(values: list[int], classes: int = 5) -> list[float]:
    """Cuantiles internos (classes-1 cortes)."""
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


def main() -> None:
    if not OUT.exists():
        raise SystemExit(
            f"Base layer missing: {OUT} (ejecuta antes los scripts de secciones)"
        )

    try:
        renta = fetch_renta()
    except Exception as e:
        print(f"[WARN] No se pudo descargar renta del INE ({e}); no se modifica el geojson")
        return

    if not any(renta.values()):
        print("[WARN] Sin valores de renta; no se modifica el geojson")
        return

    fc = json.loads(OUT.read_text(encoding="utf-8"))
    features = fc["features"]

    anios = sorted({y for var in renta.values() for yrs in var.values() for y in yrs})
    fc["renta_anios"] = anios

    for key, name in INDICADORES.items():
        series = renta[key]
        all_vals = [v for yrs in series.values() for v in yrs.values()]
        if not all_vals:
            print(f"[WARN] Sin valores para {key} ({name})")
            continue
        breaks = [round(b) for b in quantile_breaks(all_vals)]
        matched = 0
        for f in features:
            props = f["properties"]
            yrs = series.get(props.get("CUSEC"))
            if yrs:
                props[key] = {str(y): yrs[y] for y in anios if y in yrs}
                matched += 1
            else:
                props.setdefault(key, {})
        fc[f"{key}_breaks"] = breaks
        fc[f"{key}_colors"] = RAMP
        print(f"[OK] {key:<13} ({name}): {matched}/{len(features)} secciones · "
              f"rango {min(all_vals):,}-{max(all_vals):,} € · cortes {breaks}")

    # Alias de compatibilidad: `renta` = variante por defecto (mediana UC).
    for f in features:
        f["properties"]["renta"] = f["properties"].get(DEFAULT_KEY, {})
    fc["renta_breaks"] = fc.get(f"{DEFAULT_KEY}_breaks", [])
    fc["renta_colors"] = RAMP

    OUT.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
    print(f"[OK] Renta {anios[0]}-{anios[-1]} embebida (titular: {DEFAULT_KEY})")


if __name__ == "__main__":
    main()
