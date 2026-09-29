# JALRAKSHAK

JALRAKSHAK brings rainfall, river, and hazard information for monitored areas of Assam into one dashboard. It combines live and forecast data with model-based flood and landslide risk estimates.

## Run locally

You'll need Node.js 18+ and Python 3.10+. From the project root, install the frontend dependencies and start Vite:

```powershell
npm install
npm run dev
```

In a second terminal, set up and start the API:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
$env:PYTHONPATH = "backend"
python -m uvicorn app.main:app --reload --port 8000
```

The dashboard is available at `http://localhost:3000`; the API runs at `http://127.0.0.1:8000`. The frontend uses that API address by default. To change it, set `VITE_BACKEND_URL` in a root `.env.local` file.

## What’s included

The dashboard shows weather forecasts, river discharge, and zone-level flood and landslide risk, with interactive maps, rainfall history, scenario simulations, and alert review. It also includes nearest-zone information based on browser location and HLS water-signal screening for Guwahati. Configured webhook, email, or SMS channels can be used to deliver live advisories; simulation alerts are previews only.

## Deployment notes

SQLite is used by default, and the API applies database migrations on startup. PostgreSQL is supported through `DATABASE_URL`; it requires PostGIS for spatial zone data. For production, configure the frontend API URL and backend CORS origins, and include the model files under `backend/models`. Keep notification credentials in your hosting provider's secret settings, not in source control.

## Checks

```powershell
npm run build
npm run lint
```
