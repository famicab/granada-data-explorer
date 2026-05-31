// Variantes de renta alternables en el coropleta y la ficha de sección.
// Todas salen de la tabla INE ADRH 31025 (2015-2023), embebidas por sección.

export type RentaVariant = "renta_med_uc" | "renta_hogar" | "renta_persona";

export interface RentaVariantInfo {
  key: RentaVariant;
  short: string; // etiqueta del toggle
  unit: string; // sufijo de unidad
  full: string; // etiqueta larga (leyenda / panel)
  tip: string; // tooltip explicativo
}

export const RENTA_VARIANTS: RentaVariantInfo[] = [
  {
    key: "renta_med_uc",
    short: "Mediana (UC)",
    unit: "€/UC",
    full: "Renta mediana (por unidad de consumo)",
    tip:
      "Mediana de la renta por «unidad de consumo»: escala que ajusta la renta " +
      "del hogar según su tamaño y composición (estándar de Eurostat/INE). " +
      "Más representativa que la media, porque no la distorsionan las rentas " +
      "extremas. A nivel de barrio es una aproximación (media ponderada de las " +
      "medianas de sección).",
  },
  {
    key: "renta_hogar",
    short: "Media/hogar",
    unit: "€/hogar",
    full: "Renta neta media por hogar",
    tip: "Renta neta media de cada hogar (suma de los ingresos del hogar).",
  },
  {
    key: "renta_persona",
    short: "Media/persona",
    unit: "€/persona",
    full: "Renta neta media por persona",
    tip:
      "Renta neta del hogar repartida entre todos sus miembros (per cápita). " +
      "Es baja porque incluye a quienes no tienen ingresos (menores, etc.).",
  },
];

export const DEFAULT_RENTA_VARIANT: RentaVariant = "renta_med_uc";

export const rentaInfo = (k: RentaVariant): RentaVariantInfo =>
  RENTA_VARIANTS.find((v) => v.key === k) ?? RENTA_VARIANTS[0];
