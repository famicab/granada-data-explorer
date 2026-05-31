import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  circleMarker,
  divIcon,
  marker as createMarker,
  type Layer,
  type LatLng,
  type PathOptions,
} from "leaflet";
import type { StationProps } from "./StationPanel.tsx";
import type { AreaProps } from "./AreaPanel.tsx";

const VERDE_PANE = "verde";
const POI_PANE = "poi";

// Crea un pane personalizado para Zonas verdes: se pinta por encima del
// choropleth (z-index 420 > overlayPane 400) pero no captura clicks, de modo
// que los clicks pasan a las secciones de abajo.
function VerdePane() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane(VERDE_PANE)) {
      const p = map.createPane(VERDE_PANE);
      p.style.zIndex = "420";
      p.style.pointerEvents = "none";
    }
  }, [map]);
  return null;
}

// Pane para POIs (equipamientos): debajo de markerPane (estaciones, z=600)
// pero encima de overlayPane (coropleta, z=400) y verde (z=420). Los POIs
// SÍ deben capturar clicks (popup con info).
function PoiPane() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane(POI_PANE)) {
      const p = map.createPane(POI_PANE);
      p.style.zIndex = "500";
    }
  }, [map]);
  return null;
}

export interface FlyTarget {
  coords: [number, number]; // [lon, lat] formato GeoJSON
  n: number; // contador para forzar re-trigger en clicks repetidos
}

function FlyTo({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target?.coords) return;
    const [lon, lat] = target.coords;
    map.flyTo([lat, lon], Math.max(map.getZoom(), 16), { duration: 0.7 });
  }, [target, map]);
  return null;
}

interface LayerData {
  name: string;
  label: string;
  color: string;
  visible: boolean;
  data: GeoJSON.FeatureCollection | null;
  group?: string;
}

export type SeccionMetric =
  | "pop"
  | "verde_hab"
  | "no2_exposure"
  | "renta"
  | "vft_ratio";

interface Props {
  layers: LayerData[];
  onSelectStation: (station: StationProps) => void;
  onSelectArea: (area: AreaProps) => void;
  year: number | null;
  metric: SeccionMetric;
  rentaKey?: string;
  flyTarget?: FlyTarget | null;
}

const GRANADA_CENTER: [number, number] = [37.176, -3.598];
// Cualquiera de estas capas es coropleta de áreas (mutuamente excluyentes
// vía App.tsx). El mapa trata a las dos igual.
const AREA_LAYERS = ["secciones_censales", "barrios"] as const;
const isAreaLayerName = (n: string) =>
  (AREA_LAYERS as readonly string[]).includes(n);
const STATIONS = "estaciones_aire";

// Bandas anuales de NO2 (UE): <20 verde, 20-40 ámbar, >40 rojo.
function no2BandColor(v: number): string {
  if (v < 20) return "#22c55e";
  if (v < 40) return "#f59e0b";
  return "#ef4444";
}

// Color del marcador de estación según NO2 del año seleccionado (gris si no
// hay dato para ese año, fallback estático si el año no está fijado todavía).
function stationFillColor(
  feature: GeoJSON.Feature | undefined,
  year: number | null,
  fallback: string
): string {
  if (year == null) return fallback;
  const series = (feature?.properties?.series as
    | { NO2?: { anio: number; valor: number }[] }
    | undefined)?.NO2;
  const point = series?.find((p) => p.anio === year);
  return point ? no2BandColor(point.valor) : "#9ca3af";
}

function classIndex(v: number, breaks: number[]): number {
  for (let i = 0; i < breaks.length; i++) if (v <= breaks[i]) return i;
  return breaks.length;
}

function choroplethValue(
  feature: GeoJSON.Feature | undefined,
  year: number | null,
  metric: SeccionMetric,
  estacionesNo2?: Record<string, Record<string, number>>,
  rentaKey: string = "renta"
): number | undefined {
  const props = feature?.properties as Record<string, any> | undefined;
  if (!props) return undefined;
  const pob =
    year != null
      ? (props.poblaciones as Record<string, number> | undefined)?.[String(year)]
      : undefined;
  if (metric === "verde_hab") {
    const verde = props.superficie_verde_m2 as number | undefined;
    if (verde == null || pob == null || pob <= 0) return undefined;
    return verde / pob;
  }
  if (metric === "no2_exposure") {
    if (year == null) return undefined;
    // Barrios: serie NO₂ pre-agregada (media ponderada por población).
    const direct = props.no2_serie?.[String(year)];
    if (typeof direct === "number") return direct;
    // Secciones: lookup vía estación más cercana.
    const stationName = props.estacion_cercana?.name as string | undefined;
    if (!stationName || !estacionesNo2) return undefined;
    return estacionesNo2[stationName]?.[String(year)];
  }
  if (metric === "renta") {
    if (year == null) return undefined;
    const series = props[rentaKey] as Record<string, number> | undefined;
    if (!series) return undefined;
    const direct = series[String(year)];
    if (typeof direct === "number") return direct;
    // ADRH cubre 2015-2023. Si el slider está fuera del rango, mostramos
    // el dato más reciente disponible — la coropleta no se queda gris.
    const yrs = Object.keys(series)
      .map(Number)
      .sort((a, b) => b - a);
    return yrs.length > 0 ? series[String(yrs[0])] : undefined;
  }
  if (metric === "vft_ratio") {
    // Serie reconstruida desde `registration_date` de las VFTs activas
    // hoy. Para cada año, n_vfts_acum / viviendas_total (denominador
    // fijo al stock residencial actual — la evolución refleja solo el
    // numerador, no cambios demográficos).
    const v = props.vft;
    if (!v) return undefined;
    const viviendas = v.viviendas_total as number | undefined;
    if (!viviendas || viviendas <= 0) return undefined;
    if (year != null && v.serie && typeof v.serie[String(year)] === "number") {
      return (v.serie[String(year)] / viviendas) * 100;
    }
    // Sin año (o año sin dato) → snapshot actual.
    const ratio = v.ratio_vft_pct;
    return typeof ratio === "number" ? ratio : undefined;
  }
  return pob;
}

function choroplethStyle(
  feature: GeoJSON.Feature | undefined,
  year: number | null,
  metric: SeccionMetric,
  breaks: number[],
  colors: string[],
  estacionesNo2?: Record<string, Record<string, number>>,
  rentaKey: string = "renta"
): PathOptions {
  const v = choroplethValue(feature, year, metric, estacionesNo2, rentaKey);
  const fill = v != null ? colors[classIndex(v, breaks)] : "#cccccc";
  return { color: "#fff", weight: 0.6, fillColor: fill, fillOpacity: 0.7 };
}

/**
 * Mensaje explicativo cuando una sección está gris en la coropleta.
 * `null` significa "valor sí presente" (no hace falta tooltip).
 *
 * El audit detectó que las secciones grises sin explicación son una
 * fuente de confusión (esp. en renta — secciones censuradas por secreto
 * estadístico ADRH, o secciones nuevas sin histórico antes de su creación).
 * Cada métrica tiene un motivo distinto; lo comunicamos al usuario.
 */
function missingValueHint(
  feature: GeoJSON.Feature | undefined,
  year: number | null,
  metric: SeccionMetric,
  estacionesNo2?: Record<string, Record<string, number>>,
  rentaKey: string = "renta"
): string | null {
  const props = feature?.properties as Record<string, any> | undefined;
  if (!props || year == null) return null;
  if (choroplethValue(feature, year, metric, estacionesNo2, rentaKey) != null) return null;

  if (metric === "pop" || metric === "verde_hab") {
    const pobs = props.poblaciones as Record<string, number> | undefined;
    if (!pobs?.[String(year)]) {
      const yrs = Object.keys(pobs ?? {})
        .map(Number)
        .sort((a, b) => a - b);
      if (yrs.length === 0 || year < yrs[0]) {
        return "Sección sin datos para este año (probablemente creada después)";
      }
      return "Sin datos de población para este año";
    }
    if (metric === "verde_hab") return "Sin zonas verdes registradas o pob.=0";
  }
  if (metric === "renta") {
    return "Renta no publicada · secreto estadístico (ADRH)";
  }
  if (metric === "vft_ratio") {
    return "Sin denominador (pob. o tamaño de hogar no disponibles)";
  }
  if (metric === "no2_exposure") {
    return `Sin medición de NO₂ para ${year} en la estación más cercana`;
  }
  return null;
}


// Leaflet applies this style fn to every path layer, points included. A feature
// may carry its own `color` (NO2 band for stations, population class for the
// choropleth); otherwise fall back to the layer's nominal colour. Cuando se
// pasa `year`, los puntos (estaciones) se colorean dinámicamente con el NO2
// de ese año.
function styleFor(
  feature: GeoJSON.Feature | undefined,
  fallback: string,
  year: number | null = null
): PathOptions {
  const featColor = feature?.properties?.color as string | undefined;
  if (feature?.geometry?.type === "Point") {
    const fill = stationFillColor(feature, year, featColor ?? fallback);
    return { color: "#fff", weight: 2, fillColor: fill, fillOpacity: 0.9 };
  }
  if (featColor) {
    return { color: "#fff", weight: 0.6, fillColor: featColor, fillOpacity: 0.7 };
  }
  return { color: fallback, weight: 1.5, fillColor: fallback, fillOpacity: 0.25 };
}

// Zonas verdes sobre el choropleth: la forma se reconoce por el borde
// marcado, el relleno queda muy translúcido para no tapar el color de la
// sección de debajo.
function verdeStyle(color: string): PathOptions {
  return { color, weight: 1.4, fillColor: color, fillOpacity: 0.15 };
}

function pointToLayer(
  feature: GeoJSON.Feature,
  latlng: LatLng,
  fallback: string,
  year: number | null = null
) {
  // markerPane (z-index 600) garantiza que los puntos se vean siempre encima
  // de polígonos (sections, zonas verdes), aunque coincidan en el espacio.
  return circleMarker(latlng, {
    radius: 7,
    pane: "markerPane",
    ...styleFor(feature, fallback, year),
  });
}

// POIs (equipamientos): marker con icono emoji + borde del color de la capa,
// para distinguir las 6 categorías a simple vista. Usamos `marker` con
// `divIcon` en lugar de `circleMarker` para evitar que `styleFor` (aplicado
// por el `style` prop del GeoJSON) sobreescriba el color con gris.
const POI_ICONS: Record<string, string> = {
  poi_sanidad: "➕",
  poi_educacion: "📚",
  poi_agua: "💧",
  poi_reciclaje: "♻️",
  poi_aparcabicis: "🚲",
  poi_patrimonio: "🏛️",
};

// Override por subtipo OSM: cuando una categoría agrupa POIs visualmente
// muy distintos (p. ej. agua potable vs fuente ornamental), el icono del
// `kind` reemplaza el de la capa.
const POI_ICONS_BY_KIND: Record<string, string> = {
  // Agua
  drinking_water: "🚰", // grifo — agua potable
  fountain: "⛲",        // fuente ornamental
};

function poiMarker(
  latlng: LatLng,
  layerName: string,
  color: string,
  kind?: string
) {
  const icon =
    (kind && POI_ICONS_BY_KIND[kind]) ?? POI_ICONS[layerName] ?? "•";
  // `border-color` inline pisa el shorthand `border` del CSS por especificidad
  // de inline styles. Así el color de la capa se ve en el borde.
  const html = `<div class="poi-marker" style="border-color:${color}">${icon}</div>`;
  return createMarker(latlng, {
    pane: POI_PANE,
    icon: divIcon({
      className: "",
      html,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    }),
  });
}

const POI_KIND_LABELS: Record<string, string> = {
  pharmacy: "Farmacia",
  hospital: "Hospital",
  clinic: "Clínica",
  doctors: "Centro médico",
  school: "Colegio",
  kindergarten: "Guardería",
  college: "Centro de FP",
  university: "Universidad",
  library: "Biblioteca",
  drinking_water: "Fuente potable",
  fountain: "Fuente",
  recycling: "Punto de reciclaje",
  waste_disposal: "Residuos",
  bicycle_parking: "Aparcabicis",
  museum: "Museo",
  gallery: "Galería",
  viewpoint: "Mirador",
  attraction: "Atracción",
  castle: "Castillo",
  palace: "Palacio",
  church: "Iglesia",
  citywalls: "Murallas",
  city_gate: "Puerta histórica",
  monument: "Monumento",
};

function poiPopupHtml(props: Record<string, any> | null): string {
  if (!props) return "";
  const name = (props.name as string | undefined) ?? null;
  const kind = (props.kind as string | undefined) ?? null;
  const kindLabel = kind ? POI_KIND_LABELS[kind] ?? kind : "";
  const parts: string[] = [];
  if (name) parts.push(`<strong>${name}</strong>`);
  if (kindLabel) parts.push(`<span style="color:#666">${kindLabel}</span>`);
  // VFTs traen plazas y CP — útil para el popup, sin name oficial las
  // muchas veces son entidades anonimizables (privacidad razonable).
  const plazas = props.plazas as number | undefined;
  if (typeof plazas === "number" && plazas > 0) {
    parts.push(`<span style="color:#666">${plazas} plazas</span>`);
  }
  const cp = props.postal_code as string | undefined;
  if (cp) parts.push(`<span style="color:#888">CP ${cp}</span>`);
  return parts.join("<br/>") || "(sin información)";
}

function onEachFeature(
  feature: GeoJSON.Feature,
  layer: Layer,
  onSelectStation: (station: StationProps) => void
) {
  const props = feature.properties;
  if (!props) return;

  // Air quality stations open the detail panel (with the larger chart) on click.
  if (props.series && typeof props.series === "object") {
    (layer as any).bindTooltip(String(props.name ?? "Estación"));
    layer.on("click", () => onSelectStation(props as StationProps));
    return;
  }

  const lines: string[] = [];
  if (props.name) lines.push(`<strong>${props.name}</strong>`);
  if (props.leisure) lines.push(`<b>Tipo:</b> ${props.leisure}`);

  if (lines.length > 0) {
    (layer as any).bindPopup(lines.join("<br/>"));
  }
}

export default function GranadaMap({
  layers,
  onSelectStation,
  onSelectArea,
  year,
  metric,
  rentaKey = "renta",
  flyTarget = null,
}: Props) {
  // Refs para recolorear capas dinámicas sin remontarlas:
  //  - choroRef:    secciones (cambia con año/métrica)
  //  - stationsRef: estaciones (cambia con año → color NO2 de ese año)
  const choroRef = useRef<any>(null);
  const stationsRef = useRef<any>(null);
  const stationsLayer = layers.find(
    (l) => l.name === STATIONS && l.visible && l.data
  );
  const choroLayer = layers.find(
    (l) => isAreaLayerName(l.name) && l.visible && l.data
  );
  const choroMeta = choroLayer?.data as
    | {
        poblacion_breaks?: number[];
        poblacion_colors?: string[];
        verde_hab_breaks?: number[];
        verde_hab_colors?: string[];
        no2_breaks?: number[];
        no2_colors?: string[];
        renta_breaks?: number[];
        renta_colors?: string[];
        vft_breaks?: number[];
        vft_colors?: string[];
        estaciones_no2?: Record<string, Record<string, number>>;
      }
    | undefined;
  const breaks =
    metric === "verde_hab"
      ? choroMeta?.verde_hab_breaks
      : metric === "no2_exposure"
      ? choroMeta?.no2_breaks
      : metric === "renta"
      ? ((choroMeta as any)?.[`${rentaKey}_breaks`] as number[] | undefined)
      : metric === "vft_ratio"
      ? choroMeta?.vft_breaks
      : choroMeta?.poblacion_breaks;
  const colors =
    metric === "verde_hab"
      ? choroMeta?.verde_hab_colors
      : metric === "no2_exposure"
      ? choroMeta?.no2_colors
      : metric === "renta"
      ? ((choroMeta as any)?.[`${rentaKey}_colors`] as string[] | undefined)
      : metric === "vft_ratio"
      ? choroMeta?.vft_colors
      : choroMeta?.poblacion_colors;
  const estacionesNo2 = choroMeta?.estaciones_no2;

  // Recolorea las secciones al cambiar de año o métrica, sin remontar la capa.
  // Además: bind tooltip dinámico con la causa del gris cuando una sección
  // está sin dato (audit recommendation MEDIO-3: usuarios confunden gris
  // con bug; explicar el motivo elimina la fricción).
  useEffect(() => {
    const gj = choroRef.current;
    if (!gj || !breaks || !colors) return;
    gj.eachLayer((sub: any) => {
      const f = sub.feature as GeoJSON.Feature | undefined;
      if (!f) return;
      sub.setStyle(choroplethStyle(f, year, metric, breaks, colors, estacionesNo2, rentaKey));
      const hint = missingValueHint(f, year, metric, estacionesNo2, rentaKey);
      if (hint) {
        sub.bindTooltip(hint, { sticky: true, direction: "top" });
      } else if (sub.getTooltip()) {
        sub.unbindTooltip();
      }
    });
  }, [year, metric, rentaKey, breaks, colors, estacionesNo2, choroLayer?.data]);

  // Recolorea los marcadores de estación al cambiar año (sin remontarlos).
  useEffect(() => {
    const gj = stationsRef.current;
    if (!gj) return;
    gj.eachLayer((sub: any) => {
      const f = sub.feature as GeoJSON.Feature | undefined;
      if (!f) return;
      const fallback =
        (f.properties?.color as string | undefined) ?? "#ef4444";
      sub.setStyle({ fillColor: stationFillColor(f, year, fallback) });
    });
  }, [year, stationsLayer?.data]);

  return (
    <MapContainer
      center={GRANADA_CENTER}
      zoom={14}
      className="map-container"
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <VerdePane />
      <PoiPane />
      <FlyTo target={flyTarget} />

      {layers.map((layer) => {
        if (!layer.visible || !layer.data) return null;
        const isChoro = isAreaLayerName(layer.name);
        const isStations = layer.name === STATIONS;
        const isVerde = layer.group === "verde";
        const isPoi = layer.group === "equip";
        return (
          <GeoJSON
            key={layer.name}
            ref={isChoro ? choroRef : isStations ? stationsRef : undefined}
            data={layer.data}
            pane={isVerde ? VERDE_PANE : isPoi ? POI_PANE : undefined}
            style={(feature) =>
              isChoro
                ? choroplethStyle(
                    feature,
                    year,
                    metric,
                    breaks ?? [],
                    colors ?? [],
                    estacionesNo2,
                    rentaKey
                  )
                : isVerde
                ? verdeStyle(layer.color)
                : styleFor(feature, layer.color, year)
            }
            pointToLayer={(feature, latlng) =>
              isPoi
                ? poiMarker(
                    latlng,
                    layer.name,
                    layer.color,
                    feature.properties?.kind as string | undefined
                  )
                : pointToLayer(feature, latlng, layer.color, year)
            }
            onEachFeature={(feature, lyr) => {
              if (isChoro) {
                lyr.on("click", () =>
                  onSelectArea(feature.properties as AreaProps)
                );
              } else if (isPoi) {
                (lyr as any).bindPopup(poiPopupHtml(feature.properties));
                const name = feature.properties?.name as string | undefined;
                const kind = feature.properties?.kind as string | undefined;
                // Sin name: nunca exponemos el código OSM crudo; usamos el
                // label en español de POI_KIND_LABELS.
                const tooltip =
                  name ?? (kind ? POI_KIND_LABELS[kind] ?? kind : null);
                if (tooltip) (lyr as any).bindTooltip(String(tooltip));
              } else {
                onEachFeature(feature, lyr, onSelectStation);
              }
            }}
          />
        );
      })}
    </MapContainer>
  );
}
