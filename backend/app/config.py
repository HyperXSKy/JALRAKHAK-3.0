from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "nowcast_ridge.npz"

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_FLOOD = "https://flood-api.open-meteo.com/v1/flood"
REQUEST_TIMEOUT_S = 10.0
CACHE_TTL_S = 90.0

# IMD operational colour-coded rainfall warnings (24h accumulation, mm)
IMD_YELLOW_MM = 64.5
IMD_ORANGE_MM = 115.6
IMD_RED_MM = 204.4
