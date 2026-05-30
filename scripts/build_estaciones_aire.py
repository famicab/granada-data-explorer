"""
Build the Granada air quality stations layer from the Andalusian historical CSVs.

Scans raw-data/Calidad Aire/aire_raw, keeps only the municipality of Granada
(INE province 18, municipality 087), and for each active station computes the
most recent annual mean per pollutant. NO2 drives the display colour.

Station coordinates/names are not in the source CSVs (only numeric station
codes), so the two currently-active stations are mapped by their temporal
signature:
  - código 7  -> Granada Norte (2001-2024, urban-traffic reference)
  - código 10 -> Granada Palacio de Congresos (2010-2024, opened 2009)
Decommissioned stations (5, 8, 9) have no published coordinates and are skipped.
"""

import json
import re
from math import floor, log10
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw-data" / "Calidad Aire" / "aire_raw"
OUT = ROOT / "backend" / "data" / "estaciones_aire.geojson"

PROV, MUNI = 18, 87  # Granada province / Granada city (INE)

# Active stations we can geolocate: station code -> static metadata.
STATIONS = {
    7: {
        "name": "Granada Norte",
        "direccion": "Av. Luis Miranda Dávalos",
        "tipo": "Tráfico, urbana",
        "coordinates": [-3.6126595, 37.1961046],
    },
    10: {
        "name": "Granada Palacio de Congresos",
        "direccion": "Paseo del Violón (explanada Palacio de Congresos)",
        "tipo": "Tráfico, suburbana",
        "coordinates": [-3.5984717, 37.16605],
    },
}

# Standard reporting units for the SIVA network. Pb is reported in µg/m³ (EU
# Directive 2008/50), the other metals/B(a)P in ng/m³ (Directive 2004/107).
UNITS = {
    "SO2": "µg/m³", "NO": "µg/m³", "NO2": "µg/m³", "NOx": "µg/m³",
    "O3": "µg/m³", "C6H6": "µg/m³", "PM10": "µg/m³", "PM2.5": "µg/m³",
    "CO": "mg/m³", "Pb": "µg/m³", "As": "ng/m³", "Cd": "ng/m³",
    "Ni": "ng/m³", "B(a)P": "ng/m³",
}

# Popup ordering: regulated/headline pollutants first.
POLLUTANT_ORDER = ["NO2", "NOx", "NO", "PM10", "PM2.5", "O3", "SO2",
                   "CO", "C6H6", "Pb", "As", "Cd", "Ni", "B(a)P"]


def pollutant_of(name: str) -> str:
    m = re.match(r"\d{4}_(.+?)_(HH|DD|\d{4})", name)
    pol = m.group(1) if m else name
    return "PM2.5" if pol == "PM25" else pol


def year_of(name: str) -> int:
    return int(name[:4])


def norm(series: pd.Series) -> pd.Series:
    """Normalise zero-padded numeric codes to their integer string form."""
    return series.astype(str).str.strip().str.lstrip("0").replace("", "0")


def round_val(x: float) -> float:
    """2 decimals for values ≥1; 3 significant figures for small ones (metals)."""
    if x == 0:
        return 0.0
    if abs(x) >= 1:
        return round(x, 2)
    return round(x, 2 - floor(log10(abs(x))))


def annual_mean(df: pd.DataFrame) -> float | None:
    """Mean of all measurement values in a Granada subset, any file format."""
    cols = df.columns
    measure = [c for c in cols if re.fullmatch(r"[HD]\d{2}", c)]
    if measure:
        vals = df[measure].apply(pd.to_numeric, errors="coerce").stack()
    elif "VALOR" in cols:  # irregular-period files
        vals = pd.to_numeric(df["VALOR"], errors="coerce")
    else:
        return None
    m = vals.mean()
    return round_val(float(m)) if pd.notna(m) else None


def collect() -> dict[int, dict[str, dict[int, float]]]:
    """Annual-mean series per pollutant per station: station -> pollutant -> {year: mean}.

    When a pollutant has both daily (DD) and hourly (HH) files for a year, the
    later-sorted (HH, the standard continuous measurement) overwrites and wins.
    """
    series: dict[int, dict[str, dict[int, float]]] = {code: {} for code in STATIONS}
    for f in sorted(RAW.glob("*.csv")):
        pol = pollutant_of(f.name)
        year = year_of(f.name)
        df = pd.read_csv(f, sep=";", encoding="latin-1", header=0, dtype=str)
        df.columns = [c.strip() for c in df.columns]
        df = df[(norm(df.iloc[:, 0]) == str(PROV)) & (norm(df.iloc[:, 1]) == str(MUNI))]
        if df.empty:
            continue
        est_col = df.columns[2]
        for code in STATIONS:
            sub = df[norm(df[est_col]) == str(code)]
            if sub.empty:
                continue
            mean = annual_mean(sub)
            if mean is None:
                continue
            series[code].setdefault(pol, {})[year] = mean
    return series


def no2_level(value: float | None) -> tuple[str, str]:
    """Classify annual-mean NO2 (µg/m³). EU annual limit = 40, WHO 2021 = 10."""
    if value is None:
        return "sin datos", "#9ca3af"
    if value < 20:
        return "bueno", "#22c55e"
    if value < 40:
        return "moderado", "#f59e0b"
    return "alto (supera límite UE)", "#ef4444"


def main() -> None:
    series = collect()
    features = []
    for code, meta in STATIONS.items():
        st = series[code]
        # Latest annual value per pollutant, derived from the same series as the
        # chart so the listed value and the chart's last point always agree.
        contaminantes = [
            {"param": p, "valor": st[p][max(st[p])],
             "unidad": UNITS.get(p, ""), "anio": max(st[p])}
            for p in POLLUTANT_ORDER if st.get(p)
        ]
        no2 = next((c["valor"] for c in contaminantes if c["param"] == "NO2"), None)
        no2_anio = next((c["anio"] for c in contaminantes if c["param"] == "NO2"), None)
        nivel, color = no2_level(no2)
        # Annual-mean series per pollutant (NO2 first), only ≥2 points to plot.
        series_out = {
            p: [{"anio": y, "valor": st[p][y]} for y in sorted(st[p])]
            for p in POLLUTANT_ORDER
            if p in st and len(st[p]) >= 2
        }
        features.append({
            "type": "Feature",
            "properties": {
                "name": meta["name"],
                "direccion": meta["direccion"],
                "tipo": meta["tipo"],
                "no2": no2,
                "no2_anio": no2_anio,
                "nivel_no2": nivel,
                "color": color,
                "contaminantes": contaminantes,
                "series": series_out,
            },
            "geometry": {"type": "Point", "coordinates": meta["coordinates"]},
        })
        cont_str = ", ".join(f"{c['param']}={c['valor']}{c['unidad']}({c['anio']})"
                             for c in contaminantes)
        print(f"{meta['name']}: NO2={no2} -> {nivel}")
        print(f"    {cont_str}\n")

    fc = {
        "type": "FeatureCollection",
        "name": "estaciones_calidad_aire_granada",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }
    OUT.write_text(json.dumps(fc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ Wrote {len(features)} stations to {OUT}")


if __name__ == "__main__":
    main()
