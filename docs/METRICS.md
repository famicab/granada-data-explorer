# Métricas — Granada Data Explorer

Documenta cada métrica derivada que el proyecto calcula y muestra. Para cada una: qué representa, qué datos consume (referencias a [DATA_SOURCES.md](DATA_SOURCES.md), columna ID), cómo se calcula paso a paso, cómo interpretarla, y qué sesgos/limitaciones tiene.

Las métricas se agrupan por panel de origen:

- **A. Coropletas del mapa** (selector "📊 [Modo]" en la píldora superior) — M1 a M5
- **B. Indicadores del AreaPanel** (panel lateral al pulsar una sección/barrio) — M6 a M11
- **C. Rankings** (panel "≡ Rankings") — M12 a M16
- **D. Panel "📊 Ciudad"** (agregados municipales) — M17 a M20

---

## A. Coropletas del mapa

### M1 · Habitantes por sección/barrio

**Objetivo:** mostrar la distribución de la población residente por unidad territorial fina y su evolución 2015-2025.

**Datos de entrada:** F3 (ADRH 31033, 2015-2020) + F4 (CAP 69178, 2021-2025) + F8 (geometría secciones).

**Fórmula:** valor por feature = `poblaciones[año_slider]` (ya pre-calculado en el geojson). No hay fórmula derivada.

**Pasos de cálculo (build_secciones_poblacion.py):**
1. Descargar ADRH 31033 y CAP 69178.
2. Para cada CUSEC, fusionar series: ADRH 2015-2020 + CAP 2021-2025 (CAP gana en solapados).
3. Calcular **cuantiles pooled** sobre el conjunto de todos los pares (sección, año) — 4 cortes → 5 clases.
4. Embeber `poblaciones`, `poblacion_breaks`, `poblacion_colors` (ColorBrewer Blues 5-class) y `poblacion_anios` en el FeatureCollection.

**Agregación a barrio (build_barrios.py):** suma simple de `poblaciones[año]` de las secciones del barrio. Cuantiles pooled propios (29 barrios × 11 años ≈ 320 valores).

**Interpretación:** el slider mueve la coropleta año a año; como los cortes son pooled, el mismo color significa el mismo rango absoluto entre años, así los cambios de color reflejan cambios reales de stock poblacional.

**Limitaciones:**
- Cambio metodológico ADRH→CAP en 2020-21 puede producir saltos artefactuales.
- Posibles redelimitaciones de sección no reconciliadas.

---

### M2 · Verde por habitante (m²/hab)

**Objetivo:** medir el "stock per cápita" de zonas verdes accesibles, marcar las secciones bajo el umbral OMS (9 m²/hab).

**Datos de entrada:** F9 OSM (`Parques.geojson`, `Jardines.geojson`, `Arbolado.geojson`) + F8 (secciones) + M1 (población).

**Fórmula:** `ratio = superficie_verde_m2 / poblaciones[año]` (m² por habitante).

**Pasos de cálculo (build_secciones_indicadores.py):**
1. Reproyectar las tres capas verdes y las secciones a EPSG:25830 (cálculo en metros).
2. Para evitar doble conteo en solapes OSM, aplicar **precedencia parques > jardines > arbolado**: la cobertura de parques tapa la de jardines, ésta la de arbolado.
3. Para cada sección, sumar área de intersección con cada subtipo → `superficie_verde_desglose` (parques/jardines/arbolado).
4. `superficie_verde_m2` = suma del desglose.
5. Calcular cuantiles pooled del ratio sobre todos los pares (sección, año) con `pob > 0`.
6. Paleta diverging RdYlGn 5-class (rojo = poco verde/hab, verde = mucho).

**Agregación a barrio:** suma de áreas verdes desglosadas + suma de poblaciones; ratio = suma_verde / suma_pob.

**Interpretación:** umbral OMS 9 m²/hab marcado en el AreaPanel (color verde sobre umbral, rojo bajo).

**Limitaciones:**
- "Zona verde" según etiquetado OSM ≠ definición legal/urbanística.
- Sin datos de **accesibilidad** real (vallas, horarios, distancia).
- Arbolado urbano cuenta su huella geométrica completa (no su valor recreativo real).

---

### M3 · Exposición NO₂ (µg/m³)

**Objetivo:** asignar a cada sección/barrio una exposición anual a NO₂.

**Datos de entrada:** F7 (SIVA, series NO₂ anuales por estación) + F8 (secciones).

**Fórmula:** valor por sección = `NO₂[estación más cercana, año]`. Para barrios, media ponderada por población.

**Pasos de cálculo:**
- **Sección (build_secciones_indicadores.py):**
  1. Centroide de la sección en EPSG:25830.
  2. Buscar la estación SIVA más cercana → `estacion_cercana = {name, distancia_m}`.
  3. En tiempo de render (`GranadaMap.tsx`), leer `estaciones_no2[estacion_cercana.name][año]` para el año del slider.
- **Barrio (build_barrios.py):**
  1. Para cada año, calcular `Σ pob_sec × NO₂_estacion_cercana / Σ pob_sec` sobre las secciones del barrio.
  2. Guardar como `no2_serie[año]`.

**Bandas (UE / OMS):**
- < 20 µg/m³ → verde "bueno" (#22c55e)
- 20-40 → ámbar "moderado" (#f59e0b)
- > 40 → rojo "alto" — supera límite anual UE 2008/50/CE (#ef4444)
- Recordatorio: OMS 2021 ha bajado la guía a 10 µg/m³ (sin reflejar en bandas).

**Limitaciones:**
- **Solo 2 estaciones para todo el municipio** — la asignación nearest-neighbor es una Voronoi muy gruesa. No reproduce gradientes urbanos finos (calles canyon, plazas).
- Media anual aritmética sin ponderar por validez QA/QC oficial.
- Códigos de estación inferidos por firma temporal, sin confirmación documental.

---

### M4 · Renta (mediana por unidad de consumo)

**Objetivo:** comparar la renta entre secciones / barrios con una medida robusta.

**Datos de entrada:** F2 (ADRH 31025) + F8 (secciones).

**Fórmula:** valor directo del indicador del ADRH. El **coropleta usa la mediana
por unidad de consumo** (`renta_med_uc`); la ficha de sección muestra además las
otras dos variantes embebidas (`renta_hogar`, `renta_persona`).

**Pasos de cálculo (build_renta.py):**
1. Descargar ADRH 31025 (cacheada) y filtrar municipio 18087.
2. Extraer **3 indicadores**: `Mediana de la renta por unidad de consumo`,
   `Renta neta media por hogar`, `Renta neta media por persona`.
3. Estructurar `{CUSEC: {año: valor}}` por indicador.
4. Cuantiles pooled **por variante** sobre todos los pares (sección, año).
5. Paleta OrRd 5-class. El mapa colorea por `renta_med_uc`.

**Agregación a barrio (build_barrios.py):** **media ponderada por población de la
sección**, por variante. ⚠️ Para `renta_hogar`/`renta_persona` es una media válida;
para `renta_med_uc` es una **aproximación** (media ponderada de medianas de sección
— la mediana no se agrega; la UI lo advierte en el tooltip).

**Cobertura temporal:** 2015-2023. Para 2024-25 (rango del slider) la UI muestra el dato más reciente.

**Interpretación:** la **mediana por unidad de consumo** representa el hogar "del
medio" ajustado por tamaño/composición; es más robusta que la media (no la
distorsionan las rentas altas) y es el estándar de pobreza/desigualdad de Eurostat/INE.
Distinta del ingreso por declarante IRPF (F6, M19), que es contable y por contribuyente.

**Por qué tres variantes:** "por persona" (per cápita) parece baja porque reparte
entre todos los miembros, incluidos los que no ingresan; "por hogar" es mayor y más
intuitiva; la mediana UC es la comparación de referencia. Mostrarlas juntas es una
lección de alfabetización de datos (la unidad cambia la cifra radicalmente).

**Limitaciones:**
- ADRH es estadística experimental — revisada retrospectivamente por el INE.
- La mediana UC se publica en escalones gruesos (múltiplos ~50 €) → tramos planos.
- La paleta no es comparable con la de M5 (VFT %): paletas distintas (OrRd vs PuRd).

---

### M5 · VFTs por 100 viviendas (%)

**Objetivo:** cuantificar la presión turística sobre el parque residencial de cada sección/barrio.

**Datos de entrada:** F1 (OpenRTA) + F3 (tamaño hogar) + F4/F3 (población última) + F8 (secciones).

**Fórmula (por sección y año):**
```
viviendas_total ≈ poblacion_año_más_reciente / tamaño_medio_hogar_2023
ratio[año] = n_vfts_acumuladas_hasta_año / viviendas_total × 100
```

**Pasos de cálculo (build_vft.py):**
1. Descargar y cachear OpenRTA filtrado a VFTs Granada (~3.6 k registros).
2. Spatial-join VFT→sección en EPSG:25830.
3. Por cada sección, guardar la lista de años de `registration_date`.
4. Calcular `viviendas_total = max(1, round(pob_2025 / tamaño_hogar_2023))`.
5. Para cada año del slider (2015-2025), calcular el cumulativo de VFTs registradas ≤ ese año.
6. `ratio[año] = cumulativo_año / viviendas_total × 100`.
7. Cortes **fijos semánticos** (no cuantiles): `[1, 3, 7, 12, 20, 30]` % → 7 clases PuRd.

**Por qué cortes fijos y no cuantiles:** la distribución es muy sesgada (mediana ~1,3 %, máximo ~46 %). Los cuantiles colapsaban todo el casco histórico en un mismo color; los cortes fijos diferencian "testimonial / moderado / notable / alta / muy alta / severa / extrema".

**Agregación a barrio (build_barrios.py):** suma de VFTs / suma de viviendas (no media ponderada).

**Umbral de alerta:** `≥ 10 %` → "Alta presión turística" en el AreaPanel.

**Limitaciones:**
- **Sesgo superviviente**: la serie histórica solo incluye VFTs que siguen activas hoy. Los años pasados están sub-estimados (las bajas anteriores no aparecen). La dirección de la tendencia es honesta; los valores absolutos del pasado no.
- **No incluye VFTs ilegales** (sin registro RTA).
- **Denominador fijo al año más reciente:** la evolución refleja únicamente cambios del numerador (más narrativa, menos ruido demográfico).
- Tamaño medio del hogar congelado en 2023.

---

## B. Indicadores del AreaPanel

### M6 · Pirámide demográfica de la sección/barrio

⚠️ **No implementada todavía** a nivel sección. El AreaPanel muestra serie temporal de habitantes pero no pirámide. Posible mejora futura.

---

### M7 · Delta poblacional 2015→2025 (absoluto + %)

**Datos de entrada:** M1 (`poblaciones[primer_año]`, `poblaciones[último_año]`).

**Fórmula:**
```
delta_abs = poblaciones[2025] - poblaciones[2015]
delta_pct = delta_abs / poblaciones[2015] × 100
```

Mostrado con color verde si positivo, rojo si negativo.

**Limitaciones:** los años extremos pueden estar en metodologías distintas (ADRH vs CAP).

---

### M8 · Equipamientos (cobertura POI)

**Datos de entrada:** F9 OSM POIs categorizados (6 categorías).

**Métrica por categoría y sección:**
- `n_dentro`: número de POIs `within` el polígono.
- Si `n_dentro == 0`: distancia al más cercano (`mas_cercana_m`) + nombre.

**Pasos (build_pois.py):**
1. Reproyectar a EPSG:25830 (cálculos en metros).
2. Construir GeoDataFrame por categoría.
3. Para cada sección: `geometry.contains(poi)` por categoría.
4. Si vacío: `nearest distance(centroide, pois)`.

**Umbral de visualización:** se muestra "a X m" si `mas_cercana_m < 500` (caminable). Si no, no se lista — interpretado como "no accesible a pie".

**Agregación a barrio:** suma simple `n_dentro_total`.

**Limitaciones:** cobertura OSM no exhaustiva ni uniforme. Sin fecha de snapshot conocida.

---

### M9 · Estación de aire más cercana / principal

**Datos de entrada:** F7 (estaciones) + F8 (centroides).

**Sección:** estación con menor distancia euclídea al centroide (EPSG:25830) → `{name, distancia_m}`.

**Barrio:** estación que **cubre más población** dentro del barrio (la que es "nearest" de más secciones, ponderadas por población del último año).

---

### M10 · Renta de la sección (3 variantes, con fallback)

**Datos de entrada:** M4 (`renta_med_uc`, `renta_hogar`, `renta_persona`).

**Lógica de display:** la ficha muestra **las tres variantes** con su unidad
(€/UC, €/hogar, €/persona). Para cada una: si existe el año del slider → mostrar;
si no, caer al año más reciente disponible y anotar el año entre paréntesis.

---

### M11 · VFT del año slider + ratio + alerta

**Datos de entrada:** M5.

**Display:**
- Número de VFTs acumuladas al año del slider.
- Plazas totales (snapshot actual; no se recalculan por año).
- Ratio % sobre viviendas estimadas.
- Si ratio ≥ 10 %, badge "⚠️ Alta presión turística".
- Mini-chart SVG con la evolución completa de la serie + dots coloreados por banda.

---

## C. Rankings

Cada ranking ordena las features de la capa de área activa (secciones o barrios) por valor descendente y muestra los 10 primeros para el año del slider.

| ID | Tab | Métrica | Origen | Formato |
|---|---|---|---|---|
| M12 | "Población" | `poblaciones[año]` | M1 | "N hab." |
| M13 | "Renta" | `renta_med_uc[año]` (mediana UC) con fallback | M4 | "N €/UC" |
| M14 | "Verde/hab" | `superficie_verde_m2 / poblaciones[año]` | M2 | "X.X m²/hab" |
| M15 | "Peor NO₂" | NO₂ vía estación más cercana / `no2_serie` | M3 | "X.X µg/m³" |
| M16 | "Crecimiento" | `(pob[año_slider] - pob[primer_año]) / pob[primer_año] × 100` | M1 | "±X.X %" |
| M16b | "VFT %" | `vft.serie[año] / vft.viviendas_total × 100` o snapshot | M5 | "X.X %" |

---

## D. Panel "📊 Ciudad"

### M17 · Pirámide quinquenal municipal

**Datos de entrada:** F5 (Padrón continuo 33794, 2003-2022) fusionado con CSV local CAP quinquenal (2021-2025) — CAP gana en solapados.

**Fórmula:** valores absolutos por grupo quinquenal × sexo × año. Sin métrica derivada — display directo.

**Pasos (build_demografia.py):**
1. Leer CSV local CAP quinquenal.
2. Descargar Padrón 33794, filtrar municipio 18087.
3. Para cada año en el conjunto unión, embeber `{hombres: [valores por grupo], mujeres: [...]}`.

**Limitaciones:** salto metodológico Padrón→CAP visible en 2021.

---

### M18 · Serie histórica de habitantes 1996-2025

**Datos de entrada:** INE jaxiT3 tabla **2871** ("Cifras oficiales de población resultantes de la revisión del Padrón municipal a 1 de enero" — series largas por municipio y sexo). URL: `https://ine.es/jaxiT3/Tabla.htm?t=2871`. El CSV local se generó filtrando por municipio Granada (18087) y exportando.

**Fórmula:** display directo — tres líneas Total/Hombres/Mujeres 1996-2025.

**Limitaciones:**
- Año 2025 reciente — puede actualizarse retroactivamente al cerrar el padrón anual.
- Mezcla metodológica: el Padrón se reformuló en 2021 con la introducción del CAP. Saltos en torno a 2020-21 son metodológicos, no demográficos.

---

### M19 · Renta IRPF municipal

**Datos de entrada:** F6.

**Métricas mostradas:**
- Big number: `renta_bruta_media[último_año]` €.
- Línea principal: serie 2013-2023 renta **bruta** media.
- Línea secundaria (discontinua): renta **disponible** media.
- Delta: `(último - primero) / primero × 100`.

**Distinción contable importante:**
- **Renta bruta** = ingresos totales declarados.
- **Renta disponible** = bruta − cuota líquida del IRPF.
- Las dos están por **declarante**, no por habitante ni por hogar.

**Limitaciones:** solo cubre **declarantes** (excluye rentas exentas y no obligados a declarar) — sub-estima la cola baja.

---

### M19b · Renta ADRH municipal (3 variantes)

**Objetivo:** mostrar la evolución de la renta de la ciudad según la unidad de
medida, como complemento espacial de M4 (la misma fuente, agregada al municipio).

**Datos de entrada:** F2 (ADRH 31025), **fila de municipio** de Granada → bloque
`renta_adrh` de `demografia.json` (`build_demografia.py`).

**Métricas mostradas (gráfica del panel "Ciudad", pestaña "Renta"):**
- Big number: mediana UC del último año (2023 = 19.950 €).
- Tres líneas 2015-2023: **mediana (UC)**, **media/hogar**, **media/persona**.

**Distinción importante:** son **valores municipales oficiales del INE**, no la
agregación de las secciones. La mediana municipal (19.950 € en 2023) ≠ la mediana
de las medianas de sección (20.650 €) — por eso se usa el dato oficial, no se agrega.
Esta gráfica es distinta de **M19** (AEAT, renta por declarante): se muestran juntas
en la misma pestaña, cada una con su fuente.

**Limitaciones:**
- Mismas que F2 (experimental, mediana en escalones gruesos → tramos planos).
- Cobertura 2015-2023 (no hay 2024-2025 oficial todavía).

---

### M20 · Serie municipal acumulada de VFTs

**Datos de entrada:** F1 (subset cacheado + datos espaciales agregados).

**Métricas mostradas:**
- Big number: `vfts[último_año]` (acumulado a 2025 ≈ 3 626).
- Anotaciones narrativas: "▼ freno COVID" (2020), "★ récord +44 %/año" (2024).
- Side stats: plazas acumuladas, ratio sobre parque residencial municipal, delta % desde primer año con datos (2016).

**Fórmula (build_vft.py):**
```
viviendas_total_muni = Σ viviendas_total[sección]  # ≈ 103 849
para cada año Y en serie_years:
    vfts[Y] = #{VFT : registration_year ≤ Y}
    plazas[Y] = Σ plazas (VFT : registration_year ≤ Y)
    ratio[Y] = vfts[Y] / viviendas_total_muni × 100
```

**Limitaciones:**
- Mismo sesgo superviviente que M5.
- El año 2026 del slider se descarta (sigue siendo parcial al momento de la descarga).

---

## Tabla resumen de cobertura temporal por métrica

| Métrica | Rango con datos | Rango slider | Comportamiento fuera de rango |
|---|---|---|---|
| M1 Población | 2015-2025 | 2015-2025 | — |
| M2 Verde/hab | 2015-2025 | 2015-2025 | — |
| M3 NO₂ | 2001-2024 | 2015-2025 | gris si no hay dato |
| M4 Renta sec/barrio (mediana UC) | 2015-2023 | 2015-2025 | fallback al último año |
| M5 VFT % | 2016-2025 | 2015-2025 | 2015 = 0; 2026+ no aplica |
| M17 Pirámide | 2003-2025 | 2003-2025 (slider propio) | — |
| M18 Serie 1996+ | 1996-2025 | 1996-2025 (slider propio) | — |
| M19 Renta IRPF (AEAT) | 2013-2023 | independiente | — |
| M19b Renta ADRH muni | 2015-2023 | independiente | — |
| M20 VFT muni | 2016-2025 | 2015-2025 (slider mapa) | 2015 = 0 |

---

## Mejoras futuras prioritarias

1. **Exposición NO₂ con más estaciones / IDW** (M3) — pasar de Voronoi a Inverse Distance Weighting o usar un modelo CALIOPE/EMEP. Requiere validar fuentes.
2. **Reconciliación de secciones censales inter-año** — si el INE redelimita una sección entre 2015 y 2025, hoy se pierden datos. Mapear CUSEC viejo → CUSEC nuevo vía tabla oficial INE.
3. **Tamaño medio del hogar variable por año** en M5 — usar `tamaño_hogar[año]` en vez de fijo 2023.
4. **Snapshots mensuales de OpenRTA** — eliminar el sesgo superviviente registrando históricos propios.
5. **Confirmar identidad de las estaciones SIVA** (códigos 7 y 10) con un contacto en la Junta.
6. **Documentar y versionar la query Overpass** de las capas OSM — hoy son un agujero negro de reproducibilidad.
7. **Validación post-pipeline** — añadir tests que verifiquen rangos y monotonías (p. ej. cumulativo VFT siempre creciente, ratio NO₂ siempre positivo, etc.).
