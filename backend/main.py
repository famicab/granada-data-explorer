"""
Granada Data Explorer — Backend API
Serves static GeoJSON/JSON files from backend/data/.
"""

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

DATA_DIR = Path(__file__).resolve().parent / "data"

# Orígenes permitidos (CORS). En despliegue, define CORS_ORIGINS con la(s) URL(s)
# del frontend separadas por comas, p. ej.:
#   CORS_ORIGINS="https://granada-data-explorer.pages.dev,https://midominio.com"
# Por defecto "*" para desarrollo local (API pública de solo lectura).
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

app = FastAPI(title="Granada Data Explorer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _load(filename: str) -> dict:
    path = DATA_DIR / filename
    if not path.exists():
        raise HTTPException(404, f"Dataset not found: {filename}")
    return json.loads(path.read_text(encoding="utf-8"))


# ── Endpoints ───────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"name": "Granada Data Explorer API", "version": "0.1.0"}


@app.get("/api/layers")
def list_layers():
    """List all available GeoJSON layers."""
    files = sorted(f.stem for f in DATA_DIR.glob("*.geojson")) if DATA_DIR.exists() else []
    return {"layers": files}


@app.get("/api/layers/{layer_name}")
def get_layer(layer_name: str):
    """Return a GeoJSON layer by name."""
    return JSONResponse(_load(f"{layer_name}.geojson"))


@app.get("/api/demografia")
def get_demografia():
    """Datos demograficos a nivel municipal (serie 1996-2025 + piramide)."""
    return JSONResponse(_load("demografia.json"))


@app.get("/api/health")
def health():
    return {"status": "ok"}
