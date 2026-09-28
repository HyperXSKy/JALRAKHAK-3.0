# JALRAKSHAK

JALRAKSHAK is an Assam-focused dashboard for rainfall, flood, and landslide monitoring. It combines live weather feeds with terrain and catchment data to show current conditions, risk estimates, and alerts.

## Requirements

Before starting the project, make sure you have:

- Node.js 18+ or later
- Python 3.10+
- Git (optional, but recommended)


## 1) Start the frontend

Install dependencies and launch the Vite app:

```powershell
npm install
npm run dev
```

After that, open:

- Frontend: http://localhost:3000

## 2) Start the backend

Open a second terminal window, then run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
$env:PYTHONPATH = "backend"
python -m uvicorn app.main:app --reload --port 8000
```

This starts the FastAPI backend at:

- API: http://127.0.0.1:8000
- Swagger docs: http://127.0.0.1:8000/docs

## 3) Use the app

Once both services are running:

- Open the frontend at http://localhost:3000
- The frontend will connect to the backend API at http://127.0.0.1:8000

If you want to point the frontend to a different backend URL, create a `.env.local` file in the project root and add:

```env
VITE_BACKEND_URL=http://127.0.0.1:8000
```

## 4) Configure real alert delivery

The Alerts view supports HTTPS webhooks, SMTP email, and Twilio SMS. Configure one or more channels in the same PowerShell session used to start the backend, then restart Uvicorn.

Webhook:

```powershell
$env:ALERT_WEBHOOK_URL = "https://your-provider.example/incoming-webhook"
$env:ALERT_WEBHOOK_TOKEN = "your-bearer-token-if-required"
```

SMTP email (use `ssl` for providers that require implicit TLS, commonly port 465):

```powershell
$env:SMTP_HOST = "smtp.example.com"
$env:SMTP_PORT = "587"
$env:SMTP_SECURITY = "starttls"
$env:SMTP_USERNAME = "your-smtp-user"
$env:SMTP_PASSWORD = "your-smtp-password"
$env:ALERT_EMAIL_FROM = "alerts@example.com"
$env:ALERT_EMAIL_TO = "operator@example.com"
```

Twilio SMS (numbers must be in E.164 format):

```powershell
$env:TWILIO_ACCOUNT_SID = "your-account-sid"
$env:TWILIO_AUTH_TOKEN = "your-auth-token"
$env:TWILIO_FROM_NUMBER = "+15555550100"
$env:ALERT_SMS_TO = "+15555550200"
```

Start or restart the backend after setting the variables:

```powershell
$env:PYTHONPATH = "backend"
python -m uvicorn app.main:app --reload --port 8000
```

`ALERT_WEBHOOK_TOKEN` is optional and is sent as a Bearer token. The webhook receives `event`, `text`, `content`, and the complete `alert`; `text` and `content` support common Slack- and Discord-style incoming webhooks. In **Alerts**, choose an available channel and select **Send test alert** to verify it, or **Deliver via ...** on a live advisory. Simulation previews are never sent. Keep credentials in environment variables, not source control.

## Notes

- The backend uses live upstream weather data, so values may vary depending on network and service availability.
- River telemetry is modeled daily GloFAS discharge in m³/s from the nearest flood-grid river cell, not a measured water height or bankfull level; the API grid is approximately 5 km and can select a nearby main river. The FFI compares flow with a per-watershed historical 95th-percentile reference.
- Flood-model labels combine rainfall triggers with next-day discharge reaching that historical high-flow reference. These are proxies, not observed flood or overflow events. GloFAS reanalysis coverage ends in July 2022; retrain with `python backend/train_flood_xgboost.py` after changing model features.
- The HLS inundation screening model is limited to the Guwahati grid and should not be treated as an official flood warning.
- If the API is unavailable, the dashboard may fall back to browser-side weather requests.

## Experimental spatial screen

- The map-layer menu includes an experimental HLS water-signal surface for the 5,751-cell Guwahati grid. It predicts the source CSV `mean` fraction from rainfall and terrain features; the label's physical meaning is undocumented, so this is not a confirmed inundation extent or flood probability.
- The available Drive data includes 17 spatial-label batches and a separate 2023 label file. The baseline download in this workspace is a metadata manifest only; the referenced ERA5 feature tables and baseline `.joblib` model are not present, and the yearly-label, shared-folder, and terrain folders are empty. Those missing files cannot currently add training features or support a controlled baseline comparison.
- [ML4Floods / WorldFloods](https://github.com/spaceml-org/ml4floods) offers pretrained Sentinel-2 flood segmentation models. Its WorldFloods data/model use is non-commercially licensed and its documented dataset is large; inference also requires the matching satellite imagery.
- [NASA/IBM Prithvi Sen1Floods11](https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-1.0-100M-sen1floods11) is Apache-2.0 licensed and expects a six-band Sentinel-2 GeoTIFF. It is a possible future imagery-segmentation path, but those imagery inputs are not among the local Drive assets.
- [Google Flood Forecasting API](https://developers.google.com/flood-forecasting) requires an approved API project and key. Google's public historical datasets include inundation history and global runoff reanalysis; they are useful for future validation but are not currently integrated.

## Common troubleshooting

If Python cannot find the app package, make sure this environment variable is set before running uvicorn:

```powershell
$env:PYTHONPATH = "backend"
```

If npm install fails, remove the lock file and reinstall packages:

```powershell
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
```
