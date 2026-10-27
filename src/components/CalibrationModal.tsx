import React, { useState } from 'react';
import { X, Ruler, CreditCard, RotateCcw, Check } from 'lucide-react';

interface CalibrationModalProps {
  isOpen: boolean;
  currentPxPerMm: number;
  onSavePxPerMm: (pxPerMm: number) => void;
  onClose: () => void;
}

/**
 * Interactive Physical Scale Calibration Tool:
 * Allows the bench optician to calibrate exact physical pixel-to-millimeter scale
 * using either an ISO/IEC 7810 ID-1 standard credit/PD card (85.60 mm x 53.98 mm)
 * or a physical millimeter bench ruler (50.0 mm span).
 */
export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  currentPxPerMm,
  onSavePxPerMm,
  onClose
}) => {
  const [pxPerMm, setPxPerMm] = useState<number>(currentPxPerMm);
  const [mode, setMode] = useState<'card' | 'ruler'>('card');

  if (!isOpen) return null;

  // Standard ID-1 Credit Card width = 85.60 mm (or short edge = 53.98 mm)
  const cardShortEdgeMm = 53.98;
  const rulerReferenceMm = 50.0;

  const cardWidthPx = Math.round(cardShortEdgeMm * pxPerMm);
  const rulerWidthPx = Math.round(rulerReferenceMm * pxPerMm);
  const ref34MmPx = Math.round(34.0 * pxPerMm);

  const presets = [
    { name: 'iPad Pro / Air (11"–13")', value: 5.2 },
    { name: 'iPad Mini (8.3")', value: 6.4 },
    { name: 'Surface Pro / 1080p Bench', value: 4.6 },
    { name: 'Mobile High-DPI (Macro 1:1)', value: 5.8 }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-oled-panel border-2 border-oled-border rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-oled-surface border-b border-oled-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-optic-yellow/15 border border-optic-yellow/40 text-optic-yellow">
              <Ruler className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-wide text-white uppercase">
                34.0 mm Physical Scale Calibration
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Match on-screen guide to a physical PD ruler or credit card held against glass
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close calibration modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {/* Reference Mode Switcher */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode('card')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border font-semibold text-sm transition-all ${
                mode === 'card'
                  ? 'bg-optic-yellow text-oled border-optic-yellow shadow-neon-yellow'
                  : 'bg-oled-surface text-slate-300 border-oled-border hover:border-slate-500'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              Credit Card Short Edge (53.98 mm)
            </button>
            <button
              onClick={() => setMode('ruler')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border font-semibold text-sm transition-all ${
                mode === 'ruler'
                  ? 'bg-optic-cyan text-oled border-optic-cyan shadow-neon-cyan'
                  : 'bg-oled-surface text-slate-300 border-oled-border hover:border-slate-500'
              }`}
            >
              <Ruler className="w-5 h-5" />
              Metric PD Ruler (50.0 mm)
            </button>
          </div>

          {/* Interactive Physical Alignment Box */}
          <div className="bg-oled rounded-xl border border-oled-border p-6 flex flex-col items-center justify-center min-h-[210px] relative overflow-hidden">
            {mode === 'card' ? (
              <div className="flex flex-col items-center">
                <span className="text-xs font-mono text-optic-yellow uppercase tracking-wider mb-3">
                  Place Credit Card / Insurance Card Vertically Inside Yellow Brackets (53.98 mm)
                </span>
                <div
                  style={{ width: `${cardWidthPx}px`, height: '118px' }}
                  className="border-2 border-optic-yellow bg-optic-yellow/10 rounded-xl relative flex flex-col items-center justify-center transition-all"
                >
                  <div className="absolute -left-1 top-0 bottom-0 w-1.5 bg-optic-yellow" />
                  <div className="absolute -right-1 top-0 bottom-0 w-1.5 bg-optic-yellow" />
                  <span className="font-mono font-bold text-optic-yellow text-base">
                    53.98 mm
                  </span>
                  <span className="font-mono text-xs text-slate-300 mt-1">
                    ISO ID-1 Card Height ({cardWidthPx} px)
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-xs font-mono text-optic-cyan uppercase tracking-wider mb-3">
                  Align Optical Bench PD Ruler 0 mm to 50 mm Marks
                </span>
                <div
                  style={{ width: `${rulerWidthPx}px` }}
                  className="border-b-2 border-optic-cyan bg-optic-cyan/10 pt-6 pb-2 relative transition-all"
                >
                  {Array.from({ length: 51 }).map((_, mm) => {
                    const isTen = mm % 10 === 0;
                    const isFive = mm % 5 === 0;
                    return (
                      <div
                        key={mm}
                        style={{
                          left: `${(mm / 50) * 100}%`,
                          height: isTen ? '22px' : isFive ? '14px' : '8px'
                        }}
                        className="absolute bottom-0 border-l border-optic-cyan"
                      >
                        {isTen && (
                          <span className="absolute -top-5 -translate-x-1/2 font-mono text-[10px] font-bold text-optic-cyan">
                            {mm}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <span className="font-mono text-xs text-slate-300 mt-3">
                  50.0 mm = {rulerWidthPx} px ({pxPerMm.toFixed(2)} px/mm)
                </span>
              </div>
            )}

            {/* Resulting 34.0 mm PAL Span Preview */}
            <div className="mt-5 pt-4 border-t border-oled-border w-full flex flex-col items-center">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                <span>Resulting 34.0 mm Laser Span: <strong className="text-optic-yellow">{ref34MmPx} px</strong></span>
              </div>
              <div
                style={{ width: `${ref34MmPx}px` }}
                className="h-3 border-x-2 border-optic-yellow flex items-center justify-between relative"
              >
                <div className="w-3 h-3 rounded-full border-2 border-optic-yellow -ml-1.5 bg-oled" />
                <div className="flex-1 h-0.5 bg-optic-cyan/60" />
                <div className="w-3 h-3 rounded-full border-2 border-optic-yellow -mr-1.5 bg-oled" />
              </div>
            </div>
          </div>

          {/* Fine Slider Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Scale Ratio Adjuster
              </label>
              <span className="font-mono text-base font-bold text-optic-yellow bg-oled px-3 py-1 rounded-lg border border-oled-border">
                {pxPerMm.toFixed(2)} px / mm
              </span>
            </div>
            <input
              type="range"
              min="3.0"
              max="9.0"
              step="0.05"
              value={pxPerMm}
              onChange={(e) => setPxPerMm(parseFloat(e.target.value))}
              className="w-full bench-slider"
            />
            <div className="flex justify-between text-xs font-mono text-slate-400">
              <span>3.0 px/mm (Desktop Monitor)</span>
              <span>6.0 px/mm (Tablet)</span>
              <span>9.0 px/mm (High-DPI Phone)</span>
            </div>
          </div>

          {/* Device Quick Presets */}
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 block mb-2">
              Workstation Quick Presets
            </span>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => setPxPerMm(preset.value)}
                  className="px-3 py-2 rounded-lg bg-oled-surface border border-oled-border hover:border-optic-cyan text-left transition-colors"
                >
                  <div className="text-xs font-semibold text-white">{preset.name}</div>
                  <div className="text-[11px] font-mono text-optic-cyan">{preset.value.toFixed(2)} px/mm</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-oled-surface border-t border-oled-border flex items-center justify-between gap-3">
          <button
            onClick={() => setPxPerMm(5.2)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-oled border border-oled-border text-slate-300 hover:text-white text-sm font-semibold"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Default (5.20)
          </button>
          <button
            onClick={() => {
              onSavePxPerMm(pxPerMm);
              onClose();
            }}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-optic-yellow text-oled font-bold text-sm shadow-neon-yellow hover:brightness-110 transition-all"
          >
            <Check className="w-5 h-5" />
            Lock 34.0 mm Calibration
          </button>
        </div>
      </div>
    </div>
  );
};
