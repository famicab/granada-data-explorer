# Guion — Granada Data Explorer (≈10 minutos)

Presentación de 11 diapositivas, ~55 s cada una. El texto en cursiva es lo que se
dice; los títulos son las diapositivas. Este mismo guion va incrustado como **notas
del orador** en el `.pptx`.

---

## 1 · Portada — Granada Data Explorer
*Buenos días. Os presento Granada Data Explorer, un observatorio urbano interactivo
que reúne en un único mapa datos abiertos sobre la ciudad de Granada: población,
renta, calidad del aire, zonas verdes y vivienda turística. Todo el proyecto es
público y está disponible en línea, sin instalar nada, en la dirección que veis en
pantalla. En los próximos diez minutos os voy a enseñar qué hace, de dónde salen sus
datos y, sobre todo, por qué puede ser una buena herramienta para aprender a leer
datos urbanos con criterio.*

## 2 · ¿Qué es?
*Granada Data Explorer es una aplicación web de mapas. Divide la ciudad en sus
secciones censales y barrios —las unidades estadísticas más pequeñas— y colorea cada
zona según el indicador que elijas. Un deslizador temporal permite ver cómo ha
cambiado cada métrica a lo largo de los años. La idea es sencilla: convertir tablas
de datos oficiales, que suelen ser áridas y difíciles de interpretar, en un mapa que
cualquiera pueda explorar de forma intuitiva. No es un informe cerrado, sino una
herramienta para hacerte preguntas sobre tu ciudad y buscar las respuestas tú mismo.*

## 3 · ¿Por qué?
*¿Por qué construir esto? Los datos abiertos de las administraciones existen, pero
están dispersos: unos en el INE, otros en la Junta, otros en la Agencia Tributaria,
cada uno en su formato y su portal. Para una persona normal —un estudiante, un
docente, un vecino curioso— juntarlos y entenderlos es casi imposible. Este proyecto
hace ese trabajo pesado por ti: descarga, limpia, cruza y representa los datos sobre
un mismo mapa. El objetivo no es solo enseñar cifras, sino acercar la información
pública a la gente y servir como ejemplo de qué se puede hacer con datos abiertos.*

## 4 · Qué puedes explorar
*El mapa ofrece cinco grandes indicadores. Población: cuánta gente vive en cada zona
y cómo ha evolucionado. Renta neta media por persona, para ver las diferencias
socioeconómicas entre barrios. Presión de la vivienda turística, es decir, cuántas
viviendas de uso turístico hay por cada cien viviendas. Verde por habitante, los
metros cuadrados de zona verde por persona, con el umbral de nueve que recomienda la
Organización Mundial de la Salud. Y la exposición al dióxido de nitrógeno, un
contaminante ligado al tráfico. Además, al pulsar una zona obtienes una ficha con sus
equipamientos cercanos, rankings de barrios y un panel con datos de toda la ciudad.*

## 5 · Así se ve (demo)
*Esto es lo que se ve al abrir la aplicación. En el centro, el mapa de Granada
coloreado por secciones; aquí, más oscuro significa más población. A la izquierda, la
ficha de la zona seleccionada, con su renta, su verde por habitante, la estación de
aire más cercana y la presión turística. Arriba se elige la métrica y el nivel
—secciones o barrios— y abajo está el deslizador de años. Os animo a abrirlo después
en vuestro móvil: funciona en cualquier navegador y no requiere instalar nada.*

## 6 · Cómo funciona
*Por dentro, el proyecto es deliberadamente sencillo. Un conjunto de programas en
Python se encarga del trabajo de datos: descargan las fuentes oficiales, recortan la
información a Granada capital —ciento ochenta secciones censales— y calculan los
indicadores. El resultado son archivos ligeros que la página web pinta sobre un mapa
interactivo. Al ser datos ya procesados y estáticos, la web es rápida, barata de
mantener y está siempre disponible. De hecho, está alojada en un servicio gratuito y
se actualiza sola cada vez que cambiamos algo.*

## 7 · Fuentes oficiales
*Todos los datos provienen de fuentes oficiales y abiertas. El Instituto Nacional de
Estadística aporta población, renta y la cartografía de las secciones. La Junta de
Andalucía, el registro de viviendas turísticas y el histórico de calidad del aire. La
Agencia Tributaria, la renta del IRPF municipal. Y OpenStreetMap, el mapa
colaborativo, aporta los barrios, el callejero, los parques y los puntos de interés.
Cada fuente conserva su licencia y está citada; nada está inventado ni es de pago.
Esta trazabilidad es importante: cualquiera puede ir a la fuente y comprobar los datos.*

## 8 · La honestidad de los datos
*Y llegamos a lo que para mí es lo más valioso del proyecto: es honesto sobre los
límites de sus datos. Os doy tres ejemplos. La serie histórica de vivienda turística
solo incluye los pisos que siguen activos hoy, así que el pasado está subestimado: la
tendencia es fiable, pero las cifras absolutas de hace años no. La calidad del aire se
apoya en solo dos estaciones para toda la ciudad, así que es una aproximación, no una
medición fina calle a calle. Y algunos datos del INE son experimentales y se revisan
con el tiempo. Cada métrica documenta estas limitaciones. Esto convierte la
herramienta en una buena lección de alfabetización de datos: los datos abiertos son
potentes, pero hay que leerlos con criterio.*

## 9 · Un hallazgo de ejemplo
*¿Qué se puede ver con todo esto? Un ejemplo claro es la presión de la vivienda
turística. En el conjunto de la ciudad hay del orden de tres mil seiscientas
viviendas turísticas registradas, pero no están repartidas: se concentran en el casco
histórico, donde algunas secciones rondan el treinta por ciento de las viviendas
—casi una de cada tres—, frente a una mediana de la ciudad por debajo del uno por
ciento. Y esto es sobre todo el parque de viviendas, contando con el dato real del
Censo, no una estimación. El mapa hace visible de un vistazo esa concentración. Y lo
mismo ocurre con el verde o la renta: las desigualdades entre barrios, que en una
tabla pasan desapercibidas, saltan a la vista en el mapa.*

## 10 · Código abierto
*El proyecto es de código abierto. Está construido con tecnologías web estándar y todo
el código está publicado en GitHub bajo licencia MIT, lo que significa que cualquiera
puede verlo, aprender de él, reutilizarlo o proponer mejoras. La documentación explica
las fuentes y la metodología paso a paso. Para un contexto educativo esto es ideal: no
es una caja negra, sino un proyecto que se puede abrir, estudiar y modificar. Es, en
sí mismo, un ejemplo práctico de datos abiertos y software libre trabajando juntos.*

## 11 · Cierre
*En resumen: Granada Data Explorer es un observatorio urbano que acerca los datos
abiertos de la ciudad a cualquier persona, con un mapa interactivo, fuentes oficiales
y total transparencia sobre sus limitaciones. Os dejo las dos direcciones: la demo en
vivo para probarlo y el repositorio para ver cómo está hecho. Está pensado para
estudiantes, docentes y cualquiera con curiosidad por su ciudad. Muchas gracias; quedo
a vuestra disposición para preguntas.*
