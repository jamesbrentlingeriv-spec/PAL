import { TemporalSymbolGlyph } from '../types/pal';

export interface SymbolDefinition {
  id: TemporalSymbolGlyph;
  name: string;
  shortLabel: string;
  manufacturers: string;
  description: string;
}

export const TEMPORAL_SYMBOL_CATALOG: SymbolDefinition[] = [
  {
    id: 'stylized-v',
    name: 'Stylized "V" / Essilor Arc',
    shortLabel: 'Stylized V',
    manufacturers: 'Essilor / Varilux',
    description: 'Curved or stylized script "V" or "E" emblem above material/corridor code'
  },
  {
    id: 'shamir-s',
    name: 'Infinity Wave / Stylized "S"',
    shortLabel: 'Wave / S',
    manufacturers: 'Shamir Optical',
    description: 'Stylized S-wave or script monogram paired with design code (III, INT, SP)'
  },
  {
    id: 'zeiss-z',
    name: 'Carl Zeiss "Z" Frame',
    shortLabel: 'Zeiss Z',
    manufacturers: 'Carl Zeiss Vision',
    description: 'Micro-engraved Zeiss Z-box banner with numerical material & index suffix'
  },
  {
    id: 'hoya-circle',
    name: 'Concentric Circle / Arc Dot',
    shortLabel: 'Circle / O',
    manufacturers: 'Hoya Vision',
    description: 'Open circle, double ring, or Hoya H-circle emblem over design code'
  },
  {
    id: 'diamond',
    name: 'Diamond / Lozenge (◇)',
    shortLabel: 'Diamond ◇',
    manufacturers: 'Younger / Seiko / Kodak',
    description: 'Geometric diamond or lozenge outline around or above laser prefix'
  },
  {
    id: 'triangle',
    name: 'Delta Triangle (△)',
    shortLabel: 'Triangle △',
    manufacturers: 'Vision Ease / Hoya / IOT',
    description: 'Equilateral triangle or delta wedge marking temporal reference point'
  },
  {
    id: 'infinity',
    name: 'Infinity Loop (∞)',
    shortLabel: 'Infinity ∞',
    manufacturers: 'Essilor / Freeform Digital',
    description: 'Horizontal figure-eight / infinity loop symbol for binocular freeform designs'
  },
  {
    id: 'bird-wing',
    name: 'Bird Wings / Gull Arc',
    shortLabel: 'Bird Wing',
    manufacturers: 'Younger Image / Specialty',
    description: 'Twin curved gull-wing arcs or horizon curve over material code'
  },
  {
    id: 'hexagon',
    name: 'Hexagon / Shield (⬡)',
    shortLabel: 'Hexagon ⬡',
    manufacturers: 'Rodenstock / Nikon',
    description: 'Six-sided polygon or R-shield enclosing temporal reference point'
  },
  {
    id: 'alphanumeric',
    name: 'Alphanumeric Prefix (A–Z)',
    shortLabel: 'Code A-Z',
    manufacturers: 'Universal OLA Standard',
    description: 'Direct two- or three-character laser code (e.g. NVL, OVT, DEF, IMG)'
  },
  {
    id: 'custom',
    name: 'Custom Lab / Uploaded SVG',
    shortLabel: 'Custom Lab',
    manufacturers: 'In-House Private Label',
    description: 'Proprietary house brand or custom uploaded vector laser engraving'
  }
];
