const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export async function fetchLayer(name: string): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`${API_BASE}/layers/${name}`);
  if (!res.ok) throw new Error(`Failed to load layer: ${name}`);
  return res.json();
}

export async function fetchLayerList(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/layers`);
  if (!res.ok) throw new Error("Failed to load layer list");
  const data = await res.json();
  return data.layers;
}

export async function fetchDemografia(): Promise<unknown> {
  const res = await fetch(`${API_BASE}/demografia`);
  if (!res.ok) throw new Error("Failed to load demografia");
  return res.json();
}
