// Chips bajo la píldora MapMode con los overlays activos. Tap en un chip
// desactiva el overlay (cierra el grupo completo si era un master). Tap en
// "+" abre el panel de capas.

interface Chip {
  key: string;
  icon: string;
  label: string;
  onRemove: () => void;
}

export default function ActiveOverlaysStrip({
  chips,
  onOpenLayersPanel,
}: {
  chips: Chip[];
  onOpenLayersPanel: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="overlays-strip" role="list" aria-label="Capas activas">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          className="overlays-chip"
          onClick={c.onRemove}
          aria-label={`Desactivar ${c.label}`}
          role="listitem"
          title={`Desactivar ${c.label}`}
        >
          <span className="overlays-chip-icon" aria-hidden="true">
            {c.icon}
          </span>
          <span className="overlays-chip-label">{c.label}</span>
          <span className="overlays-chip-x" aria-hidden="true">
            ×
          </span>
        </button>
      ))}
      <button
        type="button"
        className="overlays-chip overlays-chip-add"
        onClick={onOpenLayersPanel}
        aria-label="Añadir o gestionar capas"
        title="Gestionar capas"
      >
        +
      </button>
    </div>
  );
}

export type { Chip as OverlayChip };
