import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MONITORING_ZONES } from './data/zones';
import { ZoneWithTelemetry, EarlyWarningAlert, RiskLevel, WeatherRainfallData } from './types';
import { fetchZoneWeather, fetchLivePointWeather, SimulationScenario } from './services/openMeteo';
import {
  fetchBackendDashboard,
  fetchHLSInundationScreen,
  HLSInundationScreenResponse,
} from './services/backend';
import { calculateZoneRisk, generateZoneAlert, calculateDistanceKm } from './utils/riskEngine';
import { TopNav } from './components/TopNav';
import { AlertBanner } from './components/AlertBanner';
import { SidebarZoneList } from './components/SidebarZoneList';
import { InteractiveMap } from './components/InteractiveMap';
import { ZoneDetailPanel } from './components/ZoneDetailPanel';
import { HowItWorksModal } from './components/HowItWorksModal';
import { CheckAreaModal } from './components/CheckAreaModal';
import { AlertsDrawerModal } from './components/AlertsDrawerModal';
import { LandingPage } from './components/LandingPage';
import { Map, ListFilter, Activity, RefreshCw } from 'lucide-react';
import { DEFAULT_SANDBOX_INPUTS, SandboxInputs, applySandboxInputs } from './services/sandbox';
import { SimulationWorkspace } from './components/SimulationWorkspace';
import { AlertsWorkspace } from './components/AlertsWorkspace';

async function fetchNetworkLocation(): Promise<{ lat: number; lng: number } | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json() as { latitude?: number; longitude?: number };
    if (
      typeof data.latitude !== 'number' ||
      typeof data.longitude !== 'number' ||
      data.latitude < -90 ||
      data.latitude > 90 ||
      data.longitude < -180 ||
      data.longitude > 180
    ) {
      return null;
    }
    return { lat: data.latitude, lng: data.longitude };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const browserFallbackRequests = new globalThis.Map<SimulationScenario, Promise<ZoneWithTelemetry[]>>();

function fetchBrowserFallbackZones(scenario: SimulationScenario): Promise<ZoneWithTelemetry[]> {
  const existingRequest = browserFallbackRequests.get(scenario);
  if (existingRequest) return existingRequest;

  const request = Promise.allSettled(
    MONITORING_ZONES.map(async (zone) => {
      const weather = await fetchZoneWeather(zone, scenario);
      return { ...zone, weather, assessment: calculateZoneRisk(zone, weather) };
    })
  ).then((results) =>
    results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
  );
  browserFallbackRequests.set(scenario, request);
  const clearRequest = () => {
    if (browserFallbackRequests.get(scenario) === request) {
      browserFallbackRequests.delete(scenario);
    }
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

export default function App() {
  const [currentView, setCurrentView] = useState<'LANDING' | 'DASHBOARD' | 'SIMULATION' | 'ALERTS'>('LANDING');
  const [zones, setZones] = useState<ZoneWithTelemetry[]>([]);
  const [selectedZone, setSelectedZone] = useState<ZoneWithTelemetry | null>(null);
  const [alerts, setAlerts] = useState<EarlyWarningAlert[]>([]);
  const acknowledgedAlertIdsRef = useRef<Set<string>>(new Set());
  const [scenario, setScenario] = useState<SimulationScenario>('LIVE');
  const [sandboxInputs, setSandboxInputs] = useState<SandboxInputs>(DEFAULT_SANDBOX_INPUTS);
  const [simulationZoneId, setSimulationZoneId] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLiveApi, setIsLiveApi] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [countdownSeconds, setCountdownSeconds] = useState<number>(60);
  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState<boolean>(true);

  const [filterHazard, setFilterHazard] = useState<'ALL' | 'HIGH_SEVERE' | 'LANDSLIDE' | 'FLOOD'>('ALL');

  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isAlertsDrawerOpen, setIsAlertsDrawerOpen] = useState(false);

  const [isCheckAreaOpen, setIsCheckAreaOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [userWeather, setUserWeather] = useState<WeatherRainfallData | null>(null);
  const [isLoadingUserWeather, setIsLoadingUserWeather] = useState<boolean>(false);
  const [hlsScreen, setHlsScreen] = useState<HLSInundationScreenResponse | null>(null);
  const [hlsScreenMessage, setHlsScreenMessage] = useState<string | null>(null);
  const [nearestZone, setNearestZone] = useState<ZoneWithTelemetry | null>(null);
  const [distanceToNearestKm, setDistanceToNearestKm] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [mobileTab, setMobileTab] = useState<'MAP' | 'LIST' | 'DETAIL'>('MAP');
  const [isSectorListVisible, setIsSectorListVisible] = useState(true);
  const [isZoneDetailsVisible, setIsZoneDetailsVisible] = useState(true);

  const loadLocationWeatherAndModel = (lat: number, lng: number, label: string) => {
    setIsLoadingUserWeather(true);
    setUserWeather(null);
    setHlsScreen(null);
    setHlsScreenMessage(null);

    void fetchHLSInundationScreen(lat, lng)
      .then((result) => {
        setHlsScreen(result);
        setUserWeather(result.weather);
      })
      .catch(async (modelError: unknown) => {
        const message = modelError instanceof Error ? modelError.message : '';
        setHlsScreenMessage(
          message.toLowerCase().includes('guwahati grid')
            ? 'The HLS model currently covers Guwahati only. Local weather is shown without a model estimate.'
            : 'The model estimate is unavailable. Local weather is shown without it.'
        );
        try {
          setUserWeather(await fetchLivePointWeather(lat, lng, label));
        } catch (weatherError) {
          console.warn('Could not fetch local weather:', weatherError);
        }
      })
      .finally(() => setIsLoadingUserWeather(false));
  };

  const loadData = useCallback(async (scenarioMode: SimulationScenario = 'LIVE') => {
    setIsRefreshing(true);
    try {
      const backendPayload = await fetchBackendDashboard(scenarioMode);
      setIsLiveApi(scenarioMode === 'LIVE' && backendPayload.zones.some((zone) => zone.weather.isLive));
      setZones(backendPayload.zones);
      setAlerts(backendPayload.alerts.filter((alert) => !acknowledgedAlertIdsRef.current.has(alert.id)));
      setLastSyncTime(new Date(backendPayload.generatedAt).toLocaleTimeString());
      setCountdownSeconds(60);
      setSelectedZone((prev) => {
        if (!prev) return backendPayload.zones[0] || null;
        return backendPayload.zones.find((zone) => zone.id === prev.id) || backendPayload.zones[0] || null;
      });
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    } catch (backendError) {
      if (!browserFallbackRequests.has(scenarioMode)) {
        console.warn('JALRAKSHAK backend unavailable; using browser fallback:', backendError);
      }
    }

    try {
      const results = await fetchBrowserFallbackZones(scenarioMode);

      const hasLive = results.some((r) => r.weather.isLive);
      setIsLiveApi(scenarioMode === 'LIVE' && hasLive);

      const generatedAlerts: EarlyWarningAlert[] = [];
      results.forEach((z) => {
        const alert = generateZoneAlert(z, z.assessment);
        if (alert) generatedAlerts.push(alert);
      });

      results.sort((a, b) => b.assessment.compositeScore - a.assessment.compositeScore);

      setZones(results);
      setAlerts(generatedAlerts.filter((alert) => !acknowledgedAlertIdsRef.current.has(alert.id)));
      setLastSyncTime(new Date().toLocaleTimeString());
      setCountdownSeconds(60);

      setSelectedZone((prev) => {
        if (!prev) return results[0] || null;
        const matching = results.find((r) => r.id === prev.id);
        return matching || results[0] || null;
      });
    } catch (err) {
      console.error('Failed to load telemetry:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(scenario);
  }, [loadData, scenario]);

  useEffect(() => {
    if (scenario !== 'LIVE' || !isAutoRefreshActive) return;

    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          loadData('LIVE');
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [scenario, isAutoRefreshActive, loadData]);

  const handleScenarioChange = (newScenario: SimulationScenario) => {
    setScenario(newScenario);
  };

  const handleCheckMyArea = () => {
    setGeoError(null);
    setIsLocating(true);

    if (!navigator.geolocation) {
      const fallback = zones[0] || MONITORING_ZONES[0];
      setNearestZone(fallback);
      setDistanceToNearestKm(null);
      setUserCoords(null);
      setGeoError('Geolocation is not supported by your browser environment. Displaying nearest regional sector.');
      setIsLocating(false);
      setIsCheckAreaOpen(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const rawLat = position?.coords?.latitude;
        const rawLng = position?.coords?.longitude;
        const lat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat));
        const lng = typeof rawLng === 'number' ? rawLng : parseFloat(String(rawLng));

        if (
          isNaN(lat) ||
          isNaN(lng) ||
          !isFinite(lat) ||
          !isFinite(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          const fallback = zones[0] || MONITORING_ZONES[0];
          setNearestZone(fallback);
          setDistanceToNearestKm(null);
          setUserCoords(null);
          setGeoError('GPS signal lacked valid numerical coordinates. Showing proximity to active sector.');
          setIsLocating(false);
          setIsCheckAreaOpen(true);
          return;
        }

        setUserCoords({ lat, lng });

        let minDistance = Infinity;
        let closest: ZoneWithTelemetry | null = null;

        zones.forEach((z) => {
          if (Array.isArray(z.center) && typeof z.center[0] === 'number') {
            const dist = calculateDistanceKm(lat, lng, z.center[0], z.center[1]);
            if (dist < minDistance) {
              minDistance = dist;
              closest = z;
            }
          }
        });

        const activeNearest = closest || zones[0] || null;
        setNearestZone(activeNearest);
        setDistanceToNearestKm(minDistance === Infinity ? null : minDistance);
        setIsLocating(false);
        setIsCheckAreaOpen(true);

        loadLocationWeatherAndModel(lat, lng, 'User Location');

        if (activeNearest) {
          setSelectedZone(activeNearest);
        }
      },
      (err) => {
        console.warn('Geolocation failed:', err.message);
        void fetchNetworkLocation()
          .then((networkLocation) => {
            if (!networkLocation) throw new Error('Network location unavailable');

            setUserCoords(networkLocation);
            let minDistance = Infinity;
            let closest: ZoneWithTelemetry | null = null;
            zones.forEach((z) => {
              if (Array.isArray(z.center) && typeof z.center[0] === 'number') {
                const distance = calculateDistanceKm(
                  networkLocation.lat,
                  networkLocation.lng,
                  z.center[0],
                  z.center[1]
                );
                if (distance < minDistance) {
                  minDistance = distance;
                  closest = z;
                }
              }
            });
            const activeNearest = closest || zones[0] || null;
            setNearestZone(activeNearest);
            setDistanceToNearestKm(minDistance === Infinity ? null : minDistance);
            setSelectedZone(activeNearest);
            setIsLocating(false);
            setIsCheckAreaOpen(true);

            loadLocationWeatherAndModel(networkLocation.lat, networkLocation.lng, 'Network Location');
          })
          .catch(() => {
            const fallback = zones[0] || MONITORING_ZONES[0];
            setNearestZone(fallback);
            setDistanceToNearestKm(null);
            setUserCoords(null);
            setSelectedZone(fallback);
            setGeoError(
              'Browser and network location services were unavailable. Showing the nearest monitored sector without claiming a user position.'
            );
            setIsLocating(false);
            setIsCheckAreaOpen(true);
          });
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  };

  const handleSelectZoneById = (zoneId: string) => {
    const found = zones.find((z) => z.id === zoneId);
    if (found) {
      setSelectedZone(found);
      setCurrentView('DASHBOARD');
      setMobileTab('DETAIL');
    }
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    acknowledgedAlertIdsRef.current.add(alertId);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const simulationTarget = zones.find((zone) => zone.id === simulationZoneId) || selectedZone || zones[0] || null;
  const simulationZones = zones.map((zone) =>
    simulationTarget?.id === zone.id ? applySandboxInputs(zone, sandboxInputs) : zone
  );
  const simulatedSelectedZone = simulationTarget
    ? simulationZones.find((zone) => zone.id === simulationTarget.id) || null
    : null;
  const generatedSimulationAlert = simulatedSelectedZone
    ? generateZoneAlert(simulatedSelectedZone, simulatedSelectedZone.assessment)
    : null;
  const simulationAlerts = generatedSimulationAlert
    ? [{ ...generatedSimulationAlert, id: `simulation-${simulatedSelectedZone?.id}`, timestamp: 'Simulation preview' }]
    : [];

  return (
    <div className="flex flex-col h-screen max-h-screen w-full overflow-hidden bg-[#f2f6fb] text-[#193653] font-sans selection:bg-sky-100 selection:text-sky-950">
      {/* Top Header */}
      <TopNav
        currentView={currentView}
        onViewChange={setCurrentView}
        alertCount={alerts.length}
        simulationAlertCount={simulationAlerts.length}
        onOpenAlerts={() => setIsAlertsDrawerOpen(true)}
        onCheckMyArea={handleCheckMyArea}
        isLocating={isLocating}
        onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
        simulationScenario={scenario}
        onScenarioChange={handleScenarioChange}
        onRefreshData={() => loadData(scenario)}
        isRefreshing={isRefreshing}
        isLiveApi={isLiveApi}
        lastSyncTime={lastSyncTime}
        countdownSeconds={countdownSeconds}
        isAutoRefreshActive={isAutoRefreshActive}
        onToggleAutoRefresh={() => setIsAutoRefreshActive((prev) => !prev)}
      />

      {currentView === 'LANDING' ? (
        <div className="flex-1 overflow-y-auto min-h-0">
          <LandingPage
            zones={zones}
            alerts={alerts}
            onLaunchConsole={() => setCurrentView('DASHBOARD')}
            onSelectZone={(zone) => {
              setSelectedZone(zone);
              setCurrentView('DASHBOARD');
              setMobileTab('DETAIL');
            }}
            onCheckMyArea={handleCheckMyArea}
            onOpenAlertDelivery={() => setCurrentView('ALERTS')}
            onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
            onOpenAlerts={() => setIsAlertsDrawerOpen(true)}
            isLiveApi={isLiveApi}
            lastSyncTime={lastSyncTime}
            simulationScenario={scenario}
            isLoading={isLoading}
          />
        </div>
      ) : isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <RefreshCw className="mb-3 h-8 w-8 animate-spin text-orange-600" />
          <h2 className="text-base font-bold text-stone-900">Initializing Hydrological Telemetry...</h2>
          <p className="mt-1 max-w-sm text-xs text-stone-700">Fetching rainfall and watershed data for the selected view.</p>
        </div>
      ) : currentView === 'SIMULATION' ? (
        <SimulationWorkspace
          zones={simulationZones}
          selectedZone={simulatedSelectedZone}
          onSelectZone={(zone) => {
            setSimulationZoneId(zone.id);
            setSelectedZone(zones.find((item) => item.id === zone.id) || zone);
          }}
          inputs={sandboxInputs}
          onInputsChange={setSandboxInputs}
          onReset={() => setSandboxInputs(DEFAULT_SANDBOX_INPUTS)}
        />
      ) : currentView === 'ALERTS' ? (
        <AlertsWorkspace
          alerts={alerts}
          simulationAlerts={simulationAlerts}
          onOpenSimulation={() => setCurrentView('SIMULATION')}
        />
      ) : (
        <>
          {/* Threshold Violations Alert Banner */}
          <AlertBanner
            alerts={alerts}
            onSelectZoneById={handleSelectZoneById}
            onOpenAlertDelivery={() => setCurrentView('ALERTS')}
          />

          {/* Main Content Area */}
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mb-3" />
              <h2 className="text-base font-bold text-stone-900">
                Initializing Hydrological Telemetry...
              </h2>
              <p className="text-xs text-stone-700 mt-1 max-w-sm">
                Fetching live rainfall matrices from Open-Meteo across watershed observation stations and evaluating slope shear indices.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Mobile Tab Switcher */}
              <div className="lg:hidden flex items-center justify-around border-b border-stone-200/80 bg-white/80 backdrop-blur-md px-2 py-2 text-xs font-semibold text-stone-700 shadow-2xs">
                <button
                  onClick={() => setMobileTab('MAP')}
                  className={`tactile-btn flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition cursor-pointer ${mobileTab === 'MAP'
                    ? 'bg-stone-900 text-white font-bold shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100'
                    }`}
                >
                  <Map className="w-3.5 h-3.5 text-orange-500" />
                  <span>Map View</span>
                </button>
                <button
                  onClick={() => setMobileTab('LIST')}
                  className={`tactile-btn flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition cursor-pointer ${mobileTab === 'LIST'
                    ? 'bg-stone-900 text-white font-bold shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100'
                    }`}
                >
                  <ListFilter className="w-3.5 h-3.5 text-orange-500" />
                  <span>Sectors ({zones.length})</span>
                </button>
                <button
                  onClick={() => setMobileTab('DETAIL')}
                  className={`tactile-btn flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition cursor-pointer ${mobileTab === 'DETAIL'
                    ? 'bg-stone-900 text-white font-bold shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100'
                    }`}
                >
                  <Activity className="w-3.5 h-3.5 text-orange-500" />
                  <span>Sector Analysis</span>
                </button>
              </div>

              {/* Desktop 3-Column Layout / Mobile Single Tab */}
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative min-h-0">
                {/* Left Column: Sectors List */}
                <div
                  className={`h-full ${mobileTab === 'LIST' ? 'flex flex-1 w-full min-h-0' : 'hidden'} ${isSectorListVisible ? 'lg:flex lg:flex-none lg:w-80 xl:w-96' : 'lg:hidden'}`}
                >
                  <SidebarZoneList
                    zones={zones}
                    selectedZone={selectedZone}
                    onCollapse={() => setIsSectorListVisible(false)}
                    onSelectZone={(z) => {
                      setSelectedZone(z);
                      setMobileTab('DETAIL');
                    }}
                  />
                </div>

                {/* Center Column: Interactive Hero Map */}
                <main
                  className={`h-full flex-1 relative min-h-0 ${mobileTab === 'LIST' ? 'hidden' : 'flex w-full min-h-[400px]'} lg:flex lg:min-h-0`}
                >
                  <InteractiveMap
                    zones={zones}
                    selectedZone={selectedZone}
                    onSelectZone={(z) => {
                      setSelectedZone(z);
                      setMobileTab('DETAIL');
                    }}
                    userLocation={userCoords}
                    filterHazard={filterHazard}
                    onFilterChange={setFilterHazard}
                    onGoHome={() => setCurrentView('LANDING')}
                    onScanLocation={handleCheckMyArea}
                    isLocating={isLocating}
                    isSectorListVisible={isSectorListVisible}
                    isZoneDetailsVisible={isZoneDetailsVisible}
                    onToggleSectorList={() => setIsSectorListVisible((visible) => !visible)}
                    onToggleZoneDetails={() => {
                      const visible = !isZoneDetailsVisible;
                      setIsZoneDetailsVisible(visible);
                      setMobileTab(visible ? 'DETAIL' : 'MAP');
                    }}
                  />
                </main>

                {/* Right Column: Selected Sector Deep Telemetry & Recharts */}
                <div
                  className={`h-full ${mobileTab === 'DETAIL' && isZoneDetailsVisible ? 'absolute inset-x-0 bottom-0 z-20 h-[68%] w-full shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[min(45vw,24rem)]' : 'hidden'} ${isZoneDetailsVisible ? 'lg:relative lg:inset-auto lg:z-auto lg:flex lg:h-full lg:w-auto lg:flex-none lg:shadow-none' : 'lg:hidden'}`}
                >
                  {selectedZone ? (
                    <ZoneDetailPanel
                      zone={selectedZone}
                      onClose={() => {
                        setIsZoneDetailsVisible(false);
                        setMobileTab('MAP');
                      }}
                      onOpenAlertDelivery={() => setCurrentView('ALERTS')}
                      onOpenHowItWorks={() => setIsHowItWorksOpen(true)}
                    />
                  ) : (
                    <div className="w-80 xl:w-96 bg-stone-50/80 backdrop-blur-md border-l border-stone-200/80 p-8 flex flex-col items-center justify-center text-stone-500 text-xs text-center font-medium gap-2">
                      <div className="w-10 h-10 rounded-2xl glass-card border border-stone-200/80 flex items-center justify-center text-stone-400 shadow-2xs">
                        <Activity className="w-5 h-5" />
                      </div>
                      <p className="max-w-[200px]">
                        Select a watershed on the map or from the sector directory to inspect live telemetry.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals & Dialogs */}
      <HowItWorksModal
        isOpen={isHowItWorksOpen}
        onClose={() => setIsHowItWorksOpen(false)}
        inputs={sandboxInputs}
        onInputsChange={setSandboxInputs}
        riverFlowThresholdM3s={
          simulationTarget?.weather.riverDischarge?.highFlowThresholdM3s
          ?? selectedZone?.weather.riverDischarge?.highFlowThresholdM3s
          ?? null
        }
      />

      <CheckAreaModal
        isOpen={isCheckAreaOpen}
        onClose={() => setIsCheckAreaOpen(false)}
        userCoords={userCoords}
        nearestZone={nearestZone}
        distanceKm={distanceToNearestKm}
        userWeather={userWeather}
        isLoadingWeather={isLoadingUserWeather}
        hlsScreen={hlsScreen}
        hlsScreenMessage={hlsScreenMessage}
        onFocusZone={(z) => {
          setSelectedZone(z);
          setCurrentView('DASHBOARD');
          setMobileTab('MAP');
        }}
        onFocusMap={() => {
          setCurrentView('DASHBOARD');
          setMobileTab('MAP');
        }}
        errorMsg={geoError}
        onRetry={handleCheckMyArea}
      />

      <AlertsDrawerModal
        isOpen={isAlertsDrawerOpen}
        onClose={() => setIsAlertsDrawerOpen(false)}
        alerts={alerts}
        simulationAlerts={simulationAlerts}
        onSelectZoneById={handleSelectZoneById}
        onAcknowledgeAlert={handleAcknowledgeAlert}
      />
    </div>
  );
}
