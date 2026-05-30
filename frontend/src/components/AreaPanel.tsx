import { useState } from "react";

// ── Tipos ────────────────────────────────────────────────────────────────
// AreaProps cubre los dos shapes posibles: secciones censales (CUSEC, CDIS,
// CSEC, NMUN, estacion_cercana) y barrios (id, name, n_secciones,
// no2_serie, estacion_principal). Cualquier feature de área lleva
// poblaciones + verde + centroide.

export interface VftBlock {
  n_vfts: number;
  n_plazas: number;
  viviendas_total: number | null;
  ratio_vft_pct: number | null;
  // Acumulado anual de VFTs activas hoy registradas hasta fin de cada año
  // (clave = año como string). Reconstruido desde `registration_date` —
  // tiene sesgo superviviente: VFTs dadas de baja antes de hoy no cuentan.
  serie?: Record<string, number>;
}

export interface SeccionProps {
  CUSEC: string;
  CDIS?: string;
  CSEC?: string;
  NMUN?: string;
  poblaciones?: Record<string, number>;
  superficie_verde_m2?: number;
  superficie_verde_desglose?: VerdeDesglose;
  estacion_cercana?: { name: string; distancia_m: number };
  centroide?: [number, number];
  equipamientos?: Record<string, EquipEntrySeccion>;
  renta?: Record<string, number>;
  vft?: VftBlock;
}

export interface BarrioProps {
  id: string;
  name: string;
  n_secciones: number;
  poblaciones?: Record<string, number>;
  superficie_verde_m2?: number;
  superficie_verde_desglose?: VerdeDesglose;
  no2_serie?: Record<string, number>;
  estacion_principal?: string | null;
  centroide?: [number, number];
  equipamientos?: Record<string, EquipEntryBarrio>;
  renta?: Record<string, number>;
  vft?: VftBlock;
}

interface EquipEntrySeccion {
  n_dentro: number;
  mas_cercana_m?: number;
  mas_cercana_name?: string;
}

interface EquipEntryBarrio {
  n_dentro_total: number;
}

const EQUIP_ORDER = [
  "sanidad",
  "educacion",
  "agua",
  "reciclaje",
  "aparcabicis",
  "patrimonio",
] as const;

const EQUIP_LABELS: Record<string, string> = {
  sanidad: "Sanidad",
  educacion: "Educación",
  agua: "Agua",
  reciclaje: "Reciclaje",
  aparcabicis: "Aparcabicis",
  patrimonio: "Patrimonio",
};

// Mismos iconos que los markers en el mapa (GranadaMap.tsx POI_ICONS).
const EQUIP_ICONS: Record<string, string> = {
  sanidad: "➕",
  educacion: "📚",
  agua: "💧",
  reciclaje: "♻️",
  aparcabicis: "🚲",
  patrimonio: "🏛️",
};

// Umbral para mostrar la categoría aunque no haya POIs dentro: si el más
// cercano queda a <500 m, sigue siendo "accesible a pie".
const EQUIP_NEAR_THRESHOLD_M = 500;

interface VerdeDesglose {
  parques: number;
  jardines: number;
  arbolado: number;
}

export type AreaProps = SeccionProps | BarrioProps;

export function isBarrio(a: AreaProps): a is BarrioProps {
  return "name" in a && typeof (a as BarrioProps).name === "string";
}

export function areaLabel(a: AreaProps): string {
  return isBarrio(a)
    ? a.name
    : `Distrito ${a.CDIS ?? "—"} · sec ${a.CSEC ?? "—"}`;
}

export function areaId(a: AreaProps): string {
  return isBarrio(a) ? a.id : a.CUSEC;
}

// ── Helpers ─────────────────────────────────────────────────────────────
const fmtArea = (m2: number) =>
  m2 >= 10_000
    ? `${(m2 / 10_000).toFixed(1)} ha`
    : `${Math.round(m2).toLocaleString("es-ES")} m²`;

const fmtDist = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

const OMS_VERDE_HAB = 9;
const ratioColor = (r: number) => (r >= OMS_VERDE_HAB ? "#16a34a" : "#dc2626");

const SUBTYPE_COLORS: Record<keyof VerdeDesglose, string> = {
  parques: "#22c55e",
  jardines: "#84cc16",
  arbolado: "#14532d",
};

const fmt = (v: number) => v.toLocaleString("es-ES");
const clamp01 = (o: number) => Math.max(0, Math.min(1, o));

function classIndex(v: number, breaks: number[]): number {
  for (let i = 0; i < breaks.length; i++) if (v <= breaks[i]) return i;
  return breaks.length;
}

function axisMax(m: number): number {
  if (m <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  for (const s of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (m <= s * pow) return s * pow;
  return 10 * pow;
}

function DesgloseVerde({
  desglose,
  total,
}: {
  desglose: VerdeDesglose;
  total: number;
}) {
  if (total <= 0) return null;
  const subs: (keyof VerdeDesglose)[] = ["parques", "jardines", "arbolado"];
  const pct = Object.fromEntries(
    subs.map((s) => [s, (desglose[s] / total) * 100])
  ) as Record<keyof VerdeDesglose, number>;
  return (
    <div className="sp-subtypes">
      <div className="sp-bar" role="img" aria-label="Desglose de zonas verdes">
        {subs.map((s) =>
          pct[s] > 0 ? (
            <div
              key={s}
              style={{ width: `${pct[s]}%`, background: SUBTYPE_COLORS[s] }}
              title={`${s} ${pct[s].toFixed(0)}%`}
            />
          ) : null
        )}
      </div>
      <div className="sp-sub sp-subtypes-legend">
        {subs.map((s) => (
          <span key={s} className="sp-subtypes-item">
            <span className="dot" style={{ background: SUBTYPE_COLORS[s] }} />
            {s.charAt(0).toUpperCase() + s.slice(1)} {pct[s].toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

interface PuntoSerie {
  anio: number;
  valor: number;
}

function PoblacionChart({
  serie,
  breaks,
  colors,
  year,
  unidad,
}: {
  serie: PuntoSerie[];
  breaks: number[];
  colors: string[];
  year: number | null;
  unidad: string;
}) {
  const [hover, setHover] = useState<PuntoSerie | null>(null);
  const W = 360, H = 190, padL = 42, padR = 12, padT = 16, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const years = serie.map((p) => p.anio);
  const vals = serie.map((p) => p.valor);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const yMax = axisMax(Math.max(...vals));
  const x = (yr: number) =>
    padL + (maxY === minY ? 0 : (yr - minY) / (maxY - minY)) * plotW;
  const y = (v: number) => padT + (1 - v / yMax) * plotH;
  const points = serie.map((p) => `${x(p.anio).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
  const last = serie[serie.length - 1];
  const dotColor = (v: number) => colors[classIndex(v, breaks)];

  const rampDesc = [...colors].reverse();
  const offsDesc = [...breaks].reverse().map((b) => clamp01((yMax - b) / yMax));
  const stops: { offset: number; color: string }[] = [
    { offset: 0, color: rampDesc[0] },
  ];
  for (let i = 0; i < offsDesc.length; i++) {
    stops.push({ offset: offsDesc[i], color: rampDesc[i] });
    stops.push({ offset: offsDesc[i], color: rampDesc[i + 1] });
  }
  stops.push({ offset: 1, color: rampDesc[rampDesc.length - 1] });

  const yearInRange = year != null && year >= minY && year <= maxY;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sp-chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient
          id="pobgrad"
          gradientUnits="userSpaceOnUse"
          x1={padL}
          y1={y(yMax)}
          x2={padL}
          y2={y(0)}
        >
          {stops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>

      {[0, yMax / 2, yMax].map((v) => (
        <g key={v}>
          <line x1={padL} y1={y(v)} x2={padL + plotW} y2={y(v)} stroke="#eee" />
          <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#888">
            {fmt(Math.round(v))}
          </text>
        </g>
      ))}

      {yearInRange && (
        <line
          x1={x(year!)}
          y1={padT}
          x2={x(year!)}
          y2={padT + plotH}
          stroke="#1e3a5f"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.5"
        />
      )}

      <polyline points={points} fill="none" stroke="url(#pobgrad)" strokeWidth="2.5" />
      {serie.map((p) => (
        <circle key={p.anio} cx={x(p.anio)} cy={y(p.valor)} r="2.5" fill={dotColor(p.valor)} />
      ))}
      <text
        x={x(last.anio)}
        y={y(last.valor) - 6}
        textAnchor="end"
        fontSize="10"
        fontWeight="600"
        fill={dotColor(last.valor)}
      >
        {fmt(last.valor)}
      </text>
      <text x={padL} y={H - 8} textAnchor="start" fontSize="10" fill="#888">{minY}</text>
      <text x={padL + plotW} y={H - 8} textAnchor="end" fontSize="10" fill="#888">{maxY}</text>

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
        const w = 100;
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

// ── Panel ───────────────────────────────────────────────────────────────

export default function AreaPanel({
  area,
  onClose,
  year,
  breaks,
  colors,
}: {
  area: AreaProps;
  onClose: () => void;
  year: number | null;
  breaks: number[];
  colors: string[];
}) {
  const esBarrio = isBarrio(area);
  const pobs = area.poblaciones ?? {};
  const serie: PuntoSerie[] = Object.entries(pobs)
    .map(([y, v]) => ({ anio: Number(y), valor: v }))
    .sort((a, b) => a.anio - b.anio);

  const actual = year != null ? pobs[String(year)] : undefined;
  const primero = serie[0];
  const ultimo = serie[serie.length - 1];
  const delta = primero && ultimo ? ultimo.valor - primero.valor : null;
  const deltaPct =
    primero && ultimo && primero.valor !== 0
      ? (delta! / primero.valor) * 100
      : null;
  const deltaColor =
    delta == null || delta === 0 ? "#666" : delta > 0 ? "#16a34a" : "#dc2626";

  // NO₂ del año: barrios traen serie pre-agregada, secciones no la traen
  // (la calidad del aire se ve por estación cercana, fuera de aquí).
  const no2Actual =
    esBarrio && year != null ? area.no2_serie?.[String(year)] : undefined;

  const verde = area.superficie_verde_m2;
  const desglose = area.superficie_verde_desglose;
  const ratio =
    verde != null && actual != null && actual > 0 ? verde / actual : null;

  // Renta neta media: muestra el valor del año del slider si está en el
  // rango ADRH (2015-2023). Si el slider está en 2024/2025 cae al último
  // año disponible, indicando ese año entre paréntesis.
  const rentaSerie = area.renta;
  const rentaHasAny = rentaSerie && Object.keys(rentaSerie).length > 0;
  let rentaValue: number | undefined;
  let rentaYear: number | undefined;
  if (rentaSerie && year != null && rentaSerie[String(year)] != null) {
    rentaValue = rentaSerie[String(year)];
    rentaYear = year;
  } else if (rentaSerie) {
    const yrs = Object.keys(rentaSerie)
      .map(Number)
      .sort((a, b) => b - a);
    if (yrs.length > 0) {
      rentaYear = yrs[0];
      rentaValue = rentaSerie[String(yrs[0])];
    }
  }

  return (
    <div className="detail-panel">
      <div className="sp-header">
        <strong>
          {esBarrio ? `Barrio · ${area.name}` : `Sección ${area.CUSEC}`}
        </strong>
        <button onClick={onClose} aria-label="Cerrar">×</button>
      </div>
      <div className="sp-body">
      <div className="sp-sub">
        {esBarrio
          ? `Agrupa ${area.n_secciones} sección${
              area.n_secciones === 1 ? "" : "es"
            } censal${area.n_secciones === 1 ? "" : "es"}`
          : `${area.NMUN ?? "Granada"}${
              area.CDIS ? ` · distrito ${area.CDIS}` : ""
            }${area.CSEC ? ` · sección ${area.CSEC}` : ""}`}
      </div>
      {actual != null && year != null && (
        <div className="sp-no2">
          {fmt(actual)} hab.{" "}
          <span style={{ color: "#666", fontWeight: 400 }}>({year})</span>
        </div>
      )}

      <div className="sp-chart-title">Evolución de la población</div>
      {serie.length >= 2 ? (
        <PoblacionChart
          serie={serie}
          breaks={breaks}
          colors={colors}
          year={year}
          unidad="hab."
        />
      ) : (
        <div className="sp-sub">Serie temporal insuficiente.</div>
      )}

      {delta != null && primero && ultimo && deltaPct != null && (
        <div className="sp-sub" style={{ marginTop: 8 }}>
          {primero.anio} → {ultimo.anio}:{" "}
          <strong style={{ color: deltaColor }}>
            {delta > 0 ? "+" : ""}
            {fmt(delta)} hab. ({deltaPct > 0 ? "+" : ""}
            {deltaPct.toFixed(1)}%)
          </strong>
        </div>
      )}

      {(verde != null ||
        rentaHasAny ||
        (esBarrio ? area.estacion_principal : area.estacion_cercana)) && (
        <div className="sp-indicators">
          {rentaValue != null && rentaYear != null && (
            <div>
              <span className="sp-label">Renta neta media:</span>{" "}
              <strong>
                {rentaValue.toLocaleString("es-ES")} €/persona
              </strong>{" "}
              <span className="sp-sub">({rentaYear})</span>
            </div>
          )}
          {verde != null && (
            <div>
              <span className="sp-label">
                Zonas verdes {esBarrio ? "en el barrio" : "en la sección"}:
              </span>{" "}
              <strong>{fmtArea(verde)}</strong>
            </div>
          )}
          {desglose && verde != null && verde > 0 && (
            <DesgloseVerde desglose={desglose} total={verde} />
          )}
          {ratio != null && (
            <div>
              <span className="sp-label">Verde por habitante:</span>{" "}
              <strong style={{ color: ratioColor(ratio) }}>
                {ratio.toFixed(1)} m²/hab
              </strong>{" "}
              <span className="sp-sub">
                ({ratio >= OMS_VERDE_HAB ? "≥" : "<"} OMS {OMS_VERDE_HAB})
              </span>
            </div>
          )}
          {esBarrio && area.estacion_principal && (
            <div>
              <span className="sp-label">Estación de aire principal:</span>{" "}
              <strong>{area.estacion_principal}</strong>
              {no2Actual != null && (
                <>
                  {" · "}
                  <strong style={{ color: ratioColorNo2(no2Actual) }}>
                    NO₂ {no2Actual.toFixed(1)} µg/m³
                  </strong>{" "}
                  <span className="sp-sub">({year})</span>
                </>
              )}
            </div>
          )}
          {!esBarrio && area.estacion_cercana && (
            <div>
              <span className="sp-label">Estación de aire más cercana:</span>{" "}
              <strong>{area.estacion_cercana.name}</strong>{" "}
              <span className="sp-sub">
                ({fmtDist(area.estacion_cercana.distancia_m)})
              </span>
            </div>
          )}
        </div>
      )}

      <VftBlockView vft={area.vft} esBarrio={esBarrio} year={year} />
      <EquipamientosBlock area={area} esBarrio={esBarrio} />
      </div>
    </div>
  );
}

// Umbral a partir del cual marcamos "Alta presión turística" (plan 06):
// barrios como Albaicín superan el 10 %; al casco histórico se asocia
// conflicto urbano por turistificación.
const VFT_ALERT_THRESHOLD_PCT = 10;

// Paleta PuRd 7-class — misma que en build_vft.py / build_barrios.py, para
// que los puntos del gráfico de evolución encajen con la coropleta.
const VFT_RAMP = [
  "#f1eef6", "#d4b9da", "#c994c7", "#df65b0",
  "#e7298a", "#ce1256", "#91003f",
];
const VFT_BREAKS = [1, 3, 7, 12, 20, 30];

function VftBlockView({
  vft,
  esBarrio,
  year,
}: {
  vft?: VftBlock;
  esBarrio: boolean;
  year: number | null;
}) {
  if (!vft || vft.n_vfts <= 0) return null;

  // Si hay serie y el slider apunta a un año con dato, mostramos el valor
  // de ese año (acumulado a fin de año). Si no, snapshot total actual.
  const serie = vft.serie;
  const nAtYear =
    year != null && serie && typeof serie[String(year)] === "number"
      ? serie[String(year)]
      : null;
  const usingSerie = nAtYear != null;
  const nMostrado = usingSerie ? nAtYear! : vft.n_vfts;
  const viviendas = vft.viviendas_total;
  const ratioMostrado =
    viviendas != null && viviendas > 0
      ? (nMostrado / viviendas) * 100
      : null;
  const alta =
    ratioMostrado != null && ratioMostrado >= VFT_ALERT_THRESHOLD_PCT;

  // Serie continua para el chart (pasa la lista ordenada de años).
  const serieList: PuntoSerie[] | null = serie
    ? Object.entries(serie)
        .map(([y, v]) => ({ anio: Number(y), valor: v }))
        .sort((a, b) => a.anio - b.anio)
    : null;

  return (
    <div className="sp-vft">
      <div className="sp-vft-title">
        <span aria-hidden="true">🏠</span> Vivienda con fines turísticos
      </div>
      <div>
        <span className="sp-label">VFTs{usingSerie ? ` (${year})` : ""}:</span>{" "}
        <strong>{fmt(nMostrado)}</strong>
        {!usingSerie && vft.n_plazas > 0 && (
          <>
            {" "}
            <span className="sp-sub">({fmt(vft.n_plazas)} plazas hoy)</span>
          </>
        )}
      </div>
      {ratioMostrado != null && viviendas != null && (
        <div>
          <span className="sp-label">
            Sobre el parque residencial{esBarrio ? " del barrio" : ""}:
          </span>{" "}
          <strong style={{ color: alta ? "#980043" : "#6b21a8" }}>
            {ratioMostrado.toFixed(1)}%
          </strong>{" "}
          <span className="sp-sub">
            ({fmt(nMostrado)} VFT / {fmt(viviendas)} viviendas)
          </span>
        </div>
      )}
      {alta && (
        <div className="sp-vft-alert">
          ⚠️ Alta presión turística (≥ {VFT_ALERT_THRESHOLD_PCT}%)
        </div>
      )}
      {serieList && serieList.length >= 2 && (
        <>
          <div className="sp-chart-title" style={{ marginTop: 8 }}>
            Evolución del número de VFTs
          </div>
          <VftEvolutionChart
            serie={serieList}
            viviendas={viviendas ?? null}
            year={year}
          />
          <div className="sp-sub" style={{ fontStyle: "italic" }}>
            Serie reconstruida desde la fecha de alta de las VFTs hoy
            activas — los años pasados están sub-estimados (las bajas
            anteriores a hoy no aparecen).
          </div>
        </>
      )}
    </div>
  );
}

// Mini-chart de evolución VFT. Reutiliza el mismo estilo que la curva de
// población, pero los dots se colorean según el ratio (n / viviendas) en
// cada año — así "ver verde" significa "presión baja en ese año" y "ver
// magenta" significa "presión alta en ese año".
function VftEvolutionChart({
  serie,
  viviendas,
  year,
}: {
  serie: PuntoSerie[];
  viviendas: number | null;
  year: number | null;
}) {
  const [hover, setHover] = useState<PuntoSerie | null>(null);
  const W = 360, H = 150, padL = 42, padR = 12, padT = 12, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const years = serie.map((p) => p.anio);
  const vals = serie.map((p) => p.valor);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const yMax = axisMax(Math.max(...vals, 1));
  const x = (yr: number) =>
    padL + (maxY === minY ? 0 : (yr - minY) / (maxY - minY)) * plotW;
  const y = (v: number) => padT + (1 - v / yMax) * plotH;
  const points = serie
    .map((p) => `${x(p.anio).toFixed(1)},${y(p.valor).toFixed(1)}`)
    .join(" ");
  const last = serie[serie.length - 1];
  const dotColor = (n: number) => {
    if (viviendas == null || viviendas <= 0) return VFT_RAMP[VFT_RAMP.length - 1];
    const ratio = (n / viviendas) * 100;
    return VFT_RAMP[classIndex(ratio, VFT_BREAKS)];
  };
  const yearInRange = year != null && year >= minY && year <= maxY;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sp-chart" preserveAspectRatio="xMidYMid meet">
      {[0, yMax / 2, yMax].map((v) => (
        <g key={v}>
          <line x1={padL} y1={y(v)} x2={padL + plotW} y2={y(v)} stroke="#eee" />
          <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#888">
            {fmt(Math.round(v))}
          </text>
        </g>
      ))}
      {yearInRange && (
        <line
          x1={x(year!)}
          y1={padT}
          x2={x(year!)}
          y2={padT + plotH}
          stroke="#6b21a8"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.5"
        />
      )}
      <polyline points={points} fill="none" stroke="#ce1256" strokeWidth="2.2" />
      {serie.map((p) => (
        <circle key={p.anio} cx={x(p.anio)} cy={y(p.valor)} r="2.6" fill={dotColor(p.valor)} />
      ))}
      <text
        x={x(last.anio)}
        y={y(last.valor) - 6}
        textAnchor="end"
        fontSize="10"
        fontWeight="600"
        fill={dotColor(last.valor)}
      >
        {fmt(last.valor)}
      </text>
      <text x={padL} y={H - 6} textAnchor="start" fontSize="10" fill="#888">{minY}</text>
      <text x={padL + plotW} y={H - 6} textAnchor="end" fontSize="10" fill="#888">{maxY}</text>

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
            <circle cx={hx} cy={hy} r="4" fill={dotColor(hover.valor)} stroke="#fff" strokeWidth="1.5" />
            <rect x={tx - w / 2} y={ty - h} width={w} height={h} rx="3" fill="#6b21a8" />
            <text x={tx} y={ty - 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="white">
              {hover.anio}: {fmt(hover.valor)} VFTs
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

function EquipamientosBlock({
  area,
  esBarrio,
}: {
  area: AreaProps;
  esBarrio: boolean;
}) {
  const eq = area.equipamientos;
  if (!eq) return null;

  type Item = {
    cat: string;
    icon: string;
    label: string;
    valueNode: React.ReactNode;
  };
  const items: Item[] = [];

  for (const cat of EQUIP_ORDER) {
    const info = eq[cat] as
      | EquipEntrySeccion
      | EquipEntryBarrio
      | undefined;
    if (!info) continue;
    const icon = EQUIP_ICONS[cat] ?? "•";
    const label = EQUIP_LABELS[cat] ?? cat;

    if (esBarrio) {
      const n = (info as EquipEntryBarrio).n_dentro_total ?? 0;
      if (n <= 0) continue;
      items.push({
        cat,
        icon,
        label,
        valueNode: <strong>{n}</strong>,
      });
    } else {
      const sec = info as EquipEntrySeccion;
      if (sec.n_dentro > 0) {
        items.push({
          cat,
          icon,
          label,
          valueNode: (
            <>
              <strong>{sec.n_dentro}</strong>{" "}
              <span className="sp-sub">dentro</span>
            </>
          ),
        });
      } else if (
        sec.mas_cercana_m != null &&
        sec.mas_cercana_m < EQUIP_NEAR_THRESHOLD_M
      ) {
        items.push({
          cat,
          icon,
          label,
          valueNode: (
            <>
              <span className="sp-sub">a</span>{" "}
              <strong>{fmtDist(sec.mas_cercana_m)}</strong>
              {sec.mas_cercana_name && (
                <>
                  {" "}
                  <span className="sp-sub">({sec.mas_cercana_name})</span>
                </>
              )}
            </>
          ),
        });
      }
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="sp-equip">
      <div className="sp-equip-title">Equipamientos</div>
      <div className="sp-equip-list">
        {items.map((it) => (
          <div key={it.cat} className="sp-equip-item">
            <span className="sp-equip-icon" aria-hidden="true">
              {it.icon}
            </span>
            <span className="sp-label">{it.label}:</span> {it.valueNode}
          </div>
        ))}
      </div>
    </div>
  );
}

// Mismas bandas UE que en mapa y leyenda (verde / ámbar / rojo).
function ratioColorNo2(v: number): string {
  if (v < 20) return "#16a34a";
  if (v < 40) return "#d97706";
  return "#dc2626";
}
