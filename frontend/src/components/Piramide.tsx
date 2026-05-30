import { useState } from "react";

export interface PiramideData {
  anios: number[];
  grupos: string[];
  hombres: Record<string, number[]>;
  mujeres: Record<string, number[]>;
}

const COL_H = "#2563eb"; // azul para hombres
const COL_M = "#db2777"; // magenta para mujeres
const COL_GHOST = "#94a3b8"; // gris para el contorno del año base

function fmt(n: number): string {
  return n.toLocaleString("es-ES");
}

function fmtDelta(d: number): string {
  if (d > 0) return `+${fmt(d)}`;
  if (d < 0) return `−${fmt(-d)}`;
  return "0";
}

function shortenGrupo(g: string): string {
  // "De 0 a 4 años" → "0-4" · "100 y más años" → "100+"
  const m = g.match(/De (\d+) a (\d+)/);
  if (m) return `${m[1]}–${m[2]}`;
  if (g.startsWith("100")) return "100+";
  return g;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (v <= s * pow) return s * pow;
  return 10 * pow;
}

type CompareYear = number | "none";

export default function Piramide({
  data,
  year,
}: {
  data: PiramideData;
  year: number;
}) {
  const [hover, setHover] = useState<
    { sexo: "H" | "M"; grupo: string; valor: number; idx: number } | null
  >(null);
  // Año base por defecto = primero disponible. El selector permite cambiarlo
  // o desactivar la comparación.
  const [compareYear, setCompareYear] = useState<CompareYear>(data.anios[0]);

  // El slider de la app cubre 2015-2025, la pirámide solo 2021-2025.
  // Si el año está fuera, clamp al más cercano disponible.
  const minA = data.anios[0];
  const maxA = data.anios[data.anios.length - 1];
  const yearShown = Math.max(minA, Math.min(maxA, year));
  const fueraDeRango = year !== yearShown;

  const hombres = data.hombres[String(yearShown)] ?? [];
  const mujeres = data.mujeres[String(yearShown)] ?? [];
  const totalH = hombres.reduce((a, b) => a + b, 0);
  const totalM = mujeres.reduce((a, b) => a + b, 0);

  // Fantasma del año base. Se oculta si está desactivado o coincide con el
  // año actual (sería un contorno superpuesto invisible/confuso).
  const showCompare =
    compareYear !== "none" && compareYear !== yearShown;
  const baseH = showCompare
    ? data.hombres[String(compareYear)] ?? []
    : [];
  const baseM = showCompare
    ? data.mujeres[String(compareYear)] ?? []
    : [];

  // La escala debe abarcar las barras de ambos años para que ninguno se salga
  // del lienzo.
  const maxVal = Math.max(
    0,
    ...hombres,
    ...mujeres,
    ...(showCompare ? baseH : []),
    ...(showCompare ? baseM : [])
  );
  const scaleMax = niceMax(maxVal);

  // Mostramos los grupos de viejo arriba a joven abajo (estándar demográfico).
  const ordered = data.grupos.map((g, i) => ({ g, i })).reverse();

  const W = 360;
  const H = 280;
  const padT = 18;
  const padB = 28;
  const centerW = 56; // canal central con etiquetas
  const sideW = (W - centerW) / 2;
  const rowH = (H - padT - padB) / data.grupos.length;
  const barH = Math.max(2, rowH - 2);

  const xH = (v: number) => sideW - (v / scaleMax) * (sideW - 4); // crece a la izquierda
  const xM = (v: number) => sideW + centerW + (v / scaleMax) * (sideW - 4);
  const yRow = (rank: number) => padT + rank * rowH;

  // Ticks del eje X (0, ½, max) — espejados a ambos lados.
  const ticks = [0, scaleMax / 2, scaleMax];

  // Delta del grupo bajo el cursor vs el año base (solo si compara).
  let hoverDelta: number | null = null;
  if (hover && showCompare) {
    const base = (hover.sexo === "H" ? baseH : baseM)[hover.idx] ?? 0;
    hoverDelta = hover.valor - base;
  }

  return (
    <div className="piramide">
      <div className="piramide-head">
        <div>
          <strong>{yearShown}</strong>
          <span className="piramide-total">
            {" "}· {fmt(totalH + totalM)} hab.
          </span>
        </div>
        <div className="piramide-leg">
          <span className="piramide-leg-item">
            <span className="dot" style={{ background: COL_H }} /> H {fmt(totalH)}
          </span>
          <span className="piramide-leg-item">
            <span className="dot" style={{ background: COL_M }} /> M {fmt(totalM)}
          </span>
        </div>
      </div>
      <div className="piramide-compare">
        <label>
          Comparar con:{" "}
          <select
            className="sp-select"
            value={String(compareYear)}
            onChange={(e) => {
              const v = e.target.value;
              setCompareYear(v === "none" ? "none" : Number(v));
            }}
          >
            <option value="none">— sin comparar —</option>
            {data.anios.map((a) => (
              <option key={a} value={a} disabled={a === yearShown}>
                {a}
              </option>
            ))}
          </select>
        </label>
        {showCompare && (
          <span className="piramide-ghost-leg">
            <svg width="22" height="10" aria-hidden="true">
              <rect
                x="1"
                y="2"
                width="20"
                height="6"
                fill="none"
                stroke={COL_GHOST}
                strokeWidth="1"
                strokeDasharray="3 2"
              />
            </svg>{" "}
            contorno = {compareYear}
          </span>
        )}
      </div>
      {fueraDeRango && (
        <div className="piramide-warn">
          Datos solo {minA}–{maxA}. Mostrando {yearShown}.
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="piramide-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Ejes y ticks */}
        {ticks.map((t) => {
          const xL = xH(t);
          const xR = xM(t);
          return (
            <g key={t}>
              <line
                x1={xL}
                y1={padT}
                x2={xL}
                y2={H - padB}
                stroke="#f0f0f0"
              />
              <line
                x1={xR}
                y1={padT}
                x2={xR}
                y2={H - padB}
                stroke="#f0f0f0"
              />
              <text
                x={xL}
                y={H - padB + 12}
                textAnchor="middle"
                fontSize="9"
                fill="#888"
              >
                {fmt(Math.round(t))}
              </text>
              <text
                x={xR}
                y={H - padB + 12}
                textAnchor="middle"
                fontSize="9"
                fill="#888"
              >
                {fmt(Math.round(t))}
              </text>
            </g>
          );
        })}

        {/* Barras: primero el fantasma del año base (contorno), después
            las del año actual (sólidas) por encima. */}
        {ordered.map(({ g, i }, rank) => {
          const vh = hombres[i] ?? 0;
          const vm = mujeres[i] ?? 0;
          const yT = yRow(rank) + (rowH - barH) / 2;
          const wH = sideW - xH(vh);
          const wM = xM(vm) - (sideW + centerW);

          const vhB = showCompare ? baseH[i] ?? 0 : 0;
          const vmB = showCompare ? baseM[i] ?? 0 : 0;
          const wHB = sideW - xH(vhB);
          const wMB = xM(vmB) - (sideW + centerW);

          return (
            <g key={g}>
              {/* Fantasma (contorno punteado del año base) */}
              {showCompare && wHB > 0 && (
                <rect
                  x={xH(vhB)}
                  y={yT}
                  width={wHB}
                  height={barH}
                  fill="none"
                  stroke={COL_GHOST}
                  strokeWidth="1"
                  strokeDasharray="3 2"
                  pointerEvents="none"
                />
              )}
              {showCompare && wMB > 0 && (
                <rect
                  x={sideW + centerW}
                  y={yT}
                  width={wMB}
                  height={barH}
                  fill="none"
                  stroke={COL_GHOST}
                  strokeWidth="1"
                  strokeDasharray="3 2"
                  pointerEvents="none"
                />
              )}
              {/* Año actual (sólido) */}
              {wH > 0 && (
                <rect
                  x={xH(vh)}
                  y={yT}
                  width={wH}
                  height={barH}
                  fill={COL_H}
                  opacity={hover && hover.grupo === g && hover.sexo === "H" ? 1 : 0.85}
                  onMouseEnter={() =>
                    setHover({ sexo: "H", grupo: g, valor: vh, idx: i })
                  }
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                />
              )}
              {wM > 0 && (
                <rect
                  x={sideW + centerW}
                  y={yT}
                  width={wM}
                  height={barH}
                  fill={COL_M}
                  opacity={hover && hover.grupo === g && hover.sexo === "M" ? 1 : 0.85}
                  onMouseEnter={() =>
                    setHover({ sexo: "M", grupo: g, valor: vm, idx: i })
                  }
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                />
              )}
              <text
                x={W / 2}
                y={yRow(rank) + rowH / 2 + 3}
                textAnchor="middle"
                fontSize="9.5"
                fill="#444"
                fontWeight={hover?.grupo === g ? 600 : 400}
              >
                {shortenGrupo(g)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="piramide-hover">
        {hover ? (
          <>
            <strong style={{ color: hover.sexo === "H" ? COL_H : COL_M }}>
              {hover.sexo === "H" ? "Hombres" : "Mujeres"}
            </strong>{" "}
            {hover.grupo}: <strong>{fmt(hover.valor)}</strong>
            {hoverDelta != null && (
              <span
                className="piramide-delta"
                style={{
                  color:
                    hoverDelta > 0
                      ? "#16a34a"
                      : hoverDelta < 0
                      ? "#dc2626"
                      : "#666",
                }}
              >
                {" "}Δ vs {compareYear}: {fmtDelta(hoverDelta)}
              </span>
            )}
          </>
        ) : (
          <span className="piramide-hint">Pasa el cursor sobre una barra</span>
        )}
      </div>
    </div>
  );
}
