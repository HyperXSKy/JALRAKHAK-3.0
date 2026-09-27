import React, { useState } from 'react';
import { CloudRain, Mountain, Navigation, RotateCcw, Waves } from 'lucide-react';
import type { ZoneWithTelemetry } from '../types';
import type { EarlyWarningAlert } from '../types';
import type { SandboxInputs } from '../services/sandbox';
import { InteractiveMap } from './InteractiveMap';
import { RISK_PALETTE } from '../utils/riskEngine';

interface SimulationWorkspaceProps {
  zones: ZoneWithTelemetry[];
  selectedZone: ZoneWithTelemetry | null;
  onSelectZone: (zone: ZoneWithTelemetry) => void;
  inputs: SandboxInputs;
  onInputsChange: (inputs: SandboxInputs) => void;
  onReset: () => void;
  simulationAlert: EarlyWarningAlert | null;
}

interface SliderProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const Slider: React.FC<SliderProps> = ({ label, value, unit, min, max, step, onChange }) => (
  <label className="block">
    <span className="flex justify-between gap-3 text-[11px] font-semibold text-stone-700">
      <span>{label}</span>
      <span className="font-mono text-stone-900">{value}{unit}</span>
    </span>
    <input
      aria-label={label}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-1 w-full accent-orange-600"
    />
  </label>
);

export const SimulationWorkspace: React.FC<SimulationWorkspaceProps> = ({
  zones,
  selectedZone,
  onSelectZone,
  inputs,
  onInputsChange,
  onReset,
  simulationAlert,
}) => {
  const [filterHazard, setFilterHazard] = useState<'ALL' | 'HIGH_SEVERE' | 'LANDSLIDE' | 'FLOOD'>('ALL');
  const level = selectedZone?.assessment.overallLevel;
  const palette = level ? RISK_PALETTE[level] : null;
  const update = (key: keyof SandboxInputs, value: number) => onInputsChange({ ...inputs, [key]: value });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
      <main className="relative min-h-[340px] flex-1 xl:min-h-0">
        <InteractiveMap
          zones={zones}
          selectedZone={selectedZone}
          onSelectZone={onSelectZone}
          userLocation={null}
          filterHazard={filterHazard}
          onFilterChange={setFilterHazard}
          simulationMode
        />
        <div className="pointer-events-none absolute left-4 top-4 z-[400] flex items-center gap-2 border border-orange-300 bg-white/95 px-3 py-2 text-[11px] font-bold text-orange-900 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-orange-600" />
          SIMULATION OVERLAY
        </div>
      </main>

      <aside className="max-h-[52vh] w-full shrink-0 overflow-y-auto border-t border-stone-200 bg-[#f8faf8] p-4 xl:max-h-none xl:w-[370px] xl:border-l xl:border-t-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700">Interactive sandbox</p>
            <h2 className="mt-0.5 text-base font-bold text-stone-900">Formula dynamics</h2>
          </div>
          <button
            type="button"
            onClick={onReset}
            title="Reset formula inputs"
            aria-label="Reset formula inputs"
            className="border border-stone-300 bg-white p-2 text-stone-700 hover:bg-stone-100"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-4 block text-[11px] font-semibold text-stone-700">
          Region / watershed
          <select
            value={selectedZone?.id ?? ''}
            onChange={(event) => {
              const zone = zones.find((item) => item.id === event.target.value);
              if (zone) onSelectZone(zone);
            }}
            className="mt-1 w-full border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900"
          >
            {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.region} · {zone.name}</option>)}
          </select>
        </label>

        <div className="mt-4 space-y-3 border-y border-stone-200 py-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            <CloudRain className="h-3.5 w-3.5 text-sky-700" /> Rainfall
          </div>
          <Slider label="Current intensity" value={inputs.rainRate} unit=" mm/h" min={0} max={60} step={1} onChange={(value) => update('rainRate', value)} />
          <Slider label="24-hour total" value={inputs.rain24h} unit=" mm" min={0} max={200} step={5} onChange={(value) => update('rain24h', value)} />
          <Slider label="72-hour total" value={inputs.rain72h} unit=" mm" min={0} max={400} step={5} onChange={(value) => update('rain72h', value)} />
        </div>

        <div className="mt-4 space-y-3 border-b border-stone-200 pb-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            <Mountain className="h-3.5 w-3.5 text-emerald-700" /> Terrain
          </div>
          <Slider label="Slope" value={inputs.slope} unit="°" min={5} max={50} step={1} onChange={(value) => update('slope', value)} />
          <Slider label="River distance" value={inputs.riverKm} unit=" km" min={0.1} max={4} step={0.1} onChange={(value) => update('riverKm', value)} />
          <Slider label="Elevation" value={inputs.elevationM} unit=" m" min={0} max={1500} step={5} onChange={(value) => update('elevationM', value)} />
          <Slider label="Soil saturation" value={inputs.saturation} unit="%" min={0} max={100} step={1} onChange={(value) => update('saturation', value)} />
        </div>

        {selectedZone && palette && (
          <section className="mt-4" aria-live="polite">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2">
              <h3 className="text-xs font-bold text-stone-900">Simulated outcome</h3>
              <span className={`border px-2 py-1 text-[10px] font-bold ${palette.badgeBg} ${palette.badgeText} ${palette.badgeBorder}`}>
                {level}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-3 text-center">
              <div><span className="block text-[9px] uppercase text-stone-500">LSI</span><strong className="font-mono text-sm">{selectedZone.assessment.landslideScore}</strong></div>
              <div><span className="block text-[9px] uppercase text-stone-500">FFI</span><strong className="font-mono text-sm">{selectedZone.assessment.floodScore}</strong></div>
              <div><span className="block text-[9px] uppercase text-stone-500">Overall</span><strong className="font-mono text-sm text-orange-700">{selectedZone.assessment.compositeScore}</strong></div>
            </div>
            <p className="text-[11px] leading-relaxed text-stone-700">{selectedZone.assessment.recommendedAction}</p>
            <div className="mt-3 flex items-start gap-2 border-l-2 border-sky-700 bg-sky-50 p-2.5 text-[10px] leading-relaxed text-sky-950">
              <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Only this watershed is overlaid. Live readings remain unchanged; this is a sandbox forecast, not an official warning.</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-stone-500">
              <Waves className="h-3 w-3" />
              Rainfall and terrain sliders feed the same risk engine used by live advisories.
            </div>
            <div className="mt-4 border-t border-stone-200 pt-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-stone-700">Alert for this situation</h4>
              {simulationAlert ? (
                <div className="mt-2 border-l-2 border-orange-600 bg-orange-50 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`border px-2 py-0.5 text-[10px] font-bold ${palette.badgeBg} ${palette.badgeText} ${palette.badgeBorder}`}>{simulationAlert.level} · {simulationAlert.compositeScore}/100</span>
                    <span className="text-[10px] font-semibold uppercase text-stone-600">{simulationAlert.hazardType.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="mt-2 text-[11px] font-bold leading-snug text-stone-900">{simulationAlert.headline}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-stone-700">{simulationAlert.recommendation}</p>
                  <p className="mt-2 text-[9px] font-semibold text-orange-900">Preview only · no alert is sent</p>
                </div>
              ) : (
                <p className="mt-2 border border-stone-200 bg-white px-3 py-2.5 text-[10px] leading-relaxed text-stone-600">
                  This situation remains below the High warning threshold. Continue monitoring; increasing rainfall or saturation may change the alert.
                </p>
              )}
            </div>
          </section>
        )}
      </aside>
    </div>
  );
};
