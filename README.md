# JALRAKSHAK

JALRAKSHAK brings rainfall, river, and hazard information for monitored areas of Assam into one dashboard. It combines live and forecast data with model-based flood and landslide risk estimates.

## Run locally (Single Deployment)

You only need Node.js 18+. From the project root, install dependencies and start the app:

```powershell
npm install
npm run dev
```

The unified dashboard is immediately available at `http://localhost:3000`. Telemetry, risk score calculations, GloFAS river discharge, alert generation, and scenario simulations run directly and seamlessly.

### Production Build & Single Server
```powershell
npm run build
npm start
```

### Optional Python ML Training & API (Optional)
If you wish to retrain the XGBoost models or run the optional FastAPI service:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
$env:PYTHONPATH = "backend"
python -m uvicorn app.main:app --reload --port 8000
```
To point the frontend to an external backend instance, set `VITE_BACKEND_URL` in a `.env.local` file. If omitted, the integrated in-browser engine runs everything autonomously.

## What’s included

The dashboard shows weather forecasts, river discharge, and zone-level flood and landslide risk, with interactive maps, rainfall history, scenario simulations, and alert review. It also includes nearest-zone information based on browser location and HLS water-signal screening for Guwahati. Configured webhook, email, or SMS channels can be used to deliver live advisories; simulation alerts are previews only.

## Deployment notes

SQLite is used by default, and the API applies database migrations on startup. PostgreSQL is supported through `DATABASE_URL`; it requires PostGIS for spatial zone data. For production, configure the frontend API URL and backend CORS origins, and include the model files under `backend/models`. Keep notification credentials in your hosting provider's secret settings, not in source control.

## Checks

```powershell
npm run build
npm run lint
```
