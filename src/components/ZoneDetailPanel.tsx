import React, { useState } from 'react';
import { ZoneWithTelemetry } from '../types';
import { RISK_PALETTE } from '../utils/riskEngine';
import {
  CloudRain,
  CloudSun,
  CloudDrizzle,
  Droplets,
  History,
  Mountain,
  Waves,
  ShieldAlert,
  Calendar,
  Thermometer,
  Wind,
  Compass,
  Building2,
  Users,
  Radio,
  FileCode2,
  AlertTriangle,
  ChevronDown,
  Info,
  Maximize2,
  PanelRightClose,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

interface ZoneDetailPanelProps {
  zone: ZoneWithTelemetry;
  onOpenAlertDelivery: () => void;
  onOpenHowItWorks: () => void;
  onClose?: () => void;
}

export const ZoneDetailPanel: React.FC<ZoneDetailPanelProps> = ({
  zone,
  onOpenAlertDelivery,
  onOpenHowItWorks,
  onClose,
}) => {
  const [precipitationView, setPrecipitationView] = useState<'HISTORY' | 'NOW' | 'FORECAST'>('NOW');
  const [showFormulaBreakdown, setShowFormulaBreakdown] = useState(false);

  const palette = RISK_PALETTE[zone.assessment.overallLevel];
  const isHighOrSevere =
    zone.assessment.overallLevel === 'High' || zone.assessment.overallLevel === 'Severe';
  const floodRiskModel = zone.fusion?.floodRiskModel;
  const floodModelHoldout = floodRiskModel?.model.chronologicalHoldout;

  const historyData = zone.weather.dailyHistory.filter((item) => !item.isForecast).map((item) => ({
    name: item.date,
    rainfall: item.rainfallMm,
  }));
  const forecastDays = zone.weather.dailyHistory.filter((item) => item.isForecast).slice(0, 5);
  const hourlyForecast = zone.weather.hourlyForecast.slice(0, 8);
  const historyTotal = historyData.reduce((total, item) => total + item.rainfall, 0);

  return (
    <div
      id="zone-detail-panel"
      className="w-full lg:w-96 xl:w-[440px] bg-stone-50/90 backdrop-blur-md border-l border-stone-200/80 flex flex-col h-full shrink-0 overflow-y-auto"
    >
      {/* Detail Header */}
      <div className="p-4 border-b border-stone-200/80 sticky top-0 bg-white/85 backdrop-blur-md z-10">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
            <span>{zone.region}</span>
            <span>&bull;</span>
            <span className="font-semibold text-stone-800">{zone.country}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold border tracking-wide shadow-2xs ${palette.badgeBg} ${palette.badgeText} ${palette.badgeBorder}`}
            >
              {zone.assessment.overallLevel} Risk ({zone.assessment.compositeScore}/100)
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Hide area details"
                className="tactile-btn flex h-8 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700"
                title="Hide area details"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
                <span>Hide</span>
              </button>
            )}
          </div>
        </div>

        <h2 className="text-lg font-bold text-stone-900 leading-tight mb-1">
          {zone.name}
        </h2>

        <p className="text-xs text-stone-600 mb-3 leading-relaxed">
          {zone.geologyDescription}
        </p>

        {/* Quick Location & Infrastructure Meta */}
        <div className="grid grid-cols-2 gap-2 p-2.5 glass-card rounded-xl border border-stone-200/80 text-xs">
          <div>
            <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">Population</span>
            <span className="font-bold text-stone-900 flex items-center gap-1.5 mt-0.5">
              <Users className="w-3.5 h-3.5 text-orange-600" />
              {zone.population.toLocaleString()} residents
            </span>
          </div>
          <div>
            <span className="text-stone-500 block text-[10px] uppercase font-bold tracking-wider">Terrain Elevation</span>
            <span className="font-bold text-stone-900 flex items-center gap-1.5 mt-0.5">
              <Compass className="w-3.5 h-3.5 text-amber-600" />
              {zone.elevation}m ASL &bull; {zone.slope}° slope
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <section aria-label="Key model scores">
          <div className="mb-2 flex items-end justify-between gap-2">
            <h3 className="text-xs font-bold text-stone-900">Key risk scores</h3>
            <span className="text-[10px] text-stone-500">Higher means greater estimated risk</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div title="Landslide Susceptibility Index, scored from 0 to 100" className="min-w-0 rounded-lg border border-amber-200 bg-amber-50/70 p-2">
              <span className="block truncate text-[10px] font-semibold text-stone-700">Landslide · LSI</span>
              <strong className="mt-1 block font-mono text-lg leading-none text-stone-950">{zone.assessment.landslideScore}<span className="text-[10px] text-stone-500">/100</span></strong>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${zone.assessment.landslideScore}%` }} />
              </div>
            </div>
            <div title="Flash Flood Index, scored from 0 to 100" className="min-w-0 rounded-lg border border-orange-200 bg-orange-50/70 p-2">
              <span className="block truncate text-[10px] font-semibold text-stone-700">Flash flood · FFI</span>
              <strong className="mt-1 block font-mono text-lg leading-none text-stone-950">{zone.assessment.floodScore}<span className="text-[10px] text-stone-500">/100</span></strong>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-orange-600" style={{ width: `${zone.assessment.floodScore}%` }} />
              </div>
            </div>
            <div title="XGBoost flood-risk estimate based on rainfall and river-flow data" className="min-w-0 rounded-lg border border-cyan-200 bg-cyan-50/70 p-2">
              <span className="block truncate text-[10px] font-semibold text-stone-700">XGBoost · flood risk</span>
              <strong className="mt-1 block truncate font-mono text-lg leading-none text-stone-950">
                {floodRiskModel ? `${floodRiskModel.riskPercent.toFixed(1)}%` : '—'}
              </strong>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white">
                {floodRiskModel && <div className="h-full rounded-full bg-cyan-700" style={{ width: `${floodRiskModel.riskPercent}%` }} />}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="precipitation-title" className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-800">
                <CloudRain className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 id="precipitation-title" className="text-sm font-bold text-stone-900">Rain & weather</h3>
                <p className="text-[10px] text-stone-500">{zone.weather.isLive ? 'Live conditions' : 'Scenario conditions'} · Updated {zone.weather.lastUpdated}</p>
              </div>
            </div>
          </div>

          <div role="group" aria-label="Rain and weather view" className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-1">
            {([
              { id: 'HISTORY', label: 'Past', icon: History },
              { id: 'NOW', label: 'Now', icon: CloudSun },
              { id: 'FORECAST', label: 'Forecast', icon: Calendar },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={precipitationView === id}
                onClick={() => setPrecipitationView(id)}
                className={`flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 ${precipitationView === id ? 'bg-white text-sky-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3" aria-live="polite">
            {precipitationView === 'HISTORY' && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-stone-800">Past 7 days</span>
                  <span className="font-mono text-[11px] font-bold text-sky-800">{historyTotal.toFixed(1)} mm total</span>
                </div>
                {historyData.length ? (
                  <div className="h-44 w-full" role="img" aria-label="Daily rainfall totals for the past seven days">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={historyData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E7E5E4" />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#78716C' }} />
                        <YAxis tick={{ fontSize: 9, fill: '#78716C' }} unit="mm" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E7E5E4', borderRadius: 8, fontSize: 11 }}
                          formatter={(value: number | string | undefined) => [`${value ?? 0} mm`, 'Observed rain']}
                        />
                        <ReferenceLine y={50} stroke="#EA580C" strokeDasharray="3 3" />
                        <Bar dataKey="rainfall" name="Rainfall" fill="#0284C7" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="rounded-lg bg-stone-50 px-3 py-5 text-center text-xs text-stone-600">Past rainfall history is unavailable.</p>
                )}
                <p className="mt-1 text-[10px] text-stone-500">Observed daily totals. The dashed line marks 50 mm.</p>
              </div>
            )}

            {precipitationView === 'NOW' && (
              <div>
                <div className="flex items-center gap-3 rounded-lg bg-sky-50 p-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-sky-700">
                    <CloudRain className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-sky-900">Rain rate now</p>
                    <p className="font-mono text-2xl font-bold leading-tight text-stone-950">{zone.weather.currentRateMmPerHour.toFixed(1)} <span className="text-xs font-semibold text-stone-600">mm/h</span></p>
                    <p className="truncate text-[11px] text-stone-700">{zone.weather.weatherDescription}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-2">
                    <Droplets className="h-4 w-4 shrink-0 text-sky-700" />
                    <span className="min-w-0 text-[10px] text-stone-600">Past 24h<strong className="block font-mono text-xs text-stone-900">{zone.weather.last24hMm.toFixed(1)} mm</strong></span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-2">
                    <Droplets className="h-4 w-4 shrink-0 text-cyan-700" />
                    <span className="min-w-0 text-[10px] text-stone-600">Past 72h<strong className="block font-mono text-xs text-stone-900">{zone.weather.last72hMm.toFixed(1)} mm</strong></span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-2">
                    <Thermometer className="h-4 w-4 shrink-0 text-orange-600" />
                    <span className="min-w-0 text-[10px] text-stone-600">Temperature<strong className="block font-mono text-xs text-stone-900">{zone.weather.temperatureC != null ? `${zone.weather.temperatureC}°C` : 'Unavailable'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-2">
                    <Wind className="h-4 w-4 shrink-0 text-stone-600" />
                    <span className="min-w-0 text-[10px] text-stone-600">Wind<strong className="block font-mono text-xs text-stone-900">{zone.weather.windSpeedKmh != null ? `${zone.weather.windSpeedKmh} km/h` : 'Unavailable'}</strong></span>
                  </div>
                </div>
              </div>
            )}

            {precipitationView === 'FORECAST' && (
              <div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <CloudDrizzle className="h-5 w-5 text-sky-800" />
                    <span className="text-xs font-semibold text-stone-800">Expected in next 24 hours</span>
                  </div>
                  <strong className="shrink-0 font-mono text-lg text-sky-900">{zone.weather.forecastNext24hMm.toFixed(1)} <span className="text-xs">mm</span></strong>
                </div>
                <div className="mt-3">
                  <h4 className="mb-2 text-[11px] font-bold text-stone-800">Coming hours</h4>
                  {hourlyForecast.length ? (
                    <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Hourly precipitation forecast">
                      {hourlyForecast.map((hour, index) => (
                        <div key={`${hour.time}-${index}`} className="min-w-[4.25rem] rounded-lg border border-stone-200 bg-white px-2 py-2 text-center">
                          <span className="block text-[10px] font-semibold text-stone-600">{index === 0 ? 'Now' : hour.time}</span>
                          {hour.probability >= 30 ? <CloudRain className="mx-auto my-1 h-4 w-4 text-sky-700" /> : <CloudDrizzle className="mx-auto my-1 h-4 w-4 text-stone-400" />}
                          <strong className="block font-mono text-xs text-stone-900">{hour.precipitationMm.toFixed(1)} mm</strong>
                          <span className="text-[9px] text-stone-500">{hour.probability}% chance</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-stone-50 px-3 py-4 text-center text-xs text-stone-600">Hourly forecast is unavailable.</p>
                  )}
                </div>
                {forecastDays.length > 0 && (
                  <div className="mt-2 border-t border-stone-200 pt-2">
                    <h4 className="mb-1 text-[11px] font-bold text-stone-800">Coming days</h4>
                    <div className="divide-y divide-stone-100">
                      {forecastDays.map((day) => (
                        <div key={day.date} className="flex items-center gap-2 py-1.5 text-[11px]">
                          <span className="w-14 shrink-0 text-stone-600">{day.date}</span>
                          <CloudRain className="h-3.5 w-3.5 shrink-0 text-sky-700" />
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                            <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, day.rainfallMm)}%` }} />
                          </div>
                          <strong className="w-12 shrink-0 text-right font-mono text-stone-900">{day.rainfallMm.toFixed(1)} mm</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="mt-2 border-t border-stone-100 pt-2 text-[10px] text-stone-500">Source: Open-Meteo · {zone.weather.isLive ? 'live weather data' : 'scenario preview'}</p>
        </section>

        {/* Hazard Breakdown: Landslide vs Flash Flood */}
        <section className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-stone-700 block">
            Hazard Susceptibility Engines
          </span>

          {/* Landslide Card */}
          <div className="p-3.5 rounded-xl border border-stone-200/80 glass-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Mountain className="w-4 h-4 text-orange-600" />
                <span className="text-xs font-bold text-stone-900">Landslide Hazard Index (LSI)</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs ${RISK_PALETTE[zone.assessment.landslideLevel].badgeBg} ${RISK_PALETTE[zone.assessment.landslideLevel].badgeText} ${RISK_PALETTE[zone.assessment.landslideLevel].badgeBorder}`}
              >
                {zone.assessment.landslideLevel} ({zone.assessment.landslideScore}/100)
              </span>
            </div>

            <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden mb-2 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full transition-all duration-500"
                style={{ width: `${zone.assessment.landslideScore}%` }}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[10px] text-stone-700 pt-1.5 border-t border-stone-200/60 font-mono">
              <div>
                <span className="text-stone-500 block">Slope Angle</span>
                <span className="font-bold text-stone-900">{zone.slope}° (&times;{zone.assessment.landslideBreakdown.slopeMultiplier})</span>
              </div>
              <div>
                <span className="text-stone-500 block">Antecedent 72h</span>
                <span className="font-bold text-stone-900">{zone.assessment.landslideBreakdown.effective72hMm} mm</span>
              </div>
              <div>
                <span className="text-stone-500 block">Soil Saturation</span>
                <span className="font-bold text-stone-900">{zone.soilSaturationInitial}%</span>
              </div>
            </div>
          </div>

          {/* Flash Flood Card */}
          <div className="p-3.5 rounded-xl border border-stone-200/80 glass-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Waves className="w-4 h-4 text-orange-600" />
                <span className="text-xs font-bold text-stone-900">Flash Flood Index (FFI)</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs ${RISK_PALETTE[zone.assessment.floodLevel].badgeBg} ${RISK_PALETTE[zone.assessment.floodLevel].badgeText} ${RISK_PALETTE[zone.assessment.floodLevel].badgeBorder}`}
              >
                {zone.assessment.floodLevel} ({zone.assessment.floodScore}/100)
              </span>
            </div>

            <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden mb-2 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-red-600 rounded-full transition-all duration-500"
                style={{ width: `${zone.assessment.floodScore}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-1 text-[10px] text-stone-700 pt-1.5 border-t border-stone-200/60 font-mono">
              <div>
                <span className="text-stone-500 block">River Proximity</span>
                <span className="font-bold text-stone-900">{zone.riverProximityKm} km (&times;{zone.assessment.floodBreakdown.riverProximityMultiplier})</span>
              </div>
              <div>
                <span className="text-stone-500 block">24h Runoff Total</span>
                <span className="font-bold text-stone-900">{zone.assessment.floodBreakdown.accumulation24h} mm</span>
              </div>
              <div>
                <span className="text-stone-500 block">Valley Funnel</span>
                <span className="font-bold text-stone-900">&times;{zone.assessment.floodBreakdown.elevationFunnelMultiplier}</span>
              </div>
              <div>
                <span className="text-stone-500 block">River Flow</span>
                <span className="font-bold text-stone-900">
                  {zone.assessment.floodBreakdown.riverDischargeM3s != null
                    ? `${zone.assessment.floodBreakdown.riverDischargeM3s.toLocaleString()} m³/s`
                    : 'Unavailable'}
                </span>
                <span className="block text-stone-500">
                  {zone.assessment.floodBreakdown.riverFlowRatio != null
                    ? `Q/Q95 ${zone.assessment.floodBreakdown.riverFlowRatio.toFixed(2)}×`
                    : 'No flow ratio'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-stone-200/80 glass-card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-stone-900">XGBoost flood-risk score</span>
              {floodRiskModel ? (
                <span className="text-xs font-bold text-stone-800">
                  {floodRiskModel.riskPercent.toFixed(1)}%
                </span>
              ) : (
                <span className="text-xs font-bold text-stone-500">Not available</span>
              )}
            </div>
            <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
              {floodRiskModel
                ? floodRiskModel.scoreMeaning
                : 'Score not available. Please wait a few seconds and try again.'}
            </p>
            {floodModelHoldout?.precision != null && floodModelHoldout.recall != null && (
              <p className="mt-1 text-[10px] text-stone-500">
                Historical holdout: {(floodModelHoldout.precision * 100).toFixed(1)}% precision / {(floodModelHoldout.recall * 100).toFixed(1)}% recall on rainfall/high-flow hazard labels.
              </p>
            )}
          </div>

          {/* Toggle Formula Breakdown */}
          <button
            onClick={() => setShowFormulaBreakdown(!showFormulaBreakdown)}
            className="tactile-btn w-full flex items-center justify-between px-3 py-2 text-xs text-stone-700 glass-card rounded-xl font-semibold transition cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <FileCode2 className="w-3.5 h-3.5 text-orange-600" />
              {showFormulaBreakdown ? 'Hide Formula Equation' : 'Inspect Mathematical Formulas'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFormulaBreakdown ? 'rotate-180' : ''}`} />
          </button>

          {showFormulaBreakdown && (
            <div className="p-3.5 glass-card rounded-xl text-xs space-y-2.5 text-stone-800 font-mono">
              <div className="border-b border-stone-200/60 pb-2">
                <span className="font-sans font-bold text-stone-900 block mb-0.5">LSI Calculation:</span>
                <p className="text-[11px] text-stone-700">
                  (Rate &times; 3.2 + 72h &times; 0.42) &times; SlopeMultiplier &times; Saturation &times; 0.45
                </p>
                <p className="text-[10px] text-orange-800 mt-1 font-sans">
                  = ({zone.assessment.landslideBreakdown.intensityFactor} + {zone.assessment.landslideBreakdown.effective72hMm}) &times; {zone.assessment.landslideBreakdown.slopeMultiplier} &times; {zone.assessment.landslideBreakdown.saturationFactor} &times; 0.45 = <strong className="text-stone-900">{zone.assessment.landslideScore}</strong>
                </p>
              </div>
              <div>
                <span className="font-sans font-bold text-stone-900 block mb-0.5">FFI Calculation:</span>
                <p className="text-[11px] text-stone-700">
                  (24h &times; 0.68 + Rate &times; 3.6) &times; RiverBuffer &times; Elevation &times; FlowFactor &times; 0.40
                </p>
                <p className="text-[10px] text-orange-800 mt-1 font-sans">
                  = ({zone.assessment.floodBreakdown.accumulation24h} + {zone.assessment.floodBreakdown.intensityFactor}) &times; {zone.assessment.floodBreakdown.riverProximityMultiplier} &times; {zone.assessment.floodBreakdown.elevationFunnelMultiplier} &times; {zone.assessment.floodBreakdown.riverFlowMultiplier} &times; 0.40 = <strong className="text-stone-900">{zone.assessment.floodScore}</strong>
                </p>
                <p className="text-[10px] text-stone-600 mt-1 font-sans">
                  Flow factor = 1 + 0.5 &times; clamp(Q/Q95, 0, 2); Q95 is a historical high-flow reference, not a bankfull level.
                </p>
              </div>
              <button
                onClick={onOpenHowItWorks}
                className="text-xs text-orange-700 font-sans font-bold underline block pt-1 hover:text-orange-900 cursor-pointer"
              >
                Open Full Interactive Formula Sandbox &rarr;
              </button>
            </div>
          )}
        </section>

        {/* Actionable Safety Protocol & Advisories */}
        <section className="p-3.5 glass-card rounded-xl border border-stone-200/80 space-y-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-100 text-orange-600 shadow-2xs">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-stone-900">Recommended Action Plan</span>
          </div>

          <p className="text-xs font-medium text-stone-800 leading-relaxed">
            {zone.assessment.recommendedAction}
          </p>

          <div className="space-y-1.5 pt-2 border-t border-stone-200/60 text-xs">
            <span className="text-[10px] uppercase font-bold text-stone-500 block">Active Advisories:</span>
            {zone.assessment.activeAdvisories.map((adv, i) => (
              <div key={i} className="flex items-start gap-1.5 text-stone-700 text-[11px]">
                <span className="text-orange-600 font-bold">&bull;</span>
                <span>{adv}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Critical Infrastructure List */}
        <section className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-stone-700 block">
            Vulnerable Infrastructure Assets
          </span>
          <div className="flex flex-wrap gap-1.5">
            {zone.criticalInfrastructure.map((item, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 glass-card border border-stone-200/80 text-stone-800 rounded-lg text-[11px] font-medium shadow-2xs"
              >
                {item}
              </span>
            ))}
          </div>
        </section>

        {/* Alert Delivery Action */}
        <div className="pt-2">
          <button
            id="btn-simulate-zone-sms"
            onClick={onOpenAlertDelivery}
            className="tactile-btn w-full py-2.5 px-3 bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 hover:from-orange-600 hover:to-orange-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-orange-500/20 border border-orange-400/30 transition cursor-pointer"
          >
            <Radio className="w-4 h-4" />
            <span>Open live alert delivery</span>
          </button>
        </div>
      </div>
    </div>
  );
};
