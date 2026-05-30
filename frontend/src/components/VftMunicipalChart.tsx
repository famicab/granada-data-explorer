import { useState } from "react";

// Datos municipales agregados de VFT (panel "Ciudad" > tab Turismo).
// El shape proviene de demografia.json.vft_municipal — escrito por
// scripts/build_vft.py al final del pipeline (suma sobre todas las
// secciones, denominador = parque residencial municipal estimado).

export interface VftMunicipalData {
  anios: number[];
  vfts: number[];
  plazas: number[];
  ratio_vft_pct: (number | null)[];
  viviendas_total: number;
  fecha_descarga: string;
  hogar_year: number;
}

// PuRd 7-class — misma rampa que en la coropleta y el gráfico de
// evolución del AreaPanel. La coherencia visual entre el mapa y los
// charts ayuda a que el usuario una mentalmente las dos vistas.
const VFT_RAMP = [
  "#f1eef6", "#d4b9da", "#c994c7", "#df65b0",
  "#e7298a", "#ce1256", "#91003f",
];
const VFT_BREAKS = [1, 3, 7, 12, 20, 30];

function classIndex(v: number, breaks: number[]): number {
  for (let i = 0; i < breaks.length; i++) if (v <= breaks[i]) return i;
  return breaks.length;
}

const fmt = (n: number) => n.toLocaleString("es-ES");
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function axisMax(m: number): number {
  if (m <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  for (const s of [1, 1.5, 2, 3, 4, 5, 6, 8, 10])
    if (m <= s * pow) return s * pow;
  return 10 * pow;
}

// Hitos narrativos para anotar el gráfico. Se eligieron de la propia
// serie: 2020 = freno COVID (slowdown visible), 2024 = año récord (de
// 2 447 → 3 521 VFTs, casi +44 % en un año).
interface Annotation {
  year: number;
  label: string;
  icon: string;
  /** Posición vertical relativa: "top" o "bottom". */
  side: "top" | "bottom";
}

export default function VftMunicipalChart({
  data,
  year,
}: {
  data: VftMunicipalData;
  year: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);

  // Mismas dimensiones que RentaMunicipalChart para que las dos cards
  // (Renta IRPF y Turismo) tengan el mismo "peso visual" cuando estén
  // ambas en el grid en modo full.
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
  const yMax = axisMax(Math.max(...data.vfts) * 1.05);
  const x = (yr: number) =>
    padL + ((yr - minY) / Math.max(1, maxY - minY)) * plotW;
  const y = (v: number) => padT + (1 - v / yMax) * plotH;

  // Path con relleno bajo la curva (area chart) — la masa visual debajo
  // refuerza la sensación de "stock acumulado" frente a una simple línea.
  const linePoints = data.anios
    .map((yr, i) => `${x(yr).toFixed(1)},${y(data.vfts[i]).toFixed(1)}`)
    .join(" ");
  const areaPath =
    `M ${x(data.anios[0]).toFixed(1)},${y(0).toFixed(1)} ` +
    `L ${linePoints.split(" ").join(" L ")} ` +
    `L ${x(data.anios[data.anios.length - 1]).toFixed(1)},${y(0).toFixed(1)} Z`;

  // Color del punto en cada año según el ratio (banda PuRd). Así un punto
  // bajo es lila pálido (presión baja) y un punto alto es magenta fuerte.
  const dotColor = (i: number): string => {
    const r = data.ratio_vft_pct[i];
    if (r == null) return VFT_RAMP[0];
    return VFT_RAMP[classIndex(r, VFT_BREAKS)];
  };

  // Ticks Y: 0, mitad, máximo (suficiente con tres referencias).
  const yTicks = [0, yMax / 2, yMax];
  const xTickCount = Math.min(6, data.anios.length);
  const xTicks: number[] = [];
  for (let i = 0; i < xTickCount; i++) {
    xTicks.push(
      Math.round(minY + (i / Math.max(1, xTickCount - 1)) * (maxY - minY))
    );
  }

  const yearInRange = year != null && year >= minY && year <= maxY;
  const focusYear = hover ?? (yearInRange ? year! : null);
  const focusIdx =
    focusYear != null ? data.anios.findIndex((a) => a === focusYear) : -1;

  // Delta global desde el primer año con VFTs (2016 normalmente).
  const firstNonZero = data.vfts.findIndex((v) => v > 0);
  const baseIdx = firstNonZero >= 0 ? firstNonZero : 0;
  const baseVal = data.vfts[baseIdx];
  const lastVal = data.vfts[data.vfts.length - 1];
  const deltaPct = baseVal > 0 ? ((lastVal - baseVal) / baseVal) * 100 : null;

  const annotations: Annotation[] = (
    [
      { year: 2020, label: "freno COVID", icon: "▼", side: "top" },
      { year: 2024, label: "récord +44 %/año", icon: "★", side: "top" },
    ] as Annotation[]
  ).filter((a) => a.year >= minY && a.year <= maxY);

  return (
    <div className="serie">
      {/* Big-number header: la cifra que cuenta la historia.
          --muni-accent fija el color para bignum y delta (PuRd dark). */}
      <div
        className="muni-stats"
        style={
          {
            "--muni-accent": "#91003f",
            "--muni-accent-soft": "#6b21a8",
          } as React.CSSProperties
        }
      >
        <div>
          <div className="muni-bignum">{fmt(lastVal)}</div>
          <div className="muni-label">
            VFTs registradas en Granada · {maxY}
          </div>
        </div>
        <div className="muni-side">
          <div>
            <strong>{fmt(data.plazas[data.plazas.length - 1])}</strong> plazas
          </div>
          <div>
            <strong>
              {data.ratio_vft_pct[data.ratio_vft_pct.length - 1]?.toFixed(1) ??
                "—"}
              %
            </strong>{" "}
            sobre el parque residencial
          </div>
          {deltaPct != null && deltaPct > 0 && (
            <div className="muni-delta">
              ↑ +{Math.round(deltaPct).toLocaleString("es-ES")}% desde {data.anios[baseIdx]}
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
          <linearGradient id="vftgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#91003f" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f1eef6" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              y1={y(t)}
              x2={padL + plotW}
              y2={y(t)}
              stroke="#eee"
            />
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

        {/* Annotations: linea fina vertical + etiqueta arriba. */}
        {annotations.map((a) => (
          <g key={a.year} opacity="0.85">
            <line
              x1={x(a.year)}
              y1={padT}
              x2={x(a.year)}
              y2={padT + plotH}
              stroke="#9ca3af"
              strokeDasharray="2 3"
              strokeWidth="1"
            />
            <text
              x={x(a.year)}
              y={padT - 10}
              textAnchor="middle"
              fontSize="9"
              fill="#6b21a8"
              fontWeight="600"
            >
              {a.icon} {a.label}
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

        <path d={areaPath} fill="url(#vftgrad)" />
        <polyline
          points={linePoints}
          fill="none"
          stroke="#ce1256"
          strokeWidth="2.2"
        />

        {data.anios.map((yr, i) => (
          <circle
            key={yr}
            cx={x(yr)}
            cy={y(data.vfts[i])}
            r={focusIdx === i ? 4 : 2.4}
            fill={dotColor(i)}
            stroke="#fff"
            strokeWidth={focusIdx === i ? 1.5 : 0}
          />
        ))}

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

        {/* Hit-targets invisibles para que pasar el ratón sobre cualquier
            zona del año active el tooltip — usabilidad táctil/desktop. */}
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
          <span className="serie-hover-item">
            <span className="dot" style={{ background: dotColor(focusIdx) }} />{" "}
            <strong>{fmt(data.vfts[focusIdx])}</strong> VFTs
          </span>
          <span className="serie-hover-item">
            {fmt(data.plazas[focusIdx])} plazas
          </span>
          {data.ratio_vft_pct[focusIdx] != null && (
            <span className="serie-hover-item">
              {fmtPct(data.ratio_vft_pct[focusIdx]!)} residencial
            </span>
          )}
        </div>
      ) : (
        <div className="serie-hover">
          <span className="piramide-hint">
            Pasa el cursor sobre el gráfico
          </span>
        </div>
      )}

      <div className="renta-fuente">
        Fuente: OpenRTA · descargado {data.fecha_descarga}. Solo se cuentan
        VFTs cuyo geocoding cae dentro del término municipal (excluye ~18
        registros con coords erróneas en origen). Serie reconstruida desde
        la fecha de alta de las VFTs activas hoy: los años pasados están
        sub-estimados (las bajas anteriores no aparecen).
      </div>
    </div>
  );
}
