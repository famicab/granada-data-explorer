// Copia los datos procesados de backend/data/ a public/api/ para que el sitio
// se pueda desplegar como estático (Cloudflare Pages) sin backend.
//
// Genera las MISMAS rutas que sirve la API FastAPI, sin extensión:
//   backend/data/<capa>.geojson  ->  public/api/layers/<capa>
//   backend/data/demografia.json ->  public/api/demografia
// Así el frontend (que pide /api/layers/<capa> y /api/demografia) funciona igual
// contra los ficheros estáticos. Se ejecuta automáticamente antes de `build`.

import { mkdir, rm, readdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "backend", "data");
const API = join(here, "public", "api");
const LAYERS = join(API, "layers");

await rm(API, { recursive: true, force: true });
await mkdir(LAYERS, { recursive: true });

let n = 0;
for (const f of await readdir(SRC)) {
  if (f.endsWith(".geojson")) {
    await copyFile(join(SRC, f), join(LAYERS, f.replace(/\.geojson$/, "")));
    n++;
  } else if (f === "demografia.json") {
    await copyFile(join(SRC, f), join(API, "demografia"));
    n++;
  }
}
console.log(`[copy-data] ${n} ficheros copiados -> frontend/public/api/`);
