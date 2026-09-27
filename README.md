
# JALRAKSHAK

An Assam-focused dashboard for rainfall, flood, and landslide monitoring. It combines weather feeds with catchment terrain data to show current conditions, risk estimates, and alerts.

## Run Locally

Requirements: Node.js and Python.

Install the frontend dependencies and start the dashboard:

```powershell
npm install
npm run dev
```

In a second terminal, install the backend dependencies and start the API from the project root:

```powershell
python -m pip install -r backend/requirements.txt
$env:PYTHONPATH='backend'; python -m uvicorn app.main:app --reload --port 8000
```

The API listens on `http://127.0.0.1:8000`. To use another address, set `VITE_BACKEND_URL` in `.env.local`. If the API is unavailable, the dashboard falls back to browser-side weather requests.

Live values depend on upstream weather services. The HLS screening model is limited to the Guwahati grid and should not be treated as an official flood warning.
