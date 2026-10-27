import { PALLensDesign, TemporalSymbolGlyph } from '../types/pal';

export interface ParsedAddPower {
  raw: string;
  diopters: number | null;
  formatted: string;
  twoDigitCode: string;
  threeDigitCode: string;
}

/**
 * Translates quick bench keypad inputs (e.g. "20" -> +2.00, "225" -> +2.25, "22" -> +2.25, "175" -> +1.75)
 * into standardized optical Add Power diopters and OLA 2-digit / 3-digit laser engraving codes.
 */
export function parseNasalAddInput(rawInput: string): ParsedAddPower {
  const cleaned = rawInput.trim().replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return {
      raw: '',
      diopters: null,
      formatted: 'Any Add',
      twoDigitCode: '',
      threeDigitCode: ''
    };
  }

  let diopters: number | null = null;

  if (cleaned.includes('.')) {
    const val = parseFloat(cleaned);
    if (!isNaN(val) && val >= 0.5 && val <= 4.5) {
      diopters = Math.round(val * 4) / 4;
    }
  } else if (cleaned.length === 1) {
    // e.g. "2" -> +2.00
    const val = parseInt(cleaned, 10);
    if (val >= 1 && val <= 4) {
      diopters = val;
    }
  } else if (cleaned.length === 2) {
    // e.g. "20" -> +2.00, "22" -> +2.25, "25" -> +2.50, "27" -> +2.75, "17" -> +1.75
    const tens = parseInt(cleaned[0], 10);
    const ones = parseInt(cleaned[1], 10);
    if (ones === 2) {
      diopters = tens + 0.25;
    } else if (ones === 7) {
      diopters = tens + 0.75;
    } else if (ones === 5) {
      diopters = tens + 0.5;
    } else if (ones === 0) {
      diopters = tens;
    } else {
      diopters = Math.round((parseInt(cleaned, 10) / 10) * 4) / 4;
    }
  } else if (cleaned.length >= 3) {
    // e.g. "225" -> +2.25, "200" -> +2.00, "075" -> +0.75
    const sub = cleaned.slice(0, 3);
    const val = parseInt(sub, 10) / 100;
    if (!isNaN(val) && val >= 0.5 && val <= 4.5) {
      diopters = Math.round(val * 4) / 4;
    }
  }

  if (diopters === null || diopters < 0.5 || diopters > 4.5) {
    return {
      raw: cleaned,
      diopters: null,
      formatted: `Code "${cleaned}"`,
      twoDigitCode: cleaned.slice(0, 2),
      threeDigitCode: cleaned.slice(0, 3)
    };
  }

  const formatted = `+${diopters.toFixed(2)} D`;
  const threeDigitCode = Math.round(diopters * 100)
    .toString()
    .padStart(3, '0');
  const twoDigitCode = threeDigitCode.slice(0, 2);

  return {
    raw: cleaned,
    diopters,
    formatted,
    twoDigitCode,
    threeDigitCode
  };
}

export interface SearchFilterCriteria {
  query: string;
  symbol: TemporalSymbolGlyph | 'all';
  nasalAddRaw: string;
  fittingCrossDrop: number | 'all';
}

export interface ScoredLensMatch {
  lens: PALLensDesign;
  score: number;
  matchReasons: string[];
}

export function filterAndScoreLenses(
  lenses: PALLensDesign[],
  criteria: SearchFilterCriteria
): ScoredLensMatch[] {
  const parsedAdd = parseNasalAddInput(criteria.nasalAddRaw);
  const q = criteria.query.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);

  const results: ScoredLensMatch[] = [];

  for (const lens of lenses) {
    let score = 100;
    const matchReasons: string[] = [];

    // 1. Temporal Symbol Category filter
    if (criteria.symbol !== 'all') {
      if (lens.temporalSymbolCategory !== criteria.symbol) {
        continue;
      }
      score += 35;
      matchReasons.push(`Symbol: ${lens.temporalMarkLabel}`);
    }

    // 2. Fitting Cross Drop filter
    if (criteria.fittingCrossDrop !== 'all') {
      if (lens.fittingCrossDropMm !== criteria.fittingCrossDrop) {
        continue;
      }
      score += 25;
      matchReasons.push(`+${lens.fittingCrossDropMm} mm FC Drop`);
    }

    // 3. Nasal Add Power filter
    if (criteria.nasalAddRaw.trim() !== '') {
      if (parsedAdd.diopters !== null) {
        const [minAdd, maxAdd] = lens.supportedAddRange;
        if (parsedAdd.diopters < minAdd || parsedAdd.diopters > maxAdd) {
          continue;
        }
        // Boost lenses whose nasal format matches 3-digit vs 2-digit engraving style
        const isThreeDigitInput = criteria.nasalAddRaw.trim().length === 3;
        const usesThreeDigitFormat = lens.nasalEngravingFormat.includes('3-digit') || lens.nasalEngravingFormat.includes('3-character');
        if (isThreeDigitInput && usesThreeDigitFormat) {
          score += 30;
          matchReasons.push(`3-Digit Add (${parsedAdd.threeDigitCode} = ${parsedAdd.formatted})`);
        } else if (!isThreeDigitInput && !usesThreeDigitFormat) {
          score += 25;
          matchReasons.push(`2-Digit Add (${parsedAdd.twoDigitCode} = ${parsedAdd.formatted})`);
        } else {
          score += 15;
          matchReasons.push(`Supports ${parsedAdd.formatted}`);
        }
      } else {
        // Check if alphanumeric nasal code matches example or format
        if (
          !lens.nasalExample.toLowerCase().includes(criteria.nasalAddRaw.toLowerCase()) &&
          !lens.nasalEngravingFormat.toLowerCase().includes(criteria.nasalAddRaw.toLowerCase())
        ) {
          continue;
        }
        score += 20;
      }
    }

    // 4. Free-text Fuzzy Search across Brand, Design Name, Laser Code, Materials, Notes
    if (tokens.length > 0) {
      const searchableBlob = [
        lens.brand,
        lens.designName,
        lens.temporalEngravingCode,
        lens.temporalMarkLabel,
        lens.nasalEngravingFormat,
        lens.notes,
        ...lens.materials.map((m) => `${m.code} ${m.index} ${m.name}`)
      ]
        .join(' ')
        .toLowerCase();

      let allTokensMatched = true;
      for (const token of tokens) {
        if (searchableBlob.includes(token)) {
          if (lens.brand.toLowerCase().includes(token)) score += 30;
          if (lens.designName.toLowerCase().includes(token)) score += 40;
          if (lens.temporalEngravingCode.toLowerCase().includes(token)) {
            score += 50;
            matchReasons.push(`Laser Code "${lens.temporalEngravingCode}"`);
          }
        } else {
          // Fuzzy subsequence / Levenshtein tolerance for 1-char typo on ≥4 char words
          if (token.length >= 4 && isFuzzyMatch(token, searchableBlob)) {
            score += 12;
          } else {
            allTokensMatched = false;
            break;
          }
        }
      }

      if (!allTokensMatched) {
        continue;
      }
    }

    if (lens.isCustom) {
      score += 5;
    }

    results.push({ lens, score, matchReasons });
  }

  return results.sort((a, b) => b.score - a.score);
}

function isFuzzyMatch(token: string, text: string): boolean {
  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  for (const word of words) {
    if (Math.abs(word.length - token.length) <= 1) {
      let diffs = 0;
      const len = Math.min(word.length, token.length);
      for (let i = 0; i < len; i++) {
        if (word[i] !== token[i]) diffs++;
        if (diffs > 1) break;
      }
      if (diffs <= 1) return true;
    }
  }
  return false;
}
