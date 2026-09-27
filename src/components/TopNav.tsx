import React from 'react';
import type { SimulationScenario } from '../services/openMeteo';
import { Bell, LoaderCircle, MapPin } from 'lucide-react';

interface TopNavProps {
  currentView?: 'LANDING' | 'DASHBOARD';
  onViewChange?: (view: 'LANDING' | 'DASHBOARD') => void;
  alertCount: number;
  onOpenAlerts: () => void;
  onCheckMyArea: () => void;
  isLocating: boolean;
  onOpenHowItWorks: () => void;
  onOpenSmsSimulator: () => void;
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
  onViewChange,
  alertCount,
  onOpenAlerts,
  onCheckMyArea,
  isLocating,
}) => {
  return (
    <header className="glass-dock sticky top-0 z-30 px-4 py-2 border-b rounded-b-2xl">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onViewChange && onViewChange('LANDING')}
                className="text-base font-bold text-[#193c38] leading-none hover:text-emerald-700 transition cursor-pointer text-left"
              >
                JALRAKSHAK
              </button>
            </div>
          </div>
        </div>
        <nav aria-label="Quick actions" className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCheckMyArea}
            disabled={isLocating}
            aria-label="Check my area"
            className="tactile-btn flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 bg-white/80 text-stone-800 text-xs font-bold hover:bg-white disabled:opacity-60 cursor-pointer"
          >
            {isLocating ? <LoaderCircle className="w-4 h-4 animate-spin text-orange-600" /> : <MapPin className="w-4 h-4 text-orange-600" />}
            <span>Check area</span>
          </button>
          <button
            type="button"
            onClick={onOpenAlerts}
            aria-label={`Open alerts${alertCount ? `, ${alertCount} active` : ''}`}
            className={`tactile-btn flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer ${alertCount > 0
              ? 'border-orange-600 bg-orange-600 text-white hover:bg-orange-700'
              : 'border-stone-200 bg-white/80 text-stone-800 hover:bg-white'
              }`}
          >
            <Bell className={`w-4 h-4 ${alertCount > 0 ? 'text-white' : 'text-stone-600'}`} />
            <span>Alerts</span>
            <span className="min-w-4 text-center">{alertCount}</span>
          </button>
        </nav>
      </div>
    </header>
  );
};

