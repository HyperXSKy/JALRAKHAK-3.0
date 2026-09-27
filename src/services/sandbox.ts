import type { ZoneWithTelemetry } from '../types';
import { calculateZoneRisk } from '../utils/riskEngine';

export interface SandboxInputs {
  rainRate: number;
  rain24h: number;
  rain72h: number;
  slope: number;
  riverKm: number;
  saturation: number;
  elevationM: number;
}

export const DEFAULT_SANDBOX_INPUTS: SandboxInputs = {
  rainRate: 12,
  rain24h: 65,
  rain72h: 90,
  slope: 32,
  riverKm: 0.3,
  saturation: 75,
  elevationM: 780,
};

export function applySandboxInputs(zone: ZoneWithTelemetry, inputs: SandboxInputs): ZoneWithTelemetry {
  const simulatedZone = {
    ...zone,
    slope: inputs.slope,
    riverProximityKm: inputs.riverKm,
    soilSaturationInitial: inputs.saturation,
    elevation: inputs.elevationM,
    weather: {
      ...zone.weather,
      currentRateMmPerHour: inputs.rainRate,
      last24hMm: inputs.rain24h,
      last72hMm: inputs.rain72h,
      isLive: false,
      dataQuality: 'simulated' as const,
      weatherDescription: 'Interactive formula simulation',
      lastUpdated: new Date().toLocaleTimeString(),
    },
  };

  return {
    ...simulatedZone,
    assessment: calculateZoneRisk(simulatedZone, simulatedZone.weather),
  };
}