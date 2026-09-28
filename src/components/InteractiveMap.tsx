import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import { ZoneWithTelemetry, RiskLevel } from '../types';
import { RISK_PALETTE } from '../utils/riskEngine';
import {
  Mountain,
  Waves,
  MapPin,
  ZoomIn,
  ZoomOut,
  Compass,
  Layers,
  Globe,
  Eye,
  X,
  Map as MapIcon,
  Flame,
  Home,
  LocateFixed,
  PanelLeftOpen,
  PanelRightOpen,
} from 'lucide-react';

export type BaseLayerType = 'light' | 'terrain' | 'satellite';

interface LayerOption {
  id: BaseLayerType;
  label: string;
  provider: string;
  description: string;
  url: string;
  attribution: string;
  subdomains?: string;
  maxZoom: number;
}

const BASE_LAYERS: Record<BaseLayerType, LayerOption> = {
  light: {
    id: 'light',
    label: 'OpenStreetMap Light',
    provider: 'OpenStreetMap',
    description: 'Standard OpenStreetMap cartography with road network and river outlines',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
  },
  terrain: {
    id: 'terrain',
    label: 'Terrain Elevation',
    provider: 'OpenTopoMap / SRTM',
    description: 'Topographic contour elevation lines, mountain hillshades & river gorges',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>, SRTM | Style: &copy; <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a>',
    subdomains: 'abc',
    maxZoom: 17,
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite Imagery',
    provider: 'Esri World Imagery',
    description: 'High-resolution true-color orbital imagery of riverbeds and terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a> &mdash; USGS, USDA, GeoEye, Earthstar Geographics',
    subdomains: '',
    maxZoom: 18,
  },
};

const LABELS_OVERLAY_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

interface InteractiveMapProps {
  zones: ZoneWithTelemetry[];
  selectedZone: ZoneWithTelemetry | null;
  onSelectZone: (zone: ZoneWithTelemetry) => void;
  userLocation: { lat: number; lng: number } | null;
  filterHazard: 'ALL' | 'HIGH_SEVERE' | 'LANDSLIDE' | 'FLOOD';
  onFilterChange: (filter: 'ALL' | 'HIGH_SEVERE' | 'LANDSLIDE' | 'FLOOD') => void;
  onGoHome?: () => void;
  onScanLocation?: () => void;
  isLocating?: boolean;
  simulationMode?: boolean;
  isSectorListVisible?: boolean;
  isZoneDetailsVisible?: boolean;
  onToggleSectorList?: () => void;
  onToggleZoneDetails?: () => void;
}

// Coordinate safety validators to avoid Leaflet "Invalid LatLng object: (NaN, NaN)"
function isValidCoord(val: unknown): val is number {
  return typeof val === 'number' && !isNaN(val) && isFinite(val);
}

function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    isValidCoord(lat) &&
    isValidCoord(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  zones,
  selectedZone,
  onSelectZone,
  userLocation,
  filterHazard,
  onFilterChange,
  onGoHome,
  onScanLocation,
  isLocating = false,
  simulationMode = false,
  isSectorListVisible = true,
  isZoneDetailsVisible = true,
  onToggleSectorList,
  onToggleZoneDetails,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const labelsTileLayerRef = useRef<L.TileLayer | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const layerMenuRef = useRef<HTMLDivElement>(null);

  const [baseLayer, setBaseLayer] = useState<BaseLayerType>('light');
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState<boolean>(false);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (layerMenuRef.current && !layerMenuRef.current.contains(event.target as Node)) {
        setIsLayerMenuOpen(false);
      }
    }
    if (isLayerMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLayerMenuOpen]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) return;

    // Clear any stale Leaflet id from container in React Strict Mode
    if ((mapContainerRef.current as unknown as { _leaflet_id?: number })._leaflet_id) {
      delete (mapContainerRef.current as unknown as { _leaflet_id?: number })._leaflet_id;
    }

    const initialCenter: [number, number] = [26.2, 92.9];
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 7,
      zoomControl: false,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 18,
    });

    const layerMeta = BASE_LAYERS[baseLayer];
    const initialBaseLayer = L.tileLayer(layerMeta.url, {
      attribution: layerMeta.attribution,
      subdomains: layerMeta.subdomains || 'abc',
      maxZoom: layerMeta.maxZoom,
    });
    initialBaseLayer.addTo(map);
    baseTileLayerRef.current = initialBaseLayer;

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    const t1 = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const t2 = setTimeout(() => {
      map.invalidateSize();
    }, 500);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (mapContainerRef.current) {
        delete (mapContainerRef.current as unknown as { _leaflet_id?: number })._leaflet_id;
      }
      baseTileLayerRef.current = null;
      labelsTileLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const layerMeta = BASE_LAYERS[baseLayer];

    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
      baseTileLayerRef.current = null;
    }

    const newBaseLayer = L.tileLayer(layerMeta.url, {
      attribution: layerMeta.attribution,
      subdomains: layerMeta.subdomains || 'abc',
      maxZoom: layerMeta.maxZoom,
    });
    newBaseLayer.addTo(map);
    baseTileLayerRef.current = newBaseLayer;

    if (labelsTileLayerRef.current) {
      map.removeLayer(labelsTileLayerRef.current);
      labelsTileLayerRef.current = null;
    }

    if (showLabels && baseLayer === 'satellite') {
      const labelsLayer = L.tileLayer(LABELS_OVERLAY_URL, {
        attribution: 'Labels &copy; Esri',
        maxZoom: 18,
      });
      labelsLayer.addTo(map);
      labelsTileLayerRef.current = labelsLayer;
    }
  }, [baseLayer, showLabels]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (heatLayerRef.current) {
      try {
        map.removeLayer(heatLayerRef.current);
      } catch (e) {
        console.warn('Could not remove previous heat layer', e);
      }
      heatLayerRef.current = null;
    }

    if (!showHeatmap) return;

    const activeZones = zones.filter((z) => {
      if (filterHazard === 'HIGH_SEVERE') {
        return z.assessment.overallLevel === 'High' || z.assessment.overallLevel === 'Severe';
      }
      if (filterHazard === 'LANDSLIDE') {
        return z.assessment.landslideScore >= 50;
      }
      if (filterHazard === 'FLOOD') {
        return z.assessment.floodScore >= 50;
      }
      return true;
    });

    // Leaflet heat points use [latitude, longitude, intensity].
    const heatPoints: [number, number, number][] = [];

    activeZones.forEach((zone) => {
      let score = zone.assessment.compositeScore;
      if (filterHazard === 'FLOOD') {
        score = zone.assessment.floodScore;
      } else if (filterHazard === 'LANDSLIDE') {
        score = zone.assessment.landslideScore;
      }

      const intensity = Math.max(0.15, Math.min(1.0, score / 100));

      if (
        Array.isArray(zone.center) &&
        zone.center.length >= 2 &&
        isValidLatLng(zone.center[0], zone.center[1])
      ) {
        const [cLat, cLng] = zone.center;
        heatPoints.push([cLat, cLng, intensity]);
        heatPoints.push([cLat, cLng, intensity * 0.95]);

        if (Array.isArray(zone.polygon)) {
          zone.polygon.forEach((pt) => {
            if (Array.isArray(pt) && pt.length >= 2 && isValidLatLng(pt[0], pt[1])) {
              const [pLat, pLng] = pt;
              heatPoints.push([pLat, pLng, intensity * 0.6]);

              const midLat = (cLat + pLat) / 2;
              const midLng = (cLng + pLng) / 2;
              heatPoints.push([midLat, midLng, intensity * 0.8]);

              const qLat = cLat * 0.7 + pLat * 0.3;
              const qLng = cLng * 0.7 + pLng * 0.3;
              heatPoints.push([qLat, qLng, intensity * 0.9]);
            }
          });
        }
      }
    });

    if (heatPoints.length === 0) return;

    try {
      if (typeof (L as unknown as { heatLayer?: (pts: unknown[], opts: unknown) => L.HeatLayer }).heatLayer === 'function') {
        const isSatellite = baseLayer === 'satellite';
        const heat = (L as unknown as { heatLayer: (pts: unknown[], opts: unknown) => L.HeatLayer }).heatLayer(
          heatPoints,
          {
            radius: isSatellite ? 45 : 38,
            blur: isSatellite ? 35 : 26,
            maxZoom: 14,
            max: 1.0,
            minOpacity: isSatellite ? 0.45 : 0.35,
            gradient: {
              0.15: '#fef08a', // Pale amber (low risk)
              0.35: '#facc15', // Warm gold
              0.55: '#fb923c', // Orange (moderate risk)
              0.75: '#ea580c', // Dark orange (high risk)
              0.88: '#dc2626', // Deep red-orange (severe risk)
              1.00: '#7f1d1d', // Crimson / Peak hazard
            },
          }
        );

        heat.addTo(map);
        heatLayerRef.current = heat;
      }
    } catch (err) {
      console.warn('Could not initialize Leaflet HeatLayer', err);
    }

    return () => {
      if (heatLayerRef.current && map) {
        try {
          map.removeLayer(heatLayerRef.current);
        } catch (e) {
          // ignore cleanup errors
        }
        heatLayerRef.current = null;
      }
    };
  }, [showHeatmap, zones, filterHazard, baseLayer]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const filteredZones = zones.filter((z) => {
      if (filterHazard === 'HIGH_SEVERE') {
        return z.assessment.overallLevel === 'High' || z.assessment.overallLevel === 'Severe';
      }
      if (filterHazard === 'LANDSLIDE') {
        return z.assessment.landslideScore >= 50;
      }
      if (filterHazard === 'FLOOD') {
        return z.assessment.floodScore >= 50;
      }
      return true;
    });

    const isSatellite = baseLayer === 'satellite';

    filteredZones.forEach((zone) => {
      const isSelected = selectedZone?.id === zone.id;
      const palette = RISK_PALETTE[zone.assessment.overallLevel];

      const validPolygon = Array.isArray(zone.polygon)
        ? (zone.polygon.filter(
          (pt) => Array.isArray(pt) && pt.length >= 2 && isValidLatLng(pt[0], pt[1])
        ) as [number, number][])
        : [];

      if (validPolygon.length >= 3) {
        try {
          const polygon = L.polygon(validPolygon, {
            color: isSatellite ? (isSelected ? '#F97316' : '#FFFFFF') : palette.mapStroke,
            weight: isSelected ? 3.5 : (isSatellite ? 2.2 : 1.5),
            opacity: isSelected ? 1 : (isSatellite ? 0.95 : 0.8),
            fillColor: palette.mapFill,
            fillOpacity: isSelected
              ? 0.6
              : showHeatmap
                ? 0.12
                : isSatellite
                  ? 0.45
                  : 0.35,
            dashArray: isSelected ? undefined : '4, 4',
          });

          polygon.on('click', () => {
            onSelectZone(zone);
          });

          polygon.addTo(layerGroup);
        } catch (e) {
          console.warn('Could not render polygon for zone', zone.id, e);
        }
      }

      if (
        !Array.isArray(zone.center) ||
        zone.center.length < 2 ||
        !isValidLatLng(zone.center[0], zone.center[1])
      ) {
        return;
      }

      const isSevere = zone.assessment.overallLevel === 'Severe';
      const isHigh = zone.assessment.overallLevel === 'High';
      const isWarmAlert = isHigh || isSevere;

      const showMarkerLabel = isSelected || isWarmAlert;
      const markerHtml = showMarkerLabel
        ? `
          <div class="relative cursor-pointer group select-none">
            ${isWarmAlert ? `<div class="absolute -inset-2 rounded-full ${isSevere ? 'bg-red-600/25 animate-ping' : 'bg-orange-500/20'}"></div>` : ''}
            <div class="relative flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-sm border ${isSelected
              ? 'bg-[#193653] text-white border-cyan-400 ring-2 ring-cyan-500/30'
              : `${palette.badgeBg} ${palette.badgeText} ${palette.badgeBorder}`
            }">
              <span class="w-2 h-2 rounded-full ${palette.dotColor} shrink-0"></span>
              <span class="text-xs font-semibold whitespace-nowrap">${zone.name.split('-')[0].trim()}</span>
              <span class="text-[10px] font-mono opacity-80 pl-1 border-l border-current/20">${zone.assessment.overallLevel}</span>
            </div>
          </div>
        `
        : `<div class="h-3.5 w-3.5 rounded-full border-2 border-white ${palette.dotColor} shadow-[0_1px_5px_rgba(15,23,42,0.45)]"></div>`;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-leaflet-marker',
        iconSize: showMarkerLabel ? [148, 30] : [20, 20],
        iconAnchor: showMarkerLabel ? [74, 15] : [10, 10],
      });

      try {
        const marker = L.marker(zone.center as [number, number], { icon: customIcon })
          .bindTooltip(`${zone.name} · ${zone.assessment.overallLevel} risk`, { direction: 'top', offset: [0, -8] });

        const popupHtml = `
          <div class="p-3.5 max-w-[280px] font-sans text-stone-900">
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-[11px] font-medium tracking-wide uppercase text-stone-700">${zone.region}</span>
              <span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${palette.badgeBg} ${palette.badgeText} ${palette.badgeBorder}">
                ${zone.assessment.overallLevel} Risk
              </span>
            </div>
            <h4 class="text-sm font-bold text-stone-900 mb-1 leading-snug">${zone.name}</h4>
            <p class="text-xs text-stone-700 mb-3">${palette.description}</p>
            
            <div class="grid grid-cols-2 gap-2 p-2 mb-3 bg-stone-50 rounded border border-stone-200 text-xs">
              <div>
                <span class="text-stone-700 block text-[10px] uppercase font-semibold">${simulationMode && isSelected ? 'Scenario now' : 'Rain now'}</span>
                <span class="font-bold text-stone-900">${zone.weather.currentRateMmPerHour.toFixed(1)} mm/h</span>
              </div>
              <div>
                <span class="text-stone-700 block text-[10px] uppercase font-semibold">Past 24h</span>
                <span class="font-bold text-stone-900">${zone.weather.last24hMm.toFixed(1)} mm</span>
              </div>
              <div>
                <span class="text-stone-700 block text-[10px] uppercase font-semibold">Next 24h</span>
                <span class="font-bold text-stone-900">${zone.weather.forecastNext24hMm.toFixed(1)} mm</span>
              </div>
              <div>
                <span class="text-stone-700 block text-[10px] uppercase font-semibold">Landslide · LSI</span>
                <span class="font-bold ${zone.assessment.landslideScore >= 60 ? 'text-orange-700' : 'text-stone-800'}">
                  ${zone.assessment.landslideScore}/100
                </span>
              </div>
              <div>
                <span class="text-stone-700 block text-[10px] uppercase font-semibold">Flash flood · FFI</span>
                <span class="font-bold ${zone.assessment.floodScore >= 60 ? 'text-orange-700' : 'text-stone-800'}">
                  ${zone.assessment.floodScore}/100
                </span>
              </div>
              <div class="col-span-2 border-t border-stone-200 pt-2">
                <span class="text-stone-700 block text-[10px] uppercase font-semibold">XGBoost flood-risk estimate</span>
                <span class="font-bold text-cyan-800">
                  ${zone.fusion?.floodRiskModel ? `${zone.fusion.floodRiskModel.riskPercent.toFixed(1)}%` : 'Not available'}
                </span>
              </div>
            </div>

            <button id="btn-popup-${zone.id}" class="w-full py-1.5 px-3 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded transition flex items-center justify-center gap-1.5 focus:ring-2 focus:ring-orange-500 focus:outline-none">
              Inspect Full Telemetry &rarr;
            </button>
          </div>
        `;

        marker.bindPopup(popupHtml, {
          className: 'custom-leaflet-popup',
          closeButton: true,
        });

        marker.on('popupopen', () => {
          const btn = document.getElementById(`btn-popup-${zone.id}`);
          if (btn) {
            btn.onclick = () => {
              onSelectZone(zone);
              map.closePopup();
            };
          }
        });

        marker.on('click', () => {
          onSelectZone(zone);
        });

        marker.addTo(layerGroup);
      } catch (e) {
        console.warn('Could not place marker for zone', zone.id, e);
      }
    });
  }, [zones, selectedZone, filterHazard, onSelectZone, baseLayer, showHeatmap]);

  const selectedZoneId = selectedZone?.id;

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedZone) return;

    if (
      Array.isArray(selectedZone.center) &&
      selectedZone.center.length >= 2 &&
      isValidLatLng(selectedZone.center[0], selectedZone.center[1])
    ) {
      try {
        map.flyTo(selectedZone.center as [number, number], 11, {
          animate: true,
          duration: 1.2,
        });
      } catch (e) {
        console.warn('Map flyTo failed:', e);
      }
    }
  }, [selectedZoneId]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (
      userLocation &&
      isValidLatLng(userLocation.lat, userLocation.lng)
    ) {
      try {
        const userIcon = L.divIcon({
          html: `
            <div class="relative flex items-center justify-center">
              <span class="animate-ping absolute w-6 h-6 rounded-full bg-orange-600/40"></span>
              <span class="relative w-4 h-4 rounded-full bg-orange-600 border-2 border-white shadow-md"></span>
            </div>
          `,
          className: 'user-loc-icon',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
          .bindPopup(
            `<div class="p-2 text-xs font-sans">
              <strong class="text-orange-700 block mb-0.5">Your Position</strong>
              <span>${userLocation.lat.toFixed(4)}°, ${userLocation.lng.toFixed(4)}°</span>
            </div>`
          )
          .addTo(map);

        userMarkerRef.current = marker;
        map.flyTo([userLocation.lat, userLocation.lng], 10, { animate: true, duration: 1.4 });
      } catch (e) {
        console.warn('User marker placement failed:', e);
      }
    }
  }, [userLocation]);

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleResetBounds = () => {
    const map = mapInstanceRef.current;
    if (!map || !Array.isArray(zones) || zones.length === 0) return;

    const validCenters = zones
      .map((z) => z.center)
      .filter(
        (c) => Array.isArray(c) && c.length >= 2 && isValidLatLng(c[0], c[1])
      ) as [number, number][];

    if (validCenters.length > 0) {
      try {
        const bounds = L.latLngBounds(validCenters);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
      } catch (e) {
        console.warn('Reset bounds failed:', e);
      }
    }
  };


  return (
    <div
      id="interactive-map-wrapper"
      className="relative h-full min-h-[480px] w-full flex-1 overflow-hidden bg-stone-100"
    >
      {/* Map DOM Canvas */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0 h-full w-full" style={{ minHeight: '480px' }} />

      {/* ── Back to Home  &  My Location  ─ floating action row ── */}
      {(onGoHome || onScanLocation) && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          {/* Back to Homepage */}
          {onGoHome && (
            <button
              id="btn-map-go-home"
              onClick={onGoHome}
              title="Back to HydroShield homepage"
              className="group flex items-center gap-2 px-3 py-2 rounded-xl
                bg-stone-900/90 hover:bg-stone-950
                text-white text-xs font-bold
                border border-white/10 shadow-lg
                transition-all duration-200
                hover:shadow-orange-500/20 hover:shadow-xl
                cursor-pointer backdrop-blur-sm"
            >
              <Home className="w-3.5 h-3.5 text-orange-400 group-hover:text-orange-300 transition-colors" />
              <span className="hidden sm:inline">Back to Home</span>
              <span className="sm:hidden">Home</span>
            </button>
          )}

          {/* My Location */}
          {onScanLocation && (
            <button
              id="btn-map-my-location"
              onClick={onScanLocation}
              disabled={isLocating}
              title="Detect your GPS position & find the nearest hazard zone"
              className={`group flex items-center gap-2 px-3 py-2 rounded-xl
                text-xs font-bold border shadow-lg
                transition-all duration-200 cursor-pointer backdrop-blur-sm
                ${isLocating
                  ? 'bg-orange-600/90 border-orange-400/40 text-white cursor-not-allowed shadow-orange-500/30'
                  : 'bg-white/90 hover:bg-white border-white/60 text-stone-800 hover:shadow-orange-500/20 hover:shadow-xl'
                }`}
            >
              {/* Pulsing ring while scanning */}
              <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                {isLocating && (
                  <span className="absolute inline-flex w-full h-full rounded-full bg-orange-400 opacity-60 animate-ping" />
                )}
                <LocateFixed
                  className={`w-3.5 h-3.5 relative ${
                    isLocating
                      ? 'text-white animate-spin'
                      : 'text-orange-500 group-hover:text-orange-600 transition-colors'
                  }`}
                />
              </span>
              <span className="hidden sm:inline">{isLocating ? 'Scanning…' : 'My Location'}</span>
              <span className="sm:hidden">{isLocating ? '…' : 'Locate'}</span>
            </button>
          )}
        </div>
      )}

      {/* Map filters */}
      <section
        aria-label="Map display options"
        className={`absolute z-10 w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-white/80 bg-white/95 p-3 shadow-lg backdrop-blur-md ${(onGoHome || onScanLocation) ? 'top-16 left-2 sm:left-4' : 'top-4 left-2 sm:left-4'}`}
      >
        <div className="flex items-center gap-2">
          <label htmlFor="map-zone-filter" className="shrink-0 text-xs font-bold text-stone-800">Show areas</label>
          <select
            id="map-zone-filter"
            value={filterHazard}
            onChange={(event) => onFilterChange(event.target.value as 'ALL' | 'HIGH_SEVERE' | 'LANDSLIDE' | 'FLOOD')}
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-xs font-semibold text-stone-800 focus:border-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-700/20"
          >
            <option value="ALL">All monitored areas ({zones.length})</option>
            <option value="HIGH_SEVERE">High and severe risk</option>
            <option value="LANDSLIDE">Landslide risk</option>
            <option value="FLOOD">Flood risk</option>
          </select>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-stone-600">
          Select an area on the map to see its rainfall and risk details.
        </p>
        {(!isSectorListVisible || !isZoneDetailsVisible) && (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-stone-200 pt-2">
            {!isSectorListVisible && onToggleSectorList && (
              <button
                type="button"
                onClick={onToggleSectorList}
                className="flex min-h-8 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" /> Show areas
              </button>
            )}
            {!isZoneDetailsVisible && onToggleZoneDetails && (
              <button
                type="button"
                onClick={onToggleZoneDetails}
                className="flex min-h-8 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700"
              >
                <PanelRightOpen className="h-3.5 w-3.5" /> Show details
              </button>
            )}
          </div>
        )}
      </section>

      {/* Map Control Cluster (Layer Selector & Zoom Controls) */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
        {/* Layer Selector Dropdown Button */}
        <div className="relative" ref={layerMenuRef}>
          <button
            id="btn-map-layers-toggle"
            onClick={() => setIsLayerMenuOpen((prev) => !prev)}
            className={`tactile-btn h-9 px-3 rounded-xl border flex items-center gap-2 text-xs font-bold transition shadow-xs cursor-pointer ${isLayerMenuOpen || baseLayer !== 'light'
                ? 'bg-stone-900 text-white border-stone-800'
                : 'glass-card text-stone-800 hover:bg-white'
              }`}
            title="Choose map style and overlays"
          >
            <Layers className="w-4 h-4 text-orange-500" />
            <span className="hidden sm:inline">
              {baseLayer === 'light' ? 'Street map' : baseLayer === 'terrain' ? 'Terrain' : 'Satellite'}
            </span>
            <span className="sm:hidden">Layers</span>
          </button>

          {/* Layer Selection Menu Popover */}
          {isLayerMenuOpen && (
            <div
              id="map-layer-popover"
              className="absolute right-0 top-full mt-2 w-[min(19rem,calc(100vw-1rem))] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-stone-200 bg-white p-3 text-stone-900 shadow-xl z-30"
            >
              <div className="mb-3 flex items-center justify-between border-b border-stone-200 pb-2">
                <div>
                  <h2 className="text-sm font-bold text-stone-900">Map appearance</h2>
                  <p className="text-[11px] text-stone-600">Choose a background and optional overlays.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLayerMenuOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700"
                  title="Close map appearance"
                  aria-label="Close map appearance"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <fieldset className="mb-3">
                <legend className="mb-1.5 text-xs font-bold text-stone-800">Background map</legend>
                <div className="grid grid-cols-3 gap-1.5">
                {(['light', 'terrain', 'satellite'] as BaseLayerType[]).map((layerKey) => {
                  const opt = BASE_LAYERS[layerKey];
                  const isActive = baseLayer === layerKey;
                  return (
                    <button
                      key={layerKey}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        setBaseLayer(layerKey);
                      }}
                      className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-center text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 ${isActive
                        ? 'border-cyan-700 bg-cyan-50 text-cyan-950'
                        : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      {layerKey === 'light' && <MapIcon className="h-4 w-4" />}
                      {layerKey === 'terrain' && <Mountain className="h-4 w-4" />}
                      {layerKey === 'satellite' && <Globe className="h-4 w-4" />}
                      <span>{layerKey === 'light' ? 'Street' : layerKey === 'terrain' ? 'Terrain' : 'Satellite'}</span>
                      <span className="sr-only">{opt.provider}</span>
                    </button>
                  );
                })}
                </div>
              </fieldset>

              <fieldset className="space-y-1 border-t border-stone-200 pt-2">
                <legend className="mb-1 text-xs font-bold text-stone-800">Map overlays</legend>
                <label className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs hover:bg-stone-50">
                  <span className="flex items-center gap-2 font-medium text-stone-800">
                    <Flame className="h-4 w-4 text-orange-600" />
                    Risk heatmap
                  </span>
                  <input
                    id="checkbox-risk-heatmap-popover"
                    type="checkbox"
                    checked={showHeatmap}
                    onChange={(event) => setShowHeatmap(event.target.checked)}
                    className="h-4 w-4 accent-orange-600"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-xs hover:bg-stone-50">
                  <span className="flex items-center gap-2 font-medium text-stone-800">
                    <Eye className="h-4 w-4 text-stone-600" />
                    Place labels on satellite
                  </span>
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={(event) => setShowLabels(event.target.checked)}
                    className="h-4 w-4 accent-cyan-700"
                  />
                </label>
              </fieldset>
            </div>
          )}
        </div>

        {/* Map Zoom & Center Control Buttons */}
        <div className="flex flex-col gap-1 glass-card border border-white/80 rounded-xl p-1 shadow-md">
          <button
            id="btn-map-zoom-in"
            onClick={handleZoomIn}
            title="Zoom In"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-700 hover:text-stone-950 hover:bg-stone-100/80 transition cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            id="btn-map-zoom-out"
            onClick={handleZoomOut}
            title="Zoom Out"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-700 hover:text-stone-950 hover:bg-stone-100/80 transition cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="h-px bg-stone-200/80 mx-1" />
          <button
            id="btn-map-fit-bounds"
            onClick={handleResetBounds}
            title="Show all monitored areas"
            aria-label="Show all monitored areas"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-700 hover:text-orange-600 hover:bg-stone-100/80 transition cursor-pointer"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Map key */}
      <div className="absolute bottom-2 left-2 z-10 w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-white/90 bg-white/95 p-3 shadow-lg backdrop-blur-md sm:bottom-4 sm:left-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold text-stone-900">Area risk key</span>
          {showHeatmap && (
            <span className="text-[10px] font-bold text-orange-700 flex items-center gap-1 bg-orange-50/90 px-1.5 py-0.5 rounded-full border border-orange-200/80 shadow-2xs">
              <Flame className="w-3 h-3 text-orange-600 fill-orange-600" /> Heatmap Active
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {(['Low', 'Moderate', 'High', 'Severe'] as RiskLevel[]).map((lvl) => {
            const p = RISK_PALETTE[lvl];
            return (
              <div key={lvl} className="flex flex-col items-center">
                <div
                  className="w-full h-2 rounded-full mb-1 border shadow-2xs"
                  style={{ backgroundColor: p.mapFill, borderColor: p.mapStroke }}
                />
                <span className="text-[10px] font-bold text-stone-800">{lvl}</span>
              </div>
            );
          })}
        </div>

        {showHeatmap && (
          <div className="mt-2.5 pt-2 border-t border-stone-200/70">
            <div className="flex items-center justify-between text-[10px] font-bold text-stone-700 mb-1">
              <span className="flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-600" />
                Combined risk shading
              </span>
              <span className="font-mono text-orange-700 font-bold">0 &rarr; 100 Score</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-gradient-to-r from-yellow-200 via-amber-400 via-orange-500 via-red-500 to-red-900 border border-stone-200 shadow-inner" />
            <div className="flex justify-between text-[9px] text-stone-500 mt-1 font-semibold">
              <span>Low (0-25)</span>
              <span>Moderate (25-50)</span>
              <span>High (50-75)</span>
              <span>Severe (75-100)</span>
            </div>
          </div>
        )}

        <p className="mt-2 text-[10px] text-stone-600 border-t border-stone-200/70 pt-1.5 leading-tight font-normal">
          {showHeatmap
            ? 'Shading shows combined risk scores. Area colors show each zone’s overall risk.'
            : simulationMode
              ? 'The selected area reflects your test scenario; other areas keep their current assessments.'
              : 'Area colors show overall risk. Select an area to see rainfall and risk details.'}
        </p>
      </div>
    </div>
  );
};
