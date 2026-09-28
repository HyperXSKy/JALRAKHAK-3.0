export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Severe';

export interface Zone {
  id: string;
  name: string;
  region: string;
  country: string;
  center: [number, number]; // [lat, lng]
  polygon: [number, number][]; // Coordinates defining the watershed / terrain catchment
  slope: number; // degrees (e.g., 8° to 44°)
  elevation: number; // meters above sea level
  riverProximityKm: number; // distance to drainage axis
  soilSaturationInitial: number; // % estimated antecedence (0-100)
  catchmentAreaKm2: number;
  population: number;
  criticalInfrastructure: string[];
  geologyDescription: string;
}

export interface WeatherRainfallData {
  currentRateMmPerHour: number;
  last24hMm: number;
  last72hMm: number;
  forecastNext24hMm: number;
  hourlyForecast: {
    time: string;
    precipitationMm: number;
    rainMm: number;
    probability: number;
  }[];
  dailyHistory: {
    date: string;
    rainfallMm: number;
    isForecast?: boolean;
  }[];
  lastUpdated: string;
  isLive: boolean;
  dataQuality?: 'live' | 'simulated' | 'unavailable';
  weatherDescription: string;
  temperatureC?: number;
  humidityPercent?: number;
  windSpeedKmh?: number;
  stationElevationM?: number;
  generationTimeMs?: number;
  liveIsoTimestamp?: string;
  riverDischarge?: RiverDischargeTelemetry | null;
}

export interface RiverDischargeTelemetry {
  source: string;
  latitude: number | null;
  longitude: number | null;
  currentDate: string | null;
  currentM3s: number | null;
  nextDayM3s?: number | null;
  peakM3s: number | null;
  highFlowThresholdM3s?: number | null;
  highFlowRatio?: number | null;
  daily: { date: string | null; dischargeM3s: number | null }[];
}

export interface FormulaBreakdownLandslide {
  intensityFactor: number;
  saturationFactor: number;
  slopeMultiplier: number;
  effective72hMm: number;
  rawScore: number;
}

export interface FormulaBreakdownFlood {
  accumulation24h: number;
  intensityFactor: number;
  riverProximityMultiplier: number;
  elevationFunnelMultiplier: number;
  riverFlowMultiplier: number;
  riverFlowRatio: number | null;
  riverDischargeM3s: number | null;
  riverHighFlowThresholdM3s: number | null;
  rawScore: number;
}

export interface RiskAssessment {
  compositeScore: number; // 0 to 100
  overallLevel: RiskLevel;
  landslideScore: number; // 0 to 100
  landslideLevel: RiskLevel;
  landslideBreakdown: FormulaBreakdownLandslide;
  floodScore: number; // 0 to 100
  floodLevel: RiskLevel;
  floodBreakdown: FormulaBreakdownFlood;
  activeAdvisories: string[];
  recommendedAction: string;
  thresholdsTriggered: string[];
}

export interface FloodRiskModelOutput {
  probability: number;
  riskPercent: number;
  level: RiskLevel;
  decisionThreshold: number;
  scoreMeaning: string;
  observedEventProbability: false;
  model: {
    labelDefinition?: string;
    chronologicalHoldout?: {
      precision?: number;
      recall?: number;
      f1?: number;
    };
  };
}

export interface ZoneWithTelemetry extends Zone {
  weather: WeatherRainfallData;
  assessment: RiskAssessment;
  fusion?: {
    floodRiskModel?: FloodRiskModelOutput;
  };
}

export interface EarlyWarningAlert {
  id: string;
  zoneId: string;
  zoneName: string;
  region: string;
  level: RiskLevel;
  hazardType: 'LANDSLIDE' | 'FLASH_FLOOD' | 'EXTREME_RAINFALL' | 'MULTI_HAZARD';
  headline: string;
  recommendation: string;
  timestamp: string;
  compositeScore: number;
  acknowledged?: boolean;
}

export interface UserLocationCheck {
  lat: number;
  lng: number;
  nearestZone: ZoneWithTelemetry | null;
  distanceKm: number | null;
  timestamp: string;
}
