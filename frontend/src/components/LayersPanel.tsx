import { useEffect, useRef } from "react";

// Panel de capas (overlays opcionales sobre la coropleta principal).
// Renderiza un FAB siempre visible y, al abrirse, un drawer con los
// overlays agrupados: Zonas verdes, Estaciones de aire, Equipamientos,
// Contexto (Distritos).

export interface LayerItem {
  index: number;       // posición en el array `layers` del App.tsx
  name: string;
  label: string;
  color: string;
  visible: boolean;
  group?: string;
}

interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  color?: string;
  icon?: string;
  indent?: boolean;
}

function Switch({ checked, onChange, label, color, icon, indent }: SwitchProps) {
  return (
    <label className={`lp-switch ${indent ? "is-indent" : ""}`}>
      <span className="lp-switch-label">
        {color && (
          <span className="lp-dot" style={{ background: color }} aria-hidden="true" />
        )}
        {icon && (
          <span className="lp-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {label}
      </span>
      <span className={`lp-toggle ${checked ? "is-on" : ""}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          aria-label={label}
        />
        <span className="lp-toggle-track" aria-hidden="true">
          <span className="lp-toggle-thumb" />
        </span>
      </span>
    </label>
  );
}

// Iconos por categoría (alineados con AreaPanel / GranadaMap).
const EQUIP_ICONS_BY_NAME: Record<string, string> = {
  poi_sanidad: "➕",
  poi_educacion: "📚",
  poi_agua: "💧",
  poi_reciclaje: "♻️",
  poi_aparcabicis: "🚲",
  poi_patrimonio: "🏛️",
};

export default function LayersPanel({
  open,
  onOpenChange,
  verdes,
  equips,
  estaciones,
  distritos,
  verdeMasterOpen,
  equipMasterOpen,
  onToggleLayer,
  onToggleVerdeMaster,
  onToggleEquipMaster,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  verdes: LayerItem[];
  equips: LayerItem[];
  estaciones?: LayerItem;
  distritos?: LayerItem;
  verdeMasterOpen: boolean;
  equipMasterOpen: boolean;
  onToggleLayer: (index: number) => void;
  onToggleVerdeMaster: () => void;
  onToggleEquipMaster: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // Click fuera + Escape para cerrar.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (drawerRef.current?.contains(t) || fabRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  // Contador de overlays activos para el badge del FAB.
  const activeCount =
    (verdeMasterOpen && verdes.some((v) => v.visible) ? 1 : 0) +
    (estaciones?.visible ? 1 : 0) +
    (equipMasterOpen && equips.some((e) => e.visible) ? 1 : 0) +
    (distritos?.visible ? 1 : 0);

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={`lp-fab ${open ? "is-open" : ""}`}
        onClick={() => onOpenChange(!open)}
        aria-label="Abrir panel de capas"
        aria-expanded={open}
      >
        <span className="lp-fab-icon" aria-hidden="true">
          {open ? "✕" : "⊞"}
        </span>
        {!open && activeCount > 0 && (
          <span className="lp-fab-badge" aria-hidden="true">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <aside
          ref={drawerRef}
          className="lp-drawer"
          role="dialog"
          aria-label="Panel de capas"
        >
          <header className="lp-header">
            <strong>Capas</strong>
            <button
              type="button"
              className="lp-close"
              onClick={() => onOpenChange(false)}
              aria-label="Cerrar"
            >
              ×
            </button>
          </header>
          <div className="lp-body">
            {verdes.length > 0 && (
              <section className="lp-section">
                <Switch
                  checked={verdeMasterOpen}
                  onChange={onToggleVerdeMaster}
                  label="Zonas verdes"
                  color="#16a34a"
                />
                {verdeMasterOpen && (
                  <div className="lp-sub">
                    {verdes.map((v) => (
                      <Switch
                        key={v.name}
                        checked={v.visible}
                        onChange={() => onToggleLayer(v.index)}
                        label={v.label}
                        color={v.color}
                        indent
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {estaciones && (
              <section className="lp-section">
                <Switch
                  checked={estaciones.visible}
                  onChange={() => onToggleLayer(estaciones.index)}
                  label="Estaciones de calidad del aire"
                  color={estaciones.color}
                />
              </section>
            )}

            {equips.length > 0 && (
              <section className="lp-section">
                <Switch
                  checked={equipMasterOpen}
                  onChange={onToggleEquipMaster}
                  label="Equipamientos"
                  color="#475569"
                />
                {equipMasterOpen && (
                  <div className="lp-sub">
                    {equips.map((e) => (
                      <Switch
                        key={e.name}
                        checked={e.visible}
                        onChange={() => onToggleLayer(e.index)}
                        label={e.label}
                        color={e.color}
                        icon={EQUIP_ICONS_BY_NAME[e.name]}
                        indent
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {distritos && (
              <section className="lp-section">
                <div className="lp-section-title">Contexto</div>
                <Switch
                  checked={distritos.visible}
                  onChange={() => onToggleLayer(distritos.index)}
                  label="Distritos"
                  color={distritos.color}
                />
              </section>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
