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

The API runs at `http://127.0.0.1:8000`. Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

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
- Optional webhook, email, and SMS alert delivery.

## Alert delivery

Alert delivery is disabled unless the relevant environment variables are configured before starting the backend.

Webhook:

```powershell
$env:ALERT_WEBHOOK_URL = "https://provider.example/incoming-webhook"
$env:ALERT_WEBHOOK_TOKEN = "optional-bearer-token"
```

Email:

```powershell
$env:SMTP_HOST = "smtp.example.com"
$env:SMTP_PORT = "587"
$env:SMTP_SECURITY = "starttls"
$env:SMTP_USERNAME = "smtp-user"
$env:SMTP_PASSWORD = "smtp-password"
$env:ALERT_EMAIL_FROM = "alerts@example.com"
$env:ALERT_EMAIL_TO = "operator@example.com"
```

SMS through Twilio:

```powershell
$env:TWILIO_ACCOUNT_SID = "account-sid"
$env:TWILIO_AUTH_TOKEN = "auth-token"
$env:TWILIO_FROM_NUMBER = "+15555550100"
$env:ALERT_SMS_TO = "+15555550200"
```

Keep credentials in environment variables and do not commit them. Simulation alerts are previews and cannot be delivered.

## Data and model limitations

- The dashboard is a monitoring and decision-support tool, not an official warning service.
- Weather and river values depend on external services and network availability.
- GloFAS values are daily discharge estimates from a nearby grid cell, not direct water-level measurements. The grid is approximately 5 km.
- Flood labels and risk scores are proxy estimates based on rainfall, terrain, and river-flow patterns. They do not confirm flooding or overflow.
- The local flood model uses historical GloFAS coverage that ends in July 2022.
- The HLS model covers only the Guwahati grid. Its output is an HLS water-signal estimate, not a flood probability or confirmed inundation map.
- The browser fallback can provide weather-based zone data when the API is unavailable, but backend-only model and river features will not be available.
- Alert acknowledgement is kept in the current browser session and is not stored in a database.

## Development commands

```powershell
npm run build
npm run lint
```

The repository currently has no automated test suite. Train the local flood model only when the training data or model features change:

```powershell
python backend/train_flood_xgboost.py
```
