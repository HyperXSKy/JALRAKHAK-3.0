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

## Notes

- The backend uses live upstream weather data, so values may vary depending on network and service availability.
- The HLS inundation screening model is limited to the Guwahati grid and should not be treated as an official flood warning.
- If the API is unavailable, the dashboard may fall back to browser-side weather requests.

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
