import { useState } from "react";

export interface SerieData {
  anios: number[];
  total: (number | null)[];
  hombres: (number | null)[];
  mujeres: (number | null)[];
}

const COL_T = "#1e3a5f";
const COL_H = "#2563eb";
const COL_M = "#db2777";

function fmt(n: number): string {
  return n.toLocaleString("es-ES");
}

interface SeriesDef {
  key: "total" | "hombres" | "mujeres";
  label: string;
  color: string;
  data: (number | null)[];
}

// Genera el `d` de un <path> conectando solo los puntos válidos. Los huecos
// (años sin dato — p.ej. 1997 en Granada) se dejan como discontinuidades.
function pathFor(
  data: (number | null)[],
  anios: number[],
  x: (y: number) => number,
  y: (v: number) => number
): string {
  const parts: string[] = [];
  let pen = false;
  for (let i = 0; i < anios.length; i++) {
    const v = data[i];
    if (v == null) {
      pen = false;
      continue;
    }
    parts.push((pen ? "L" : "M") + x(anios[i]).toFixed(1) + "," + y(v).toFixed(1));
    pen = true;
  }
  return parts.join(" ");
}

export default function SerieHistorica({
  data,
  year,
}: {
  data: SerieData;
  year: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 360;
  const H = 220;
  const padL = 46;
  const padR = 12;
  const padT = 22;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const minY = data.anios[0];
  const maxY = data.anios[data.anios.length - 1];

  const allVals = [...data.total, ...data.hombres, ...data.mujeres].filter(
    (v): v is number => v != null
  );
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  // Banda con un poco de aire arriba y abajo.
  const range = maxVal - minVal;
  const yLo = Math.floor((minVal - range * 0.05) / 1000) * 1000;
  const yHi = Math.ceil((maxVal + range * 0.05) / 1000) * 1000;

  const x = (yr: number) => padL + ((yr - minY) / (maxY - minY)) * plotW;
  const y = (v: number) => padT + (1 - (v - yLo) / (yHi - yLo)) * plotH;

  const series: SeriesDef[] = [
    { key: "total", label: "Total", color: COL_T, data: data.total },
    { key: "hombres", label: "Hombres", color: COL_H, data: data.hombres },
    { key: "mujeres", label: "Mujeres", color: COL_M, data: data.mujeres },
  ];

  // Ticks Y: 3 niveles (lo, mid, hi).
  const yTicks = [yLo, (yLo + yHi) / 2, yHi];
  // Ticks X: ~5 etiquetas equiespaciadas (1996, 2003, 2010, 2017, 2025 aprox).
  const xTickCount = 5;
  const xTicks: number[] = [];
  for (let i = 0; i < xTickCount; i++) {
    xTicks.push(
      Math.round(minY + (i / (xTickCount - 1)) * (maxY - minY))
    );
  }

  const yearInRange = year != null && year >= minY && year <= maxY;
  // Año bajo el cursor: prioridad hover > selectedYear.
  const focusYear = hover ?? (yearInRange ? year! : null);
  const focusIdx =
    focusYear != null ? data.anios.findIndex((a) => a === focusYear) : -1;

  return (
    <div className="serie">
      <div className="serie-leg">
        {series.map((s) => (
          <span key={s.key} className="serie-leg-item">
            <span className="dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="serie-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid Y */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} y1={y(t)} x2={padL + plotW} y2={y(t)} stroke="#eee" />
            <text
              x={padL - 4}
              y={y(t) + 3}
              textAnchor="end"
              fontSize="9"
              fill="#888"
            >
              {fmt(Math.round(t))}
            </text>
          </g>
        ))}

        {/* Cursor vertical en el año focal */}
        {focusYear != null && (
          <line
            x1={x(focusYear)}
            y1={padT}
            x2={x(focusYear)}
            y2={padT + plotH}
            stroke="#1e3a5f"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        )}

        {/* Series */}
        {series.map((s) => (
          <path
            key={s.key}
            d={pathFor(s.data, data.anios, x, y)}
            fill="none"
            stroke={s.color}
            strokeWidth="1.8"
          />
        ))}

        {/* Marcadores del año focal */}
        {focusIdx >= 0 &&
          series.map((s) => {
            const v = s.data[focusIdx];
            if (v == null) return null;
            return (
              <circle
                key={s.key}
                cx={x(data.anios[focusIdx])}
                cy={y(v)}
                r="3"
                fill={s.color}
                stroke="#fff"
                strokeWidth="1.5"
              />
            );
          })}

        {/* Ticks X */}
        {xTicks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - 8}
            textAnchor="middle"
            fontSize="9"
            fill="#888"
          >
            {t}
          </text>
        ))}

        {/* Áreas de hit invisibles, 1 por año, para hover */}
        {data.anios.map((yr, i) => {
          const w =
            i === 0
              ? (x(data.anios[1] ?? yr + 1) - x(yr)) / 2
              : i === data.anios.length - 1
              ? (x(yr) - x(data.anios[i - 1])) / 2
              : (x(data.anios[i + 1]) - x(data.anios[i - 1])) / 2;
          return (
            <rect
              key={yr}
              x={x(yr) - w / 2}
              y={padT}
              width={w}
              height={plotH}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover(yr)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      {focusIdx >= 0 && (
        <div className="serie-hover">
          <strong>{data.anios[focusIdx]}</strong>
          {series.map((s) => {
            const v = s.data[focusIdx];
            if (v == null) return null;
            return (
              <span key={s.key} className="serie-hover-item">
                <span className="dot" style={{ background: s.color }} /> {fmt(v)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
