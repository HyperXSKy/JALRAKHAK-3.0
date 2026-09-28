import React from 'react';
import { X, Calculator, ShieldCheck, Mountain, Waves, ExternalLink, HelpCircle } from 'lucide-react';
import { RISK_PALETTE, getRiskLevel } from '../utils/riskEngine';
import type { SandboxInputs } from '../services/sandbox';

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputs: SandboxInputs;
  onInputsChange: (inputs: SandboxInputs) => void;
  riverFlowThresholdM3s: number | null;
}

export const HowItWorksModal: React.FC<HowItWorksModalProps> = ({
  isOpen,
  onClose,
  inputs,
  onInputsChange,
  riverFlowThresholdM3s,
}) => {
  const {
    rainRate: testRainRate,
    rain24h: test24hRain,
    rain72h: test72hRain,
    riverDischargeM3s: testRiverDischargeM3s,
    slope: testSlope,
    riverKm: testRiverKm,
    saturation: testSaturation,
    elevationM: testElevationM,
  } = inputs;

  if (!isOpen) return null;

  const slopeMultiplier = Number((Math.pow(Math.max(5, Math.min(50, testSlope)) / 26, 1.65)).toFixed(2));
  const satFactor = Number((1.0 + (testSaturation / 100) * 0.55).toFixed(2));
  const intensityLsi = testRainRate * 3.2;
  const ante72h = test72hRain * 0.42;
  const calculatedLsi = Math.min(
    100,
    Math.max(0, Math.round((intensityLsi + ante72h) * slopeMultiplier * satFactor * 0.45))
  );
  const lsiLevel = getRiskLevel(calculatedLsi);

  const floodAccum = test24hRain * 0.68;
  const floodInt = testRainRate * 3.6;
  const riverFactor = Number(Math.max(0.6, 2.4 - testRiverKm * 0.55).toFixed(2));
  const elevationFactor = Number(
    Math.max(0.7, 2.0 - (Math.min(testElevationM, 1500) / 1200) * 0.85).toFixed(2)
  );
  const riverFlowRatio = riverFlowThresholdM3s != null && riverFlowThresholdM3s > 0
    ? testRiverDischargeM3s / riverFlowThresholdM3s
    : null;
  const riverFlowFactor = riverFlowRatio == null
    ? 1
    : Number((1 + 0.5 * Math.min(2, Math.max(0, riverFlowRatio))).toFixed(2));
  const riverFlowSliderMax = Math.max(100, Math.ceil((riverFlowThresholdM3s ?? 500) * 2 / 100) * 100);
  const calculatedFfi = Math.min(
    100,
    Math.max(0, Math.round((floodAccum + floodInt) * riverFactor * elevationFactor * riverFlowFactor * 0.4))
  );
  const ffiLevel = getRiskLevel(calculatedFfi);

  const compositeScore = Math.min(
    100,
    Math.round(Math.max(calculatedLsi, calculatedFfi) * 0.75 + Math.min(calculatedLsi, calculatedFfi) * 0.25)
  );
  const compLevel = getRiskLevel(compositeScore);

  return (
    <div
      id="how-it-works-modal"
      className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="glass-modal border border-stone-200/80 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-stone-900">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-stone-200/80 flex items-center justify-between bg-white/70">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center shadow-xs">
                <Calculator className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-stone-900">
                Risk formulas and model estimates
              </h3>
            </div>
            <p className="text-xs text-stone-500 font-medium mt-0.5">
              How rainfall and terrain data become the scores shown in the dashboard.
            </p>
          </div>
          <button
            onClick={onClose}
            className="tactile-btn p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-stone-800">
          {/* Architecture Overview */}
          <div className="p-4 glass-card rounded-xl border border-stone-200/80 space-y-2 shadow-2xs">
            <h4 className="font-bold text-stone-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              Data Ingestion &amp; Hydrological Model
            </h4>
            <p className="leading-relaxed text-stone-700">
              JALRAKSHAK combines Open-Meteo rainfall with daily modeled GloFAS discharge and geophysical catchment attributes. River flow is compared with each watershed's historical 95th-percentile reference.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 space-y-1.5">
            <h4 className="font-bold text-stone-900">About the model scores</h4>
            <p className="text-[11px] text-stone-700 leading-relaxed">
              GloFAS supplies modeled discharge in m³/s, not measured river height or bankfull stage. The XGBoost model combines rainfall triggers and historical high-flow proxy labels, not observed overflow events, so its score is not a calibrated flood probability. Neither score replaces official warnings.
            </p>
          </div>

          {/* Mathematical Formulations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Landslide formula */}
            <div className="p-4 rounded-xl border border-stone-200/80 glass-card space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold">
                <Mountain className="w-4 h-4 text-orange-600" />
                <span>1. Landslide Susceptibility Index (LSI)</span>
              </div>
              <div className="p-3 bg-stone-100/80 rounded-lg border border-stone-200 font-mono text-[11px] text-stone-900 shadow-inner">
                LSI = [(3.2 &times; I<sub>rate</sub> + 0.42 &times; A<sub>72h</sub>) &times; M<sub>slope</sub> &times; M<sub>sat</sub>] &times; 0.45
              </div>
              <ul className="space-y-1.5 text-[11px] text-stone-600 list-disc list-inside">
                <li>
                  <strong className="text-stone-900">M<sub>slope</sub></strong> = (clamp(Slope, 5°, 50°) / 26°)<sup>1.65</sup>.
                </li>
                <li>
                  <strong className="text-stone-900">M<sub>sat</sub></strong> = 1 + (SoilSat / 100) &times; 0.55 — Pore-water pressure multiplier.
                </li>
                <li>
                  <strong className="text-stone-900">A<sub>72h</sub></strong> = 72-hour antecedent rainfall total (liquefaction baseline).
                </li>
              </ul>
            </div>

            {/* Flash flood formula */}
            <div className="p-4 rounded-xl border border-stone-200/80 glass-card space-y-2 shadow-2xs">
              <div className="flex items-center gap-2 text-stone-900 font-bold">
                <Waves className="w-4 h-4 text-orange-600" />
                <span>2. Flash Flood Index (FFI)</span>
              </div>
              <div className="p-3 bg-stone-100/80 rounded-lg border border-stone-200 font-mono text-[11px] text-stone-900 shadow-inner">
                FFI = [(0.68 &times; A<sub>24h</sub> + 3.6 &times; I<sub>rate</sub>) &times; R<sub>river</sub> &times; E<sub>elevation</sub> &times; M<sub>flow</sub>] &times; 0.40
              </div>
              <ul className="space-y-1.5 text-[11px] text-stone-600 list-disc list-inside">
                <li>
                  <strong className="text-stone-900">R<sub>river</sub></strong> = max(0.6, 2.4 &minus; Dist<sub>km</sub> &times; 0.55) — Alluvial bank overtop buffer.
                </li>
                <li>
                  <strong className="text-stone-900">E<sub>elevation</sub></strong> = max(0.7, 2.0 - min(Elevation, 1500) / 1200 &times; 0.85).
                </li>
                <li>
                  <strong className="text-stone-900">A<sub>24h</sub></strong> = 24-hour total precipitation runoff volume.
                </li>
                <li>
                  <strong className="text-stone-900">M<sub>flow</sub></strong> = 1 + 0.5 &times; clamp(Q / Q<sub>95</sub>, 0, 2). Q<sub>95</sub> is a historical high-flow reference, not a bankfull threshold.
                </li>
              </ul>
            </div>
          </div>

          {/* Severity Threshold Classification */}
          <div className="p-4 rounded-xl border border-stone-200/80 glass-card space-y-3 shadow-2xs">
            <h4 className="font-bold text-stone-900 text-xs uppercase tracking-wider">
              Risk levels
            </h4>
            <p className="text-[11px] text-stone-600">
              24-hour IMD rainfall bands: Yellow &ge;64.5 mm, Orange &ge;115.6 mm, Red &ge;204.4 mm.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/80 shadow-2xs">
                <span className="font-bold text-amber-900 block">Low (0 - 29)</span>
                <span className="text-[10px] text-amber-700 font-medium">Pale Amber Tint</span>
              </div>
              <div className="p-2.5 rounded-xl border border-amber-300 bg-amber-100/80 shadow-2xs">
                <span className="font-bold text-amber-950 block">Moderate (30 - 59)</span>
                <span className="text-[10px] text-amber-800 font-medium">Warm Amber-Orange</span>
              </div>
              <div className="p-2.5 rounded-xl border border-orange-500 bg-orange-600 text-white shadow-2xs">
                <span className="font-bold block">High (60 - 79)</span>
                <span className="text-[10px] text-orange-100 font-medium">Alert Vibrant Orange</span>
              </div>
              <div className="p-2.5 rounded-xl border border-orange-700 bg-stone-900 text-orange-400 shadow-2xs">
                <span className="font-bold block">Severe (80 - 100)</span>
                <span className="text-[10px] text-orange-300 font-medium">Deep Red-Orange</span>
              </div>
            </div>
          </div>

          {/* Interactive Live Formula Calculator for Hackathon Judges */}
          <div className="p-4 sm:p-5 rounded-xl border border-amber-300/80 bg-gradient-to-br from-amber-50/60 to-orange-50/40 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-orange-600" />
                Interactive Sandbox: Test Formula Dynamics
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/90 border border-orange-200 text-orange-800 shadow-2xs">
                Live Evaluator
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="flex justify-between text-stone-700 font-semibold mb-1">
                  <span>Current Rainfall Intensity (I<sub>rate</sub>)</span>
                  <span className="font-bold font-mono text-stone-900">{testRainRate} mm/h</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={testRainRate}
                  onChange={(e) => onInputsChange({ ...inputs, rainRate: Number(e.target.value) })}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="flex justify-between text-stone-700 font-semibold mb-1">
                  <span>24-Hour Rainfall (A<sub>24h</sub>)</span>
                  <span className="font-bold font-mono text-stone-900">{test24hRain} mm</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="5"
                  value={test24hRain}
                  onChange={(e) => onInputsChange({ ...inputs, rain24h: Number(e.target.value) })}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="flex justify-between text-stone-700 font-semibold mb-1">
                  <span>72-Hour Rainfall (A<sub>72h</sub>)</span>
                  <span className="font-bold font-mono text-stone-900">{test72hRain} mm</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="400"
                  step="5"
                  value={test72hRain}
                  onChange={(e) => onInputsChange({ ...inputs, rain72h: Number(e.target.value) })}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="flex justify-between text-stone-700 font-semibold mb-1">
                  <span>Terrain Slope Steepness</span>
                  <span className="font-bold font-mono text-stone-900">{testSlope}°</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  value={testSlope}
                  onChange={(e) => onInputsChange({ ...inputs, slope: Number(e.target.value) })}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="flex justify-between text-stone-700 font-semibold mb-1">
                  <span>Distance to River Corridor</span>
                  <span className="font-bold font-mono text-stone-900">{testRiverKm} km</span>
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="4.0"
                  step="0.1"
                  value={testRiverKm}
                  onChange={(e) => onInputsChange({ ...inputs, riverKm: Number(e.target.value) })}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="flex justify-between text-stone-700 font-semibold mb-1">
                  <span>Daily River Discharge (Q)</span>
                  <span className="font-bold font-mono text-stone-900">{testRiverDischargeM3s.toLocaleString()} m³/s</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max={riverFlowSliderMax}
                  step={Math.max(1, Math.ceil(riverFlowSliderMax / 100))}
                  value={Math.min(testRiverDischargeM3s, riverFlowSliderMax)}
                  onChange={(e) => onInputsChange({ ...inputs, riverDischargeM3s: Number(e.target.value) })}
                  className="w-full accent-cyan-700 cursor-pointer"
                />
                <span className="text-[10px] text-stone-500">
                  Local Q<sub>95</sub>: {riverFlowThresholdM3s == null ? 'unavailable' : `${riverFlowThresholdM3s.toLocaleString()} m³/s`}
                </span>
              </div>

              <div>
                <label className="flex justify-between text-stone-700 font-semibold mb-1">
                  <span>Ground Elevation</span>
                  <span className="font-bold font-mono text-stone-900">{testElevationM} m</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1500"
                  step="5"
                  value={testElevationM}
                  onChange={(e) => onInputsChange({ ...inputs, elevationM: Number(e.target.value) })}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="flex justify-between text-stone-700 font-semibold mb-1">
                  <span>Soil Saturation</span>
                  <span className="font-bold font-mono text-stone-900">{testSaturation}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={testSaturation}
                  onChange={(e) => onInputsChange({ ...inputs, saturation: Number(e.target.value) })}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Calculated Output Score Card */}
            <div className="grid grid-cols-3 gap-2 p-3 bg-white/90 rounded-xl border border-stone-200/80 text-center shadow-2xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-500 block">Landslide (LSI)</span>
                <span className="text-base font-bold font-mono text-stone-900">{calculatedLsi}/100</span>
                <span className="text-[10px] block font-bold text-orange-600">{lsiLevel}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-500 block">Flash Flood (FFI)</span>
                <span className="text-base font-bold font-mono text-stone-900">{calculatedFfi}/100</span>
                <span className="text-[10px] block font-bold text-orange-600">{ffiLevel}</span>
                <span className="text-[9px] block text-stone-500">Flow ×{riverFlowFactor}</span>
              </div>
              <div className="border-l border-stone-200/80 pl-2">
                <span className="text-[10px] uppercase font-bold text-stone-500 block">Composite Rating</span>
                <span className="text-base font-bold font-mono text-orange-600">{compositeScore}/100</span>
                <span className="text-[10px] block font-bold text-stone-900 uppercase">{compLevel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-stone-200/80 flex items-center justify-between bg-stone-50/70">
          <span className="text-[11px] text-stone-500 font-medium">
            Screening aid only. Follow official alerts and local authority instructions.
          </span>
          <button
            onClick={onClose}
            className="tactile-btn px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Close Documentation
          </button>
        </div>
      </div>
    </div>
  );
};
