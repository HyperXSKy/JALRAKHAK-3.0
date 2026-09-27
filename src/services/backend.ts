import { EarlyWarningAlert, FloodRiskModelOutput, WeatherRainfallData, ZoneWithTelemetry } from '../types';
import { SimulationScenario } from './openMeteo';

export interface BackendDashboardResponse {
  zones: ZoneWithTelemetry[];
  alerts: EarlyWarningAlert[];
  scenario: SimulationScenario;
  generatedAt: string;
  provider: string;
  partialFailures: number;
  cache: 'hit' | 'miss';
}

const BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const BACKEND_REQUEST_TIMEOUT_MS = 12000;
const inFlightRequests = new Map<SimulationScenario, Promise<BackendDashboardResponse>>();

export interface AlertDeliveryStatus {
  configured: boolean;
  channels: Record<DeliveryChannel, boolean>;
}

export type DeliveryChannel = 'webhook' | 'email' | 'sms';

export async function getAlertDeliveryStatus(): Promise<AlertDeliveryStatus> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/alerts/delivery-status`);
  if (!response.ok) throw new Error(`Alert delivery status HTTP ${response.status}`);
  return response.json() as Promise<AlertDeliveryStatus>;
}

export async function deliverAlert(alert: EarlyWarningAlert, channel: DeliveryChannel): Promise<void> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/alerts/deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...alert, channel }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail || `Alert delivery HTTP ${response.status}`);
  }
}

export function fetchBackendDashboard(
  scenario: SimulationScenario,
  signal?: AbortSignal
): Promise<BackendDashboardResponse> {
  if (!signal) {
    const existingRequest = inFlightRequests.get(scenario);
    if (existingRequest) return existingRequest;
  }

  const request = requestBackendDashboard(scenario, signal);
  if (!signal) {
    inFlightRequests.set(scenario, request);
    const clearRequest = () => {
      if (inFlightRequests.get(scenario) === request) {
        inFlightRequests.delete(scenario);
      }
    };
    void request.then(clearRequest, clearRequest);
  }
  return request;
}

async function requestBackendDashboard(
  scenario: SimulationScenario,
  signal?: AbortSignal
): Promise<BackendDashboardResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BACKEND_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();

  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(
      `${BACKEND_BASE_URL}/api/dashboard?scenario=${encodeURIComponent(scenario)}`,
      { signal: controller.signal }
    );
    if (!response.ok) {
      throw new Error(`JALRAKSHAK backend HTTP ${response.status}`);
    }
    return response.json() as Promise<BackendDashboardResponse>;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export interface HLSInundationScreenResponse {
  estimatedHlsFraction: number;
  screenPositive: boolean;
  highFractionCutoff: number;
  nearestGridKm: number;
  scoreMeaning: string;
  targetCaveat: string;
  intendedUse: string;
  operationalWarning: false;
  weather: WeatherRainfallData;
  floodRiskModel: FloodRiskModelOutput & { nearestZoneName: string };
}

export async function fetchHLSInundationScreen(
  lat: number,
  lng: number
): Promise<HLSInundationScreenResponse> {
  const response = await fetch(
    `${BACKEND_BASE_URL}/api/inundation/hls-screen?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail || `JALRAKSHAK model HTTP ${response.status}`);
  }
  return payload as HLSInundationScreenResponse;
}