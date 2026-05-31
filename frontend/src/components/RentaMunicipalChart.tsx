import { useState } from "react";

export interface RentaMunicipalData {
  anios: number[];
  renta_bruta_media: (number | null)[];
  renta_disponible_media: (number | null)[];
  n_declaraciones: (number | null)[];
  habitantes: (number | null)[];
  fuente: string;
}

// Acentos OrRd — alinean con la coropleta de renta del mapa. Bruta es
// la serie protagonista (más oscura, con relleno); disponible queda en
// secundario (línea más fina, color medio).
const COL_BRUTA = "#b30000";
const COL_DISP = "#fc8d59";
const COL_ACCENT_SOFT = "#9a3412";

const fmt = (n: number) => n.toLocaleString("es-ES");

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

// Genera el path del área para la serie "bruta": baja al eje en los
// extremos para que el relleno cierre limpio.
function areaPathFor(
  data: (number | null)[],
  anios: number[],
  x: (y: number) => number,
  y: (v: number) => number,
  yBase: number
): string {
  const valids: { yr: number; v: number }[] = [];
  for (let i = 0; i < anios.length; i++) {
    const v = data[i];
    if (v != null) valids.push({ yr: anios[i], v });
  }
  if (valids.length < 2) return "";
  const top = valids
    .map((p) => `${x(p.yr).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(" L ");
  return (
    `M ${x(valids[0].yr).toFixed(1)},${y(yBase).toFixed(1)} ` +
    `L ${top} ` +
    `L ${x(valids[valids.length - 1].yr).toFixed(1)},${y(yBase).toFixed(1)} Z`
  );
}

interface SeriesDef {
  key: "bruta" | "disponible";
  label: string;
  color: string;
  strokeWidth: number;
  data: (number | null)[];
}

export default function RentaMunicipalChart({
  data,
  year,
}: {
  data: RentaMunicipalData;
  year: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);

  // Mismas dimensiones que VftMunicipalChart para que las cards Renta y
  // Turismo "pesen igual" cuando estén ambas en el grid en modo full.
  const W = 480;
  const H = 220;
  const padL = 50;
  const padR = 14;
  const padT = 26;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const minY = data.anios[0];
  const maxY = data.anios[data.anios.length - 1];

  const allVals = [
    ...data.renta_bruta_media,
    ...data.renta_disponible_media,
  ].filter((v): v is number => v != null);
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal;
  // Banda con aire arriba y abajo, redondeada a millares.
  const yLo = Math.floor((minVal - range * 0.15) / 1000) * 1000;
  const yHi = Math.ceil((maxVal + range * 0.1) / 1000) * 1000;

  const x = (yr: number) =>
    padL + ((yr - minY) / Math.max(1, maxY - minY)) * plotW;
  const y = (v: number) => padT + (1 - (v - yLo) / (yHi - yLo)) * plotH;

  const series: SeriesDef[] = [
    {
      key: "bruta",
      label: "Renta bruta media",
      color: COL_BRUTA,
      strokeWidth: 2.4,
      data: data.renta_bruta_media,
    },
    {
      key: "disponible",
      label: "Renta disponible media",
      color: COL_DISP,
      strokeWidth: 1.6,
      data: data.renta_disponible_media,
    },
  ];

  const yTicks = [yLo, (yLo + yHi) / 2, yHi];
  const xTicks: number[] = [];
  const xTickCount = Math.min(6, data.anios.length);
  for (let i = 0; i < xTickCount; i++) {
    xTicks.push(
      Math.round(minY + (i / Math.max(1, xTickCount - 1)) * (maxY - minY))
    );
  }

  const yearInRange = year != null && year >= minY && year <= maxY;
  const focusYear = hover ?? (yearInRange ? year! : null);
  const focusIdx =
    focusYear != null ? data.anios.findIndex((a) => a === focusYear) : -1;

  // Cifras del big-number: último valor disponible de bruta y disponible
  // + delta porcentual contra el primer valor con dato.
  const lastBrutaIdx = (() => {
    for (let i = data.renta_bruta_media.length - 1; i >= 0; i--) {
      if (data.renta_bruta_media[i] != null) return i;
    }
    return -1;
  })();
  const firstBrutaIdx = data.renta_bruta_media.findIndex((v) => v != null);
  const lastBruta =
    lastBrutaIdx >= 0 ? data.renta_bruta_media[lastBrutaIdx]! : null;
  const lastDisp =
    lastBrutaIdx >= 0 && data.renta_disponible_media[lastBrutaIdx] != null
      ? data.renta_disponible_media[lastBrutaIdx]!
      : null;
  const baseBruta =
    firstBrutaIdx >= 0 ? data.renta_bruta_media[firstBrutaIdx]! : null;
  const deltaPct =
    lastBruta != null && baseBruta != null && baseBruta > 0
      ? ((lastBruta - baseBruta) / baseBruta) * 100
      : null;
  const lastYear = lastBrutaIdx >= 0 ? data.anios[lastBrutaIdx] : maxY;
  const baseYear = firstBrutaIdx >= 0 ? data.anios[firstBrutaIdx] : minY;

  return (
    <div className="serie">
      {/* Big-number header — misma estructura que el chart de turismo
          para mantener coherencia visual entre las cards municipales. */}
      <div
        className="muni-stats"
        style={
          {
            "--muni-accent": COL_BRUTA,
            "--muni-accent-soft": COL_ACCENT_SOFT,
          } as React.CSSProperties
        }
      >
        <div>
          <div className="muni-bignum">
            {lastBruta != null ? `${fmt(lastBruta)} €` : "—"}
          </div>
          <div className="muni-label">
            Renta bruta media por declarante · {lastYear}
          </div>
        </div>
        <div className="muni-side">
          <div
            className="serie-hover-item"
            title="Ingresos totales declarados, antes del IRPF."
          >
            <span className="dot" style={{ background: COL_BRUTA }} /> Renta bruta
          </div>
          <div
            className="serie-hover-item"
            title="Renta bruta menos la cuota del IRPF: lo que queda disponible."
          >
            <span className="dot" style={{ background: COL_DISP }} /> Renta
            disponible
            {lastDisp != null && (
              <>
                {" "}
                · <strong>{fmt(lastDisp)} €</strong>
              </>
            )}
          </div>
          {deltaPct != null && (
            <div className="muni-delta">
              {deltaPct >= 0 ? "↑" : "↓"} {deltaPct >= 0 ? "+" : ""}
              {deltaPct.toFixed(1)}% desde {baseYear}
            </div>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="serie-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="rentagrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COL_BRUTA} stopOpacity="0.32" />
            <stop offset="100%" stopColor={COL_BRUTA} stopOpacity="0.02" />
          </linearGradient>
        </defs>

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
              {`${Math.round(t / 1000)}k €`}
            </text>
          </g>
        ))}

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

        {/* Área rellena bajo la línea bruta → da masa visual. La línea
            disponible queda como secundaria (más fina, sin relleno). */}
        <path
          d={areaPathFor(data.renta_bruta_media, data.anios, x, y, yLo)}
          fill="url(#rentagrad)"
        />
        {series.map((s) => (
          <path
            key={s.key}
            d={pathFor(s.data, data.anios, x, y)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.strokeWidth}
            strokeDasharray={s.key === "disponible" ? "4 3" : undefined}
          />
        ))}

        {/* Dots permanentes en la bruta para señalar puntos exactos.
            En disponible los dots solo aparecen al hover (más calma visual). */}
        {data.anios.map((yr, i) => {
          const v = data.renta_bruta_media[i];
          if (v == null) return null;
          return (
            <circle
              key={`b-${yr}`}
              cx={x(yr)}
              cy={y(v)}
              r={focusIdx === i ? 4 : 2.4}
              fill={COL_BRUTA}
              stroke="#fff"
              strokeWidth={focusIdx === i ? 1.5 : 0}
            />
          );
        })}
        {focusIdx >= 0 && (() => {
          const v = data.renta_disponible_media[focusIdx];
          if (v == null) return null;
          return (
            <circle
              cx={x(data.anios[focusIdx])}
              cy={y(v)}
              r="3.5"
              fill={COL_DISP}
              stroke="#fff"
              strokeWidth="1.5"
            />
          );
        })()}

        {xTicks.map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - 10}
            textAnchor="middle"
            fontSize="9"
            fill="#888"
          >
            {t}
          </text>
        ))}

        {/* Hit-targets verticales: capturar el año al pasar el ratón por
            cualquier punto vertical, no solo sobre el dot. */}
        {data.anios.map((yr, i) => {
          const w =
            i === 0
              ? (x(data.anios[1] ?? yr + 1) - x(yr)) / 2 + 4
              : i === data.anios.length - 1
              ? (x(yr) - x(data.anios[i - 1])) / 2 + 4
              : (x(data.anios[i + 1]) - x(data.anios[i - 1])) / 2;
          return (
            <rect
              key={`hit-${yr}`}
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

      {focusIdx >= 0 ? (
        <div className="serie-hover">
          <strong>{data.anios[focusIdx]}</strong>
          {series.map((s) => {
            const v = s.data[focusIdx];
            if (v == null) return null;
            return (
              <span key={s.key} className="serie-hover-item">
                <span className="dot" style={{ background: s.color }} />{" "}
                {fmt(v)} €
              </span>
            );
          })}
        </div>
      ) : (
        <div className="serie-hover">
          <span className="piramide-hint">
            Pasa el cursor sobre el gráfico
          </span>
        </div>
      )}
      <div
        style={{
          marginTop: 6,
          fontSize: "0.7rem",
          lineHeight: 1.4,
          color: "#6b7280",
        }}
      >
        <strong>Bruta:</strong> ingresos declarados antes de impuestos. ·{" "}
        <strong>Disponible:</strong> lo que queda tras pagar el IRPF. Ambas por
        declarante.
      </div>
      <div className="renta-fuente">Fuente: {data.fuente}</div>
    </div>
  );
}
