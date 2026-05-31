import { useState } from "react";

// Renta ADRH a nivel ciudad (Granada), 3 variantes 2015-2023. Misma operación
// que la coropleta del mapa, pero agregada al municipio. Distinta de la gráfica
// AEAT (que es renta por declarante). Tres líneas para comparar cómo cambia la
// cifra según la unidad: mediana por unidad de consumo / media por hogar /
// media por persona.

export interface RentaAdrhData {
  anios: number[];
  med_uc: (number | null)[];
  hogar: (number | null)[];
  persona: (number | null)[];
  fuente: string;
}

const SERIES = [
  {
    key: "med_uc",
    label: "Mediana (UC)",
    color: "#b30000",
    width: 2.6,
    tip: "Renta del hogar «del medio», ajustada por su tamaño y composición (unidad de consumo). Es la más representativa: no la distorsionan las rentas altas.",
  },
  {
    key: "hogar",
    label: "Media/hogar",
    color: "#e8810c",
    width: 1.8,
    tip: "Ingresos netos medios por hogar (lo que entra en cada vivienda).",
  },
  {
    key: "persona",
    label: "Media/persona",
    color: "#4c78a8",
    width: 1.8,
    tip: "Renta per cápita: reparte la del hogar entre todos sus miembros, incluidos los que no ingresan (menores, etc.). Por eso es la más baja.",
  },
] as const;

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

export default function RentaAdrhChart({
  data,
  year,
}: {
  data: RentaAdrhData;
  year: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);

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

  const allVals = [...data.med_uc, ...data.hogar, ...data.persona].filter(
    (v): v is number => v != null
  );
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;
  const yLo = Math.floor((minVal - range * 0.12) / 1000) * 1000;
  const yHi = Math.ceil((maxVal + range * 0.1) / 1000) * 1000;

  const x = (yr: number) =>
    padL + ((yr - minY) / Math.max(1, maxY - minY)) * plotW;
  const y = (v: number) => padT + (1 - (v - yLo) / (yHi - yLo)) * plotH;

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

  // Big-number: mediana del último año disponible.
  const lastIdx = (() => {
    for (let i = data.med_uc.length - 1; i >= 0; i--) {
      if (data.med_uc[i] != null) return i;
    }
    return -1;
  })();
  const lastMed = lastIdx >= 0 ? data.med_uc[lastIdx]! : null;
  const lastYear = lastIdx >= 0 ? data.anios[lastIdx] : maxY;

  return (
    <div className="serie">
      <div
        className="muni-stats"
        style={
          {
            "--muni-accent": "#b30000",
            "--muni-accent-soft": "#9a3412",
          } as React.CSSProperties
        }
      >
        <div>
          <div className="muni-bignum">
            {lastMed != null ? `${fmt(lastMed)} €` : "—"}
          </div>
          <div className="muni-label">
            Renta mediana (unidad de consumo) · {lastYear}
          </div>
        </div>
        <div className="muni-side">
          {SERIES.map((s) => (
            <div key={s.key} className="serie-hover-item" title={s.tip}>
              <span className="dot" style={{ background: s.color }} /> {s.label}
            </div>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="serie-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} y1={y(t)} x2={padL + plotW} y2={y(t)} stroke="#eee" />
            <text x={padL - 4} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#888">
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

        {SERIES.map((s) => (
          <path
            key={s.key}
            d={pathFor(data[s.key], data.anios, x, y)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
          />
        ))}

        {focusIdx >= 0 &&
          SERIES.map((s) => {
            const v = data[s.key][focusIdx];
            if (v == null) return null;
            return (
              <circle
                key={s.key}
                cx={x(data.anios[focusIdx])}
                cy={y(v)}
                r="3.5"
                fill={s.color}
                stroke="#fff"
                strokeWidth="1.5"
              />
            );
          })}

        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 10} textAnchor="middle" fontSize="9" fill="#888">
            {t}
          </text>
        ))}

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
          {SERIES.map((s) => {
            const v = data[s.key][focusIdx];
            if (v == null) return null;
            return (
              <span key={s.key} className="serie-hover-item">
                <span className="dot" style={{ background: s.color }} /> {fmt(v)} €
              </span>
            );
          })}
        </div>
      ) : (
        <div className="serie-hover">
          <span className="piramide-hint">Pasa el cursor sobre el gráfico</span>
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
        <strong>Mediana (UC):</strong> hogar «del medio», ajustada por su tamaño
        (la más fiable). · <strong>Media/hogar:</strong> ingresos por vivienda.{" "}
        · <strong>Media/persona:</strong> per cápita, incluye a quien no ingresa.
      </div>
      <div className="renta-fuente">Fuente: {data.fuente}</div>
    </div>
  );
}
