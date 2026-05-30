# Granada Data Explorer

Explorador interactivo de datos abiertos de la ciudad de **Granada**: demografía,
renta, calidad del aire, vivienda turística, zonas verdes y equipamientos, sobre un
mapa por secciones censales y barrios.

- **Frontend:** React + TypeScript + Leaflet (Vite)
- **Backend:** FastAPI sirviendo capas GeoJSON / JSON ya procesadas
- **Pipeline de datos:** scripts Python (pandas / geopandas) que descargan y
  transforman las fuentes oficiales a `backend/data/`

## Estructura

```
backend/        API FastAPI (sirve backend/data/)
  data/         Datos procesados que consume la app (versionados)
frontend/       SPA React + Leaflet
scripts/        Pipeline build_*.py + prepare_data.py (regeneran backend/data/)
raw-data/       Datos crudos (NO versionados — ver .gitignore; reproducibles)
```

## Arranque local

### Backend (FastAPI)

```bash
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1   ·   Linux/Mac: source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

La API queda en `http://localhost:8000` (`/api/layers`, `/api/layers/{nombre}`,
`/api/demografia`, `/api/health`).

### Frontend (Vite)

```bash
cd frontend
npm install
npm run dev
```

Por defecto el frontend llama a `/api`. Para apuntar a otro host, copia
`.env.example` a `.env` y define `VITE_API_URL`.

### Regenerar los datos (opcional)

Los datos procesados ya están en `backend/data/`. Para reconstruirlos desde las
fuentes oficiales:

```bash
pip install -r requirements.txt   # pandas, geopandas, shapely
python scripts/prepare_data.py    # y/o los scripts build_*.py individuales
```

Los crudos pesados (`raw-data/Calidad Aire/`, `granada.pbf`, …) no se incluyen en
el repositorio; cada `scripts/build_*.py` documenta su descarga.

Las tablas del INE se descargan automáticamente la primera vez y se **cachean** en
`raw-data/ine_cache/` (no versionado), así que las ejecuciones siguientes no
vuelven a descargarlas. Para forzar una actualización: borra esa carpeta o ejecuta
con `INE_CACHE_REFRESH=1`. Los datasets que se leen de CSVs locales (calidad del
aire, demografía quinquenal) sí requieren tener esos crudos en `raw-data/`.

---

## Fuentes de datos y atribución

Cada dataset conserva la licencia de su fuente original (ver
[DATA_LICENSE.md](DATA_LICENSE.md)). Inventario por identificador (referenciado
desde la sección de métricas):

| ID | Fuente | Organismo | Contenido | Licencia |
|---|---|---|---|---|
| F1 | OpenRTA | Junta de Andalucía (Turismo) | Viviendas de uso turístico (VFT) | Reutilización con atribución |
| F2 | ADRH tabla 31025 | INE | Renta neta media por sección | Reutilización con atribución |
| F3 | ADRH tabla 31033 | INE | Población + tamaño hogar por sección | Reutilización con atribución |
| F4 | CAP tabla 69178 | INE | Población por sección 2021-25 | Reutilización con atribución |
| F5 | Padrón continuo 33794 + CAP quinquenal | INE | Pirámide quinquenal municipal | Reutilización con atribución |
| F6 | IRPF declarantes municipios | AEAT | Renta IRPF municipal | Reutilización con atribución |
| F7 | SIVA — históricos cuantitativos | Junta de Andalucía (CMAOT) | Calidad del aire | Reutilización con atribución |
| F8 | Cartografía Censal `seccionado_2026` | INE | Secciones censales | Reutilización con atribución |
| F9 | OpenStreetMap | OSM Foundation | Barrios, distritos, POIs, viario, parques | **ODbL** (atribución + share-alike) |

> © OpenStreetMap contributors — datos bajo [ODbL](https://opendatacommons.org/licenses/odbl/).
> Fuentes estadísticas: INE, Junta de Andalucía, AEAT.

### Metodología por fuente (resumen)

- **F1 · OpenRTA** — `datos.juntadeandalucia.es/api/v0/openrta/all` (JSON, ~193 k
  registros Andalucía). Filtrado a `Vivienda de uso turístico` + `GRANADA`, parseo
  de coordenadas (EPSG:25830), spatial-join `within` contra secciones censales.
  *Limitación:* snapshot vivo sin histórico oficial → la serie se reconstruye desde
  `registration_date` y tiene **sesgo superviviente** (las VFT dadas de baja no
  aparecen; los años pasados quedan sub-estimados). No incluye VFT ilegales.
- **F2 · ADRH 31025 (renta)** — CSV INE `ine.es/jaxiT3/files/t/es/csv_bdsc/31025.csv`.
  Filtro municipio `18087` + `Renta neta media por persona`. Cobertura 2015-2023;
  para 2024-25 la UI cae al último año disponible.
- **F3 · ADRH 31033 (población/hogar)** — CSV INE tabla 31033. Población e indicador
  "Tamaño medio del hogar" por sección, 2015-2023.
- **F4 · CAP 69178** — CSV INE. Población por sección 2021-2025 (metodología
  registral nueva). En años solapados con F3 (2021-2023), **CAP gana**.
- **F5 · Padrón 33794 + CAP quinquenal** — Padrón continuo 2003-2022 (descarga al
  vuelo) fusionado con CSV local CAP quinquenal 2021-2025 (Sexo × Nacionalidad ×
  Edad, generado vía "Personalizar tabla" de jaxiT3 sobre la operación CAP, raíz
  tabla 69181). CAP gana en años solapados.
- **F6 · AEAT IRPF** — *scraping* del HTML de la sede de la AEAT
  (`sede.agenciatributaria.gob.es/.../irpfmunicipios/{año}`), 2013-2023. Extrae
  habitantes, nº declaraciones, renta bruta y disponible media (**por declarante**,
  no per cápita). *Limitación:* se rompe si la AEAT cambia la maquetación.
- **F7 · SIVA (aire)** — CSVs horarios/diarios 2001-2024 (`latin-1`, `;`). Media
  anual por estación-contaminante; bandas NO₂ UE (20/40 µg/m³). *Limitación:* solo
  **2 estaciones activas** (códigos 7 y 10, geolocalizadas e identificadas por su
  firma temporal — **no confirmadas oficialmente**); asignación sección→estación por
  vecino más cercano (Voronoi gruesa).
- **F8 · Cartografía Censal INE** — `seccionado_2026.zip` (España completa).
  Recorte a Granada capital con QGIS (`CUMUN='18087'` → 180 secciones), reproyección
  EPSG:25830 → WGS84. Sobre esta geometría se "parchean" los indicadores.
- **F9 · OpenStreetMap** — extracción vía Overpass Turbo (área `Granada, Spain`).
  Capas verdes (`leisure=park/garden`, `landuse=grass`/`natural=wood`), viario
  (`highway=*`), POIs (`amenity`/`tourism`/`historic`). *Limitaciones:* OSM no es
  exhaustivo ni uniforme; sin fecha de snapshot conocida la auditabilidad temporal
  es nula. **Atribución ODbL obligatoria.**

---

## Métricas

Las métricas se agrupan por panel. Para cada una se documenta entrada, cálculo y
sesgos. Resumen (formulación completa en los `scripts/build_*.py`):

### A. Coropletas del mapa

| ID | Métrica | Entrada | Cálculo | Sesgo clave |
|---|---|---|---|---|
| M1 | Habitantes por sección/barrio | F3+F4+F8 | Serie fusionada ADRH 2015-20 + CAP 2021-25; cuantiles *pooled* (5 clases Blues) | Salto metodológico ADRH→CAP en 2020-21 |
| M2 | Verde por habitante (m²/hab) | F9+F8+M1 | `superficie_verde_m2 / pob[año]`; precedencia parques>jardines>arbolado para evitar doble conteo; umbral OMS 9 m²/hab | "Verde" según etiqueta OSM ≠ definición legal; sin accesibilidad real |
| M3 | Exposición NO₂ (µg/m³) | F7+F8 | NO₂ de la estación más cercana al centroide; barrios = media ponderada por población. Bandas UE <20 / 20-40 / >40 | Solo 2 estaciones (Voronoi gruesa) |
| M4 | Renta neta media/persona | F2+F8 | Valor directo ADRH; barrios = media ponderada por población; cuantiles *pooled* (OrRd) | ADRH experimental, revisado retrospectivamente |
| M5 | VFT por 100 viviendas (%) | F1+F3+F8 | `viviendas≈pob_reciente/tam_hogar_2023`; `ratio[año]=VFT_acum≤año/viviendas×100`; cortes fijos `[1,3,7,12,20,30]` | **Sesgo superviviente**; denominador fijo; sin VFT ilegales |

### B. Indicadores del AreaPanel (al pulsar una sección/barrio)

- **M7 · Delta poblacional 2015→2025** — `pob[2025]-pob[2015]` absoluto y %.
- **M8 · Equipamientos (POI)** — nº de POIs `within` por categoría (6 categorías
  OSM); si 0, distancia al más cercano (se lista si `<500 m`, "caminable").
- **M9 · Estación de aire más cercana** — menor distancia al centroide (sección) /
  estación que cubre más población (barrio).
- **M10 · Renta del año slider** — valor del año; *fallback* al último disponible.
- **M11 · VFT del año slider** — VFT acumuladas + plazas + ratio % + alerta `≥10 %`.
- *M6 (pirámide por sección): no implementada.*

### C. Rankings (top-10 por año del slider)

M12 Población · M13 Renta · M14 Verde/hab · M15 Peor NO₂ · M16 Crecimiento
poblacional · M16b VFT %.

### D. Panel "Ciudad" (agregados municipales)

- **M17 · Pirámide quinquenal** — F5 (Padrón 33794 + CAP quinquenal). Salto
  metodológico visible en 2021.
- **M18 · Serie de habitantes 1996-2025** — INE jaxiT3 tabla **2871** (cifras
  oficiales del Padrón). Saltos 2020-21 son metodológicos, no demográficos.
- **M19 · Renta IRPF municipal** — F6. Renta bruta y disponible media 2013-2023
  (**por declarante**; excluye rentas exentas y no obligados a declarar).
- **M20 · Serie municipal acumulada de VFT** — F1 (≈3 626 a 2025). Mismo sesgo
  superviviente que M5; el año en curso se descarta por parcial.

### Cobertura temporal

| Métrica | Rango con datos | Fuera de rango |
|---|---|---|
| M1 Población · M2 Verde | 2015-2025 | — |
| M3 NO₂ | 2001-2024 | gris si no hay dato |
| M4 Renta sec/barrio | 2015-2023 | fallback al último año |
| M5 VFT % | 2016-2025 | 2015 = 0; 2026+ no aplica |
| M17 Pirámide | 2003-2025 | — |
| M18 Serie larga | 1996-2025 | — |
| M19 Renta IRPF | 2013-2023 | — |

> ⚠️ Los datos son experimentales y con limitaciones documentadas (sesgos,
> snapshots, estaciones inferidas). Léelas antes de usarlos para conclusiones.

---

## Licencias

- **Código** (`backend/`, `frontend/`, `scripts/`): MIT — ver [LICENSE](LICENSE).
- **Datos**: cada dataset conserva la licencia de su fuente. Incluyen
  **OpenStreetMap (ODbL, atribución + share-alike)**, INE, Junta de Andalucía y
  AEAT. Condiciones y atribución en [DATA_LICENSE.md](DATA_LICENSE.md).
