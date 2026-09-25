

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run the Hydromet Backend

Install the Python dependencies once:

`python -m pip install -r backend/requirements.txt`

Start the API from the project root:

`$env:PYTHONPATH='backend'; python -m uvicorn app.main:app --reload --port 8000`

The frontend uses `http://127.0.0.1:8000` by default. Set `VITE_BACKEND_URL` in `.env.local` when the API runs elsewhere. The dashboard endpoint caches each scenario for 90 seconds to limit upstream weather-provider requests during demos.

## Train the Historical Nowcast Model

The checked-in model artifact is trained from Open-Meteo Archive hourly precipitation for all monitoring zones, using a chronological holdout for evaluation. To retrain it:

`$env:PYTHONPATH='backend'; python backend/train_historical_nowcast.py`

Optional date overrides are available through `NOWCAST_HISTORY_START` and `NOWCAST_HISTORY_END`. The API exposes the model data source, training period, sample count, and holdout metrics in each dashboard response.

## Train the XGBoost Flood-Risk Model

The flood model uses historical rainfall plus zone terrain, soil, river-proximity, catchment, and impervious-surface features:

`$env:PYTHONPATH='backend'; python backend/train_flood_xgboost.py`

Its current label is a documented rainfall-triggered flood-risk proxy, not an observed flood event. Replace the proxy labels with verified river-level, flood-inundation, or satellite flood-map labels before operational deployment.
