import { useState, type ReactNode } from "react";
import Piramide, { type PiramideData } from "./Piramide.tsx";
import SerieHistorica, { type SerieData } from "./SerieHistorica.tsx";
import RentaMunicipalChart, {
  type RentaMunicipalData,
} from "./RentaMunicipalChart.tsx";
import RentaAdrhChart, { type RentaAdrhData } from "./RentaAdrhChart.tsx";
import VftMunicipalChart, {
  type VftMunicipalData,
} from "./VftMunicipalChart.tsx";

export interface DemografiaData {
  municipio: string;
  serie: SerieData;
  piramide: PiramideData;
  renta_municipal?: RentaMunicipalData;
  renta_adrh?: RentaAdrhData;
  vft_municipal?: VftMunicipalData;
}

// El panel se renombra a "Ciudad" porque ya no es solo demografía
// (pirámide + serie habitantes) sino el paraguas municipal: gente,
// dinero y turismo. La interface conserva el nombre `DemografiaData`
// porque el JSON sigue viniendo del mismo endpoint /api/demografia
// (cambiar también el endpoint y el archivo añade coste sin ganancia).
type Tab = "piramide" | "serie" | "renta" | "turismo";

export default function DemografiaPanel({
  data,
  loading,
  year,
  onClose,
  full = false,
  yearControl,
}: {
  data: DemografiaData | null;
  loading: boolean;
  year: number | null;
  onClose: () => void;
  // full=true: ocupa todo el área central (modo "vista demografía"),
  // grid 2 columnas en desktop y stack en móvil, sin tabs.
  full?: boolean;
  // Control de año del panel (slot dedicado al slider/play). El panel lo
  // renderiza inmediatamente bajo la cabecera para que sea siempre visible
  // dentro del propio panel, sin depender de un absolute-positioned overlay.
  yearControl?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("piramide");

  const piramideYear =
    year ?? data?.piramide.anios[data.piramide.anios.length - 1] ?? 0;

  const piramideEl = data && (
    <section className="demo-card">
      <h3 className="demo-card-title">Pirámide de población</h3>
      <Piramide data={data.piramide} year={piramideYear} />
    </section>
  );
  const serieEl = data && (
    <section className="demo-card">
      <h3 className="demo-card-title">Serie histórica</h3>
      <SerieHistorica data={data.serie} year={year} />
    </section>
  );
  // El chart de renta solo se renderiza si el JSON trae renta_municipal.
  // En modo full ocupa la fila completa bajo pirámide+serie.
  const rentaEl = data?.renta_municipal && (
    <section className="demo-card demo-card-wide">
      <h3 className="demo-card-title">
        Renta declarada (IRPF) · {data.renta_municipal.anios[0]}–
        {data.renta_municipal.anios[data.renta_municipal.anios.length - 1]}
      </h3>
      <RentaMunicipalChart data={data.renta_municipal} year={year} />
    </section>
  );
  // Renta por sección (ADRH) agregada a ciudad — 3 variantes. Distinta de la
  // de AEAT (por declarante): se muestran juntas en la pestaña Renta.
  const rentaSeccionEl = data?.renta_adrh && (
    <section className="demo-card demo-card-wide">
      <h3 className="demo-card-title">
        Renta por sección (ADRH) · {data.renta_adrh.anios[0]}–
        {data.renta_adrh.anios[data.renta_adrh.anios.length - 1]}
      </h3>
      <RentaAdrhChart data={data.renta_adrh} year={year} />
    </section>
  );
  const turismoEl = data?.vft_municipal && (
    <section className="demo-card demo-card-wide">
      <h3 className="demo-card-title">
        Vivienda con fines turísticos · {data.vft_municipal.anios[0]}–
        {data.vft_municipal.anios[data.vft_municipal.anios.length - 1]}
      </h3>
      <VftMunicipalChart data={data.vft_municipal} year={year} />
    </section>
  );

  return (
    <aside
      className={`demografia-panel${full ? " full" : ""}`}
      aria-label="Panel de demografia"
    >
      <div className="rp-header">
        <strong>📊 Ciudad · {data?.municipio ?? "Granada"}</strong>
        <button onClick={onClose} aria-label="Cerrar panel ciudad">×</button>
      </div>
      {yearControl && (
        <div className="demografia-yearbar">{yearControl}</div>
      )}
      {!full && (
        <div className="rp-tabs">
          <button
            className={`rp-tab ${tab === "piramide" ? "active" : ""}`}
            onClick={() => setTab("piramide")}
          >
            Pirámide
          </button>
          <button
            className={`rp-tab ${tab === "serie" ? "active" : ""}`}
            onClick={() => setTab("serie")}
          >
            Serie histórica
          </button>
          {(data?.renta_adrh || data?.renta_municipal) && (
            <button
              className={`rp-tab ${tab === "renta" ? "active" : ""}`}
              onClick={() => setTab("renta")}
            >
              Renta
            </button>
          )}
          {data?.vft_municipal && (
            <button
              className={`rp-tab ${tab === "turismo" ? "active" : ""}`}
              onClick={() => setTab("turismo")}
            >
              Turismo
            </button>
          )}
        </div>
      )}
      <div className={`demografia-body${full ? " full" : ""}`}>
        {loading && <div className="rp-empty">Cargando datos…</div>}
        {!loading && !data && (
          <div className="rp-empty">No se pudieron cargar los datos.</div>
        )}
        {!loading && data && full && (
          <>
            {piramideEl}
            {serieEl}
            {rentaSeccionEl}
            {rentaEl}
            {turismoEl}
          </>
        )}
        {!loading && data && !full && tab === "piramide" && piramideEl}
        {!loading && data && !full && tab === "serie" && serieEl}
        {!loading && data && !full && tab === "renta" && (
          <>
            {rentaSeccionEl}
            {rentaEl}
          </>
        )}
        {!loading && data && !full && tab === "turismo" && turismoEl}
      </div>
    </aside>
  );
}
