import React, { useState, useMemo } from 'react';
import { ZoneWithTelemetry, RiskLevel } from '../types';
import { RISK_PALETTE } from '../utils/riskEngine';
import {
  Search,
  Mountain,
  Waves,
  CloudRain,
  ChevronRight,
  SlidersHorizontal,
  PanelLeftClose,
} from 'lucide-react';

interface SidebarZoneListProps {
  zones: ZoneWithTelemetry[];
  selectedZone: ZoneWithTelemetry | null;
  onSelectZone: (zone: ZoneWithTelemetry) => void;
  onCollapse: () => void;
}

export const SidebarZoneList: React.FC<SidebarZoneListProps> = ({
  zones,
  selectedZone,
  onSelectZone,
  onCollapse,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | RiskLevel>('ALL');
  const [hazardFocus, setHazardFocus] = useState<'ALL' | 'LANDSLIDE' | 'FLOOD'>('ALL');
  const [sortBy, setSortBy] = useState<'RISK' | 'RAINFALL' | 'SLOPE'>('RISK');

  const filteredAndSortedZones = useMemo(() => {
    return zones
      .filter((zone) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = zone.name.toLowerCase().includes(q);
          const matchRegion = zone.region.toLowerCase().includes(q);
          const matchCountry = zone.country.toLowerCase().includes(q);
          if (!matchName && !matchRegion && !matchCountry) return false;
        }

        if (severityFilter !== 'ALL' && zone.assessment.overallLevel !== severityFilter) {
          return false;
        }

        if (hazardFocus === 'LANDSLIDE' && zone.assessment.landslideScore < 45) {
          return false;
        }
        if (hazardFocus === 'FLOOD' && zone.assessment.floodScore < 45) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'RISK') {
          return b.assessment.compositeScore - a.assessment.compositeScore;
        }
        if (sortBy === 'RAINFALL') {
          return b.weather.currentRateMmPerHour - a.weather.currentRateMmPerHour;
        }
        if (sortBy === 'SLOPE') {
          return b.slope - a.slope;
        }
        return 0;
      });
  }, [zones, searchQuery, severityFilter, hazardFocus, sortBy]);

  const counts = useMemo(() => {
    return {
      all: zones.length,
      severe: zones.filter((z) => z.assessment.overallLevel === 'Severe').length,
      high: zones.filter((z) => z.assessment.overallLevel === 'High').length,
      moderate: zones.filter((z) => z.assessment.overallLevel === 'Moderate').length,
      low: zones.filter((z) => z.assessment.overallLevel === 'Low').length,
    };
  }, [zones]);

  return (
    <aside
      id="sidebar-zone-list"
      className="w-full lg:w-80 xl:w-96 bg-stone-50/90 backdrop-blur-md border-r border-stone-200/80 flex flex-col h-full shrink-0"
    >
      {/* Sidebar Header & Search */}
      <div className="p-3.5 border-b border-stone-200/80 bg-white/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-xs font-bold text-stone-900">
            Monitored areas
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-stone-500 font-mono font-medium px-2 py-0.5 rounded-md bg-stone-100/80 border border-stone-200/60 shadow-2xs">
              {filteredAndSortedZones.length} of {zones.length} shown
            </span>
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Hide monitored areas"
              title="Hide monitored areas"
              className="hidden h-8 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 lg:flex"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
              Hide
            </button>
          </div>
        </div>

        {/* Search Box with tactile inset */}
        <div className="relative mb-2.5">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-zone-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search area or river"
            className="w-full pl-9 pr-3 py-1.5 tactile-inset bg-white/90 border border-stone-200/80 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition"
          />
        </div>

        <label className="mt-2 block text-[10px] font-semibold text-stone-600">
          Risk level
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as 'ALL' | RiskLevel)}
            className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-cyan-700/30"
          >
            <option value="ALL">All risk levels ({counts.all})</option>
            <option value="Severe">Severe ({counts.severe})</option>
            <option value="High">High ({counts.high})</option>
            <option value="Moderate">Moderate ({counts.moderate})</option>
            <option value="Low">Low ({counts.low})</option>
          </select>
        </label>

        <details className="mt-2 border-t border-stone-200/70 pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-stone-600 hover:text-stone-900">
            <SlidersHorizontal className="h-3.5 w-3.5" /> More filters and sorting
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[10px] font-medium text-stone-600">
              Hazard
              <select
                value={hazardFocus}
                onChange={(event) => setHazardFocus(event.target.value as 'ALL' | 'LANDSLIDE' | 'FLOOD')}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-stone-800"
              >
                <option value="ALL">All hazards</option>
                <option value="LANDSLIDE">Landslide</option>
                <option value="FLOOD">Flood</option>
              </select>
            </label>
            <label className="text-[10px] font-medium text-stone-600">
              Sort by
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as 'RISK' | 'RAINFALL' | 'SLOPE')}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-stone-800"
              >
                <option value="RISK">Risk score</option>
                <option value="RAINFALL">Rainfall rate</option>
                <option value="SLOPE">Slope</option>
              </select>
            </label>
          </div>
        </details>
      </div>

      {/* Zone Cards List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filteredAndSortedZones.length === 0 ? (
          <div className="p-6 text-center text-xs text-stone-600 glass-card rounded-xl">
            No monitoring zones match your current filters.
          </div>
        ) : (
          filteredAndSortedZones.map((zone) => {
            const isSelected = selectedZone?.id === zone.id;
            const palette = RISK_PALETTE[zone.assessment.overallLevel];

            return (
              <div
                key={zone.id}
                id={`zone-card-${zone.id}`}
                onClick={() => onSelectZone(zone)}
                className={`p-3 rounded-xl border transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'bg-white border-orange-500 ring-2 ring-orange-500/20 shadow-md transform -translate-y-0.5'
                    : 'glass-card glass-card-interactive hover:bg-white'
                }`}
              >
                {/* Card Top: Region & Severity Badge */}
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-stone-500 truncate">
                    {zone.region}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide border shrink-0 shadow-2xs ${palette.badgeBg} ${palette.badgeText} ${palette.badgeBorder}`}
                  >
                    {zone.assessment.overallLevel} ({zone.assessment.compositeScore})
                  </span>
                </div>

                {/* Card Title */}
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-bold text-stone-900 leading-snug truncate">
                    {zone.name}
                  </h3>
                  <ChevronRight
                    className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                      isSelected ? 'text-orange-600' : 'text-stone-400'
                    }`}
                  />
                </div>

                {/* Key Telemetry Metrics */}
                <div className="mt-2 grid grid-cols-3 gap-1 border-t border-stone-200/60 pt-2 text-[9px]">
                  <div className="min-w-0">
                    <span className="flex items-center gap-1 text-stone-500"><CloudRain className="h-3 w-3 text-sky-700" />Now</span>
                    <strong className="mt-0.5 block truncate font-mono text-[10px] text-stone-900">{zone.weather.currentRateMmPerHour.toFixed(1)} mm/h</strong>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-stone-500">Past 24h</span>
                    <strong className="mt-0.5 block truncate font-mono text-[10px] text-stone-900">{zone.weather.last24hMm.toFixed(1)} mm</strong>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-stone-500">Next 24h</span>
                    <strong className="mt-0.5 block truncate font-mono text-[10px] text-stone-900">{zone.weather.forecastNext24hMm.toFixed(1)} mm</strong>
                  </div>
                </div>

                {/* Landslide & Flood Score Bars */}
                <div className="grid grid-cols-2 gap-2 mt-2 pt-1.5 text-[10px]">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-stone-600 font-medium flex items-center gap-0.5">
                        <Mountain className="w-2.5 h-2.5 text-stone-500" />
                        Landslide
                      </span>
                      <span className="font-mono font-bold text-stone-800">
                        {zone.assessment.landslideScore}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full"
                        style={{ width: `${zone.assessment.landslideScore}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-stone-600 font-medium flex items-center gap-0.5">
                        <Waves className="w-2.5 h-2.5 text-stone-500" />
                        Flood
                      </span>
                      <span className="font-mono font-bold text-stone-800">
                        {zone.assessment.floodScore}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-red-600 rounded-full"
                        style={{ width: `${zone.assessment.floodScore}%` }}
                      />
                    </div>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
