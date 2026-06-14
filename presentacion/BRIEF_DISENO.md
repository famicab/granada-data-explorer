# Brief de diseño — Presentación "Granada Data Explorer"

Documento para entregar a una herramienta de diseño de presentaciones (Gamma,
Canva, Beautiful.ai, Claude, Tome, etc.). Estructura:
1. **Prompt maestro** (pégalo primero).
2. **Parámetros globales** (estilo, paleta, tipografía).
3. **Activos** que subirás.
4. **Contenido diapositiva a diapositiva** (lo importante).
5. **Datos verificados** (para que la IA no invente cifras).
6. **Checklist final.**

---

## 1 · Prompt maestro (cópialo tal cual)

> Crea una presentación profesional de **12 diapositivas en formato 16:9** y en
> **español de España** titulada **"Granada Data Explorer"**. Es un **observatorio
> urbano interactivo basado en datos abiertos** de la ciudad de Granada. El público
> son **estudiantes, profesorado y personas interesadas en datos urbanos**; el tono
> es **divulgativo, claro y riguroso**, no comercial. Duración objetivo al hablar:
> **10 minutos**.
>
> Sigue **exactamente** el contenido que te doy diapositiva a diapositiva (titulares,
> textos y notas del orador). **No inventes ni cambies ninguna cifra**: usa solo los
> datos de la sección "Datos verificados". Mantén los textos concisos (máximo ~5
> viñetas por diapositiva, frases cortas). Incluye las **notas del orador** que
> aporto en cada diapositiva.
>
> Estilo visual: **limpio y moderno, temática de mapas y datos urbanos**, mucho
> espacio en blanco, jerarquía tipográfica clara. Usa la **paleta y tipografía**
> indicadas. Incorpora **iconos de línea** sencillos (población, dinero, hoja/árbol,
> nube de contaminación, casa, mapa, candado abierto para "open source"). Diapositiva
> 5 debe destacar **la captura de pantalla** que adjunto, a gran tamaño. Portada y
> cierre con **fondo azul oscuro**; el resto, fondo claro con una **barra de acento**
> superior que alterna azul y verde.

---

## 2 · Parámetros globales

| Parámetro | Valor |
|---|---|
| Formato | 16:9 (panorámico), 12 diapositivas |
| Idioma | Español (España) |
| Audiencia | Estudiantes, profesorado, público interesado en datos urbanos |
| Tono | Divulgativo, claro, riguroso; nada comercial |
| Duración | ~10 min al hablar |
| Estilo | Minimalista, moderno, temática de mapas/datos; mucho aire |
| Tipografía | Sans-serif geométrica y legible (p. ej. *Inter*, *Poppins*, *Montserrat* o *Segoe UI*). Titulares en **bold** |
| Iconografía | Iconos de línea, finos, monocromos sobre los acentos |
| Reglas | **No inventar datos.** Frases cortas. Máx. ~5 viñetas/diapositiva. Buen contraste |

### Paleta de color (hex — la de la app)

| Uso | Color | Hex |
|---|---|---|
| Azul oscuro (fondos portada/cierre, titulares) | Navy | `#0B3D67` |
| Azul medio (acento, datos) | Blue | `#3182BD` |
| Verde (acento alterno, llamadas a la acción) | Green | `#22C55E` |
| Fondo claro (cuerpo) | Light | `#F4F7FB` |
| Texto principal | Dark | `#1F2937` |
| Texto secundario / pies | Muted | `#6B7280` |

---

## 3 · Activos que adjuntar a la herramienta

- **`screenshot.png`** (en `docs/img/screenshot.png`): captura real de la app — mapa
  de coropletas de Granada por secciones censales (gradiente azul) con un panel
  lateral de indicadores de una sección. **Úsala grande en la diapositiva 5** y, en
  pequeño, en la portada.
- **URLs**: demo `granada-data-explorer.pages.dev` · repo
  `github.com/famicab/granada-data-explorer`.
- No hay logo; el "logotipo" es el título tipográfico **Granada Data Explorer**.

---

## 4 · Contenido diapositiva a diapositiva

> Para cada diapositiva: **Titular**, **Cuerpo** (viñetas/idea) y **Notas del orador**
> (lo que se dice). Respeta los textos.

### Diapositiva 1 — Portada
- **Titular:** Granada Data Explorer
- **Subtítulo:** Un observatorio urbano interactivo basado en datos abiertos
- **Elementos:** URL `granada-data-explorer.pages.dev` destacada; captura en pequeño.
- **Fondo:** azul oscuro, acento verde.
- **Notas:** Buenos días. Os presento Granada Data Explorer, un observatorio urbano
  interactivo que reúne en un único mapa datos abiertos sobre Granada: población,
  renta, calidad del aire, zonas verdes y vivienda turística. Es público y está en
  línea, sin instalar nada. En diez minutos veréis qué hace, de dónde salen sus datos
  y por qué ayuda a leer datos urbanos con criterio.

### Diapositiva 2 — ¿Qué es?
- **Titular:** ¿Qué es?
- **Frase guía:** De datos oficiales difíciles de leer… a un mapa intuitivo.
- **Cuerpo:**
  - Una aplicación web de mapas de Granada.
  - Divide la ciudad en secciones censales y barrios.
  - Colorea cada zona según el indicador elegido.
  - Un deslizador temporal muestra su evolución por años.
- **Notas:** Es una aplicación web de mapas. Divide la ciudad en secciones censales y
  barrios y colorea cada zona según el indicador que elijas. Un deslizador temporal
  muestra cómo cambia cada métrica. Convierte tablas oficiales áridas en un mapa que
  cualquiera puede explorar. No es un informe cerrado, sino una herramienta para
  hacerte preguntas sobre tu ciudad.

### Diapositiva 3 — ¿Por qué?
- **Titular:** ¿Por qué?
- **Frase guía:** El problema: información pública valiosa, pero inaccesible.
- **Cuerpo:**
  - Los datos abiertos existen, pero están dispersos.
  - INE, Junta, Agencia Tributaria… cada uno en su portal y formato.
  - Juntarlos y entenderlos es casi imposible para el público.
  - El proyecto los descarga, limpia, cruza y representa.
- **Notas:** Los datos abiertos existen, pero dispersos: INE, Junta, Agencia
  Tributaria, cada uno en su formato. Para un estudiante o un vecino, juntarlos es
  casi imposible. El proyecto hace ese trabajo pesado y los lleva a un mismo mapa.
  El objetivo es acercar la información pública y demostrar el valor de los datos
  abiertos.

### Diapositiva 4 — Qué puedes explorar
- **Titular:** Qué puedes explorar
- **Cuerpo (5 indicadores, con icono cada uno):**
  - 👥 **Población** — cuánta gente y su evolución.
  - 💶 **Renta neta media** por persona — diferencias entre barrios.
  - 🏠 **Vivienda turística** — VFT por cada 100 viviendas.
  - 🌳 **Verde por habitante** — m²/hab, umbral OMS de 9.
  - 🌫️ **Exposición al NO₂** — contaminación del tráfico.
  - *(pie)* + fichas por zona, rankings y panel de toda la ciudad.
- **Notas:** Cinco indicadores. Población. Renta neta media por persona. Presión de la
  vivienda turística (VFT por cada cien viviendas). Verde por habitante, con el umbral
  de nueve metros de la OMS. Y exposición al dióxido de nitrógeno, ligado al tráfico.
  Además, al pulsar una zona: ficha de equipamientos, rankings y panel de toda la
  ciudad.

### Diapositiva 5 — Así se ve (DEMO)
- **Titular:** Así se ve
- **Elemento principal:** la **captura `screenshot.png` a gran tamaño**.
- **Pie:** Mapa por secciones · ficha de la zona · selector de métrica y deslizador.
- **Fondo:** claro, acento verde.
- **Notas:** Esto es lo que se ve al abrir la app. En el centro, el mapa por
  secciones; más oscuro, más población. A la izquierda, la ficha de la zona: renta,
  verde por habitante, estación de aire más cercana y presión turística. Arriba se
  elige métrica y nivel; abajo, el deslizador de años. *(Aquí conviene abrir la web en
  directo 1-2 minutos.)*

### Diapositiva 6 — Cómo funciona
- **Titular:** Cómo funciona
- **Frase guía:** Una arquitectura deliberadamente sencilla.
- **Cuerpo:**
  - Programas en Python descargan las fuentes oficiales.
  - Recortan los datos a Granada capital (180 secciones).
  - Calculan los indicadores y generan archivos ligeros.
  - La web los pinta sobre un mapa interactivo.
  - Datos estáticos → web rápida, gratuita y siempre activa.
- **Sugerencia visual:** diagrama de flujo de 3 pasos (Fuentes → Python → Mapa web).
- **Notas:** Por dentro es sencillo. Programas en Python descargan las fuentes,
  recortan a Granada capital —ciento ochenta secciones— y calculan los indicadores.
  El resultado son archivos ligeros que la web pinta sobre un mapa. Al ser datos
  estáticos, la web es rápida, barata y siempre disponible; está en un hosting
  gratuito y se actualiza sola.

### Diapositiva 7 — Fuentes oficiales
- **Titular:** Fuentes oficiales
- **Frase guía:** Trazabilidad total: cualquiera puede ir a la fuente y comprobarlo.
- **Cuerpo (logos/iconos si se puede):**
  - **INE** — población, renta y cartografía de secciones.
  - **Junta de Andalucía** — vivienda turística (OpenRTA) y aire (SIVA).
  - **AEAT** — renta del IRPF municipal.
  - **OpenStreetMap** — barrios, callejero, parques y puntos de interés.
- **Notas:** Todos los datos son oficiales y abiertos. El INE aporta población, renta
  y cartografía. La Junta, el registro de viviendas turísticas y el histórico de aire.
  La Agencia Tributaria, la renta del IRPF. Y OpenStreetMap, barrios, callejero,
  parques y puntos de interés. Cada fuente con su licencia y citada; nada inventado ni
  de pago.

### Diapositiva 8 — La honestidad de los datos  *(diapositiva clave)*
- **Titular:** La honestidad de los datos
- **Frase guía:** Lo más valioso: es transparente sobre lo que NO puede decir.
- **Cuerpo:**
  - Vivienda turística: solo pisos activos hoy → el pasado se subestima (tendencia
    fiable; cifras absolutas antiguas, no).
  - Calidad del aire: solo 2 estaciones → aproximación, no medición calle a calle.
  - La renta por sección es una estadística **experimental** del INE (padrón × IRPF):
    se revisa con el tiempo.
  - Cada métrica documenta sus límites.
- **Sugerencia visual:** tono sobrio; quizá icono de "lupa/aviso". Es el corazón del
  mensaje educativo.
- **Notas:** Lo más valioso del proyecto: es honesto sobre los límites de sus datos.
  La serie de vivienda turística solo incluye pisos activos hoy, así que el pasado se
  subestima: la tendencia es fiable, las cifras antiguas no. El aire se apoya en solo
  dos estaciones: es una aproximación. Y algunos datos del INE son experimentales: en
  concreto la renta por sección, que no sale de una encuesta sino de cruzar el padrón
  con los datos fiscales del IRPF; eso da un detalle muy fino, pero el INE puede
  recalcular y revisar años pasados cuando afina el método, así que una cifra de renta
  puede cambiar en futuras actualizaciones. Cada métrica lo documenta. Es una buena
  lección de alfabetización de datos: hay que leerlos con criterio.

### Diapositiva 9 — Lo que revela el mapa  *(insights)*
- **Titular:** Lo que revela el mapa
- **Frase guía:** No solo describe la ciudad: hace visibles sus desigualdades.
- **Cuerpo (4 "stat cards" con cifra grande):**
  - **33 %** — En la sección con más presión, una de cada tres viviendas es turística
    (300 VFT de 914). En el **Albaicín**, una sección llega a 180 de 841 (21 %); el
    barrio entero, 18,7 %. Mediana de ciudad: 0,8 %. *(Denominador: viviendas totales
    del Censo 2021.)*
  - **4,6×** — Brecha de renta por persona (2023): de la **Cartuja** (5.522 €) al
    **Realejo** (25.542 €). *(En el mapa: mediana por unidad de consumo; ciudad: 19.950 €.)*
  - **54 vs 2,2** — La ciudad tiene 54 m²/hab de verde, pero la sección típica solo
    2,2: el verde **existe pero está concentrado** (68 % de secciones bajo el umbral
    OMS de 9; menos en **Centro** y **Albaicín**).
  - **24 %** — población de 65 o más (era 17 % en 2003): Granada envejece.
- **Sugerencia visual:** rejilla de 4 tarjetas, cada una con la cifra muy grande y una
  línea de texto debajo.
- **Notas:** El mapa no solo describe: revela desigualdades, y se puede señalar dónde.
  La vivienda turística: en una sección del **Albaicín**, 180 de 841 viviendas son
  turísticas —una de cada cinco—, y en la sección más tensionada de la ciudad se llega
  a una de cada tres, frente a una mediana por debajo del uno por ciento (denominador:
  viviendas totales del Censo 2021; solo cuenta las VFT registradas). La
  renta: de la **Cartuja**, con cinco mil quinientos euros por persona, al **Realejo**,
  con veinticinco mil; casi cinco veces. El verde es el más sutil: la ciudad tiene
  cincuenta y cuatro metros por habitante de media, pero la sección típica solo dos
  con dos, porque el verde está muy concentrado en la periferia y la métrica solo
  cuenta el que cae dentro de cada sección; los barrios centrales —Centro, Albaicín,
  La Paz— son los que menos tienen. Y casi uno de cada cuatro granadinos supera los 65
  años, frente a uno de cada seis hace veinte años. *(Sobre el aire: ha bajado con
  claridad, pero con solo dos estaciones es un dato norte-sur, no por barrio.)*

### Diapositiva 10 — Para debatir
- **Titular:** Para debatir
- **Frase guía:** Los datos abren preguntas; las respuestas son vuestras.
- **Cuerpo (3 preguntas, tipografía protagonista, poco texto):**
  - 🏠 **Turistificación** — las zonas con más VFT apenas tienen algo más de renta
    (correlación muy débil, +0,10). ¿La vivienda turística se instala donde ya hay renta
    y centralidad, o es ella la que encarece?
  - 🌳 **¿Verde para quién?** — tener más renta **no** se asocia a más verde
    (correlación ≈ 0). ¿Esperabais lo contrario? ¿Cómo debería repartirse?
  - 🏙️ **Centro que se vacía** — 94 de 175 secciones pierden población (2015-2025)
    aunque la ciudad repunte; y desde 1996 hay −4,7 %. ¿Qué Granada queremos en 2040?
- **Sugerencia visual:** tres preguntas grandes, una por bloque; nada de párrafos.
- **Notas:** Y aquí lo más interesante: los datos no cierran el tema, lo abren. Tres
  preguntas. Primera, turistificación: las zonas con más vivienda turística tienen una
  renta solo ligeramente mayor (relación muy débil); ¿causa o consecuencia? Segunda, el verde: la renta no predice el acceso
  a zonas verdes, algo que suele sorprender; ¿cómo debería repartirse? Y tercera: el
  centro pierde población mientras crece la periferia, y la ciudad mengua desde su
  máximo de 1996. ¿Qué modelo de ciudad queremos? Os escucho.

### Diapositiva 11 — Código abierto
- **Titular:** Código abierto
- **Frase guía:** Reutilizable, auditable y didáctico.
- **Cuerpo:**
  - Tecnologías web estándar (React + Leaflet, FastAPI, Python).
  - Todo el código en GitHub bajo licencia MIT.
  - Documentación de fuentes y metodología paso a paso.
  - No es una caja negra: se puede abrir, estudiar y modificar.
- **Notas:** El proyecto es de código abierto, con tecnologías web estándar, y todo el
  código está en GitHub bajo licencia MIT: cualquiera puede verlo, aprender,
  reutilizarlo o mejorarlo. La documentación explica fuentes y metodología. Para lo
  educativo es ideal: no es una caja negra. Es un ejemplo de datos abiertos y software
  libre trabajando juntos.

### Diapositiva 12 — Cierre
- **Titular:** Un observatorio urbano abierto para todos
- **Subtítulo:** Mapa interactivo · fuentes oficiales · transparencia total
- **Cuerpo (llamadas a la acción):**
  - 🔗 Demo: `granada-data-explorer.pages.dev`
  - 💻 Código: `github.com/famicab/granada-data-explorer`
  - Para estudiantes, docentes y curiosos por su ciudad.
  - **¡Gracias!**
- **Fondo:** azul oscuro, acento verde.
- **Notas:** En resumen: acerca los datos abiertos de la ciudad a cualquiera, con un
  mapa interactivo, fuentes oficiales y transparencia sobre sus límites. Os dejo la
  demo para probarlo y el repositorio para ver cómo está hecho. Gracias; quedo a
  vuestra disposición para preguntas.

---

## 5 · Datos verificados (NO modificar)

| Dato | Valor |
|---|---|
| Secciones censales (Granada capital) | **180** |
| Población de Granada (2025) | **235.294** hab (Censo CAP) · **233.975** (serie Padrón, tabla 2871) |
| Población — máximo histórico | **245.640** en **1996** → **−4,7 %** hasta 2025 |
| Cambio de población por sección 2015-2025 | **94 de 175** secciones pierden habitantes (la ciudad agregada repunta +4,5 %) |
| Envejecimiento (65 o más) | **17,4 % (2003) → 23,9 % (2025)** |
| Viviendas turísticas (VFT) registradas | **3.635** (acumulado ≈2025) |
| VFT por 100 viviendas — mediana / máximo | **0,8 %** / **32,8 %** (sección máx. 300 de 914; Albaicín 180 de 841 = 21,4 %; Censo 2021) |
| VFT — secciones con ≥10 % | **11** |
| Renta ADRH municipal 2023 (3 medidas) | **mediana (UC) 19.950 €** · media/hogar 36.821 € · media/persona 16.024 € |
| Renta por sección 2023 — desigualdad (por persona) | de **5.522 €** a **25.542 €** → brecha **4,6×** (mediana de secciones 16.568 €) |
| Verde por habitante | agregado ciudad **54 m²/hab**, pero **68 %** de secciones < OMS **9** (mediana 2,2): verde **concentrado**, no escaso |
| Calidad del aire | **2** estaciones · NO₂ Granada Norte **42 (2002) → 31 (2024)**; Palacio de Congresos **35 (2010) → 18 (2024)** µg/m³ (límite UE 40) |
| Relaciones (correlación de Pearson) | renta–VFT % **+0,10** (muy débil) · renta–verde/hab **≈ 0** |
| Coberturas temporales | población 1996-2025 · renta por sección 2015-2023 · IRPF municipal 2013-2023 |
| Fuentes | INE · Junta de Andalucía (OpenRTA, SIVA) · AEAT · OpenStreetMap |
| Tecnología | React + TypeScript + Leaflet (Vite) · FastAPI · Python (pandas/geopandas) |
| Licencias | Código **MIT**; datos por fuente, OpenStreetMap **ODbL** (atribución + compartir-igual) |
| Demo / Repo | granada-data-explorer.pages.dev · github.com/famicab/granada-data-explorer |

> Atribución obligatoria si se muestran mapas: **© OpenStreetMap contributors**.
> Las cifras de insights se calcularon sobre `backend/data/` con
> `presentacion/analisis_insights.py` (reproducible).

### Zonas concretas para citar (traducción de sección censal → barrio)

| Dato | Zona(s) para citar | Detalle | Solidez |
|---|---|---|---|
| **VFT** (presión turística) | **Albaicín** | una sección 180 VFT de 841 viviendas (21 %, Censo 2021); el Albaicín entero, 18,7 %; máximo de ciudad ~33 % en otra sección | ✅ Alta |
| **Brecha de renta 4,6×** | **Cartuja** ↔ **Realejo** | Cartuja 5.522 €/persona · Realejo 25.542 € (2023) | ✅ Alta |
| **Verde escaso** | **Centro · Albaicín · La Paz** (<2 m²/hab) | "Desiertos verdes" (secciones con 0): **Zaidín-Vergeles, Ronda, Fígares** | ✅ Buena |
| **Verde abundante** | periferia: **Fargue, Lancha del Genil** | Cifras enormes por bosque + poca población (no parques urbanos) | ⚠️ Matizar |
| **NO₂** | **norte (~31) vs sur (~18)** | Solo 2 estaciones (Granada Norte / Palacio de Congresos) → **no citar por barrio** | ⚠️ Solo a grandes rasgos |

> ⚠️ **Sección ≠ barrio:** las cifras extremas (33 %, 25.542 €) son de *una sección
> censal* dentro de ese barrio, no de todo el barrio. Para afirmar sobre "la zona",
> usa las cifras a nivel barrio (p. ej. Albaicín 18,7 %). Nombres de barrio: capa OSM.

---

## 6 · Checklist antes de dar por buena la presentación

- [ ] 12 diapositivas, 16:9, en español.
- [ ] Las cifras coinciden con la tabla "Datos verificados" (sin inventar).
- [ ] Paleta y tipografía aplicadas; portada y cierre en azul oscuro.
- [ ] La captura aparece grande en la diapositiva 5.
- [ ] Cada diapositiva tiene sus **notas del orador**.
- [ ] Textos concisos (máx. ~5 viñetas, frases cortas).
- [ ] URLs correctas (demo y repositorio).
- [ ] Contraste y legibilidad correctos.
