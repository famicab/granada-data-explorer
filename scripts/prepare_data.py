"""
Prepare raw data for the API.
Converts GeoJSON to WGS84 and copies to backend/data/.
"""

import json
import shutil
from pathlib import Path

import geopandas as gpd

import build_estaciones_aire
import build_secciones_indicadores
import build_secciones_poblacion

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw-data"
OUT = ROOT / "backend" / "data"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # 1. Zonas verdes (OSM, WGS84): tres capas independientes.
    for src_name, out_name in [
        ("Parques.geojson", "parques.geojson"),
        ("Jardines.geojson", "jardines.geojson"),
        ("Arbolado.geojson", "arbolado.geojson"),
    ]:
        src = RAW / "Parques" / src_name
        if src.exists():
            shutil.copy2(src, OUT / out_name)
            print(f"✓ Copied {src.name}")

    # 2. Secciones censales — EPSG:25830 → WGS84
    src = RAW / "GIS" / "granada_secciones_censales.geojson"
    gdf = gpd.read_file(src)
    gdf = gdf.to_crs(epsg=4326)
    # Keep only useful columns
    gdf = gdf[["CUSEC", "CDIS", "CSEC", "NMUN", "geometry"]]
    gdf.to_file(OUT / "secciones_censales.geojson", driver="GeoJSON")
    print(f"✓ Reprojected {src.name} → WGS84 ({len(gdf)} features)")
    # Enrich with population (INE ADRH) for the choropleth
    build_secciones_poblacion.main()

    # 3. Distritos — already WGS84, copy as-is
    src = RAW / "GIS" / "Distritos.geojson"
    if src.exists():
        shutil.copy2(src, OUT / "distritos.geojson")
        print(f"✓ Copied {src.name}")

    # 4. Estaciones de calidad del aire — derived from the historical SIVA CSVs
    build_estaciones_aire.main()

    # 5. Indicadores por sección (superficie verde + estación más cercana) —
    # requiere que las capas verdes y las estaciones ya estén escritas arriba.
    build_secciones_indicadores.main()

    print(f"\nAll data written to {OUT}")


if __name__ == "__main__":
    main()
