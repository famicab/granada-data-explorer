import { useState } from "react";



export interface PuntoSerie {
  anio: number;
  valor: number;
}

export interface Contaminante {
  param: string;
  valor: number;
  unidad: string;
  anio: number;
}

export interface StationProps {
  name: string;
  direccion?: string;
  tipo?: string;
  no2?: number | null;
  no2_anio?: number;
  nivel_no2?: string;
  color?: string;
  contaminantes?: Contaminante[];
  series?: Record<string, PuntoSerie[]>;
}

// Valores anuales de referencia de la UE, en la misma unidad que los datos:
// límites (NO2, PM10, PM2.5, Pb, C6H6), valores objetivo (As, Cd, Ni, B(a)P) y
// niveles críticos (NOx, SO2). NO, O3 y CO no tienen valor anual UE.
const LIMITES: Record<string, number> = {
  NO2: 40, NOx: 30, PM10: 40, "PM2.5": 25, SO2: 20, C6H6: 5,
  Pb: 0.5, As: 6, Cd: 5, Ni: 20, "B(a)P": 1,
};

const VERDE = "#22c55e";
const AMARILLO = "#f59e0b";
const ROJO = "#ef4444";
const NEUTRO = "#6b7280"; // gris para contaminantes sin referencia anual

// Bandas relativas al valor UE: <50% verde, 50–100% amarillo, >100% rojo.
function bandColor(v: number, limite: number): string {
  if (v < limite / 2) return VERDE;
  if (v < limite) return AMARILLO;
  return ROJO;
}

// Etiquetas con subíndice para fórmulas habituales.
const LABELS: Record<string, string> = {
  NO2: "NO₂", NOx: "NOₓ", "PM2.5": "PM₂.₅", SO2: "SO₂", O3: "O₃", CO: "CO",
};
const label = (p: string) => LABELS[p] ?? p;

function axisMax(m: number): number {
  if (m <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  for (const s of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (m <= s * pow) return s * pow;
  return 10 * pow;
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

// Safe SVG id (params like "PM2.5" / "B(a)P" aren't valid in id/url refs).
const cssId = (p: string) => p.replace(/[^a-zA-Z0-9]/g, "");

const clamp01 = (o: number) => Math.max(0, Math.min(1, o));

function PollutantChart({
  serie,
  param,
  year,
  unidad,
}: {
  serie: PuntoSerie[];
  param: string;
  year: number | null;
  unidad: string;
}) {
  const [hover, setHover] = useState<PuntoSerie | null>(null);
  const limite: number | undefined = LIMITES[param];
  const W = 360, H = 190, padL = 36, padR = 12, padT = 16, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const years = serie.map((p) => p.anio);
  const vals = serie.map((p) => p.valor);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const dataMax = Math.max(...vals);
  // Include the EU value in the scale only when the data gets reasonably close
  // (≤3×); otherwise keep the trend readable and leave the limit off-scale.
  const incluirLimite = limite != null && limite <= dataMax * 3;
  const yMax = axisMax(incluirLimite ? Math.max(dataMax, limite) : dataMax);
  const x = (yr: number) => padL + (maxY === minY ? 0 : (yr - minY) / (maxY - minY)) * plotW;
  const y = (v: number) => padT + (1 - v / yMax) * plotH;
  const points = serie.map((p) => `${x(p.anio).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
  const last = serie[serie.length - 1];

  const stroke = limite != null ? `url(#grad-${cssId(param)})` : NEUTRO;
  const dotColor = (v: number) => (limite != null ? bandColor(v, limite) : NEUTRO);
  const mostrarLinea = limite != null && limite <= yMax;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sp-chart" preserveAspectRatio="xMidYMid meet">
      {limite != null && (
        <defs>
          <linearGradient id={`grad-${cssId(param)}`} gradientUnits="userSpaceOnUse"
                          x1={padL} y1={y(yMax)} x2={padL} y2={y(0)}>
            <stop offset="0" stopColor={ROJO} />
            <stop offset={clamp01((yMax - limite) / yMax)} stopColor={ROJO} />
            <stop offset={clamp01((yMax - limite) / yMax)} stopColor={AMARILLO} />
            <stop offset={clamp01((yMax - limite / 2) / yMax)} stopColor={AMARILLO} />
            <stop offset={clamp01((yMax - limite / 2) / yMax)} stopColor={VERDE} />
            <stop offset="1" stopColor={VERDE} />
          </linearGradient>
        </defs>
      )}

      {[0, yMax / 2, yMax].map((v) => (
        <g key={v}>
          <line x1={padL} y1={y(v)} x2={padL + plotW} y2={y(v)} stroke="#eee" />
          <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#888">{fmt(v)}</text>
        </g>
      ))}

      {year != null && year >= minY && year <= maxY && (
        <line
          x1={x(year)}
          y1={padT}
          x2={x(year)}
          y2={padT + plotH}
          stroke="#1e3a5f"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.5"
        />
      )}

      {mostrarLinea && (
        <>
          <line x1={padL} y1={y(limite!)} x2={padL + plotW} y2={y(limite!)}
                stroke="#ef4444" strokeDasharray="5 3" />
          <text x={padL + plotW} y={y(limite!) - 3} textAnchor="end" fontSize="9" fill="#ef4444">
            límite UE {fmt(limite!)}
          </text>
        </>
      )}

      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2.5" />
      {serie.map((p) => (
        <circle key={p.anio} cx={x(p.anio)} cy={y(p.valor)} r="2.5" fill={dotColor(p.valor)} />
      ))}
      <text x={x(last.anio)} y={y(last.valor) - 6} textAnchor="end" fontSize="10"
            fontWeight="600" fill={dotColor(last.valor)}>
        {fmt(last.valor)}
      </text>
      <text x={padL} y={H - 8} textAnchor="start" fontSize="10" fill="#888">{minY}</text>
      <text x={padL + plotW} y={H - 8} textAnchor="end" fontSize="10" fill="#888">{maxY}</text>

      {/* Áreas de hit invisibles para hover cómodo */}
      {serie.map((p) => (
        <circle
          key={`hit-${p.anio}`}
          cx={x(p.anio)}
          cy={y(p.valor)}
          r="10"
          fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseEnter={() => setHover(p)}
          onMouseLeave={() => setHover(null)}
        />
      ))}

      {hover && (() => {
        const hx = x(hover.anio);
        const hy = y(hover.valor);
        const w = 110;
        const h = 16;
        const tx = Math.max(padL + w / 2, Math.min(padL + plotW - w / 2, hx));
        const ty = Math.max(padT + h + 4, hy - 6);
        return (
          <g pointerEvents="none">
            <circle cx={hx} cy={hy} r="4" fill={dotColor(hover.valor)}
                    stroke="#fff" strokeWidth="1.5" />
            <rect x={tx - w / 2} y={ty - h} width={w} height={h} rx="3"
                  fill="#1e3a5f" />
            <text x={tx} y={ty - 4} textAnchor="middle"
                  fontSize="10" fontWeight="600" fill="white">
              {hover.anio}: {fmt(hover.valor)} {unidad}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

export default function StationPanel({
  station,
  onClose,
  year = null,
}: {
  station: StationProps;
  onClose: () => void;
  year?: number | null;
}) {
  const series = station.series ?? {};
  const contaminantes = station.contaminantes ?? [];
  // Selectable pollutants: those with a plottable series, NO2 first (build order).
  const opciones = contaminantes.map((c) => c.param).filter((p) => series[p]?.length);
  const [param, setParam] = useState(
    () => (opciones.includes("NO2") ? "NO2" : opciones[0]) ?? ""
  );

  const serie = series[param] ?? [];
  const unidad = contaminantes.find((c) => c.param === param)?.unidad ?? "";
  const otros = contaminantes.filter((c) => c.param !== "NO2");

  // NO2 del año seleccionado (con bandas/nivel calculados localmente). Cae al
  // valor estático "latest" del backend si el slider aún no está fijado.
  const seriesNO2 = series.NO2 ?? [];
  const yearPoint = year != null ? seriesNO2.find((p) => p.anio === year) : null;
  const headerNO2 = yearPoint?.valor ?? station.no2;
  const headerYear = yearPoint?.anio ?? station.no2_anio;
  const headerLevel =
    headerNO2 == null
      ? "sin datos"
      : headerNO2 < 20
      ? "bueno"
      : headerNO2 < 40
      ? "moderado"
      : "alto (supera límite UE)";
  const headerColor =
    headerNO2 == null
      ? "#9ca3af"
      : headerNO2 < 20
      ? VERDE
      : headerNO2 < 40
      ? AMARILLO
      : ROJO;
  const sinDatoEseAnio =
    year != null && seriesNO2.length > 0 && yearPoint == null;

  return (
    <div className="detail-panel">
      <div className="sp-header">
        <strong>{station.name}</strong>
        <button onClick={onClose} aria-label="Cerrar">×</button>
      </div>
      <div className="sp-body">
      {(station.tipo || station.direccion) && (
        <div className="sp-sub">
          {[station.tipo, station.direccion].filter(Boolean).join(" · ")}
        </div>
      )}
      {sinDatoEseAnio ? (
        <div className="sp-no2" style={{ color: "#6b7280" }}>
          NO₂ {year}: sin datos
        </div>
      ) : headerNO2 != null ? (
        <div className="sp-no2">
          NO₂ {headerNO2} µg/m³{" "}
          <span style={{ color: headerColor }}>({headerLevel})</span>
          {headerYear ? ` · ${headerYear}` : ""}
        </div>
      ) : null}

      <div className="sp-chart-head">
        <span className="sp-chart-title">
          {label(param)} media anual{unidad ? ` (${unidad})` : ""}
        </span>
        {opciones.length > 1 && (
          <select
            className="sp-select"
            value={param}
            onChange={(e) => setParam(e.target.value)}
            aria-label="Contaminante"
          >
            {opciones.map((p) => (
              <option key={p} value={p}>{label(p)}</option>
            ))}
          </select>
        )}
      </div>
      {serie.length >= 2 ? (
        <PollutantChart serie={serie} param={param} year={year} unidad={unidad} />
      ) : (
        <div className="sp-sub">Serie temporal insuficiente.</div>
      )}

      {otros.length > 0 && (
        <details className="sp-otros">
          <summary>Valores recientes ({otros.length})</summary>
          <ul>
            {otros.map((c) => (
              <li key={c.param}>
                {label(c.param)}: {c.valor} {c.unidad} <span className="sp-anio">({c.anio})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      </div>
    </div>
  );
}
