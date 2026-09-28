import React, { useState } from 'react';
import { CloudRain, FlaskConical, Mountain, Navigation, RotateCcw, Waves } from 'lucide-react';
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
    <span className="flex items-start justify-between gap-2 text-[10px] font-semibold leading-tight text-stone-700">
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 font-mono tabular-nums text-stone-900">{value}{unit}</span>
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
  const riverFlowThreshold = selectedZone?.weather.riverDischarge?.highFlowThresholdM3s ?? null;
  const riverFlowMax = Math.max(100, Math.ceil((riverFlowThreshold ?? 500) * 2 / 100) * 100);
  const riverFlowStep = Math.max(1, Math.ceil(riverFlowMax / 100));
  const update = (key: keyof SandboxInputs, value: number) => onInputsChange({ ...inputs, [key]: value });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <main className="relative min-h-[min(38vh,280px)] flex-1 lg:min-h-0">
        <InteractiveMap
          zones={zones}
          selectedZone={selectedZone}
          onSelectZone={onSelectZone}
          userLocation={null}
          filterHazard={filterHazard}
          onFilterChange={setFilterHazard}
          simulationMode
        />
      </main>

      <aside className="max-h-[min(52vh,440px)] w-full shrink-0 overflow-y-auto border-t border-stone-200 bg-[#f8faf8] p-4 lg:max-h-none lg:w-[390px] lg:border-l lg:border-t-0">
        <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 border-b border-stone-200 bg-[#f8faf8]/95 px-4 pb-3 pt-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-700">
                <FlaskConical className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase text-orange-700">Simulation · preview only</p>
                <h2 className="mt-0.5 truncate text-sm font-bold text-stone-900">Scenario controls</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onReset}
              title="Reset simulation inputs"
              aria-label="Reset simulation inputs"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 transition hover:border-stone-400 hover:bg-stone-100"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-wide text-stone-600">
          Watershed
          <select
            value={selectedZone?.id ?? ''}
            onChange={(event) => {
              const zone = zones.find((item) => item.id === event.target.value);
              if (zone) onSelectZone(zone);
            }}
            className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-xs font-semibold normal-case tracking-normal text-stone-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
          >
            {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.region} · {zone.name}</option>)}
          </select>
        </label>

        <section className="mt-4 border-y border-stone-200 py-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            <CloudRain className="h-3.5 w-3.5 text-sky-700" /> Rainfall
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3.5">
            <Slider label="Current intensity" value={inputs.rainRate} unit=" mm/h" min={0} max={60} step={1} onChange={(value) => update('rainRate', value)} />
            <Slider label="24-hour total" value={inputs.rain24h} unit=" mm" min={0} max={200} step={5} onChange={(value) => update('rain24h', value)} />
            <Slider label="72-hour total" value={inputs.rain72h} unit=" mm" min={0} max={400} step={5} onChange={(value) => update('rain72h', value)} />
          </div>
        </section>

        <section className="border-b border-stone-200 py-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            <Waves className="h-3.5 w-3.5 text-cyan-700" /> River flow
          </div>
          <div className="mt-3">
            <Slider label="Daily discharge" value={inputs.riverDischargeM3s} unit=" m³/s" min={0} max={riverFlowMax} step={riverFlowStep} onChange={(value) => update('riverDischargeM3s', value)} />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-stone-500">
            Local high-flow reference: {riverFlowThreshold == null ? 'unavailable' : `${riverFlowThreshold.toLocaleString()} m³/s (P95)`}
          </p>
        </section>

        <section className="border-b border-stone-200 py-3.5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
            <Mountain className="h-3.5 w-3.5 text-emerald-700" /> Terrain
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3.5">
            <Slider label="Slope" value={inputs.slope} unit="°" min={5} max={50} step={1} onChange={(value) => update('slope', value)} />
            <Slider label="River distance" value={inputs.riverKm} unit=" km" min={0.1} max={4} step={0.1} onChange={(value) => update('riverKm', value)} />
            <Slider label="Elevation" value={inputs.elevationM} unit=" m" min={0} max={1500} step={5} onChange={(value) => update('elevationM', value)} />
            <Slider label="Soil saturation" value={inputs.saturation} unit="%" min={0} max={100} step={1} onChange={(value) => update('saturation', value)} />
          </div>
        </section>

        {selectedZone && palette && (
          <section className="mt-4" aria-live="polite">
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 pb-2">
              <h3 className="text-xs font-bold text-stone-900">Simulated outcome</h3>
              <span className={`border px-2 py-1 text-[10px] font-bold ${palette.badgeBg} ${palette.badgeText} ${palette.badgeBorder}`}>
                {level}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 py-3 text-center">
              <div className="rounded-lg border border-stone-200 bg-white px-2 py-2"><span className="block text-[9px] font-bold uppercase text-stone-500">Landslide</span><strong className="font-mono text-sm text-stone-900">{selectedZone.assessment.landslideScore}<span className="text-[9px] text-stone-500">/100</span></strong></div>
              <div className="rounded-lg border border-stone-200 bg-white px-2 py-2"><span className="block text-[9px] font-bold uppercase text-stone-500">Flood</span><strong className="font-mono text-sm text-stone-900">{selectedZone.assessment.floodScore}<span className="text-[9px] text-stone-500">/100</span></strong></div>
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-2"><span className="block text-[9px] font-bold uppercase text-orange-700">Overall</span><strong className="font-mono text-sm text-orange-800">{selectedZone.assessment.compositeScore}<span className="text-[9px] text-orange-600">/100</span></strong></div>
            </div>
            <div className="flex items-center justify-between gap-3 border-y border-stone-200 py-2 text-[10px]">
              <span className="text-stone-600">River discharge · flow factor</span>
              <strong className="shrink-0 font-mono tabular-nums text-stone-900">{inputs.riverDischargeM3s.toLocaleString()} m³/s · ×{selectedZone.assessment.floodBreakdown.riverFlowMultiplier}</strong>
            </div>
            <p className="text-[11px] leading-relaxed text-stone-700">{selectedZone.assessment.recommendedAction}</p>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-[10px] leading-relaxed text-sky-950">
              <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Rainfall, terrain, and river-flow inputs update this watershed only. Live readings are unchanged; this is a preview, not an official warning.</span>
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
