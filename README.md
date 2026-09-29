# JALRAKSHAK

JALRAKSHAK is a dashboard for rainfall, flood-risk, and landslide-risk monitoring across selected areas of Assam.

## Requirements

- Node.js 18 or later
- Python 3.10 or later

## Run the project

Install the frontend packages:

```powershell
npm install
```

Start the frontend:

```powershell
npm run dev
```

The frontend runs at `http://localhost:3000`.

In a second terminal, create and activate a Python environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
```

Start the API:

```powershell
$env:PYTHONPATH = "backend"
python -m uvicorn app.main:app --reload --port 8000
```

The API runs at `http://127.0.0.1:8000`.

The frontend uses `http://127.0.0.1:8000` by default. To use another API address, create `.env.local` in the project root:

```env
VITE_BACKEND_URL=http://127.0.0.1:8000
```

## PostgreSQL and PostGIS

SQLite remains the default for local development. For a shared deployment, set `DATABASE_URL` to a PostgreSQL connection URL, for example `postgresql+psycopg://user:password@host:5432/jalrakshak`. Standard `postgresql://` and `postgres://` URLs are normalized to the installed psycopg 3 driver.

Migration `0003` creates a shared monitoring-zone catalog. PostgreSQL deployments additionally store zone centers as PostGIS geography and zone boundaries as SRID 4326 multipolygons, with GiST indexes for spatial queries. PostGIS must be installed on the database server; the migration enables the extension, so the database role needs permission to create it (or an administrator must enable it in advance).

`GET /api/zones/nearby?lat=26.18&lng=91.75&radius_km=25` returns monitoring zones ordered by distance. PostgreSQL uses PostGIS `ST_DWithin`/`ST_Distance`; local SQLite uses a Haversine fallback. API startup synchronizes the zone catalog from the application configuration.

For a multi-replica deployment, run the migration once as a release step, then disable startup migrations on each API replica:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://user:password@host:5432/jalrakshak"
alembic -c backend/alembic.ini upgrade head
$env:AUTO_MIGRATE_DATABASE = "false"
```

Local development still applies migrations automatically. Create a new Alembic revision for each future schema change; do not edit a revision already applied to a shared database.

For production, configure the frontend API address and backend CORS allowlist in your hosting settings. When the frontend and API share an origin, route `/api` to the backend. Include the XGBoost model artifacts in the backend deployment; the browser-only fallback does not include its score.

## Main features

- Live rainfall and forecast data from Open-Meteo.
- Daily river-discharge data from GloFAS through Open-Meteo.
- Flood and landslide risk scores for the monitored zones.
- Interactive street, terrain, and satellite maps.
- Rainfall history, forecast charts, and zone-level details.
- Cloudburst, monsoon-surge, and dry-baseline simulations.
- Browser geolocation with nearest-zone weather information.
- Guwahati-only HLS inundation screening.
- Alert review and acknowledgement.

## Alert delivery

The Alerts page supports delivery of live advisories through configured webhook, email, or SMS channels. Available channels are shown in the application after the server is configured. Operators can send a test notification or deliver an active advisory from the Alerts page.

Simulation alerts are previews only and cannot be delivered. Store credentials and tokens in your hosting provider's secret settings, not in this README or committed source files.

## Data and model limitations

- The dashboard is a monitoring and decision-support tool, not an official warning service.
- Weather and river values depend on external services and network availability.
- GloFAS values are daily discharge estimates from a nearby grid cell, not direct water-level measurements. The grid is approximately 5 km.
- Flood-risk scores are model estimates based on rainfall, terrain, and river-flow patterns. They are not direct observations of inundation or river overflow.
- The local flood model uses historical data and should not be treated as a direct observation.
- The HLS model covers only the Guwahati grid. Its output is an HLS water-signal estimate, not a flood probability or confirmed inundation map.
- The browser fallback can provide weather-based zone data when the API is unavailable, but backend-only model and river features will not be available.

## Development checks

```powershell
npm run build
npm run lint
```
