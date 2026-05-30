"""Cache local de descargas del INE.

Evita re-descargar las tablas jaxiT3 en cada ejecución del pipeline: la primera
vez guarda el CSV crudo en ``raw-data/ine_cache/<nombre>.csv`` y a partir de ahí
lo reutiliza desde disco.

- El cache vive bajo ``raw-data/`` → NO se versiona (está en .gitignore); es una
  caché por máquina, no datos redistribuidos.
- Para forzar una re-descarga: borra el fichero cacheado, o ejecuta con la
  variable de entorno ``INE_CACHE_REFRESH=1``.
"""

import csv
import io
import os
import urllib.request
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parent.parent / "raw-data" / "ine_cache"


def fetch_bytes(url: str) -> bytes:
    """Devuelve el contenido de ``url`` desde cache, descargándolo si falta."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    name = url.rstrip("/").split("/")[-1] or "download"
    cached = CACHE_DIR / name
    if cached.exists() and os.getenv("INE_CACHE_REFRESH") != "1":
        return cached.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read()
    cached.write_bytes(raw)
    print(f"[cache] descargado y guardado: raw-data/ine_cache/{name}")
    return raw


def open_csv(url: str, *, delimiter: str = ";", encoding: str = "utf-8-sig") -> "csv.reader":
    """csv.reader sobre el CSV cacheado de ``url`` (descarga si no existe)."""
    text = fetch_bytes(url).decode(encoding)
    return csv.reader(io.StringIO(text), delimiter=delimiter)
