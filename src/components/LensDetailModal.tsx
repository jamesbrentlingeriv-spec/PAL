import React, { useState } from 'react';
import {
  X,
  Crosshair,
  FileText,
  Layers,
  CheckCircle2,
  ArrowUpRight,
  Trash2,
  Printer,
  Sparkles
} from 'lucide-react';
import { PALLensDesign } from '../types/pal';
import { TemporalSymbolIcon } from './TemporalSymbolIcon';

interface LensDetailModalProps {
  lens: PALLensDesign | null;
  isPinnedToReticle: boolean;
  onPinToReticle: (lens: PALLensDesign | null) => void;
  onDeleteCustomLens?: (id: string) => void;
  onLoadIntoSimulator?: (lens: PALLensDesign) => void;
  onClose: () => void;
}

export const LensDetailModal: React.FC<LensDetailModalProps> = ({
  lens,
  isPinnedToReticle,
  onPinToReticle,
  onDeleteCustomLens,
  onLoadIntoSimulator,
  onClose
}) => {
  const [previewEye, setPreviewEye] = useState<'OD' | 'OS'>('OD');
  const [showFittingSheet, setShowFittingSheet] = useState(false);

  if (!lens) return null;

  const isOD = previewEye === 'OD';
  const tempX = isOD ? 88 : 232;
  const nasalX = isOD ? 232 : 88;
  const nearX = isOD ? 160 + lens.nearInsetMm * 4.2 : 160 - lens.nearInsetMm * 4.2;
  const fcY = 115 - lens.fittingCrossDropMm * 5.5;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="bg-oled-panel border-2 border-oled-border rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-oled-surface border-b border-oled-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-oled border border-optic-yellow/50 flex items-center justify-center text-optic-yellow shadow-neon-yellow">
              <TemporalSymbolIcon
                symbol={lens.temporalSymbolCategory}
                customDataUrl={lens.temporalCustomDataUrl}
                className="w-8 h-8"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-optic-cyan/15 border border-optic-cyan/40 text-optic-cyan font-mono text-xs font-bold uppercase tracking-wider">
                  {lens.brand}
                </span>
                {lens.isCustom && (
                  <span className="px-2 py-0.5 rounded-md bg-optic-yellow/20 border border-optic-yellow/50 text-optic-yellow font-mono text-[11px] font-bold uppercase">
                    Lab Custom
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-0.5">
                {lens.designName}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-oled border border-oled-border text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            aria-label="Close detail view"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Top Grid: Vector Layout Blueprint + Key Optical Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Left: Interactive Vector Layout Schematic */}
            <div className="md:col-span-6 bg-oled rounded-2xl border border-oled-border p-4 flex flex-col items-center justify-between relative">
              <div className="w-full flex items-center justify-between mb-2">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  OLA 34.0 mm Vector Layout ({previewEye})
                </span>
                <div className="flex rounded-lg bg-oled-surface border border-oled-border p-0.5">
                  {(['OD', 'OS'] as const).map((eye) => (
                    <button
                      key={eye}
                      onClick={() => setPreviewEye(eye)}
                      className={`px-2.5 py-1 rounded-md font-mono text-xs font-bold transition-colors ${
                        previewEye === eye
                          ? 'bg-optic-yellow text-oled'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {eye}
                    </button>
                  ))}
                </div>
              </div>

              <svg
                viewBox="0 0 320 230"
                className="w-full max-w-[320px] h-auto"
              >
                {/* Lens Contour */}
                <ellipse
                  cx="160"
                  cy="115"
                  rx="132"
                  ry="96"
                  fill="#101520"
                  stroke="#252B3D"
                  strokeWidth="2.5"
                />
                <ellipse
                  cx="160"
                  cy="115"
                  rx="126"
                  ry="90"
                  fill="none"
                  stroke="#00F0FF"
                  strokeWidth="0.8"
                  strokeDasharray="4 4"
                  opacity="0.4"
                />

                {/* 180° Reference Line */}
                <line
                  x1="22"
                  y1="115"
                  x2="298"
                  y2="115"
                  stroke="#00F0FF"
                  strokeWidth="1.5"
                  opacity="0.75"
                />
                <line
                  x1="160"
                  y1="25"
                  x2="160"
                  y2="205"
                  stroke="#00F0FF"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  opacity="0.45"
                />

                {/* Distance Arc */}
                <path
                  d="M 105 64 Q 160 44 215 64"
                  fill="none"
                  stroke="#00F0FF"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.55"
                />
                <text
                  x="160"
                  y="48"
                  textAnchor="middle"
                  fill="#00F0FF"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  DISTANCE DRP ZONE
                </text>

                {/* Center PRP Dot */}
                <circle cx="160" cy="115" r="3.5" fill="#00F0FF" />
                <text
                  x="167"
                  y="127"
                  fill="#00F0FF"
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  PRP
                </text>

                {/* Fitting Cross (+Drop above 180 line) */}
                <line
                  x1="150"
                  y1={fcY}
                  x2="170"
                  y2={fcY}
                  stroke="#E2F804"
                  strokeWidth="2.4"
                />
                <line
                  x1="160"
                  y1={fcY - 10}
                  x2="160"
                  y2={fcY + 10}
                  stroke="#E2F804"
                  strokeWidth="2.4"
                />
                <text
                  x="175"
                  y={fcY + 3}
                  fill="#E2F804"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  FC (+{lens.fittingCrossDropMm}mm)
                </text>

                {/* Temporal Reference Mark (-17mm or +17mm) */}
                <circle
                  cx={tempX}
                  cy="115"
                  r="11"
                  fill="rgba(226, 248, 4, 0.1)"
                  stroke="#E2F804"
                  strokeWidth="2"
                />
                <circle cx={tempX} cy="115" r="2" fill="#E2F804" />
                <text
                  x={tempX}
                  y="96"
                  textAnchor="middle"
                  fill="#E2F804"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  TEMPORAL
                </text>
                <rect
                  x={tempX - 36}
                  y="131"
                  width="72"
                  height="18"
                  rx="4"
                  fill="#090A0F"
                  stroke="#E2F804"
                  strokeWidth="1"
                />
                <text
                  x={tempX}
                  y="143"
                  textAnchor="middle"
                  fill="#E2F804"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  {lens.temporalEngravingCode}
                </text>

                {/* Nasal Reference Mark (+17mm or -17mm) */}
                <circle
                  cx={nasalX}
                  cy="115"
                  r="11"
                  fill="rgba(226, 248, 4, 0.1)"
                  stroke="#E2F804"
                  strokeWidth="2"
                />
                <circle cx={nasalX} cy="115" r="2" fill="#E2F804" />
                <text
                  x={nasalX}
                  y="96"
                  textAnchor="middle"
                  fill="#E2F804"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  NASAL ADD
                </text>
                <rect
                  x={nasalX - 30}
                  y="131"
                  width="60"
                  height="18"
                  rx="4"
                  fill="#090A0F"
                  stroke="#00F0FF"
                  strokeWidth="1"
                />
                <text
                  x={nasalX}
                  y="143"
                  textAnchor="middle"
                  fill="#00F0FF"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  {lens.nasalExample}
                </text>

                {/* Near Zone Reading Circle */}
                <circle
                  cx={nearX}
                  cy="176"
                  r="16"
                  fill="rgba(0, 240, 255, 0.12)"
                  stroke="#00F0FF"
                  strokeWidth="1.8"
                />
                <text
                  x={nearX}
                  y="179"
                  textAnchor="middle"
                  fill="#00F0FF"
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  NEAR
                </text>
                <text
                  x="160"
                  y="218"
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  ◄─── 34.0 mm STANDARDIZED SPAN ───►
                </text>
              </svg>
            </div>

            {/* Right: Key Bench Metrics */}
            <div className="md:col-span-6 grid grid-cols-2 gap-3 content-start">
              <div className="bg-oled-surface border border-oled-border rounded-xl p-3.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
                  Fitting Cross Drop
                </span>
                <div className="text-2xl font-extrabold font-mono text-optic-yellow mt-1">
                  +{lens.fittingCrossDropMm}.0 mm
                </div>
                <span className="text-xs text-slate-400">Above 180° PRP Line</span>
              </div>

              <div className="bg-oled-surface border border-oled-border rounded-xl p-3.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
                  Min Fitting Height
                </span>
                <div className="text-2xl font-extrabold font-mono text-optic-cyan mt-1">
                  {lens.minFittingHeightMm} mm
                </div>
                <span className="text-xs text-slate-400">Recommended Min B-Height</span>
              </div>

              <div className="bg-oled-surface border border-oled-border rounded-xl p-3.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
                  Corridor Lengths
                </span>
                <div className="text-lg font-extrabold font-mono text-white mt-1">
                  {lens.corridorLengthsMm.join(' / ')} mm
                </div>
                <span className="text-xs text-slate-400">Available Progression Profiles</span>
              </div>

              <div className="bg-oled-surface border border-oled-border rounded-xl p-3.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
                  Near Nasal Inset
                </span>
                <div className="text-lg font-extrabold font-mono text-optic-emerald mt-1">
                  {lens.nearInsetMm.toFixed(1)} mm Nasal
                </div>
                <span className="text-xs text-slate-400">
                  Add: +{lens.supportedAddRange[0].toFixed(2)} to +{lens.supportedAddRange[1].toFixed(2)}
                </span>
              </div>

              <div className="col-span-2 bg-oled-surface border border-oled-border rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-optic-yellow font-bold">
                    Temporal Engraving Key
                  </span>
                  <span className="font-mono text-xs font-bold text-white bg-oled px-2 py-0.5 rounded border border-oled-border">
                    {lens.temporalEngravingCode}
                  </span>
                </div>
                <p className="text-xs text-slate-300">{lens.temporalMarkLabel}</p>
                <div className="pt-1.5 border-t border-oled-border/70 flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-optic-cyan font-bold">
                    Nasal Engraving Format
                  </span>
                  <span className="font-mono text-xs text-slate-300">
                    e.g. &ldquo;{lens.nasalExample}&rdquo;
                  </span>
                </div>
                <p className="text-xs text-slate-300">{lens.nasalEngravingFormat}</p>
              </div>
            </div>
          </div>

          {/* Supported Material Codes Table */}
          <div className="bg-oled-surface border border-oled-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-optic-cyan" />
              <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-slate-200">
                Manufacturer Material Suffix Codes & Refractive Indices
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {lens.materials.map((mat, idx) => (
                <div
                  key={`${mat.code}-${idx}`}
                  className="bg-oled rounded-xl border border-oled-border px-3 py-2 flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs font-semibold text-white block">{mat.name}</span>
                    <span className="text-[11px] font-mono text-slate-400">n = {mat.index}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-optic-yellow/15 border border-optic-yellow/40 font-mono font-bold text-sm text-optic-yellow">
                    {mat.code}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Clinical & Lab Bench Notes */}
          <div className="bg-oled rounded-xl border border-oled-border p-4">
            <h4 className="text-xs font-mono uppercase tracking-wider text-optic-yellow font-bold mb-1">
              Optical Lab & Fitting Notes
            </h4>
            <p className="text-sm text-slate-200 leading-relaxed">{lens.notes}</p>
          </div>

          {/* Built-in Offline Printable Fitting Chart Drawer */}
          {showFittingSheet && (
            <div className="bg-oled border-2 border-optic-cyan/50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase text-optic-cyan">
                  Offline Bench Verification & Layout Specification Sheet
                </span>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-optic-cyan text-oled font-bold text-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Bench Ticket
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2 bg-oled-surface rounded border border-oled-border">
                  <span className="text-slate-400 block">Reference Span</span>
                  <strong className="text-white">34.0 mm (±17.0 mm)</strong>
                </div>
                <div className="p-2 bg-oled-surface rounded border border-oled-border">
                  <span className="text-slate-400 block">Prism Check Point</span>
                  <strong className="text-white">0.0 mm on 180° Line</strong>
                </div>
                <div className="p-2 bg-oled-surface rounded border border-oled-border">
                  <span className="text-slate-400 block">DRP Location</span>
                  <strong className="text-white">+{lens.fittingCrossDropMm + 4}.0 mm above PRP</strong>
                </div>
                <div className="p-2 bg-oled-surface rounded border border-oled-border">
                  <span className="text-slate-400 block">NRP Inset</span>
                  <strong className="text-white">{lens.nearInsetMm} mm Nasal / -14 mm</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-oled-surface border-t border-oled-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowFittingSheet((prev) => !prev)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-oled border border-oled-border hover:border-optic-cyan text-slate-200 text-xs sm:text-sm font-semibold transition-colors"
            >
              <FileText className="w-4 h-4 text-optic-cyan" />
              {showFittingSheet ? 'Hide Spec Sheet' : 'Bench Spec Chart'}
            </button>

            <a
              href={lens.technicalPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-oled border border-oled-border hover:border-optic-cyan text-slate-300 hover:text-white text-xs sm:text-sm font-semibold transition-colors"
            >
              OLA / Manufacturer PDF
              <ArrowUpRight className="w-4 h-4 text-optic-cyan" />
            </a>

            {onLoadIntoSimulator && (
              <button
                onClick={() => {
                  onLoadIntoSimulator(lens);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-oled border border-optic-cyan/40 hover:border-optic-cyan text-optic-cyan text-xs sm:text-sm font-semibold transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Simulate Engraving on Scope
              </button>
            )}

            {lens.isCustom && onDeleteCustomLens && (
              <button
                onClick={() => {
                  onDeleteCustomLens(lens.id);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-optic-danger/15 border border-optic-danger/40 text-optic-danger text-xs sm:text-sm font-semibold hover:bg-optic-danger/25 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Custom
              </button>
            )}
          </div>

          <button
            onClick={() => {
              onPinToReticle(isPinnedToReticle ? null : lens);
              onClose();
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              isPinnedToReticle
                ? 'bg-optic-emerald text-oled shadow-lg'
                : 'bg-optic-yellow text-oled shadow-neon-yellow hover:brightness-110'
            }`}
          >
            {isPinnedToReticle ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Unpin from Scope HUD
              </>
            ) : (
              <>
                <Crosshair className="w-5 h-5" />
                Pin +{lens.fittingCrossDropMm}mm Layout to Scope HUD
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
