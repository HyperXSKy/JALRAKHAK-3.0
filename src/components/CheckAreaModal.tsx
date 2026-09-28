import React from 'react';
import { X, MapPin, Navigation, ArrowRight, ShieldAlert, CloudRain, AlertCircle, Waves } from 'lucide-react';
import { ZoneWithTelemetry, WeatherRainfallData } from '../types';
import { RISK_PALETTE } from '../utils/riskEngine';
import { HLSInundationScreenResponse } from '../services/backend';

interface CheckAreaModalProps {
  isOpen: boolean;
  onClose: () => void;
  userCoords: { lat: number; lng: number } | null;
  nearestZone: ZoneWithTelemetry | null;
  distanceKm: number | null;
  onFocusZone: (zone: ZoneWithTelemetry) => void;
  onFocusMap: () => void;
  errorMsg: string | null;
  onRetry: () => void;
  userWeather?: WeatherRainfallData | null;
  isLoadingWeather?: boolean;
  hlsScreen?: HLSInundationScreenResponse | null;
  hlsScreenMessage?: string | null;
}

export const CheckAreaModal: React.FC<CheckAreaModalProps> = ({
  isOpen,
  onClose,
  userCoords,
  nearestZone,
  distanceKm,
  onFocusZone,
  onFocusMap,
  errorMsg,
  onRetry,
  userWeather,
  isLoadingWeather = false,
  hlsScreen,
  hlsScreenMessage,
}) => {
  if (!isOpen) return null;
  const floodRiskModel = hlsScreen?.floodRiskModel ?? nearestZone?.fusion?.floodRiskModel;

  return (
    <div
      id="check-area-modal"
      className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="glass-modal border border-stone-200/80 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-stone-900 max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-stone-200/80 flex items-center justify-between bg-white/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center shadow-xs">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Weather near you</h3>
              <p className="text-[11px] text-stone-500 font-medium">Local conditions and nearest monitored area</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="tactile-btn p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {errorMsg ? (
            <div className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-xl text-amber-950 space-y-2.5 shadow-2xs">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Location unavailable</span>
              </div>
              <p className="text-xs text-amber-900/90 leading-relaxed">{errorMsg}</p>
              <button
                onClick={onRetry}
                className="tactile-btn px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs transition cursor-pointer"
              >
                Try again
              </button>
            </div>
          ) : userCoords ? (
            <div className="space-y-4">
              {/* Coordinates Pill */}
              <div className="flex items-center justify-between p-3 glass-card border border-stone-200/80 rounded-xl text-xs">
                <span className="text-stone-600 font-medium flex items-center gap-2">
                  <Navigation className="w-3.5 h-3.5 text-orange-600" />
                  Detected Location:
                </span>
                <span className="font-mono font-bold text-stone-900 bg-white/80 px-2.5 py-0.5 rounded-md border border-stone-200/60">
                  {typeof userCoords.lat === 'number' && !isNaN(userCoords.lat)
                    ? userCoords.lat.toFixed(4)
                    : 'Unavailable'}
                  °,{' '}
                  {typeof userCoords.lng === 'number' && !isNaN(userCoords.lng)
                    ? userCoords.lng.toFixed(4)
                    : 'Unavailable'}
                  °
                </span>
              </div>

              <div className="p-3.5 glass-card border border-stone-200/80 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-stone-600 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-orange-600 animate-ping" />
                    Weather at your location
                  </span>
                  <span className="text-[10px] text-stone-400 font-mono font-medium">
                    Live weather
                  </span>
                </div>

                {isLoadingWeather ? (
                  <div className="py-5 text-center text-stone-500">
                    <CloudRain className="w-5 h-5 mx-auto animate-bounce text-orange-600 mb-1.5" />
                    Checking local weather...
                  </div>
                ) : userWeather ? (
                  <div className="space-y-2.5">
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200/60 rounded-lg flex items-center justify-between shadow-2xs">
                      <span className="font-bold text-stone-900 text-xs">
                        {userWeather.weatherDescription}
                      </span>
                      <span className="text-[11px] font-mono text-stone-600 font-medium">
                        Updated {userWeather.lastUpdated}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 bg-white/80 rounded-lg border border-stone-200/70 shadow-2xs">
                        <span className="text-[9px] uppercase font-bold text-stone-500 block">Rain Rate</span>
                        <span className="font-mono font-bold text-stone-900 text-xs">
                          {userWeather.currentRateMmPerHour} mm/h
                        </span>
                      </div>
                      <div className="p-2 bg-white/80 rounded-lg border border-stone-200/70 shadow-2xs">
                        <span className="text-[9px] uppercase font-bold text-stone-500 block">24h Total</span>
                        <span className="font-mono font-bold text-stone-900 text-xs">
                          {userWeather.last24hMm} mm
                        </span>
                      </div>
                      <div className="p-2 bg-white/80 rounded-lg border border-stone-200/70 shadow-2xs">
                        <span className="text-[9px] uppercase font-bold text-stone-500 block">Temp</span>
                        <span className="font-mono font-bold text-stone-900 text-xs">
                          {userWeather.temperatureC != null ? `${userWeather.temperatureC}°C` : '--'}
                        </span>
                      </div>
                      <div className="p-2 bg-white/80 rounded-lg border border-stone-200/70 shadow-2xs">
                        <span className="text-[9px] uppercase font-bold text-stone-500 block">Humidity</span>
                        <span className="font-mono font-bold text-stone-900 text-xs">
                          {userWeather.humidityPercent != null ? `${userWeather.humidityPercent}%` : '--'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border border-cyan-200/70 bg-cyan-50/70 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Waves className="h-4 w-4 shrink-0 text-cyan-700" />
                        <div className="min-w-0">
                          <span className="block text-[10px] font-bold text-stone-700">Nearest modeled river flow</span>
                          <span className="block truncate text-[9px] text-stone-500">
                            {userWeather.riverDischarge?.source || 'GloFAS river grid'}
                            {userWeather.riverDischarge?.latitude != null && userWeather.riverDischarge.longitude != null
                              ? ` · ${userWeather.riverDischarge.latitude.toFixed(2)}, ${userWeather.riverDischarge.longitude.toFixed(2)}`
                              : ''}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="block font-mono text-xs font-bold text-stone-900">
                          {userWeather.riverDischarge?.currentM3s != null
                            ? `${userWeather.riverDischarge.currentM3s.toLocaleString()} m³/s`
                            : 'Unavailable'}
                        </span>
                        <span className="block text-[9px] text-stone-500">
                          {userWeather.riverDischarge?.currentDate
                            ? `Daily · ${userWeather.riverDischarge.currentDate}`
                            : 'Daily discharge · not river stage'}
                        </span>
                      </div>
                    </div>
                    {userWeather.riverDischarge?.highFlowThresholdM3s != null && (
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[10px] text-stone-600">
                        <span>
                          Next day: {userWeather.riverDischarge.nextDayM3s != null
                            ? `${userWeather.riverDischarge.nextDayM3s.toLocaleString()} m³/s`
                            : '--'}
                        </span>
                        <span>
                          Q/Q95: {userWeather.riverDischarge.highFlowRatio != null
                            ? `${userWeather.riverDischarge.highFlowRatio.toFixed(2)}×`
                            : '--'}
                          {' · '}P95 {userWeather.riverDischarge.highFlowThresholdM3s.toLocaleString()} m³/s
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-stone-500 text-[11px]">Local weather details are unavailable right now.</p>
                )}
              </div>

              <div className="p-3.5 glass-card border border-stone-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-800">HLS model screening</span>
                  {hlsScreen && (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${hlsScreen.screenPositive ? 'bg-amber-100 text-amber-900' : 'bg-stone-100 text-stone-700'}`}>
                      {hlsScreen.screenPositive ? 'Elevated signal' : 'No elevated signal'}
                    </span>
                  )}
                </div>
                {isLoadingWeather ? (
                  <p className="text-[11px] text-stone-500">Checking the model for this location...</p>
                ) : hlsScreen ? (
                  <>
                    <p className="text-sm font-bold text-stone-900">
                      Estimated HLS fraction: {(hlsScreen.estimatedHlsFraction * 100).toFixed(1)}%
                    </p>
                    <p className="text-[11px] text-stone-600 leading-relaxed">
                      This is a satellite-label screening estimate, not a flood probability or an official warning. The model covers Guwahati only.
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    {hlsScreenMessage || 'No model estimate is available for this location.'}
                  </p>
                )}
              </div>

              <div className="p-3.5 glass-card border border-stone-200/80 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-stone-800">XGBoost flood-risk score</span>
                    {floodRiskModel ? (
                      <span className="text-xs font-bold text-stone-900">
                        {floodRiskModel.riskPercent.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-stone-500">Not available</span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    {floodRiskModel
                      ? `${floodRiskModel.scoreMeaning} Area: ${('nearestZoneName' in floodRiskModel && floodRiskModel.nearestZoneName) || nearestZone?.name || 'nearest monitored area'}.`
                      : 'Score not available. Please wait a few seconds and try again.'}
                  </p>
                </div>

              {/* Nearest Zone Card */}
              {nearestZone && (
                <div className="p-4 border border-stone-200/80 rounded-xl glass-card space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500">
                      Nearest monitored area
                    </span>
                    <span className="text-xs font-bold text-orange-600 font-mono bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200/60">
                      {distanceKm != null ? `${distanceKm.toFixed(1)} km away` : ''}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-stone-900">{nearestZone.name}</h4>
                    <p className="text-xs text-stone-500 font-medium">{nearestZone.region}, {nearestZone.country}</p>
                  </div>

                  {/* Severity Badge & Rating */}
                  {(() => {
                    const palette = RISK_PALETTE[nearestZone.assessment.overallLevel];
                    return (
                      <div className="flex items-center justify-between p-2.5 rounded-xl border bg-white/70 border-stone-200/70 shadow-2xs">
                        <span className="text-xs text-stone-600 font-medium">Risk level:</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-2xs ${palette.badgeBg} ${palette.badgeText} ${palette.badgeBorder}`}
                        >
                          {nearestZone.assessment.overallLevel} Risk ({nearestZone.assessment.compositeScore}/100)
                        </span>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-stone-200/60">
                    <div>
                      <span className="text-stone-500 block font-medium">Catchment Rainfall</span>
                      <span className="font-bold text-stone-900 font-mono">
                        {nearestZone.weather.currentRateMmPerHour.toFixed(1)} mm/h
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block font-medium">Slope Angle</span>
                      <span className="font-bold text-stone-900 font-mono">
                        {nearestZone.slope}° incline
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-stone-700 bg-white/70 p-2.5 rounded-xl border border-stone-200/70 leading-relaxed shadow-2xs">
                    <strong className="text-stone-900">Suggested action:</strong> {nearestZone.assessment.recommendedAction}
                  </p>
                  <p className="text-[11px] text-stone-600">
                    Follow official instructions from local authorities.
                  </p>

                </div>
              )}
              <button
                onClick={() => {
                  if (nearestZone) onFocusZone(nearestZone);
                  else onFocusMap();
                  onClose();
                }}
                className="tactile-btn w-full py-2.5 px-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <span>{nearestZone ? 'View area on map' : 'View my location on map'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <Navigation className="w-8 h-8 text-orange-600 animate-spin mx-auto mb-2" />
              <p className="text-xs font-bold text-stone-800">Finding your location...</p>
              <p className="text-[11px] text-stone-500 mt-1">
                Checking nearby monitored areas.
              </p>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-stone-200/80 bg-stone-50/70 flex justify-end">
          <button
            onClick={onClose}
            className="tactile-btn px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
