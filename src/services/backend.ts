import { EarlyWarningAlert, ZoneWithTelemetry } from '../types';
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
const BACKEND_REQUEST_TIMEOUT_MS = 8000;

export async function fetchBackendDashboard(
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
      throw new Error(`Hydromet backend HTTP ${response.status}`);
    }
    return response.json() as Promise<BackendDashboardResponse>;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}