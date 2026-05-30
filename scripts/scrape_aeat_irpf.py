"""
Scraper de "Estadística de los declarantes del IRPF por municipios" de la AEAT
para Granada capital (18087), años 2013-2023.

La AEAT no ofrece CSV directo; cada año está como página HTML en una ruta
con nombres de fichero hasheados. Para llegar a Granada:

  home.html
    -> "Detalle de los municipios con más de 1.000 habitantes" (home_parcial5...)
       -> "Datos municipales por orden alfabético"
          -> "G"
             -> "Granada-18087"  ← extraemos esta página

Cada navegación requiere buscar el enlace por su texto, no por URL fija.

Salida: raw-data/AEAT/irpf_municipal_granada.csv con una fila por año:
  anio, habitantes, n_declaraciones, n_titulares,
  renta_bruta_media, renta_disponible_media
"""

import csv
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "raw-data" / "AEAT" / "irpf_municipal_granada.csv"

BASE = (
    "https://sede.agenciatributaria.gob.es/AEAT/Contenidos_Comunes/"
    "La_Agencia_Tributaria/Estadisticas/Publicaciones/sites/irpfmunicipios/"
)
YEARS = list(range(2013, 2024))  # 2013-2023 inclusive
USER_AGENT = "Mozilla/5.0 (Granada Data Explorer scraper)"
PAUSE = 0.4  # cortesía entre requests


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        # La meta declara UTF-8 pero el contenido tiene algunos bytes cp1252
        # sueltos. Decodificamos como UTF-8 con `replace` y el parser se
        # ancla a sufijos ASCII para sortear los `�` resultantes.
        return resp.read().decode("utf-8", errors="replace")


def find_link_by_text(html: str, text_keyword: str) -> str | None:
    """Devuelve el href cuyo texto del <a> contiene `text_keyword`
    (case-insensitive)."""
    for m in re.finditer(
        r'<a[^>]+href="([^"]+\.html?)"[^>]*>([^<]+)</a>', html, re.IGNORECASE
    ):
        href, txt = m.group(1), re.sub(r"\s+", " ", m.group(2)).strip()
        if text_keyword.lower() in txt.lower():
            return href
    return None


def find_granada_page_url(year: int) -> str:
    """Navega home -> detalle municipios -> alfabético -> G -> Granada-18087.
    Devuelve la URL absoluta de la página de Granada."""
    year_base = f"{BASE}{year}/"
    # 1) home.html
    home = fetch(year_base + "home.html")
    time.sleep(PAUSE)

    # 2) Subpage "Detalle de los municipios con más de 1.000 habitantes"
    det = find_link_by_text(home, "Detalle de los municipios")
    if not det:
        raise RuntimeError(f"[{year}] no encontré 'Detalle de los municipios'")
    det_html = fetch(year_base + det)
    time.sleep(PAUSE)

    # 3) "Datos municipales por orden alfabético"
    alfab = find_link_by_text(det_html, "Datos municipales por orden alfab")
    if not alfab:
        raise RuntimeError(f"[{year}] no encontré 'orden alfabético'")
    alfab_html = fetch(year_base + alfab)
    time.sleep(PAUSE)

    # 4) Página de la letra G
    g_page = None
    # Buscamos un <a>...G</a> exacto (no GZip ni similar)
    for m in re.finditer(
        r'<a[^>]+href="([^"]+\.html?)"[^>]*>\s*G\s*</a>', alfab_html
    ):
        g_page = m.group(1)
        break
    if not g_page:
        raise RuntimeError(f"[{year}] no encontré la letra G")
    g_html = fetch(year_base + g_page)
    time.sleep(PAUSE)

    # 5) Granada-18087
    m = re.search(r'<a[^>]+href="([^"]+)"[^>]*>Granada-18087', g_html)
    if not m:
        raise RuntimeError(f"[{year}] no encontré 'Granada-18087'")
    return year_base + m.group(1)


# La AEAT publica el HTML como UTF-8 pero filtra algunos bytes cp1252
# sueltos. Tras decodificar (errors='replace') las tildes se vuelven `�`.
# Solución: anclar el match al SUFIJO ASCII del cell — distingue
# "RENTA BRUTA MEDIA" de "POSICIONAMIENTO DE LA RENTA BRUTA MEDIA A NIVEL
# NACIONAL" porque solo el primero TERMINA en "RENTA BRUTA MEDIA".
# Cada lista contiene regex que matchean el final del cell (sin el `|`).
LABEL_PATTERNS: dict[str, list[str]] = {
    "habitantes": [r"HABITANTES"],
    "n_declaraciones": [r"DECLARACIONES"],
    "n_titulares": [
        r"TITULARES DE LA DECLARACI.{1,3}",  # ÓN / �N / ON
        r"DECLARANTES",                      # alias en años antiguos
    ],
    "renta_bruta_media": [r"RENTA BRUTA MEDIA"],
    "renta_disponible_media": [r"RENTA DISPONIBLE MEDIA"],
}


def _to_number(s: str) -> int | None:
    """'32.694' -> 32694. Devuelve None si no parsea."""
    s = s.strip().replace(".", "").replace("\xa0", "").replace(" ", "")
    if not s or not s.lstrip("-").isdigit():
        return None
    try:
        return int(s)
    except ValueError:
        return None


def parse_granada_page(html: str) -> dict[str, int | None]:
    """Extrae los campos clave de la primera tabla. Para cada campo,
    busca un cell `|...PATRÓN|VALUE|` cuyo final (justo antes del `|`)
    coincida con el sufijo ASCII del campo."""
    flat = re.sub(r"<[^>]+>", "|", html)
    flat = re.sub(r"\|+", "|", flat)
    flat = re.sub(r"\s+", " ", flat)

    out: dict[str, int | None] = {}
    for field, patterns in LABEL_PATTERNS.items():
        value = None
        for suffix in patterns:
            # Cell content = cualquier cosa + sufijo justo antes del `|`,
            # valor = número entre dos `|`.
            pat = (
                r"\|[^|]*?"
                + suffix
                + r"\s*\|\s*([\-\d\.\xa0 ]+?)\s*\|"
            )
            m = re.search(pat, flat)
            if m:
                value = _to_number(m.group(1))
                if value is not None:
                    break
        out[field] = value
    return out


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    for year in YEARS:
        try:
            url = find_granada_page_url(year)
            html = fetch(url)
            time.sleep(PAUSE)
            data = parse_granada_page(html)
            data["anio"] = year
            rows.append(data)
            print(
                f"[OK] {year}: "
                f"bruta={data.get('renta_bruta_media')}, "
                f"disp={data.get('renta_disponible_media')}, "
                f"declaraciones={data.get('n_declaraciones')}, "
                f"habitantes={data.get('habitantes')}"
            )
        except Exception as e:
            print(f"[ERR] {year}: {e}")
            rows.append({"anio": year})

    cols = [
        "anio",
        "habitantes",
        "n_declaraciones",
        "n_titulares",
        "renta_bruta_media",
        "renta_disponible_media",
    ]
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in sorted(rows, key=lambda x: x["anio"]):
            w.writerow({c: r.get(c, "") for c in cols})
    print(f"\n[OUT] {OUT.relative_to(ROOT)}  ({len(rows)} filas)")


if __name__ == "__main__":
    main()
