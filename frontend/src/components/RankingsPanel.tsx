import { useState } from "react";
import type { AreaProps } from "./AreaPanel.tsx";

export type RankingKey =
  | "poblacion"
  | "verde_hab"
  | "no2"
  | "crecimiento"
  | "renta"
  | "vft";

export interface RankingItem {
  feature: AreaProps;
  cusec: string;
  label: string;
  value: number;
  fmtValue: string;
}

export type RankingsData = Record<RankingKey, RankingItem[]>;

const TABS: { key: RankingKey; label: string }[] = [
  { key: "poblacion", label: "Población" },
  { key: "renta", label: "Renta" },
  { key: "verde_hab", label: "Verde/hab" },
  { key: "no2", label: "Peor NO₂" },
  { key: "crecimiento", label: "Crecimiento" },
  { key: "vft", label: "VFT %" },
];

export default function RankingsPanel({
  rankings,
  year,
  onSelect,
  onClose,
}: {
  rankings: RankingsData;
  year: number | null;
  onSelect: (item: RankingItem) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<RankingKey>("poblacion");
  const items = rankings[tab] ?? [];

  return (
    <aside className="rankings-panel" aria-label="Rankings urbanos">
      <div className="rp-header">
        <strong>Rankings · {year ?? "—"}</strong>
        <button onClick={onClose} aria-label="Cerrar rankings">×</button>
      </div>
      <div className="rp-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`rp-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ol className="rp-list">
        {items.length === 0 ? (
          <li className="rp-empty">Sin datos suficientes para {year}.</li>
        ) : (
          items.map((it, i) => (
            <li key={it.cusec}>
              <button
                type="button"
                className="rp-item"
                onClick={() => onSelect(it)}
                title={`Centrar mapa en ${it.label}`}
              >
                <span className="rp-rank">{i + 1}</span>
                <span className="rp-label">{it.label}</span>
                <span className="rp-value">{it.fmtValue}</span>
              </button>
            </li>
          ))
        )}
      </ol>
    </aside>
  );
}
