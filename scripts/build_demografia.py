"""
Build backend/data/demografia.json — datos demográficos a nivel municipal
(Granada) que NO tienen geometría, listos para el panel "Demografía":

  - serie:    habitantes 1996-2025 (total, hombres, mujeres).
  - piramide: población por grupo quinquenal y sexo, 2003-2025.

Fuentes:
  - raw-data/Demografia/"Habitantes Granada por sexos desde 1996.csv"
  - raw-data/Demografia/"Poblacion por sexo edad grupos quinquenales.csv"
        (CAP/Censo Anual de Población, 2021-2025)
  - INE Tempus3 tabla 33794 "Población por sexo, municipios y edad
        (grupos quinquenales)" — Padrón continuo, prov. Granada, 2003-2022.
        Sirve para extender la pirámide hacia atrás (2003-2020).

En el solapamiento Padrón vs CAP (2021-2022), CAP gana — misma política
que ya usa build_secciones_poblacion.py.

Los CSV locales del INE están en cp1252 con `;` como separador y `.`
como separador de miles ("233.975" = 233 975 personas). El CSV de
Tempus3 viene en utf-8-sig.
"""

import csv
import io
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw-data" / "Demografia"
OUT = ROOT / "backend" / "data" / "demografia.json"

SERIE_CSV = RAW / "Habitantes Granada por sexos desde 1996.csv"
PIRAMIDE_CSV = RAW / "Poblacion por sexo edad grupos quinquenales.csv"
RENTA_CSV = ROOT / "raw-data" / "AEAT" / "irpf_municipal_granada.csv"

PADRON_URL = "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/33794.csv"
MUNI_PREFIX = "18087"  # Granada capital
_PERIODO_AÑO = re.compile(r"\b(\d{4})\b")


def _to_int(s: str) -> int:
    """'233.975' → 233975  (el `.` es separador de miles)."""
    return int(s.strip().replace(".", ""))


def _group_lower_bound(grupo: str) -> int:
    """'De 5 a 9 años' → 5  ·  '100 y más años' → 100. Para ordenar."""
    m = re.search(r"\d+", grupo)
    return int(m.group(0)) if m else 9999


def build_serie() -> dict:
    """{anios:[...], total:[...], hombres:[...], mujeres:[...]}."""
    by_sex_year: dict[str, dict[int, int]] = {"Total": {}, "Hombres": {}, "Mujeres": {}}
    with SERIE_CSV.open(encoding="cp1252") as f:
        reader = csv.reader(f, delimiter=";")
        next(reader, None)  # cabecera
        for row in reader:
            if len(row) < 4:
                continue
            _muni, sexo, periodo, total = row[0], row[1].strip(), row[2], row[3]
            if sexo not in by_sex_year:
                continue
            try:
                by_sex_year[sexo][int(periodo)] = _to_int(total)
            except ValueError:
                continue
    anios = sorted(by_sex_year["Total"])
    return {
        "anios": anios,
        "total": [by_sex_year["Total"].get(y) for y in anios],
        "hombres": [by_sex_year["Hombres"].get(y) for y in anios],
        "mujeres": [by_sex_year["Mujeres"].get(y) for y in anios],
    }


def fetch_padron_quinquenal() -> dict[str, dict[int, dict[str, int]]]:
    """Descarga la tabla INE 33794 y devuelve {sexo:{anio:{edad:valor}}}
    para el municipio 18087 (Granada capital). Cubre 2003-2022."""
    from _ine_cache import open_csv  # cache local en raw-data/ine_cache/
    reader = open_csv(PADRON_URL)
    next(reader, None)  # cabecera: Sexo;Provincias;Municipios;Edad;Periodo;Total
    out: dict[str, dict[int, dict[str, int]]] = {"Hombres": {}, "Mujeres": {}}
    for row in reader:
        if len(row) < 6:
            continue
        sexo = row[0].strip()
        muni = row[2]
        edad = row[3].strip()
        periodo = row[4]
        total = row[5]
        if sexo not in out or not muni.startswith(MUNI_PREFIX):
            continue
        if edad == "Todas las edades" or not total.strip():
            continue
        m = _PERIODO_AÑO.search(periodo)
        if not m:
            continue
        try:
            anio = int(m.group(1))
            valor = _to_int(total)
        except ValueError:
            continue
        out[sexo].setdefault(anio, {})[edad] = valor
    return out


def build_piramide() -> dict:
    """
    {
      anios: [...],
      grupos: ["De 0 a 4 años", ...],   # orden canónico ascendente
      hombres: { "2003": [...por grupo...], ... },
      mujeres: { ... }
    }

    Combina:
      - CSV local (CAP, 2021-2025) → prioritario en años solapados.
      - INE 33794 (Padrón continuo, 2003-2022) → rellena 2003-2020.
    """
    raw: dict[str, dict[int, dict[str, int]]] = {"Hombres": {}, "Mujeres": {}}
    grupos_set: set[str] = set()
    anios_set: set[int] = set()

    with PIRAMIDE_CSV.open(encoding="cp1252") as f:
        reader = csv.reader(f, delimiter=";")
        next(reader, None)
        # cabecera: Total Nacional; Provincias; Municipios; Sexo; Nacionalidad; Edad; Periodo; Total
        for row in reader:
            if len(row) < 8:
                continue
            sexo = row[3].strip()
            nac = row[4].strip()
            edad = row[5].strip()
            if sexo not in raw or nac != "Total" or edad == "Todas las edades":
                continue
            try:
                anio = int(row[6])
                valor = _to_int(row[7])
            except ValueError:
                continue
            raw[sexo].setdefault(anio, {})[edad] = valor
            grupos_set.add(edad)
            anios_set.add(anio)

    cap_anios = sorted(anios_set)
    padron_solo: list[int] = []
    try:
        padron = fetch_padron_quinquenal()
        for sexo, anios_data in padron.items():
            for anio, edades in anios_data.items():
                if anio in raw[sexo]:
                    continue  # CAP gana
                raw[sexo][anio] = edades
                anios_set.add(anio)
                grupos_set.update(edades.keys())
                if anio not in padron_solo:
                    padron_solo.append(anio)
    except Exception as e:
        print(f"[WARN] Padron continuo no disponible ({e}); piramide solo CAP")

    grupos = sorted(grupos_set, key=_group_lower_bound)
    anios = sorted(anios_set)

    def arr(sexo: str, anio: int) -> list[int]:
        return [raw[sexo].get(anio, {}).get(g, 0) for g in grupos]

    return {
        "anios": anios,
        "grupos": grupos,
        "hombres": {str(a): arr("Hombres", a) for a in anios},
        "mujeres": {str(a): arr("Mujeres", a) for a in anios},
        # Trazabilidad de fuentes (no es metadato secreto; el frontend lo ignora).
        "fuentes": {
            "cap": cap_anios,
            "padron_continuo": sorted(padron_solo),
        },
    }


def build_renta_municipal() -> dict | None:
    """Lee el CSV scrapeado de AEAT IRPF (raw-data/AEAT/) y devuelve un
    dict listo para servir. None si el CSV no existe (en cuyo caso el
    panel Demografía simplemente no muestra la gráfica).
    Cobertura: 2013-2023 a nivel municipio Granada (18087)."""
    if not RENTA_CSV.exists():
        return None
    with RENTA_CSV.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return None

    def _opt_int(v: str | None) -> int | None:
        if v is None or v == "":
            return None
        try:
            return int(v)
        except ValueError:
            return None

    anios = [int(r["anio"]) for r in rows]
    return {
        "anios": anios,
        "renta_bruta_media": [_opt_int(r.get("renta_bruta_media")) for r in rows],
        "renta_disponible_media": [
            _opt_int(r.get("renta_disponible_media")) for r in rows
        ],
        "n_declaraciones": [_opt_int(r.get("n_declaraciones")) for r in rows],
        "habitantes": [_opt_int(r.get("habitantes")) for r in rows],
        "fuente": "AEAT · IRPF declarantes municipios (Granada 18087)",
    }


def main() -> None:
    if not SERIE_CSV.exists():
        raise SystemExit(f"Falta: {SERIE_CSV}")
    if not PIRAMIDE_CSV.exists():
        raise SystemExit(f"Falta: {PIRAMIDE_CSV}")

    data: dict = {
        "municipio": "Granada",
        "serie": build_serie(),
        "piramide": build_piramide(),
    }
    renta = build_renta_municipal()
    if renta:
        data["renta_municipal"] = renta

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    s = data["serie"]
    p = data["piramide"]
    primer = s["total"][0]
    ultimo = s["total"][-1]
    print(
        f"[OK] Serie {s['anios'][0]}-{s['anios'][-1]} ({len(s['anios'])} anios): "
        f"{primer:,} -> {ultimo:,} hab. (delta {ultimo - primer:+,})"
    )
    print(
        f"[OK] Piramide {p['anios'][0]}-{p['anios'][-1]} ({len(p['anios'])} anios, "
        f"{len(p['grupos'])} grupos quinquenales)"
    )
    fuentes = p.get("fuentes", {})
    cap_n = len(fuentes.get("cap", []))
    pad_n = len(fuentes.get("padron_continuo", []))
    print(f"  fuentes: Padron continuo {pad_n} anios + CAP {cap_n} anios")
    if renta:
        first = renta["renta_bruta_media"][0]
        last = renta["renta_bruta_media"][-1]
        print(
            f"[OK] Renta municipal (IRPF) {renta['anios'][0]}-{renta['anios'][-1]} "
            f"({len(renta['anios'])} anios): bruta {first:,} -> {last:,} EUR"
        )
    print(f"  output: {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
