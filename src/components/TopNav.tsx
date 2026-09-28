import React from 'react';
import type { SimulationScenario } from '../services/openMeteo';
import { Bell, FlaskConical, LayoutDashboard, LoaderCircle, MapPin, Siren } from 'lucide-react';

type AppView = 'LANDING' | 'DASHBOARD' | 'SIMULATION' | 'ALERTS';

interface TopNavProps {
  currentView?: AppView;
  onViewChange?: (view: AppView) => void;
  alertCount: number;
  simulationAlertCount: number;
  onOpenAlerts: () => void;
  onCheckMyArea: () => void;
  isLocating: boolean;
  onOpenHowItWorks: () => void;
  simulationScenario: SimulationScenario;
  onScenarioChange: (scenario: SimulationScenario) => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
  isLiveApi: boolean;
  lastSyncTime?: string;
  countdownSeconds?: number;
  isAutoRefreshActive?: boolean;
  onToggleAutoRefresh?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentView,
  onViewChange,
  alertCount,
  simulationAlertCount,
  onOpenAlerts,
  onCheckMyArea,
  isLocating,
}) => {
  return (
    <header className="glass-dock sticky top-0 z-30 border-b px-3 py-2 sm:px-5">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onViewChange && onViewChange('LANDING')}
          aria-label="Jalrakshak home"
          className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2"
        >
          <img
            src="/jalrakshak%20Logo.png"
            alt=""
            className="h-10 w-10 rounded-full border-2 border-white object-cover shadow-sm ring-1 ring-cyan-200"
          />
          <span className="text-sm font-extrabold leading-tight text-[#193653] sm:text-base">JALRAKSHAK</span>
        </button>
        <nav aria-label="Primary" className="flex min-w-0 items-center justify-end gap-1 sm:gap-1.5">
          {([
            { view: 'DASHBOARD', label: 'Map', icon: LayoutDashboard },
            { view: 'SIMULATION', label: 'Simulation', icon: FlaskConical },
            { view: 'ALERTS', label: 'Alerts', icon: Siren },
          ] as const).map(({ view, label, icon: Icon }) => (
            <button
              key={view}
              type="button"
              onClick={() => onViewChange?.(view)}
              aria-current={currentView === view ? 'page' : undefined}
              title={label}
              aria-label={label}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-2 sm:px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-1 ${currentView === view ? 'bg-[#193653] text-white shadow-sm' : 'text-stone-700 hover:bg-white/80'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden min-[520px]:inline">{label}</span>
              {view === 'ALERTS' && <span className="font-mono">{alertCount + simulationAlertCount}</span>}
            </button>
          ))}
          <span aria-hidden="true" className="mx-0.5 h-6 border-l border-stone-300 sm:mx-1" />
          <button
            type="button"
            onClick={onCheckMyArea}
            disabled={isLocating}
            aria-label="Check my area"
            title="Check my area"
            className="tactile-btn flex h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white/80 px-2 sm:px-3 text-xs font-bold text-stone-800 hover:bg-white disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-1"
          >
            {isLocating ? <LoaderCircle className="w-4 h-4 animate-spin text-orange-600" /> : <MapPin className="w-4 h-4 text-orange-600" />}
            <span className="hidden min-[520px]:inline">Check area</span>
          </button>
          <button
            type="button"
            onClick={onOpenAlerts}
            aria-label={`Open alert list: ${alertCount} live${simulationAlertCount ? `, ${simulationAlertCount} simulation only` : ''}`}
            title="Open active alerts"
            className={`tactile-btn flex h-9 items-center gap-1.5 rounded-lg border px-2 sm:px-3 text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-1 ${alertCount + simulationAlertCount > 0
              ? 'border-orange-600 bg-orange-600 text-white hover:bg-orange-700'
              : 'border-stone-200 bg-white/80 text-stone-800 hover:bg-white'
              }`}
          >
            <Bell className={`w-4 h-4 ${alertCount + simulationAlertCount > 0 ? 'text-white' : 'text-stone-600'}`} />
            <span className="hidden min-[520px]:inline">Active</span>
            <span className="min-w-4 text-center">{alertCount + simulationAlertCount}</span>
          </button>
        </nav>
      </div>
    </header>
  );
};

