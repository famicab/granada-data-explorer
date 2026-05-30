# Licencia y atribución de los datos

El **código** de este proyecto se publica bajo licencia MIT (ver [LICENSE](LICENSE)).
Los **datos** distribuidos o reproducidos por este repositorio **no** son MIT: cada
dataset conserva la licencia de su fuente original. Este documento declara la
procedencia y las condiciones de reutilización. El inventario de fuentes y la
metodología de cada métrica están resumidos en el [README](README.md); los URLs y
transformaciones exactas viven en los `scripts/build_*.py`.

## Resumen por fuente

| Fuente | Datos en el repo | Licencia / condición | Requisito al reutilizar |
|---|---|---|---|
| **OpenStreetMap** | Parques, jardines, arbolado, barrios, distritos, POIs, viario (`backend/data/*` derivados y `raw-data/GIS`, `raw-data/Parques`, `*.pbf`) | **ODbL 1.0** | Atribución **"© OpenStreetMap contributors"** + *share-alike*: las bases de datos derivadas que se distribuyan deben licenciarse bajo ODbL. |
| **INE** (Instituto Nacional de Estadística) | Renta y población por sección (ADRH/CAP/Padrón), cartografía censal, pirámide demográfica | Reutilización permitida (Ley 37/2007; aviso legal del INE) | Citar al INE como fuente; no alterar el sentido; no sugerir aval oficial. |
| **Junta de Andalucía** | OpenRTA (viviendas turísticas), SIVA (calidad del aire) | Datos abiertos / reutilización con atribución | Citar al organismo; respetar las condiciones del portal de origen. |
| **AEAT** (Agencia Tributaria) | Renta IRPF municipal | Estadística pública reutilizable con atribución | Citar a la AEAT; los datos publicados son agregados. |

## Atribución requerida

Cualquier uso o redistribución de los datos derivados de OpenStreetMap debe incluir:

> © OpenStreetMap contributors — datos disponibles bajo la
> [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).

Y, para el resto de capas, citar a INE, Junta de Andalucía y AEAT según corresponda.

## Notas

- No se asume que un dato "abierto" sea libremente relicenciable. INE/Junta/AEAT
  permiten reutilización **con atribución y sin sugerir aval oficial**; OSM añade
  **cláusula share-alike**.
- Los datos crudos pesados (`raw-data/`, `*.pbf`) **no se versionan** en el repo
  (ver [.gitignore](.gitignore)); son reproducibles con los `scripts/build_*.py`.
