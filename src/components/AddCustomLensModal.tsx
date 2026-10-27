import React, { useState } from 'react';
import { X, PlusCircle, Upload, Check } from 'lucide-react';
import { PALLensDesign, TemporalSymbolGlyph } from '../types/pal';
import { TEMPORAL_SYMBOL_CATALOG } from '../data/symbolCatalog';
import { TemporalSymbolIcon } from './TemporalSymbolIcon';

interface AddCustomLensModalProps {
  isOpen: boolean;
  onSaveLens: (lens: PALLensDesign) => void;
  onClose: () => void;
}

export const AddCustomLensModal: React.FC<AddCustomLensModalProps> = ({
  isOpen,
  onSaveLens,
  onClose
}) => {
  const [brand, setBrand] = useState('');
  const [designName, setDesignName] = useState('');
  const [symbol, setSymbol] = useState<TemporalSymbolGlyph>('stylized-v');
  const [temporalCode, setTemporalCode] = useState('');
  const [customSvgDataUrl, setCustomSvgDataUrl] = useState<string | undefined>(undefined);
  const [nasalFormat, setNasalFormat] = useState('2-digit Add (e.g., 20 = +2.00)');
  const [nasalExample, setNasalExample] = useState('20');
  const [fittingCrossDropMm, setFittingCrossDropMm] = useState<number>(4);
  const [minFittingHeightMm, setMinFittingHeightMm] = useState<number>(14);
  const [nearInsetMm, setNearInsetMm] = useState<number>(2.5);
  const [corridorsInput, setCorridorsInput] = useState('11, 14');
  const [materialsInput, setMaterialsInput] = useState('P:1.59:Polycarbonate, 7:1.67:High Index 1.67');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomSvgDataUrl(reader.result);
        setSymbol('custom');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.trim() || !designName.trim()) {
      setErrorMsg('Please enter both a Brand / Lab Name and Design Name.');
      return;
    }

    const corridors = corridorsInput
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);

    const parsedMaterials = materialsInput
      .split(',')
      .map((entry) => {
        const [code, index, name] = entry.split(':').map((s) => s.trim());
        return {
          code: code || 'P',
          index: index || '1.59',
          name: name || 'Polycarbonate'
        };
      })
      .filter((m) => m.code);

    const newLens: PALLensDesign = {
      id: `custom-${Date.now()}-${designName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      brand: brand.trim(),
      designName: designName.trim(),
      temporalSymbolCategory: symbol,
      temporalEngravingCode: temporalCode.trim() || designName.slice(0, 3).toUpperCase(),
      temporalMarkLabel: `${symbol === 'custom' ? 'Custom Uploaded Glyph' : symbol} + ${
        temporalCode.trim() || designName.slice(0, 3).toUpperCase()
      }`,
      temporalCustomDataUrl: customSvgDataUrl,
      nasalEngravingFormat: nasalFormat.trim(),
      nasalExample: nasalExample.trim() || '20',
      supportedAddRange: [0.75, 3.5],
      fittingCrossDropMm: Number(fittingCrossDropMm) || 4,
      minFittingHeightMm: Number(minFittingHeightMm) || 14,
      corridorLengthsMm: corridors.length > 0 ? corridors : [14],
      nearInsetMm: Number(nearInsetMm) || 2.5,
      referenceDistanceMm: 34.0,
      materials:
        parsedMaterials.length > 0
          ? parsedMaterials
          : [{ code: 'P', index: '1.59', name: 'Polycarbonate' }],
      technicalPdfUrl: 'https://www.thevisioncouncil.org/members/progressive-identifier',
      notes:
        notes.trim() ||
        `Proprietary in-house digital freeform design saved to local IndexedDB bench catalog.`,
      isCustom: true,
      createdAt: Date.now()
    };

    onSaveLens(newLens);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="bg-oled-panel border-2 border-oled-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-oled-surface border-b border-oled-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-optic-yellow/15 border border-optic-yellow/40 text-optic-yellow">
              <PlusCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white uppercase tracking-wide">
                Add Custom Lab Lens Design
              </h2>
              <p className="text-xs font-mono text-slate-400">
                Saved offline to local IndexedDB for private-label & digital freeform PALs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            aria-label="Close modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-optic-danger/20 border border-optic-danger text-optic-danger text-xs font-mono">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                Manufacturer / Lab Brand *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. LabOptix Freeform"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-oled border border-oled-border text-white text-sm focus:border-optic-yellow focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                Progressive Design Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Apex HD Short 14"
                value={designName}
                onChange={(e) => setDesignName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-oled border border-oled-border text-white text-sm focus:border-optic-yellow focus:outline-none"
              />
            </div>
          </div>

          {/* Temporal Symbol Picker + Custom Upload */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono uppercase tracking-wider text-slate-300">
                Temporal Mark Symbol (Pick Glyph or Upload SVG/PNG)
              </label>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-oled-surface border border-optic-cyan/50 text-optic-cyan text-xs font-semibold hover:bg-optic-cyan/15 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                Upload SVG/PNG
                <input
                  type="file"
                  accept="image/svg+xml,image/png,image/jpeg"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {TEMPORAL_SYMBOL_CATALOG.map((item) => {
                const isSelected = symbol === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSymbol(item.id)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-optic-yellow/15 border-optic-yellow text-optic-yellow shadow-neon-yellow'
                        : 'bg-oled border-oled-border text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <TemporalSymbolIcon
                      symbol={item.id}
                      customDataUrl={item.id === 'custom' ? customSvgDataUrl : undefined}
                      className="w-6 h-6"
                    />
                    <span className="text-[10px] font-mono mt-1 truncate max-w-full">
                      {item.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Laser Codes & Nasal Format */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                Temporal Laser Code
              </label>
              <input
                type="text"
                placeholder="e.g. ◇ APX"
                value={temporalCode}
                onChange={(e) => setTemporalCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-oled border border-oled-border text-white font-mono text-sm focus:border-optic-yellow focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                Nasal Add Format
              </label>
              <select
                value={nasalFormat}
                onChange={(e) => setNasalFormat(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-oled border border-oled-border text-white text-sm focus:border-optic-yellow focus:outline-none"
              >
                <option value="2-digit Add (e.g., 20 = +2.00)">2-Digit Add (20 = +2.00)</option>
                <option value="3-digit Add (e.g., 225 = +2.25)">3-Digit Add (225 = +2.25)</option>
                <option value="2-digit Add over Corridor">2-Digit Add + Corridor</option>
                <option value="Decimal Add (e.g., 2.00)">Decimal Add (2.00)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                Nasal Stamp Example
              </label>
              <input
                type="text"
                placeholder="e.g. 20 or 225"
                value={nasalExample}
                onChange={(e) => setNasalExample(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-oled border border-oled-border text-white font-mono text-sm focus:border-optic-yellow focus:outline-none"
              />
            </div>
          </div>

          {/* Fitting Cross Drop, Min Fit Height, Inset */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                Fitting Cross Drop (mm)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[2, 4, 6].map((drop) => (
                  <button
                    type="button"
                    key={drop}
                    onClick={() => setFittingCrossDropMm(drop)}
                    className={`py-2 rounded-xl font-mono font-bold text-sm border transition-all ${
                      fittingCrossDropMm === drop
                        ? 'bg-optic-yellow text-oled border-optic-yellow'
                        : 'bg-oled border-oled-border text-slate-300'
                    }`}
                  >
                    +{drop} mm
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                Min Fitting Height (mm)
              </label>
              <input
                type="number"
                min={10}
                max={24}
                value={minFittingHeightMm}
                onChange={(e) => setMinFittingHeightMm(parseInt(e.target.value, 10) || 14)}
                className="w-full px-3.5 py-2 rounded-xl bg-oled border border-oled-border text-white font-mono text-sm focus:border-optic-yellow focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                Near Nasal Inset (mm)
              </label>
              <input
                type="number"
                step="0.1"
                min={0}
                max={5}
                value={nearInsetMm}
                onChange={(e) => setNearInsetMm(parseFloat(e.target.value) || 2.5)}
                className="w-full px-3.5 py-2 rounded-xl bg-oled border border-oled-border text-white font-mono text-sm focus:border-optic-yellow focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                Corridor Lengths (mm, comma-separated)
              </label>
              <input
                type="text"
                value={corridorsInput}
                onChange={(e) => setCorridorsInput(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-oled border border-oled-border text-white font-mono text-sm focus:border-optic-yellow focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
                Material Codes (Code:Index:Name)
              </label>
              <input
                type="text"
                value={materialsInput}
                onChange={(e) => setMaterialsInput(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-oled border border-oled-border text-white font-mono text-xs focus:border-optic-yellow focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-300 mb-1.5">
              Bench Fitting & Identification Notes
            </label>
            <textarea
              rows={2}
              placeholder="Optional surfacing parameters, minimum B-measurement notes, or compensator remarks..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-oled border border-oled-border text-white text-sm focus:border-optic-yellow focus:outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-oled border border-oled-border text-slate-300 hover:text-white text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-optic-yellow text-oled font-bold text-sm shadow-neon-yellow hover:brightness-110 transition-all"
            >
              <Check className="w-5 h-5" />
              Save Custom PAL to IndexedDB
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
