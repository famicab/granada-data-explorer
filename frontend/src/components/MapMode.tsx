import { useEffect, useRef, useState } from "react";
import type { SeccionMetric } from "./GranadaMap.tsx";

// Píldora flotante "Lo que veo": elige el nivel territorial + la métrica
// de la coropleta principal. Sustituye los toggles de Secciones/Barrios y
// el selector de métrica del legend anterior. Cuando está cerrada muestra
// un resumen + tira de colores; al abrirla, dropdown con radios + leyenda
// detallada.

export type AreaLevel = "secciones_censales" | "barrios" | null;

const NIVEL_LABELS: Record<string, string> = {
  secciones_censales: "Por sección",
  barrios: "Por barrio",
};

const METRIC_LABELS: Record<SeccionMetric, string> = {
  pop: "Habitantes",
  renta: "Renta neta media",
  vft_ratio: "VFTs / 100 viviendas",
  verde_hab: "Verde por hab.",
  no2_exposure: "Exposición NO₂",
};

interface NivelOption {
  value: AreaLevel;
  label: string;
  hint?: string;
}

export default function MapMode({
  activeLevel,
  onChangeLevel,
  activeMetric,
  onChangeMetric,
  hasBarrios,
  hasVerdeHab,
  hasNo2,
  hasRenta,
  hasVft,
  rentaAnios,
  vftFecha,
  year,
  breaks,
  colors,
  fmtBreak,
}: {
  activeLevel: AreaLevel;
  onChangeLevel: (l: AreaLevel) => void;
  activeMetric: SeccionMetric;
  onChangeMetric: (m: SeccionMetric) => void;
  hasBarrios: boolean;
  hasVerdeHab: boolean;
  hasNo2: boolean;
  hasRenta: boolean;
  hasVft: boolean;
  rentaAnios?: number[];
  vftFecha?: string;
  year: number | null;
  breaks: number[] | undefined;
  colors: string[] | undefined;
  fmtBreak: (n: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cierre por click fuera y tecla Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const niveles: NivelOption[] = [
    {
      value: "secciones_censales",
      label: "Secciones censales",
      hint: "180 polígonos",
    },
    ...(hasBarrios
      ? [{ value: "barrios" as AreaLevel, label: "Barrios", hint: "29 polígonos" }]
      : []),
    { value: null, label: "Sin coropleta", hint: "ocultar capa de áreas" },
  ];

  // Orden narrativo: personas → economía → vivienda → entorno.
  const metricas: { value: SeccionMetric; label: string; available: boolean; hint?: string }[] = [
    { value: "pop", label: METRIC_LABELS.pop, available: true },
    {
      value: "renta",
      label: METRIC_LABELS.renta,
      available: hasRenta,
      hint:
        hasRenta && rentaAnios && rentaAnios.length > 0
          ? `${rentaAnios[0]}–${rentaAnios[rentaAnios.length - 1]}`
          : undefined,
    },
    {
      value: "vft_ratio",
      label: METRIC_LABELS.vft_ratio,
      available: hasVft,
      hint: hasVft ? "serie hist. desde 2016" : undefined,
    },
    { value: "verde_hab", label: METRIC_LABELS.verde_hab, available: hasVerdeHab },
    { value: "no2_exposure", label: METRIC_LABELS.no2_exposure, available: hasNo2 },
  ];

  const nivelLabel = activeLevel ? NIVEL_LABELS[activeLevel] : "Sin coropleta";
  const metricLabel = METRIC_LABELS[activeMetric];

  const showLegend = activeLevel != null && colors && colors.length > 0;

  return (
    <div className="mapmode" ref={ref}>
      <button
        type="button"
        className="mapmode-pill"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="mapmode-icon" aria-hidden="true">
          📊
        </span>
        <span className="mapmode-text">
          {activeLevel == null ? (
            <span className="mapmode-summary">Sin coropleta</span>
          ) : (
            <>
              <span className="mapmode-summary">{nivelLabel}</span>
              <span className="mapmode-sep">·</span>
              <span className="mapmode-metric">{metricLabel}</span>
            </>
          )}
        </span>
        <span className="mapmode-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {/* Tira compacta de color cuando está cerrada — at-a-glance leyenda */}
      {!open && showLegend && (
        <div className="mapmode-strip" aria-hidden="true">
          {colors!.map((c) => (
            <span
              key={c}
              className="mapmode-strip-cell"
              style={{ background: c }}
            />
          ))}
        </div>
      )}

      {open && (
        <div className="mapmode-panel" role="dialog" aria-label="Configurar coropleta">
          <div className="mapmode-section">
            <div className="mapmode-section-title">Nivel territorial</div>
            <div className="mapmode-options">
              {niveles.map((n) => (
                <label key={n.label} className="mapmode-option">
                  <input
                    type="radio"
                    name="mapmode-nivel"
                    checked={activeLevel === n.value}
                    onChange={() => onChangeLevel(n.value)}
                  />
                  <span className="mapmode-option-text">
                    {n.label}
                    {n.hint && (
                      <span className="mapmode-option-hint"> · {n.hint}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {activeLevel != null && (
            <div className="mapmode-section">
              <div className="mapmode-section-title">Métrica</div>
              <div className="mapmode-options">
                {metricas.map((m) => (
                  <label
                    key={m.value}
                    className={`mapmode-option ${
                      !m.available ? "is-disabled" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="mapmode-metric"
                      checked={activeMetric === m.value}
                      onChange={() => m.available && onChangeMetric(m.value)}
                      disabled={!m.available}
                    />
                    <span className="mapmode-option-text">
                      {m.label}
                      {m.hint && (
                        <span className="mapmode-option-hint"> · {m.hint}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {showLegend && breaks && (
            <div className="mapmode-section">
              <div className="mapmode-section-title">
                Leyenda
                {year != null && (
                  <span className="mapmode-section-year"> · {year}</span>
                )}
              </div>
              <div className="mapmode-legend">
                {colors!.map((c, i) => {
                  const lo = breaks[i - 1];
                  const hi = breaks[i];
                  const txt =
                    lo == null
                      ? `<${fmtBreak(hi!)}`
                      : hi == null
                      ? `>${fmtBreak(lo)}`
                      : `${fmtBreak(lo)}–${fmtBreak(hi)}`;
                  return (
                    <span key={c} className="mapmode-legend-item">
                      <span
                        className="mapmode-legend-box"
                        style={{ background: c }}
                      />
                      {txt}
                    </span>
                  );
                })}
              </div>
              {activeMetric === "vft_ratio" && (
                <div className="mapmode-footnote">
                  Datos OpenRTA · descargados el {vftFecha ?? "—"}. Serie
                  histórica reconstruida desde la fecha de alta de las VFTs
                  activas hoy: el pasado está sub-estimado (las bajas no
                  aparecen) y el registro tampoco incluye VFTs ilegales.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
