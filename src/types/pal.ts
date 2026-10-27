export type CVFilterMode = 'raw' | 'highpass' | 'clahe' | 'darkfield';

export type TemporalSymbolGlyph =
  | 'stylized-v'
  | 'shamir-s'
  | 'zeiss-z'
  | 'hoya-circle'
  | 'diamond'
  | 'triangle'
  | 'infinity'
  | 'bird-wing'
  | 'hexagon'
  | 'alphanumeric'
  | 'custom';

export interface MaterialSpec {
  code: string;
  index: string;
  name: string;
}

export interface PALLensDesign {
  id: string;
  brand: string;
  designName: string;
  temporalSymbolCategory: TemporalSymbolGlyph;
  temporalEngravingCode: string;
  temporalMarkLabel: string;
  temporalCustomDataUrl?: string;
  nasalEngravingFormat: string;
  nasalExample: string;
  supportedAddRange: [number, number];
  fittingCrossDropMm: number; // Vertical height of Fitting Cross above 180° PRP line (+2, +4, +6 mm)
  minFittingHeightMm: number;
  corridorLengthsMm: number[];
  nearInsetMm: number;
  referenceDistanceMm: number; // Standard 34.0 mm
  materials: MaterialSpec[];
  technicalPdfUrl: string;
  notes: string;
  isCustom?: boolean;
  createdAt?: number;
}

export interface ReticleConfig {
  showReticle: boolean;
  fittingCrossOffsetMm: 2 | 4 | 6;
  eyeSide: 'OD' | 'OS'; // Right Eye (OD) or Left Eye (OS) flips temporal/nasal labels accurately!
  showCorridorZone: boolean;
  showGridRule: boolean;
  rotationDeg: number;
  pxPerMm: number; // Calibrated physical pixel-to-millimeter ratio
}
