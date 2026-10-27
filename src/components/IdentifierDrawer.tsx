import React, { useState } from 'react';
import {
  Search,
  ChevronUp,
  ChevronDown,
  Plus,
  RotateCcw,
  ScanText,
  Crosshair,
  SlidersHorizontal,
  Sparkles,
  Delete
} from 'lucide-react';
import { PALLensDesign, TemporalSymbolGlyph } from '../types/pal';
import { TEMPORAL_SYMBOL_CATALOG } from '../data/symbolCatalog';
import { TemporalSymbolIcon } from './TemporalSymbolIcon';
import {
  parseNasalAddInput,
  ScoredLensMatch,
  SearchFilterCriteria
} from '../utils/palMatcher';

interface IdentifierDrawerProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  criteria: SearchFilterCriteria;
  onChangeCriteria: React.Dispatch<React.SetStateAction<SearchFilterCriteria>>;
  matches: ScoredLensMatch[];
  pinnedLens: PALLensDesign | null;
  onSelectLensDetail: (lens: PALLensDesign) => void;
  onPinToReticle: (lens: PALLensDesign | null) => void;
  onOpenAddCustomModal: () => void;
  onTriggerOCRScan: () => void;
  isScanningOCR: boolean;
  ocrStatusMessage: string | null;
}

export const IdentifierDrawer: React.FC<IdentifierDrawerProps> = ({
  isOpen,
  onToggleOpen,
  criteria,
  onChangeCriteria,
  matches,
  pinnedLens,
  onSelectLensDetail,
  onPinToReticle,
  onOpenAddCustomModal,
  onTriggerOCRScan,
  isScanningOCR,
  ocrStatusMessage
}) => {
  const [activeTab, setActiveTab] = useState<'symbols' | 'keypad' | 'results'>('symbols');

  const parsedAdd = parseNasalAddInput(criteria.nasalAddRaw);

  const hasActiveFilters =
    criteria.query.trim() !== '' ||
    criteria.symbol !== 'all' ||
    criteria.nasalAddRaw.trim() !== '' ||
    criteria.fittingCrossDrop !== 'all';

  const resetFilters = () => {
    onChangeCriteria({
      query: '',
      symbol: 'all',
      nasalAddRaw: '',
      fittingCrossDrop: 'all'
    });
  };

  const handleKeypadDigit = (digit: string) => {
    onChangeCriteria((prev) => {
      const next = (prev.nasalAddRaw + digit).slice(0, 4);
      return { ...prev, nasalAddRaw: next };
    });
  };

  const handleKeypadBackspace = () => {
    onChangeCriteria((prev) => ({
      ...prev,
      nasalAddRaw: prev.nasalAddRaw.slice(0, -1)
    }));
  };

  const quickAddPresets = [
    { code: '15', label: '+1.50' },
    { code: '175', label: '+1.75' },
    { code: '20', label: '+2.00' },
    { code: '225', label: '+2.25' },
    { code: '25', label: '+2.50' },
    { code: '30', label: '+3.00' }
  ];

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 transition-transform duration-300 ease-out flex flex-col bg-oled-panel/95 backdrop-blur-xl border-t-2 border-oled-border shadow-2xl rounded-t-3xl ${
        isOpen ? 'translate-y-0 h-[78vh] sm:h-[72vh]' : 'translate-y-[calc(100%-64px)] h-[72vh]'
      }`}
    >
      {/* Top Pull Handle & Quick Summary Bar */}
      <div
        onClick={onToggleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onToggleOpen();
        }}
        className="h-16 px-4 sm:px-6 flex items-center justify-between cursor-pointer select-none border-b border-oled-border/80 bg-oled-surface/90 rounded-t-3xl shrink-0"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-optic-yellow text-oled flex items-center justify-center font-bold shadow-neon-yellow">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white">
                PAL Identifier & Symbol Engine
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-optic-cyan/20 border border-optic-cyan/50 text-optic-cyan font-mono text-xs font-bold">
                {matches.length} {matches.length === 1 ? 'Match' : 'Matches'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono hidden sm:block">
              Filter by Temporal Glyph, Nasal Add Keypad (e.g. 20 → +2.00, 225 → +2.25), or Laser Code
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-oled border border-optic-danger/50 text-optic-danger font-mono text-xs font-bold hover:bg-optic-danger/15 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
          <button
            onClick={onOpenAddCustomModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-oled border border-optic-yellow/60 text-optic-yellow font-mono text-xs font-bold hover:bg-optic-yellow/15 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Custom PAL</span>
          </button>
          <button
            onClick={onToggleOpen}
            className="p-2 rounded-xl bg-oled border border-oled-border text-slate-200 hover:border-optic-cyan"
            aria-label={isOpen ? 'Collapse Identifier Drawer' : 'Expand Identifier Drawer'}
          >
            {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expanded Drawer Body */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Left/Top Criteria Controls Column */}
        <div className="lg:w-[48%] xl:w-[45%] p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-oled-border overflow-y-auto space-y-4 shrink-0">
          {/* Free-Text Search & OCR Trigger Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={criteria.query}
                onChange={(e) =>
                  onChangeCriteria((prev) => ({ ...prev, query: e.target.value }))
                }
                placeholder="Brand, design, or code (Essilor, Shamir, CM, III, NVL...)"
                className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-oled border border-oled-border text-white text-sm placeholder:text-slate-500 focus:border-optic-cyan focus:outline-none"
              />
              {criteria.query && (
                <button
                  onClick={() => onChangeCriteria((prev) => ({ ...prev, query: '' }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={onTriggerOCRScan}
              disabled={isScanningOCR}
              title="Run Local OCR on Nasal Reference Bracket"
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-optic-cyan/15 border border-optic-cyan/50 text-optic-cyan font-mono text-xs font-bold hover:bg-optic-cyan/25 disabled:opacity-50 transition-all shrink-0"
            >
              <ScanText className="w-4 h-4" />
              {isScanningOCR ? 'OCR...' : 'OCR Add'}
            </button>
          </div>

          {ocrStatusMessage && (
            <div className="px-3 py-2 rounded-xl bg-optic-cyan/10 border border-optic-cyan/40 text-optic-cyan text-xs font-mono flex items-center justify-between">
              <span>{ocrStatusMessage}</span>
            </div>
          )}

          {/* Mobile Sub-Tab Switcher (Symbols vs Keypad) */}
          <div className="flex lg:hidden rounded-xl bg-oled p-1 border border-oled-border">
            <button
              onClick={() => setActiveTab('symbols')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-colors ${
                activeTab === 'symbols'
                  ? 'bg-optic-yellow text-oled'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              1. Temporal Symbols
            </button>
            <button
              onClick={() => setActiveTab('keypad')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-colors ${
                activeTab === 'keypad'
                  ? 'bg-optic-cyan text-oled'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              2. Nasal Add ({parsedAdd.formatted})
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-colors ${
                activeTab === 'results'
                  ? 'bg-white text-oled'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Results ({matches.length})
            </button>
          </div>

          {/* Section 1: Visual Symbol Picker */}
          <div className={`${activeTab === 'keypad' || activeTab === 'results' ? 'hidden lg:block' : 'block'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
                1. Temporal Symbol Picker
              </span>
              {criteria.symbol !== 'all' && (
                <button
                  onClick={() => onChangeCriteria((prev) => ({ ...prev, symbol: 'all' }))}
                  className="text-xs font-mono text-optic-yellow hover:underline"
                >
                  Show All Symbols
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              <button
                onClick={() => onChangeCriteria((prev) => ({ ...prev, symbol: 'all' }))}
                className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                  criteria.symbol === 'all'
                    ? 'bg-optic-yellow text-oled border-optic-yellow font-bold shadow-neon-yellow'
                    : 'bg-oled border-oled-border text-slate-300 hover:border-slate-500'
                }`}
              >
                <SlidersHorizontal className="w-5 h-5 my-0.5" />
                <span className="text-[10px] font-mono mt-1">All PALs</span>
              </button>

              {TEMPORAL_SYMBOL_CATALOG.map((sym) => {
                const selected = criteria.symbol === sym.id;
                return (
                  <button
                    key={sym.id}
                    onClick={() =>
                      onChangeCriteria((prev) => ({
                        ...prev,
                        symbol: prev.symbol === sym.id ? 'all' : (sym.id as TemporalSymbolGlyph)
                      }))
                    }
                    title={`${sym.name} (${sym.manufacturers})`}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                      selected
                        ? 'bg-optic-yellow text-oled border-optic-yellow font-bold shadow-neon-yellow'
                        : 'bg-oled border-oled-border text-slate-200 hover:border-optic-yellow/60'
                    }`}
                  >
                    <TemporalSymbolIcon symbol={sym.id} className="w-6 h-6" />
                    <span className="text-[10px] font-mono mt-1 truncate max-w-full">
                      {sym.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Nasal Add Power Keypad & Fitting Cross Drop Filter */}
          <div className={`${activeTab === 'symbols' || activeTab === 'results' ? 'hidden lg:block' : 'block'} space-y-3 pt-1`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
                2. Nasal Add Power Keypad
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-oled border border-oled-border font-mono text-xs text-slate-300">
                  Input: <strong className="text-optic-yellow">{criteria.nasalAddRaw || '—'}</strong>
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-optic-cyan/15 border border-optic-cyan/40 font-mono text-xs font-bold text-optic-cyan">
                  {parsedAdd.formatted}
                </span>
              </div>
            </div>

            {/* Quick One-Tap Add Presets */}
            <div className="grid grid-cols-6 gap-1.5">
              {quickAddPresets.map((p) => {
                const isActive = criteria.nasalAddRaw === p.code;
                return (
                  <button
                    key={p.code}
                    onClick={() =>
                      onChangeCriteria((prev) => ({
                        ...prev,
                        nasalAddRaw: prev.nasalAddRaw === p.code ? '' : p.code
                      }))
                    }
                    className={`py-1.5 px-1 rounded-lg border font-mono text-center transition-all ${
                      isActive
                        ? 'bg-optic-cyan text-oled border-optic-cyan font-extrabold shadow-neon-cyan'
                        : 'bg-oled border-oled-border text-slate-300 hover:border-optic-cyan/60'
                    }`}
                  >
                    <div className="text-xs font-bold">&ldquo;{p.code}&rdquo;</div>
                    <div className="text-[10px] opacity-80">{p.label}</div>
                  </button>
                );
              })}
            </div>

            {/* Numeric Tactile Keypad */}
            <div className="grid grid-cols-6 gap-1.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handleKeypadDigit(digit)}
                  className="py-2 rounded-xl bg-oled border border-oled-border hover:border-optic-yellow text-white font-mono font-bold text-sm active:scale-95 transition-all"
                >
                  {digit}
                </button>
              ))}
              <button
                onClick={handleKeypadBackspace}
                className="py-2 rounded-xl bg-oled border border-oled-border hover:border-optic-amber text-optic-amber font-mono font-bold text-xs flex items-center justify-center active:scale-95"
                title="Backspace"
              >
                <Delete className="w-4 h-4" />
              </button>
              <button
                onClick={() => onChangeCriteria((prev) => ({ ...prev, nasalAddRaw: '' }))}
                className="py-2 rounded-xl bg-oled border border-oled-border hover:border-optic-danger text-optic-danger font-mono font-bold text-xs active:scale-95"
              >
                CLR
              </button>
            </div>

            {/* Fitting Cross Drop Filter Row */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Fitting Cross Offset:
              </span>
              <div className="flex gap-1.5">
                {(['all', 2, 4, 6] as const).map((drop) => (
                  <button
                    key={String(drop)}
                    onClick={() =>
                      onChangeCriteria((prev) => ({ ...prev, fittingCrossDrop: drop }))
                    }
                    className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border transition-all ${
                      criteria.fittingCrossDrop === drop
                        ? 'bg-optic-yellow text-oled border-optic-yellow'
                        : 'bg-oled border-oled-border text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {drop === 'all' ? 'All Drops' : `+${drop} mm`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right/Bottom Matched PAL Cards List */}
        <div
          className={`flex-1 p-4 sm:p-5 overflow-y-auto ${
            activeTab !== 'results' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Matched Progressive Lens Designs ({matches.length})
            </span>
            {pinnedLens && (
              <span className="text-xs font-mono text-optic-emerald flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                HUD Pinned: {pinnedLens.designName}
              </span>
            )}
          </div>

          {matches.length === 0 ? (
            <div className="bg-oled rounded-2xl border border-oled-border p-8 text-center space-y-3">
              <p className="text-base font-bold text-white">
                No progressive lenses match the current filter combination
              </p>
              <p className="text-xs font-mono text-slate-400 max-w-md mx-auto">
                Try clearing the Temporal Symbol or Fitting Cross Offset filter, or add your lab&apos;s proprietary freeform design to IndexedDB.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 rounded-xl bg-optic-cyan text-oled font-bold text-xs"
                >
                  Reset All Filters
                </button>
                <button
                  onClick={onOpenAddCustomModal}
                  className="px-4 py-2 rounded-xl bg-oled-surface border border-optic-yellow text-optic-yellow font-bold text-xs"
                >
                  + Add Custom Lab Design
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {matches.map(({ lens, matchReasons }) => {
                const isPinned = pinnedLens?.id === lens.id;
                return (
                  <div
                    key={lens.id}
                    onClick={() => onSelectLensDetail(lens)}
                    className={`group cursor-pointer rounded-2xl border p-3.5 transition-all flex flex-col justify-between ${
                      isPinned
                        ? 'bg-oled border-optic-emerald shadow-lg'
                        : 'bg-oled border-oled-border hover:border-optic-yellow/80 hover:bg-oled-surface/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-oled-surface border border-oled-border group-hover:border-optic-yellow/60 flex items-center justify-center text-optic-yellow shrink-0">
                            <TemporalSymbolIcon
                              symbol={lens.temporalSymbolCategory}
                              customDataUrl={lens.temporalCustomDataUrl}
                              className="w-6 h-6"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-mono font-bold uppercase text-optic-cyan">
                                {lens.brand}
                              </span>
                              {lens.isCustom && (
                                <span className="px-1.5 py-0.2 rounded bg-optic-yellow/20 text-optic-yellow font-mono text-[9px] font-bold uppercase">
                                  CUSTOM
                                </span>
                              )}
                            </div>
                            <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-optic-yellow transition-colors leading-snug">
                              {lens.designName}
                            </h3>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPinToReticle(isPinned ? null : lens);
                          }}
                          title={isPinned ? 'Unpin from Scope HUD' : 'Pin Layout to Scope HUD'}
                          className={`p-2 rounded-xl border transition-colors shrink-0 ${
                            isPinned
                              ? 'bg-optic-emerald text-oled border-optic-emerald'
                              : 'bg-oled-surface border-oled-border text-slate-400 hover:text-optic-yellow hover:border-optic-yellow'
                          }`}
                        >
                          <Crosshair className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Engraving Code Badges */}
                      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center font-mono">
                        <div className="bg-oled-surface rounded-lg px-2 py-1 border border-oled-border">
                          <span className="text-[9px] text-slate-400 block uppercase">Temporal</span>
                          <span className="text-xs font-bold text-optic-yellow">
                            {lens.temporalEngravingCode}
                          </span>
                        </div>
                        <div className="bg-oled-surface rounded-lg px-2 py-1 border border-oled-border">
                          <span className="text-[9px] text-slate-400 block uppercase">FC Drop</span>
                          <span className="text-xs font-bold text-white">
                            +{lens.fittingCrossDropMm} mm
                          </span>
                        </div>
                        <div className="bg-oled-surface rounded-lg px-2 py-1 border border-oled-border">
                          <span className="text-[9px] text-slate-400 block uppercase">Min Fit</span>
                          <span className="text-xs font-bold text-optic-cyan">
                            {lens.minFittingHeightMm} mm
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Match Reason Pills or Material Summary */}
                    <div className="mt-2.5 pt-2 border-t border-oled-border/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span className="truncate">
                        {matchReasons.length > 0
                          ? matchReasons[0]
                          : `Nasal: ${lens.nasalExample} | Corridors: ${lens.corridorLengthsMm.join('/')}`}
                      </span>
                      <span className="text-optic-yellow font-bold shrink-0 ml-2 group-hover:translate-x-0.5 transition-transform">
                        Spec →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
