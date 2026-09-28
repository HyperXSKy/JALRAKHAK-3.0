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

Simulation alerts are previews only and cannot be delivered. Delivery settings and credentials stay on the server and should not be committed to the repository.

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
