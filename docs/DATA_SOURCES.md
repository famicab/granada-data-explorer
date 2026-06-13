# Fuentes de datos — Granada Data Explorer

Inventario de todos los datasets de los que se alimenta el proyecto, en el orden en que entran al pipeline. La columna "Identificador" (F1, F2…) se referencia desde [METRICS.md](METRICS.md).

> **Nota:** las rutas a `raw-data/` que aparecen abajo describen la procedencia de cada dato, pero esa carpeta **no está versionada** (datos crudos pesados; ver [.gitignore](../.gitignore)). Los datos procesados que sirve la app están en `backend/data/` y son reproducibles con los `scripts/build_*.py`.

| ID | Fuente | Organismo | Ámbito |
|---|---|---|---|
| F1 | OpenRTA | Junta de Andalucía (Consejería de Turismo) | VFTs en Granada |
| F2 | ADRH tabla 31025 | INE | Renta por sección y municipio (mediana UC · hogar · persona) |
| F3 | ADRH tabla 31033 | INE | Población + tamaño hogar por sección |
| F4 | CAP tabla 69178 | INE | Población por sección 2021-25 |
| F5 | Padrón continuo tabla 33794 | INE | Pirámide quinquenal municipal |
| F6 | IRPF declarantes municipios | AEAT (Sede Electrónica) | Renta IRPF municipal |
| F7 | SIVA — históricos cuantitativos | Junta de Andalucía (CMAOT) | Calidad del aire |
| F8 | Cartografía Censal | INE | Secciones censales |
| F9 | OpenStreetMap | OSM Foundation | Barrios, distritos, POIs, viario, parques, terrazas |
| F10 | Censo 2021 — Indicadores por sección | INE | Viviendas familiares totales (denominador VFT) |

---

## F1 · OpenRTA — Registro de Turismo de Andalucía

**Organismo responsable:** Junta de Andalucía · Consejería competente en Turismo (registro público RTA).

**URL de origen:** `https://datos.juntadeandalucia.es/api/v0/openrta/all?format=json`
(la variante `format=csv` existe pero llega corrupta: delimitador `|` con campos sin escape — el script usa la JSON).

**Fecha de descarga:** registrada por ejecución en `vft_fecha_descarga` (campo de cada GeoJSON afectado) y volcada al cache `raw-data/openrta_granada_vft.json`.

**Cobertura temporal:** snapshot del día; el endpoint no expone histórico. Cada registro lleva `registration_date`.

**Cobertura geográfica:** toda Andalucía. Filtrado en pipeline a `municipalities == "GRANADA"`.

**Formato original:** JSON, ~193 k registros (~50 MB), todos los tipos turísticos.

**Transformaciones aplicadas:**
1. Descarga del JSON completo + cache local en `raw-data/openrta_granada_vft.json`.
2. Filtro por `objects_type_id == "Vivienda de uso turístico"` y `municipalities == "GRANADA"`.
3. Parsing de `coord_x`, `coord_y` (coma decimal → `float`).
4. Construcción de un `GeoDataFrame` en EPSG:25830 (el `srid` del 99,7 % de los registros).
5. Spatial-join `within` contra `secciones_censales.geojson` reproyectado a 25830.

**Campos utilizados:** `objects_type_id`, `municipalities`, `coord_x`, `coord_y`, `srid`, `tot_gen_places`, `tot_gen_ua`, `registration_date`, `registration_code`, `postal_code`, `name`.

**Limitaciones:**
- **Snapshot vivo, sin histórico oficial.** La serie temporal del proyecto se reconstruye desde `registration_date` y por tanto tiene **sesgo superviviente** (las VFTs dadas de baja antes de la descarga no aparecen, así que los años pasados están sub-estimados; la dirección de la tendencia es honesta, los valores absolutos del pasado no).
- No incluye VFTs **ilegales** (sin registro RTA).
- ~0,3 % de registros sin coordenadas (descartados; sin geocoding fallback).
- 9/3635 registros con `registration_date` no parseable: cuentan al snapshot actual pero no a la serie.

**Pipeline:** [scripts/build_vft.py](../scripts/build_vft.py)

---

## F2 · INE ADRH — Atlas de Distribución de Renta de los Hogares, tabla 31025

**Organismo responsable:** INE.

**URL de origen:** `https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/31025.csv`

**Fecha de descarga:** en cada ejecución del pipeline; **cacheada** en `raw-data/ine_cache/31025.csv` (re-uso entre ejecuciones; `INE_CACHE_REFRESH=1` fuerza re-descarga).

**Cobertura temporal:** 2015-2023 (9 años) — última actualización ADRH publicada por el INE.

**Cobertura geográfica:** provincia de Granada por defecto en esta tabla; filtrado en pipeline a municipio `18087` (Granada capital). Se usan **dos niveles**: sección censal (mapa/ficha) y municipio (panel "Ciudad").

**Formato original:** CSV `;` separado, encoding UTF-8 con BOM, separador de miles `.`. La tabla se llama *"Indicadores de renta media y mediana"* y contiene **varios indicadores** por fila.

**Indicadores utilizados (3 de los 6 disponibles):**
| Indicador en la tabla | Clave embebida | Uso en la UI |
|---|---|---|
| Mediana de la renta por unidad de consumo | `renta_med_uc` | **Titular del coropleta** (robusto, estándar Eurostat) |
| Renta neta media por hogar | `renta_hogar` | Ficha de sección + gráfica "Ciudad" |
| Renta neta media por persona | `renta_persona` | Ficha de sección + gráfica "Ciudad" (per cápita, histórico) |

**Transformaciones aplicadas:**
1. Descarga + parseo línea a línea (cache local).
2. Filtro `Municipios.startswith("18087")` y selección de los 3 indicadores anteriores.
3. Parsing de valor (`"20.650"` → `20650`).
4. **Nivel sección** (`build_renta.py`): `{CUSEC: {año: valor}}` por indicador, embebido en `secciones_censales.geojson`; cuantiles pooled **por variante** (`<clave>_breaks`/`_colors`). El alias `renta` apunta a `renta_med_uc`.
5. **Nivel municipio** (`build_demografia.py`): la **fila de municipio** de la misma tabla (Distritos y Secciones vacíos) se vuelca como serie temporal de las 3 variantes en `demografia.json` → bloque `renta_adrh` (gráfica del panel "Ciudad").

**Campos utilizados:** `Municipios`, `Distritos`, `Secciones`, `Indicadores de renta media y mediana`, `Periodo`, `Total`.

**Limitaciones:**
- Última publicación oficial: 2023. Para años 2024-2025 (visibles en el slider) el panel cae al valor más reciente disponible.
- El ADRH es una estadística experimental basada en cruce de Padrón × IRPF — los valores difieren ligeramente de la "renta declarada IRPF" (F6), que es contable.
- **La mediana no es agregable:** a nivel barrio se aproxima por media ponderada de las medianas de sección (advertido en la UI); a nivel municipio se usa la **mediana oficial del INE** (≠ mediana de las secciones: 19.950 € vs 20.650 € en 2023).
- "Renta por **unidad de consumo**" aplica la escala de equivalencia (OCDE-modificada); no es comparable directamente con "por persona" (per cápita) ni "por hogar".
- La mediana UC se publica en **escalones gruesos** (múltiplos de ~50 €), lo que produce tramos planos inter-anuales (no es un error).
- Cambios de delimitación de secciones censales del INE en algún año podrían dejar secciones sin pareo (no hay reconciliación implementada).

**Pipeline:** [scripts/build_renta.py](../scripts/build_renta.py) (sección/barrio) + [scripts/build_demografia.py](../scripts/build_demografia.py) (serie municipal `renta_adrh`)

---

## F3 · INE ADRH — tabla 31033 (indicadores demográficos)

**Organismo responsable:** INE.

**URL de origen:** `https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/31033.csv`

**Fecha de descarga:** en cada ejecución del pipeline.

**Cobertura temporal:** 2015-2023 (igual que F2).

**Cobertura geográfica:** sección censal, municipio 18087.

**Formato original:** CSV `;` separado, UTF-8 con BOM.

**Indicadores publicados en la tabla** (los siete usados por el proyecto entre paréntesis):
- Población (✔)
- Edad media de la población
- Porcentaje de población menor de 18 años
- Porcentaje de población de 65 y más años
- Tamaño medio del hogar (✔)
- Porcentaje de hogares unipersonales
- Porcentaje de población española

**Transformaciones aplicadas:**
- Para población: filtro `Indicadores == "Población"` + parsing → `{CUSEC: {año: hab}}`.
- Para tamaño medio del hogar: filtro `Indicadores == "Tamaño medio del hogar"` + parsing (`"1,9"` → `1.9`) → `{CUSEC: tam_medio}` del año más reciente.

**Limitaciones:**
- Los demás indicadores demográficos del ADRH (edad media, % >65, etc.) **están descargados pero no se exponen** en la UI actual.
- Para años posteriores a 2023 el tamaño medio del hogar se asume constante.

**Pipelines:** [build_secciones_poblacion.py](../scripts/build_secciones_poblacion.py) (población), [build_vft.py](../scripts/build_vft.py) (tamaño hogar).

---

## F4 · INE CAP — Censo Anual de Población, tabla 69178

**Organismo responsable:** INE.

**URL de origen:** `https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/69178.csv`

**Fecha de descarga:** en cada ejecución.

**Cobertura temporal:** 2021-2025 (5 años) — nueva metodología registral.

**Cobertura geográfica:** sección censal, municipio 18087.

**Formato original:** CSV `;` separado, UTF-8 con BOM, cabecera `Provincias;Municipios;Secciones;Sexo;Nacionalidad;Periodo;Total`.

**Transformaciones aplicadas:**
- Filtro `Sexo == "Total" && Nacionalidad == "Total" && Secciones.startswith("18087")` + parsing → `{CUSEC: {año: hab}}`.

**Política de fusión con F3 (ADRH 31033):** en años solapados (2021-2023), CAP gana. La serie final embebida en `secciones_censales.geojson` es ADRH 2015-2020 + CAP 2021-2025 (11 fotos anuales).

**Limitaciones:**
- Metodología registral nueva (no comparable con padrones antiguos en términos absolutos exactos).
- Posibles desalineaciones de sección entre ADRH y CAP (no reconciliadas).

**Pipeline:** [scripts/build_secciones_poblacion.py](../scripts/build_secciones_poblacion.py)

---

## F5 · INE Padrón continuo — tabla 33794

**Organismo responsable:** INE.

**URL de origen:** `https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/33794.csv`

**Fecha de descarga:** en cada ejecución.

**Cobertura temporal:** 2003-2022.

**Cobertura geográfica:** provincia de Granada, todos los municipios. Filtrado a 18087 en pipeline.

**Formato original:** CSV `;` separado, UTF-8 con BOM, cabecera `Sexo;Provincias;Municipios;Edad;Periodo;Total`. Grupos quinquenales (0-4, 5-9, …, 100+).

**Transformaciones aplicadas:**
- Filtro municipio + parsing → `{sexo: {año: {edad: valor}}}`.
- Política de fusión con F5b (CSV CAP local) → CAP gana en años solapados (2021-2022).

**Limitaciones:**
- Mezcla dos metodologías (Padrón continuo + CAP). Los cambios de criterio inter-año pueden producir saltos artefactuales en la pirámide.

**Pipeline:** [scripts/build_demografia.py](../scripts/build_demografia.py)

---

## F5b · INE CAP — Personalización municipal por sexo, edad quinquenal y nacionalidad (CSV local 2021-2025)

**Organismo responsable:** INE.

**Operación INE:** **Censo Anual de Población (CAP)** — la tabla raíz referenciada por el autor es [jaxiT3 t=69181](https://ine.es/jaxiT3/Tabla.htm?t=69181). El CSV en `raw-data/Demografia/Poblacion por sexo edad grupos quinquenales.csv` se generó **muy probablemente vía la función "Personalizar tabla"** de jaxiT3 sobre la operación CAP, combinando dimensiones que en los cubos por defecto del INE están separadas.

**Indicios que sustentan esta hipótesis:**
- El CSV trae **simultáneamente** las dimensiones Sexo + Nacionalidad + Edad quinquenal a nivel municipio, una combinación que **ningún cubo CAP por defecto expone** (las tablas section-level 69175-69197 cubren solo una de Nacionalidad / Edad / Lugar de nacimiento por tabla, además de Sexo).
- Los valores agregados coinciden con la tabla 69181 (Granada total 2025 = 235.294 hab) — son la misma operación CAP debajo.
- La cabecera `Total Nacional;Provincias;Municipios;Sexo;Nacionalidad;Edad;Periodo;Total` (8 columnas, "Total Nacional" como primera dimensión pin) es típica de exports personalizados con toda la jerarquía geográfica expuesta.

**Inspección del archivo:**
- **Cobertura temporal:** 2021-2025 (5 años).
- **Filas:** 990 = 5 años × 22 edades × 3 sexos × 3 nacionalidades.
- **Dimensiones:** Sexo (Total/Hombres/Mujeres) × Nacionalidad (Total/Española/Extranjera) × Edad (Todas las edades + 21 grupos quinquenales hasta "100 y más").
- **Encoding:** cp1252, separador `;`, separador de miles `.`.

**Distinción importante respecto a F5:** F5 (URL 33794) es la fuente que `build_demografia.py` descarga **al vuelo** para 2003-2022. F5b es el CSV **en disco** que cubre 2021-2025 con dimensión Nacionalidad. Las dos se fusionan en `build_demografia.py`: F5b gana en años solapados (2021-2022) porque su metodología CAP es la actual.

**Transformaciones aplicadas:**
- Filtro `sexo ∈ {Hombres, Mujeres}` + `nacionalidad == "Total"` + `edad != "Todas las edades"`.
- Estructuración a `{sexo: {año: {grupo_edad: valor}}}`.

**Limitaciones:**
- El CSV no es bit-a-bit reproducible desde una URL canónica — requiere navegar jaxiT3, personalizar la operación CAP con las dimensiones deseadas y exportar manualmente. Documentado pero no automatizado.

**Pipeline:** [scripts/build_demografia.py](../scripts/build_demografia.py)

---

## F6 · AEAT — Estadística de declarantes IRPF por municipios

**Organismo responsable:** Agencia Estatal de Administración Tributaria.

**URL de origen:**
`https://sede.agenciatributaria.gob.es/AEAT/Contenidos_Comunes/La_Agencia_Tributaria/Estadisticas/Publicaciones/sites/irpfmunicipios/{año}/home.html`

**Fecha de descarga:** registrada en `raw-data/AEAT/irpf_municipal_granada.csv` cuando se re-ejecuta el scraper.

**Cobertura temporal:** 2013-2023 (11 años).

**Cobertura geográfica:** Granada capital (18087). El scraper podría extenderse a otros municipios cambiando un parámetro.

**Formato original:** HTML (la AEAT no ofrece CSV directo). El scraper navega `home → Detalle municipios → orden alfabético → G → Granada-18087` y parsea la tabla con regex anclados al sufijo ASCII del cell.

**Transformaciones aplicadas:**
1. Navegación recursiva por el HTML.
2. Parseo de la tabla principal: habitantes, nº declaraciones, nº titulares, renta bruta media, renta disponible media.
3. Volcado a CSV en `raw-data/AEAT/irpf_municipal_granada.csv`.
4. En `build_demografia.py`, lectura del CSV y empaquetado a `vft_municipal` (sic — empaquetado en realidad como `renta_municipal`).

**Campos en el CSV salida:** `anio`, `habitantes`, `n_declaraciones`, `n_titulares`, `renta_bruta_media`, `renta_disponible_media`.

**Limitaciones:**
- Scraping de HTML — si la AEAT cambia la maquetación se rompe.
- Encoding mixto (declarado UTF-8 con bytes cp1252 sueltos), parseado con `errors='replace'`. Por eso el scraper se ancla en sufijos ASCII (`"RENTA BRUTA MEDIA"`, etc.).
- "Renta bruta" y "renta disponible" son a nivel **declarante**, no per cápita ni por hogar.

**Pipeline:** [scripts/scrape_aeat_irpf.py](../scripts/scrape_aeat_irpf.py) + [scripts/build_demografia.py](../scripts/build_demografia.py)

---

## F7 · Junta de Andalucía SIVA — calidad del aire histórico

**Organismo responsable:** Junta de Andalucía · Consejería de Medio Ambiente (Red SIVA de vigilancia atmosférica).

**URL de origen:**
`https://www.juntadeandalucia.es/medioambiente/atmosfera/informes_siva/historico_cuantitativo/`
(scraper local: [raw-data/Calidad Aire/scrap.py](../raw-data/Calidad%20Aire/scrap.py) + [raw-data/Calidad Aire/getcsv.py](../raw-data/Calidad%20Aire/getcsv.py)).

**Fecha de descarga:** los CSVs en `raw-data/Calidad Aire/aire_raw/` llevan los años en el nombre (2001-2024).

**Cobertura temporal:** 2001-2024 según contaminante.

**Cobertura geográfica:** toda Andalucía. El pipeline filtra por provincia INE = 18 + municipio INE = 87 (Granada capital).

**Formato original:** CSVs `;` separados, encoding `latin-1`, una fila por estación-mes y columnas H01..H24 (horario) o D01..D31 (diario).

**Estaciones activas geolocalizadas manualmente** (las coordenadas y nombres no vienen en los CSVs, solo códigos numéricos):
- **Código 7 — Granada Norte**: Av. Luis Miranda Dávalos, tipo tráfico-urbana. Activa desde 2001. Coordenadas: `[-3.6126595, 37.1961046]`.
- **Código 10 — Granada Palacio de Congresos**: Paseo del Violón, tráfico suburbana. Activa desde 2010. Coordenadas: `[-3.5984717, 37.16605]`.
- Estaciones decomisadas (5, 8, 9) sin coordenadas publicadas: descartadas.

**Transformaciones aplicadas:**
1. Iteración sobre todos los CSV de `aire_raw/`.
2. Para cada estación-año-contaminante: media anual sobre todas las celdas H01..H24 o D01..D31 o VALOR (irregulares).
3. Para NO₂ se calcula el nivel UE: `<20 µg/m³` = bueno, `20-40` = moderado, `>40` = alto (límite anual UE 2008/50/CE = 40 µg/m³; OMS 2021 = 10 µg/m³).
4. Salida `estaciones_aire.geojson` (Point per estación + series anuales por contaminante).

**Contaminantes capturados:** NO₂, NO, NOx, PM10, PM2.5, O₃, SO₂, CO, C₆H₆, Pb, As, Cd, Ni, B(a)P (con unidades por defecto SIVA).

**Limitaciones:**
- **Cobertura limitada a 2 estaciones activas** — la asignación sección→estación en el pipeline (vía Voronoi nearest-neighbor) no representa exposición real fina.
- Los códigos de estación no están documentados públicamente; la identidad de la 7 y la 10 se infirió por su firma temporal (años activos) — `⚠️ confirmar con la Junta`.
- Media anual aritmética sin ponderar por tiempo de funcionamiento ni por validez QA/QC oficial.

**Pipeline:** [scripts/build_estaciones_aire.py](../scripts/build_estaciones_aire.py)

---

## F8 · INE Cartografía Censal — secciones

**Organismo responsable:** INE.

**Identificador del dataset:** `SECC_CE_0000_20_R_INE_10_03_2026` (de los metadatos QGIS `.qmd`).

**URL de origen:** `https://www.ine.es/prodyser/cartografia/seccionado_2026.zip`
(verificada por HEAD: ZIP 65,4 MB. El INE publica una entrega anual: `seccionado_2024.zip`, `seccionado_2025.zip`, `seccionado_2026.zip`. El identificador del .qmd `..._10_03_2026` confirma que el ZIP descargado es el de la entrega 2026.)

**Fecha del dataset:** 10 de marzo de 2026 (del identificador).

**Método de filtrado:** el ZIP nacional contiene todas las secciones de España (~36 000). El recorte a Granada capital se hizo con **QGIS** usando la expresión SQL `CUMUN = '18087'` (campo del shapefile original que codifica concatenadamente código de provincia + código de municipio: `18` + `087`). El resultado son 180 secciones censales.

**Cobertura geográfica:** España completa originalmente; en el pipeline se reproyecta y se conservan únicamente las secciones de Granada capital (180 secciones).

**Formato original:** GeoJSON (`granada_secciones_censales.geojson`), CRS EPSG:25830 (ETRS89 / UTM 30N).

**Transformaciones aplicadas:**
1. Reproyección a EPSG:4326 (WGS84) para Leaflet.
2. Selección de columnas: `CUSEC`, `CDIS`, `CSEC`, `NMUN`.
3. Patch progresivo del feature collection con bloques `poblaciones`, `superficie_verde_*`, `estacion_cercana`, `equipamientos`, `renta_med_uc`/`renta_hogar`/`renta_persona`, `vft` por sucesivos build_*.

**Campos utilizados:** `CUSEC` (10 dígitos: provincia 2 + municipio 3 + distrito 2 + sección 3), `CDIS`, `CSEC`, `NMUN`.

**Limitaciones:**
- Una sola versión congelada de la cartografía → cualquier cambio de delimitación inter-año de los datos demográficos no se reconcilia espacialmente.

**Pipeline:** [scripts/prepare_data.py](../scripts/prepare_data.py)

---

## F9 · OpenStreetMap — múltiples capas

**Organismo responsable:** OpenStreetMap Foundation (datos voluntarios).

**Archivos en el repo derivados de OSM:**

| Archivo | Uso | Etiquetas OSM relevantes |
|---|---|---|
| `raw-data/Parques/Parques.geojson` | Capa zonas verdes "parques" | `leisure=park` (probable) |
| `raw-data/Parques/Jardines.geojson` | Capa zonas verdes "jardines" | `leisure=garden` (probable) |
| `raw-data/Parques/Arbolado.geojson` | Capa zonas verdes "arbolado" | `landuse=forest` o `natural=wood` (probable) |
| `raw-data/GIS/Barrios.geojson` | Polígonos barrios | `boundary=administrative` `admin_level=10` |
| `raw-data/GIS/Distritos.geojson` | Polígonos distritos | `admin_level=9` (probable) |
| `raw-data/GIS/Puntos de Interes.geojson` | Fuente para 6 capas POI | `amenity`, `tourism`, `historic`, `leisure` (varios) |
| `raw-data/GIS/Terrazas de Bares.geojson` | Capa terrazas (plan 04 — no implementado en UI actual) | desconocido |
| `raw-data/GIS/Calles.geojson` | (Capa contextual, no servida actualmente) | `highway=*` |
| `raw-data/GIS/Carreteras.geojson` | (idem) | `highway=primary/secondary/...` |
| `raw-data/granada.pbf` | OSM data extract sin procesar | — |

**Método de extracción:** Overpass Turbo (queries puntuales por capa) usando el geocoder `Granada, Spain` como `searchArea`.

**Endpoint Overpass:** `https://overpass-api.de/api/interpreter` (default de overpass-turbo.eu).

**Bounding box implícito:** el geocoder de Overpass resuelve "Granada, Spain" al polígono administrativo del municipio. Todas las queries operan sobre esa área.

**Queries documentadas en [raw-data/GIS/queries/overpass.txt](../raw-data/GIS/queries/overpass.txt):**

| Capa | Etiquetas OSM | Geometrías |
|---|---|---|
| Parques | `leisure=park` | way + relation |
| Jardines | `leisure=garden` | way + relation |
| Arbolado / Zonas verdes | `landuse=grass`, `natural=wood`, `leisure=nature_reserve` | way + relation |
| Carreteras | `highway ∈ {motorway, trunk, primary}` | way |
| Calles | `highway ∈ {residential, pedestrian, tertiary, secondary, primary}` | way |
| Puntos de Interes | TODOS los `amenity=*` y `tourism=*` | node + way (`out center` para reducir polys a centroides) |

**Nota importante sobre "Arbolado":** la capa NO contiene árboles individuales (`natural=tree`) sino **superficies herbosas + bosques + reservas naturales**. El nombre es histórico — todas las áreas verdes "extensivas" no clasificadas como parque/jardín se agrupan ahí.

**Queries pendientes de documentar** (capas que existen en `raw-data/` pero sin query guardada):
- `Barrios.geojson` — probable `boundary=administrative` + `admin_level=10` dentro del área Granada.
- `Distritos.geojson` — probable `boundary=administrative` + `admin_level=9`.
- `Terrazas de Bares.geojson` — origen poco claro (puede no ser OSM; las terrazas no son una etiqueta OSM estándar).
- `granada.pbf` — no es Overpass: es un OSM data extract en formato binario (probable Geofabrik o BBBike); NO está procesado por ningún script actual del repo.

**Categorización aplicada** (en `build_pois.py`, sobre `Puntos de Interes.geojson`):

| Categoría | Campos OSM |
|---|---|
| sanidad | `amenity ∈ {pharmacy, hospital, clinic, doctors}` |
| educacion | `amenity ∈ {school, kindergarten, college, university, library}` |
| agua | `amenity ∈ {drinking_water, fountain}` |
| reciclaje | `amenity ∈ {recycling, waste_disposal}` |
| aparcabicis | `amenity = bicycle_parking` |
| patrimonio | `tourism ∈ {museum, gallery, viewpoint, attraction}` ∪ `historic ∈ {castle, palace, church, citywalls, city_gate, monument}` |

Orden de precedencia para POIs con múltiples etiquetas: sanidad > educacion > agua > reciclaje > aparcabicis > patrimonio.

**Limitaciones:**
- **OSM no es exhaustivo** ni uniformemente actualizado — la cobertura POI depende de la actividad de mappers locales.
- Sin fecha de snapshot conocida la auditabilidad temporal es nula.
- Se excluyen restaurantes, bares, hoteles y POIs de bajo valor analítico (bancos, papeleras, parking-coche).

**Pipelines:** [scripts/build_pois.py](../scripts/build_pois.py), [scripts/prepare_data.py](../scripts/prepare_data.py).

---

## F10 · INE Censo de Población y Viviendas 2021 — viviendas por sección

**Organismo responsable:** INE.

**URL de origen:** `https://www.ine.es/censos2021/C2021_Indicadores.csv` (fichero nacional de *indicadores por sección censal* del Censo 2021; ~8 MB, todas las secciones de España).

**Fecha de referencia:** 1 de enero de 2021. El censo de viviendas se publica cada 3-4 años; a junio de 2026, 2021 es la referencia más reciente con detalle de **sección censal** (los censos anuales posteriores actualizan solo población y variables de residencia/empleo, no el recuento de viviendas).

**Cobertura geográfica:** España completa; filtrado en pipeline a `cpro=18 & cmun=087` (Granada capital, 184 secciones en el seccionado 2021).

**Formato original:** CSV `,` separado, UTF-8, columnas codificadas `t1_1…t22_5`. Las geográficas son `ccaa,cpro,cmun,dist,secc` → `CUSEC = cpro+cmun+dist+secc` (10 dígitos).

**Columna utilizada:**
| Columna | Significado | Uso |
|---|---|---|
| `t18_1` | **Viviendas familiares totales** | Denominador del ratio VFT (parque completo) |
| `t19_1` / `t19_2` | Principales / no principales | No usadas (validación: 98.316 + 42.941 = 141.257) |

**Validación:** la suma de `t18_1` en Granada capital = **141.257 viviendas**, que cuadra con el dato municipal oficial del Censo 2021 (141.258; diferencia de 1 por redondeo/seccionado).

**Transformaciones aplicadas:**
1. Descarga del CSV nacional (cache en `raw-data/censo2021_indicadores_seccion.csv`).
2. Filtro Granada + extracción de `t18_1` por `CUSEC` → subset `raw-data/censo2021_viviendas_granada.csv`.
3. Join por `CUSEC` al embeber `vft.viviendas_total` en `secciones_censales.geojson`.

**Limitaciones:**
- **Desfase de seccionado:** las viviendas están sobre el seccionado de 2021; la cartografía del proyecto es `seccionado_2026` (F8). 2 secciones de 180 no cruzan → fallback al estimador `pob/hogar` (marcado en `vft.viviendas_fuente`).
- **Desfase temporal:** viviendas 2021 vs VFTs ~2025. Asumible (el parque cambia despacio), pero no es el mismo año.
- Sin actualización anual del recuento de viviendas (limitación metodológica del INE, no del proyecto).

**Pipeline:** [scripts/build_vft.py](../scripts/build_vft.py)

---

## Huecos pendientes

Estado tras dos rondas de verificación:

| Fuente | Estado | Notas |
|---|---|---|
| F1 OpenRTA | ✅ Documentado | URL pública, cache local |
| F2 ADRH 31025 | ✅ Documentado | URL en script |
| F3 ADRH 31033 | ✅ Documentado | URL en script |
| F4 CAP 69178 | ✅ Documentado | URL en script |
| F5 Padrón 33794 | ✅ Documentado | URL en script |
| F5b CAP quinquenal (CSV local 2021-2025) | ✅ Documentado | Operación CAP, raíz tabla 69181, generado vía "Personalizar tabla" en jaxiT3. |
| F6 AEAT IRPF | ✅ Documentado | URL en scraper |
| F7 SIVA | ⚠️ Estaciones inferidas por firma temporal | Los códigos 7 y 10 no están confirmados oficialmente como Granada Norte y Palacio de Congresos. |
| F8 INE Cartografía Censal | ✅ Documentado | `seccionado_2026.zip` + filtro QGIS `CUMUN='18087'`. |
| F9 OSM — Parques/Jardines/Arbolado/Calles/Carreteras/POIs | ✅ Documentado | Queries preservadas en `raw-data/GIS/queries/overpass.txt`. |
| F9 OSM — Barrios/Distritos/Terrazas/granada.pbf | ⚠️ Queries no preservadas | Sin query guardada. Para Barrios y Distritos las plantillas administrativas (`admin_level=10` y `=9`) son obvias; Terrazas es ambiguo y `granada.pbf` no se usa actualmente en el pipeline. Decisión del autor: dejar como está. |
| F10 Censo 2021 viviendas por sección | ✅ Documentado | URL pública, columna `t18_1` validada contra total municipal (141.257). 2 secciones sin pareo por seccionado 2021↔2026. |

**Próximas acciones recomendadas:**
1. Pedir a la Junta de Andalucía confirmación de los códigos SIVA 7 y 10 (única ambigüedad de identidad sin documentar oficialmente).
2. *(Aplazado por decisión del autor)* — guardar las queries Overpass restantes y limpiar `granada.pbf` cuando se vuelva a tocar esa parte.
