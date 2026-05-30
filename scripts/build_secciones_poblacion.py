"""
Enrich census-sections layer with a temporal population series for the
choropleth map (slider-driven year selection).

Population by CUSEC comes from two INE products:
  - ADRH (Atlas de Distribución de Renta de los Hogares), Granada-province
    table 31033, indicator "Población" — covers 2015-2023.
  - CAP  (Censo Anual de Población), Granada-province table 69178,
    Sexo=Total, Nacionalidad=Total — covers 2021-2025 with the current
    register-based methodology.

For overlapping years (2021-2023) CAP wins, so the combined series is
ADRH 2015-2020 + CAP 2021-2025 (11 annual snapshots). Quantile class breaks
are computed from the POOLED distribution of every (section, year) value, so
the same colour always means the same population range across years — the
slider then reveals real changes.
"""

import csv
import io
import json
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "backend" / "data" / "secciones_censales.geojson"

ADRH_URL = "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/31033.csv"
CAP_URL = "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/69178.csv"
MUNI = "18087"  # Granada city

# ColorBrewer "Blues" 5-class — sequential, legible, colour-blind friendly.
RAMP = ["#eff3ff", "#bdd7e7", "#6baed6", "#3182bd", "#08519c"]
NO_DATA = "#cccccc"


def _open_csv(url: str) -> csv.reader:
    from _ine_cache import open_csv  # cache local en raw-data/ine_cache/
    return open_csv(url)


def fetch_adrh() -> dict[str, dict[int, int]]:
    """{CUSEC: {year: population}} from ADRH (2015-2023)."""
    reader = _open_csv(ADRH_URL)
    next(reader, None)
    out: dict[str, dict[int, int]] = {}
    for row in reader:
        if len(row) < 6:
            continue
        secc, indic, periodo, total = row[2], row[3].strip(), row[4], row[5]
        if indic != "Población" or not secc.startswith(MUNI):
            continue
        try:
            year = int(periodo)
            value = int(total.strip().replace(".", ""))
        except ValueError:
            continue
        out.setdefault(secc[:10], {})[year] = value
    return out


def fetch_cap() -> dict[str, dict[int, int]]:
    """{CUSEC: {year: population}} from CAP (2021-2025), Total/Total filter."""
    reader = _open_csv(CAP_URL)
    next(reader, None)  # header: Provincias;Municipios;Secciones;Sexo;Nacionalidad;Periodo;Total
    out: dict[str, dict[int, int]] = {}
    for row in reader:
        if len(row) < 7:
            continue
        secc, sexo, nac, periodo, total = row[2], row[3].strip(), row[4].strip(), row[5], row[6]
        if sexo != "Total" or nac != "Total" or not secc.startswith(MUNI):
            continue
        try:
            year = int(periodo)
            value = int(total.strip().replace(".", ""))
        except ValueError:
            continue
        out.setdefault(secc[:10], {})[year] = value
    return out


def fetch_poblacion() -> tuple[dict[str, dict[int, int]], dict[str, int]]:
    """Return merged {CUSEC: {year: population}} (CAP wins on overlap) plus stats."""
    adrh = fetch_adrh()
    try:
        cap = fetch_cap()
    except Exception as e:
        print(f"⚠ CAP no disponible ({e}); usando solo ADRH 2015-2023")
        cap = {}

    merged: dict[str, dict[int, int]] = {c: dict(y) for c, y in adrh.items()}
    for cusec, yrs in cap.items():
        merged.setdefault(cusec, {}).update(yrs)  # CAP pisa años solapados

    stats = {
        "adrh_secciones": len(adrh),
        "cap_secciones": len(cap),
        "ambos": len(set(adrh) & set(cap)),
        "solo_adrh": len(set(adrh) - set(cap)),
        "solo_cap": len(set(cap) - set(adrh)),
    }
    return merged, stats


def quantile_breaks(values: list[int], classes: int = 5) -> list[float]:
    """Internal quantile boundaries (classes-1 of them)."""
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
        raise SystemExit(f"Base layer missing: {OUT} (run the secciones step first)")

    fc = json.loads(OUT.read_text(encoding="utf-8"))
    features = fc["features"]

    try:
        poblacion, stats = fetch_poblacion()
    except Exception as e:
        print(f"⚠ No se pudo descargar población del INE ({e}); capa sin coropleta")
        return

    # Pool every (section, year) value — fixed breaks across years let the
    # slider expose real change instead of reshuffled class boundaries.
    all_vals: list[int] = [v for yrs in poblacion.values() for v in yrs.values()]
    if not all_vals:
        print("⚠ Sin valores de población — capa sin coropleta")
        return

    breaks = [round(b) for b in quantile_breaks(all_vals)]
    anios = sorted({y for yrs in poblacion.values() for y in yrs})

    matched = 0
    for f in features:
        props = f["properties"]
        cusec = props.get("CUSEC")
        yrs = poblacion.get(cusec)
        if yrs:
            props["poblaciones"] = {str(y): yrs[y] for y in anios if y in yrs}
            matched += 1
        else:
            props["poblaciones"] = {}
        # Drop fields from the previous single-year version.
        props.pop("poblacion", None)
        props.pop("color", None)

    edges = [min(all_vals)] + breaks + [max(all_vals)]
    fc["leyenda"] = [
        {"min": edges[i], "max": edges[i + 1], "color": RAMP[i]}
        for i in range(len(RAMP))
    ]
    fc["poblacion_breaks"] = breaks
    fc["poblacion_colors"] = RAMP
    fc["poblacion_anios"] = anios
    fc.pop("poblacion_anio", None)  # legacy single-year field

    OUT.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    print(f"✓ Población {anios[0]}–{anios[-1]} ({len(anios)} años): "
          f"{matched}/{len(features)} secciones cruzadas")
    print(f"  ADRH: {stats['adrh_secciones']} secs · CAP: {stats['cap_secciones']} secs · "
          f"ambos: {stats['ambos']} · solo ADRH: {stats['solo_adrh']} · "
          f"solo CAP: {stats['solo_cap']}")
    print(f"  rango pooled: {min(all_vals)}–{max(all_vals)} hab.  cortes (cuantiles): "
          + ", ".join(f"≤{b}" for b in breaks))


if __name__ == "__main__":
    main()
