import { useEffect, useMemo, useState } from "react";
import GranadaMap, {
  type FlyTarget,
  type SeccionMetric,
} from "./components/GranadaMap.tsx";
import StationPanel, { type StationProps } from "./components/StationPanel.tsx";
import AreaPanel, { type AreaProps, areaId } from "./components/AreaPanel.tsx";
import RankingsPanel, {
  type RankingItem,
  type RankingsData,
} from "./components/RankingsPanel.tsx";
import DemografiaPanel, {
  type DemografiaData,
} from "./components/DemografiaPanel.tsx";
import MapMode from "./components/MapMode.tsx";
import LayersPanel, { type LayerItem } from "./components/LayersPanel.tsx";
import ActiveOverlaysStrip, {
  type OverlayChip,
} from "./components/ActiveOverlaysStrip.tsx";
import { fetchLayer, fetchDemografia } from "./api.ts";

interface LayerState {
  name: string;
  label: string;
  color: string;
  visible: boolean;
  data: GeoJSON.FeatureCollection | null;
  loading: boolean;
  group?: string; // capas con el mismo group se agrupan en un toggle maestro
}

const VERDE_GROUP = "verde";
const VERDE_MASTER_COLOR = "#16a34a";

// Categorías de equipamientos (POIs OSM): se controlan con subchecks
// individuales bajo un master "Equipamientos". A diferencia de Zonas verdes,
// los subchecks NO se encienden al activar el master — el usuario elige
// qué categoría mostrar (evita saturación: hay ~1800 POIs en total).
const EQUIP_GROUP = "equip";
const EQUIP_MASTER_COLOR = "#475569";

// Capas tipo "área coropleta": mutuamente excluyentes — activar una desactiva
// la otra (el slider/leyenda/rankings operan sobre la activa).
const AREA_LAYERS = ["secciones_censales", "barrios"] as const;
type AreaLayerName = (typeof AREA_LAYERS)[number];
const isAreaLayer = (n: string): n is AreaLayerName =>
  (AREA_LAYERS as readonly string[]).includes(n);

interface AreaMeta {
  poblacion_breaks?: number[];
  poblacion_colors?: string[];
  poblacion_anios?: number[];
  verde_hab_breaks?: number[];
  verde_hab_colors?: string[];
  no2_breaks?: number[];
  no2_colors?: string[];
  estaciones_no2?: Record<string, Record<string, number>>;
  renta_breaks?: number[];
  renta_colors?: string[];
  renta_anios?: number[];
  // Variantes de renta (mediana UC / por hogar / por persona).
  renta_med_uc_breaks?: number[];
  renta_med_uc_colors?: string[];
  renta_hogar_breaks?: number[];
  renta_hogar_colors?: string[];
  renta_persona_breaks?: number[];
  renta_persona_colors?: string[];
  vft_breaks?: number[];
  vft_colors?: string[];
  vft_fecha_descarga?: string;
}

const LAYER_CONFIG: Omit<LayerState, "data" | "loading">[] = [
  { name: "parques", label: "Parques", color: "#22c55e", visible: false, group: VERDE_GROUP },
  { name: "jardines", label: "Jardines", color: "#84cc16", visible: false, group: VERDE_GROUP },
  { name: "arbolado", label: "Arbolado", color: "#14532d", visible: false, group: VERDE_GROUP },
  { name: "secciones_censales", label: "Secciones censales", color: "#3b82f6", visible: true },
  { name: "barrios", label: "Barrios", color: "#7c3aed", visible: false },
  { name: "estaciones_aire", label: "Estaciones calidad del aire", color: "#ef4444", visible: false },
  { name: "distritos", label: "Distritos", color: "#f59e0b", visible: false },
  // Equipamientos: paleta diferenciada para que no choquen entre sí ni con
  // las capas principales (secciones/barrios/estaciones).
  { name: "poi_sanidad",     label: "Sanidad",     color: "#dc2626", visible: false, group: EQUIP_GROUP },
  { name: "poi_educacion",   label: "Educación",   color: "#0ea5e9", visible: false, group: EQUIP_GROUP },
  { name: "poi_agua",        label: "Agua",        color: "#06b6d4", visible: false, group: EQUIP_GROUP },
  { name: "poi_reciclaje",   label: "Reciclaje",   color: "#65a30d", visible: false, group: EQUIP_GROUP },
  { name: "poi_aparcabicis", label: "Aparcabicis", color: "#ec4899", visible: false, group: EQUIP_GROUP },
  { name: "poi_patrimonio",  label: "Patrimonio",  color: "#a16207", visible: false, group: EQUIP_GROUP },
  // La capa de puntos VFT individuales se retiró por privacidad: exponía la
  // geolocalización exacta de viviendas. La presión turística se visualiza por
  // densidad agregada (sección/barrio) vía el modo "VFT %".
];

export default function App() {
  const [layers, setLayers] = useState<LayerState[]>(
    LAYER_CONFIG.map((c) => ({ ...c, data: null, loading: false }))
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<StationProps | null>(null);
  const [selectedArea, setSelectedArea] = useState<AreaProps | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // Métrica de la coropleta de secciones: habitantes o ratio verde/hab.
  const [seccMetric, setSeccMetric] = useState<SeccionMetric>("pop");
  // Estado propio del maestro Zonas verdes (independiente de los subchecks).
  const [verdeOpen, setVerdeOpen] = useState(true);
  // Master Equipamientos: si está cerrado se ocultan los subcontroles y se
  // apagan los POIs visibles (evita dejar puntos colgados al colapsar).
  const [equipOpen, setEquipOpen] = useState(false);
  // Panel lateral de rankings + destino de flyTo cuando se pulsa un ítem.
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  // Panel de capas overlays (FAB top-right): muestra/oculta drawer.
  const [layersOpen, setLayersOpen] = useState(false);
  // Panel de demografía (municipal): piramide + serie 1996-2025. Lazy.
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoData, setDemoData] = useState<DemografiaData | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  // Año del panel de demografía. Independiente del slider del mapa
  // porque la pirámide cubre 2003-2025 y secciones solo 2015-2025.
  const [demoYear, setDemoYear] = useState<number | null>(null);
  // Reproducción temporal automática (recorre los años en bucle).
  const [playing, setPlaying] = useState(false);
  const PLAY_INTERVAL_MS = 800;

  // Mutual exclusion: opening one detail panel closes the other.
  const showStation = (s: StationProps) => {
    setSelectedArea(null);
    setSelectedStation(s);
  };
  const showArea = (s: AreaProps) => {
    setSelectedStation(null);
    setSelectedArea(s);
  };

  // Abre el panel de demografía y dispara fetch lazy la primera vez.
  // Mutuamente excluyente con rankings.
  const toggleDemografia = () => {
    setDemoOpen((open) => {
      const next = !open;
      if (next) {
        setRankingsOpen(false);
        if (!demoData && !demoLoading) {
          setDemoLoading(true);
          fetchDemografia()
            .then((d) => setDemoData(d as DemografiaData))
            .catch((err) => console.warn("demografia load failed:", err))
            .finally(() => setDemoLoading(false));
        }
      }
      return next;
    });
  };

  // Click en un ítem del ranking: centra el mapa en su centroide y abre el
  // panel de detalle de esa sección.
  const onSelectRanking = (item: RankingItem) => {
    const c = (item.feature as any)?.centroide as
      | [number, number]
      | undefined;
    if (c) setFlyTarget((prev) => ({ coords: c, n: (prev?.n ?? 0) + 1 }));
    showArea(item.feature);
  };

  useEffect(() => {
    LAYER_CONFIG.forEach((cfg, i) => {
      setLayers((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], loading: true };
        return next;
      });

      fetchLayer(cfg.name)
        .then((data) => {
          setLayers((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], data, loading: false };
            return next;
          });
        })
        .catch((err) => {
          console.warn(`Layer ${cfg.name} not available:`, err);
          setLayers((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], loading: false };
            return next;
          });
        });
    });
  }, []);

  const toggleLayer = (idx: number) => {
    setLayers((prev) => {
      const next = [...prev];
      const before = next[idx];
      next[idx] = { ...before, visible: !before.visible };
      // Si la capa que se enciende es una capa de área, apaga la otra.
      if (next[idx].visible && isAreaLayer(before.name)) {
        for (let i = 0; i < next.length; i++) {
          if (i !== idx && isAreaLayer(next[i].name) && next[i].visible) {
            next[i] = { ...next[i], visible: false };
          }
        }
      }
      return next;
    });
  };

  // Selector unificado del nivel territorial (radio en la píldora MapMode).
  // null = "Sin coropleta" → apaga todas las capas de área.
  const setAreaLevel = (target: AreaLayerName | null) => {
    setLayers((prev) =>
      prev.map((l) =>
        isAreaLayer(l.name)
          ? { ...l, visible: l.name === target }
          : l
      )
    );
  };

  const loadingCount = layers.filter((l) => l.loading).length;
  const airVisible = layers.some((l) => l.name === "estaciones_aire" && l.visible);

  // Capa de área activa = secciones o barrios, la que esté visible. Las
  // métricas (breaks/colors/anios) provienen de la capa activa, no fijas.
  const activeAreaLayer = layers.find(
    (l) => isAreaLayer(l.name) && l.visible && l.data
  );
  const activeAreaName = activeAreaLayer?.name as AreaLayerName | undefined;
  const areaMeta = activeAreaLayer?.data as AreaMeta | null | undefined;
  const anios = areaMeta?.poblacion_anios;
  const breaks = areaMeta?.poblacion_breaks;
  const colors = areaMeta?.poblacion_colors;
  const vhBreaks = areaMeta?.verde_hab_breaks;
  const vhColors = areaMeta?.verde_hab_colors;
  const no2Breaks = areaMeta?.no2_breaks;
  const no2Colors = areaMeta?.no2_colors;
  // El mapa muestra siempre la mediana por unidad de consumo (métrica robusta).
  // Las otras variantes (hogar/persona) se ven en la ficha de sección y en la
  // gráfica del panel "Ciudad".
  const rentaBreaks = areaMeta?.renta_med_uc_breaks;
  const rentaColors = areaMeta?.renta_med_uc_colors;
  const rentaAnios = areaMeta?.renta_anios;
  const vftBreaks = areaMeta?.vft_breaks;
  const vftColors = areaMeta?.vft_colors;
  const vftFecha = areaMeta?.vft_fecha_descarga;
  const areaActiva = !!(
    activeAreaLayer && anios?.length && breaks?.length && colors?.length
  );
  // Breaks/colors según la métrica seleccionada (cae a pop si la métrica
  // elegida no tiene datos disponibles).
  const hasVerdeHab = !!(vhBreaks?.length && vhColors?.length);
  const hasNo2 = !!(no2Breaks?.length && no2Colors?.length);
  const hasRenta = !!(rentaBreaks?.length && rentaColors?.length);
  const hasVft = !!(vftBreaks?.length && vftColors?.length);
  const activeMetric: SeccionMetric =
    seccMetric === "verde_hab" && hasVerdeHab
      ? "verde_hab"
      : seccMetric === "no2_exposure" && hasNo2
      ? "no2_exposure"
      : seccMetric === "renta" && hasRenta
      ? "renta"
      : seccMetric === "vft_ratio" && hasVft
      ? "vft_ratio"
      : "pop";
  const activeBreaks =
    activeMetric === "verde_hab"
      ? vhBreaks!
      : activeMetric === "no2_exposure"
      ? no2Breaks!
      : activeMetric === "renta"
      ? rentaBreaks!
      : activeMetric === "vft_ratio"
      ? vftBreaks!
      : breaks;
  const activeColors =
    activeMetric === "verde_hab"
      ? vhColors!
      : activeMetric === "no2_exposure"
      ? no2Colors!
      : activeMetric === "renta"
      ? rentaColors!
      : activeMetric === "vft_ratio"
      ? vftColors!
      : colors;
  const fmtBreak = (n: number) => {
    if (activeMetric === "verde_hab") return n.toFixed(1);
    if (activeMetric === "no2_exposure") return String(n);
    if (activeMetric === "renta") return `${Math.round(n / 1000)}k €`;
    if (activeMetric === "vft_ratio") {
      // Cortes enteros (1, 3, 7, 12, 20, 30) — evitar el ".0" redundante.
      return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
    }
    return n.toLocaleString("es-ES");
  };
  const metricLabel =
    activeMetric === "verde_hab"
      ? "Verde por hab. (m²)"
      : activeMetric === "no2_exposure"
      ? "Exposición NO₂ (µg/m³)"
      : activeMetric === "renta"
      ? "Renta mediana (€/UC)"
      : activeMetric === "vft_ratio"
      ? "VFTs por 100 viviendas (%)"
      : "Habitantes por sección";

  // Inicializa al último año disponible cuando llegan los datos.
  useEffect(() => {
    if (selectedYear == null && anios && anios.length > 0) {
      setSelectedYear(anios[anios.length - 1]);
    }
  }, [anios, selectedYear]);

  // Primer año disponible de la pirámide → defaultear demoYear al abrir.
  const demoAnios = demoData?.piramide.anios;
  useEffect(() => {
    if (demoYear == null && demoAnios && demoAnios.length > 0) {
      setDemoYear(demoAnios[0]);
    }
  }, [demoAnios, demoYear]);

  // Reproducción automática: avanza desde el año actual y se detiene
  // al llegar al último (sin bucle). Hay dos timelines independientes
  // (mapa y demografía) que se activan según el modo visible.
  useEffect(() => {
    if (!playing || demoOpen || !anios || anios.length < 2) return;
    const id = setInterval(() => {
      setSelectedYear((prev) => {
        if (prev == null) return anios[0];
        const idx = anios.indexOf(prev);
        if (idx >= 0 && idx < anios.length - 1) return anios[idx + 1];
        setPlaying(false);
        return prev;
      });
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, anios, demoOpen]);

  useEffect(() => {
    if (!playing || !demoOpen || !demoAnios || demoAnios.length < 2) return;
    const id = setInterval(() => {
      setDemoYear((prev) => {
        if (prev == null) return demoAnios[0];
        const idx = demoAnios.indexOf(prev);
        if (idx >= 0 && idx < demoAnios.length - 1) return demoAnios[idx + 1];
        setPlaying(false);
        return prev;
      });
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, demoAnios, demoOpen]);

  // Rankings derivados de la capa de área activa (secciones o barrios) para
  // el año actual. Las funciones valueOf son agnósticas: leen `poblaciones`,
  // `superficie_verde_m2`, etc. (presentes en ambos shapes). El NO₂ usa
  // `no2_serie` directa (barrios) o lookup por `estacion_cercana` (secciones).
  const estacionesNo2 = areaMeta?.estaciones_no2;
  const rankings: RankingsData = useMemo(() => {
    const empty: RankingsData = {
      poblacion: [],
      verde_hab: [],
      no2: [],
      crecimiento: [],
      renta: [],
      vft: [],
    };
    if (selectedYear == null || !activeAreaLayer?.data) return empty;
    const feats = activeAreaLayer.data.features as GeoJSON.Feature[];
    const label = (p: any) =>
      p?.name
        ? String(p.name)
        : `Distrito ${p.CDIS ?? "—"} · sec ${p.CSEC ?? "—"}`;
    const idOf = (p: any) => String(p?.id ?? p?.CUSEC ?? "");

    const popOf = (p: any) =>
      p?.poblaciones?.[String(selectedYear)] as number | undefined;
    const verdeHabOf = (p: any) => {
      const pob = popOf(p);
      const g = p?.superficie_verde_m2 as number | undefined;
      if (g == null || pob == null || pob <= 0) return undefined;
      return g / pob;
    };
    const no2Of = (p: any) => {
      const direct = p?.no2_serie?.[String(selectedYear)];
      if (typeof direct === "number") return direct;
      const name = p?.estacion_cercana?.name as string | undefined;
      if (!name) return undefined;
      return estacionesNo2?.[name]?.[String(selectedYear)];
    };
    const rentaOf = (p: any): number | undefined => {
      const series = p?.renta as Record<string, number> | undefined;
      if (!series) return undefined;
      // Igual que en AreaPanel: usa el año del slider si está; si no, cae
      // al último disponible. Hace que el ranking no se quede vacío cuando
      // el slider está en 2024/2025 (fuera del rango ADRH).
      const direct = series[String(selectedYear)];
      if (typeof direct === "number") return direct;
      const yrs = Object.keys(series).map(Number).sort((a, b) => b - a);
      return yrs.length > 0 ? series[String(yrs[0])] : undefined;
    };
    const crecOf = (p: any) => {
      const pobs = p?.poblaciones as Record<string, number> | undefined;
      if (!pobs) return undefined;
      const ys = Object.keys(pobs).map(Number).sort((a, b) => a - b);
      if (ys.length < 2) return undefined;
      const first = pobs[String(ys[0])];
      let last: number | undefined;
      for (let i = ys.length - 1; i >= 0; i--) {
        if (ys[i] <= selectedYear) {
          last = pobs[String(ys[i])];
          break;
        }
      }
      if (first == null || last == null || first <= 0) return undefined;
      return ((last - first) / first) * 100;
    };

    const build = (
      valueOf: (props: any) => number | undefined,
      fmt: (v: number) => string,
      order: "desc" | "asc" = "desc",
      top = 10
    ): RankingItem[] =>
      feats
        .map((f) => {
          const v = valueOf(f.properties);
          if (v == null || !isFinite(v)) return null;
          return {
            feature: f.properties as AreaProps,
            cusec: idOf(f.properties),
            label: label(f.properties),
            value: v,
            fmtValue: fmt(v),
          } as RankingItem;
        })
        .filter((x): x is RankingItem => x !== null)
        .sort((a, b) => (order === "desc" ? b.value - a.value : a.value - b.value))
        .slice(0, top);

    const vftOf = (p: any): number | undefined => {
      // Si hay serie y el slider apunta a un año con dato, devolvemos
      // el ratio reconstruido para ese año (sesgo superviviente). Si
      // no, cae al snapshot actual.
      const v = p?.vft;
      if (!v) return undefined;
      const viviendas = v.viviendas_total as number | undefined;
      const nAtYear = v.serie?.[String(selectedYear)];
      if (typeof nAtYear === "number" && viviendas && viviendas > 0) {
        return (nAtYear / viviendas) * 100;
      }
      const r = v.ratio_vft_pct;
      return typeof r === "number" ? r : undefined;
    };

    return {
      poblacion: build(popOf, (v) => `${Math.round(v).toLocaleString("es-ES")} hab.`),
      renta: build(rentaOf, (v) => `${Math.round(v).toLocaleString("es-ES")} €/p`),
      verde_hab: build(verdeHabOf, (v) => `${v.toFixed(1)} m²/hab`),
      no2: build(no2Of, (v) => `${v.toFixed(1)} µg/m³`),
      crecimiento: build(
        crecOf,
        (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`
      ),
      vft: build(vftOf, (v) => `${v.toFixed(1)}%`),
    };
  }, [selectedYear, activeAreaLayer?.data, estacionesNo2]);

  // Total municipal del año seleccionado (suma sobre la capa activa).
  let totalPob: number | null = null;
  if (selectedYear != null && activeAreaLayer?.data) {
    let sum = 0;
    let any = false;
    for (const f of activeAreaLayer.data.features) {
      const v = (f.properties as Record<string, any> | null)?.poblaciones?.[
        String(selectedYear)
      ];
      if (typeof v === "number") {
        sum += v;
        any = true;
      }
    }
    totalPob = any ? sum : null;
  }

  // Capas del grupo "Zonas verdes" — el maestro controla el panel y enciende/
  // apaga las tres subcapas; tocar una subcapa no afecta al maestro.
  const verdes = layers
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.group === VERDE_GROUP);
  const toggleVerdeMaster = () => {
    const target = !verdeOpen;
    setVerdeOpen(target);
    verdes.forEach(({ l, i }) => {
      if (l.visible !== target) toggleLayer(i);
    });
  };

  // Capas del grupo "Equipamientos": el master expande/colapsa el panel.
  // Al colapsar también apaga las subcategorías activas (mejor UX).
  // Al expandir no enciende nada — el usuario activa lo que necesite.
  const equips = layers
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.group === EQUIP_GROUP);
  const toggleEquipMaster = () => {
    const next = !equipOpen;
    setEquipOpen(next);
    if (!next) {
      equips.forEach(({ l, i }) => {
        if (l.visible) toggleLayer(i);
      });
    }
  };

  // ── Adaptadores para los nuevos componentes UI ──────────────────────
  const toLayerItem = ({ l, i }: { l: LayerState; i: number }): LayerItem => ({
    index: i,
    name: l.name,
    label: l.label,
    color: l.color,
    visible: l.visible,
    group: l.group,
  });
  const verdesItems: LayerItem[] = verdes.map(toLayerItem);
  const equipsItems: LayerItem[] = equips.map(toLayerItem);
  const estacionesLayer = layers
    .map((l, i) => ({ l, i }))
    .find(({ l }) => l.name === "estaciones_aire");
  const distritosLayer = layers
    .map((l, i) => ({ l, i }))
    .find(({ l }) => l.name === "distritos");
  const estacionesItem = estacionesLayer ? toLayerItem(estacionesLayer) : undefined;
  const distritosItem = distritosLayer ? toLayerItem(distritosLayer) : undefined;

  // Chips de overlays activos bajo la píldora MapMode. Cada chip apaga su
  // grupo entero (master → subs) al pulsarlo.
  const overlayChips: OverlayChip[] = [];
  if (verdeOpen && verdes.some(({ l }) => l.visible)) {
    overlayChips.push({
      key: "verdes",
      icon: "🌳",
      label: "Zonas verdes",
      onRemove: toggleVerdeMaster,
    });
  }
  if (estacionesLayer?.l.visible) {
    overlayChips.push({
      key: "estaciones",
      icon: "📡",
      label: "Aire",
      onRemove: () => toggleLayer(estacionesLayer.i),
    });
  }
  if (equipOpen && equips.some(({ l }) => l.visible)) {
    overlayChips.push({
      key: "equip",
      icon: "🛠️",
      label: "Equipamientos",
      onRemove: toggleEquipMaster,
    });
  }
  if (distritosLayer?.l.visible) {
    overlayChips.push({
      key: "distritos",
      icon: "🏛️",
      label: "Distritos",
      onRemove: () => toggleLayer(distritosLayer.i),
    });
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🏙️ Granada Data Explorer</h1>
        <span>Datos abiertos urbanos</span>
        <div className="header-actions">
          <button
            className="header-btn"
            onClick={toggleDemografia}
            aria-pressed={demoOpen}
          >
            {demoOpen ? "✕ Ciudad" : "📊 Ciudad"}
          </button>
          <button
            className="header-btn"
            onClick={() => {
              setRankingsOpen((v) => {
                const next = !v;
                if (next) setDemoOpen(false);
                return next;
              });
            }}
            aria-pressed={rankingsOpen}
          >
            {rankingsOpen ? "✕ Rankings" : "≡ Rankings"}
          </button>
        </div>
      </header>

      {loadingCount > 0 && (
        <div className="status-bar loading">
          Cargando {loadingCount} capa{loadingCount > 1 ? "s" : ""}…
        </div>
      )}
      {error && <div className="status-bar error">{error}</div>}

      <div className="stage">
        {demoOpen ? (
          <DemografiaPanel
            data={demoData}
            loading={demoLoading}
            year={demoYear}
            onClose={() => setDemoOpen(false)}
            full
            yearControl={
              demoYear != null && demoAnios?.length ? (
                <div className="year-slider year-slider-inline">
                  <button
                    type="button"
                    className="play-btn"
                    onClick={() => setPlaying((p) => !p)}
                    aria-label={playing ? "Pausar" : "Reproducir"}
                    aria-pressed={playing}
                  >
                    {playing ? "⏸" : "▶"}
                  </button>
                  <span>{demoAnios[0]}</span>
                  <input
                    type="range"
                    min={demoAnios[0]}
                    max={demoAnios[demoAnios.length - 1]}
                    step={1}
                    value={demoYear}
                    onChange={(e) => {
                      if (playing) setPlaying(false);
                      setDemoYear(Number(e.target.value));
                    }}
                    aria-label="Año (demografía)"
                  />
                  <span>{demoAnios[demoAnios.length - 1]}</span>
                  <strong>{demoYear}</strong>
                </div>
              ) : null
            }
          />
        ) : (
          <>
            <GranadaMap
              layers={layers}
              onSelectStation={showStation}
              onSelectArea={showArea}
              year={selectedYear}
              metric={activeMetric}
              rentaKey="renta_med_uc"
              flyTarget={flyTarget}
            />

            {/* Píldora top-left: nivel territorial + métrica + mini-leyenda */}
            <div className="stage-top-left">
              <MapMode
                activeLevel={activeAreaName ?? null}
                onChangeLevel={setAreaLevel}
                activeMetric={activeMetric}
                onChangeMetric={setSeccMetric}
                hasBarrios={layers.some(
                  (l) => l.name === "barrios" && !!l.data
                )}
                hasVerdeHab={hasVerdeHab}
                hasNo2={hasNo2}
                hasRenta={hasRenta}
                hasVft={hasVft}
                rentaAnios={rentaAnios}
                vftFecha={vftFecha}
                year={selectedYear}
                breaks={activeBreaks ?? undefined}
                colors={activeColors ?? undefined}
                fmtBreak={fmtBreak}
              />
              <ActiveOverlaysStrip
                chips={overlayChips}
                onOpenLayersPanel={() => setLayersOpen(true)}
              />
            </div>

            {/* FAB top-right + drawer de capas overlay */}
            <LayersPanel
              open={layersOpen}
              onOpenChange={setLayersOpen}
              verdes={verdesItems}
              equips={equipsItems}
              estaciones={estacionesItem}
              distritos={distritosItem}
              verdeMasterOpen={verdeOpen}
              equipMasterOpen={equipOpen}
              onToggleLayer={toggleLayer}
              onToggleVerdeMaster={toggleVerdeMaster}
              onToggleEquipMaster={toggleEquipMaster}
            />
          </>
        )}

        {/* Slider de años flotante en la parte inferior, sobre el contenido
            activo (mapa o demografía). Sustituye al year-slider en flujo. */}
        {!demoOpen &&
          areaActiva &&
          selectedYear != null &&
          anios?.length && (
            <div className="year-slider stage-bottom">
              <button
                type="button"
                className="play-btn"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "Pausar" : "Reproducir"}
                aria-pressed={playing}
              >
                {playing ? "⏸" : "▶"}
              </button>
              <span>{anios[0]}</span>
              <input
                type="range"
                min={anios[0]}
                max={anios[anios.length - 1]}
                step={1}
                value={selectedYear}
                onChange={(e) => {
                  if (playing) setPlaying(false);
                  setSelectedYear(Number(e.target.value));
                }}
                aria-label="Año"
              />
              <span>{anios[anios.length - 1]}</span>
              <strong>{selectedYear}</strong>
              {totalPob != null && (
                <span className="year-total">
                  Pob. total: {totalPob.toLocaleString("es-ES")}
                  {selectedYear < 2021 && (
                    /* ADRH (2015-2020) cuenta solo residentes en hogar
                       identificado; sub-estima el Padrón en ~3-5 %. CAP
                       (2021+) usa la metodología registral oficial y
                       converge con Padrón. */
                    <span
                      className="year-total-note"
                      title="Fuente ADRH (experimental, 2015-2020): cuenta solo residentes en hogar identificado, sub-estima el Padrón en ~3-5 %. Desde 2021 se usa CAP (oficial)."
                      aria-label="Aviso metodológico ADRH"
                    >
                      {" "}*
                    </span>
                  )}
                </span>
              )}
            </div>
          )}

      </div>

      {!demoOpen && rankingsOpen && (
        <RankingsPanel
          rankings={rankings}
          year={selectedYear}
          onSelect={onSelectRanking}
          onClose={() => setRankingsOpen(false)}
        />
      )}

      {!demoOpen && selectedStation && (
        <StationPanel
          key={selectedStation.name}
          station={selectedStation}
          onClose={() => setSelectedStation(null)}
          year={selectedYear}
        />
      )}
      {!demoOpen && selectedArea && breaks && colors && (
        <AreaPanel
          key={areaId(selectedArea)}
          area={selectedArea}
          onClose={() => setSelectedArea(null)}
          year={selectedYear}
          breaks={breaks}
          colors={colors}
        />
      )}
    </div>
  );
}
