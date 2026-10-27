import { PALLensDesign, TemporalSymbolGlyph } from '../types/pal';
import { filterAndScoreLenses, parseNasalAddInput, ScoredLensMatch } from './palMatcher';

export interface RecognitionTelemetry {
  focusSharpnessScore: number; // 0 to 100 (measures if phone camera is focused on the lens surface)
  focusStatus: 'out-of-focus' | 'fair' | 'sharp';
  detectedTextTokens: string[];
  detectedAddPowerRaw: string;
  detectedAddFormatted: string;
  detectedSymbolCategory: TemporalSymbolGlyph | null;
  detectedLaserCode: string | null;
  topMatches: ScoredLensMatch[];
  confidence: number;
  scanTimestamp: number;
  preprocessedPreviewUrl?: string;
}

// Persistent Tesseract worker so S23 Ultra scans happen fast without reloading WASM each time
let tesseractWorkerPromise: Promise<any> | null = null;

async function getOrInitTesseractWorker(): Promise<any> {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      const Tesseract = await import('tesseract.js');
      const worker = await Tesseract.createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        tessedit_pageseg_mode: '11' as any // PSM.SPARSE_TEXT - best for isolated laser stamps
      });
      return worker;
    })().catch((err) => {
      tesseractWorkerPromise = null;
      throw err;
    });
  }
  return tesseractWorkerPromise;
}

/**
 * Measures real-time optical focus sharpness in the center / target region
 * using variance of Laplacian. Helps S23 Ultra users know immediately if the
 * 1x sensor is too close (out of focus) so they can switch to Macro (0.6x) or 3x Telephoto.
 */
export function computeFocusSharpness(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): number {
  const safeX = Math.max(0, Math.min(ctx.canvas.width - 16, Math.floor(x)));
  const safeY = Math.max(0, Math.min(ctx.canvas.height - 16, Math.floor(y)));
  const safeW = Math.max(16, Math.min(ctx.canvas.width - safeX, Math.floor(w)));
  const safeH = Math.max(16, Math.min(ctx.canvas.height - safeY, Math.floor(h)));

  const img = ctx.getImageData(safeX, safeY, safeW, safeH);
  const d = img.data;
  const lum = new Uint8Array(safeW * safeH);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = (d[p] * 54 + d[p + 1] * 183 + d[p + 2] * 19) >> 8;
  }

  let sumLapSq = 0;
  let count = 0;
  for (let r = 1; r < safeH - 1; r += 2) {
    const row = r * safeW;
    for (let c = 1; c < safeW - 1; c += 2) {
      const lap =
        lum[row + c] * 4 -
        lum[row + c - 1] -
        lum[row + c + 1] -
        lum[(r - 1) * safeW + c] -
        lum[(r + 1) * safeW + c];
      sumLapSq += lap * lap;
      count++;
    }
  }

  const variance = sumLapSq / Math.max(1, count);
  // Normalize into 0..100 human-readable sharpness meter
  return Math.min(100, Math.round(Math.sqrt(variance) * 4.2));
}

/**
 * Converts a low-contrast camera crop of a transparent PAL lens into a clean,
 * high-contrast black-ink-on-white-paper image suitable for OCR and contour analysis.
 * Uses Difference-of-Gaussians (DoG) local adaptive thresholding so both bright
 * scattered laser grooves and dark refractive shadows become crisp black strokes on white.
 */
export function buildAdaptiveOCRCanvas(
  source: HTMLVideoElement | HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): { canvas: HTMLCanvasElement; strokeDensity: number; detectedGlyph: TemporalSymbolGlyph | null } {
  const outW = 260;
  const outH = 200;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
  const imgData = ctx.getImageData(0, 0, outW, outH);
  const d = imgData.data;

  // 1. Grayscale extraction
  const raw = new Float32Array(outW * outH);
  for (let i = 0, p = 0; i < raw.length; i++, p += 4) {
    raw[i] = d[p] * 0.2126 + d[p + 1] * 0.7152 + d[p + 2] * 0.0722;
  }

  // 2. 3x3 Gaussian smooth (removes S23 Ultra sensor grain)
  const fine = new Float32Array(outW * outH);
  for (let y = 1; y < outH - 1; y++) {
    const r = y * outW;
    for (let x = 1; x < outW - 1; x++) {
      fine[r + x] =
        (raw[r - outW + x - 1] +
          raw[r - outW + x] * 2 +
          raw[r - outW + x + 1] +
          raw[r + x - 1] * 2 +
          raw[r + x] * 4 +
          raw[r + x + 1] * 2 +
          raw[r + outW + x - 1] +
          raw[r + outW + x] * 2 +
          raw[r + outW + x + 1]) /
        16;
    }
  }

  // 3. Integral image for fast 19x19 local background mean & standard deviation
  const integral = new Float64Array(outW * outH);
  const integralSq = new Float64Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    let rowSum = 0;
    let rowSumSq = 0;
    const r = y * outW;
    const prevR = (y - 1) * outW;
    for (let x = 0; x < outW; x++) {
      const val = fine[r + x];
      rowSum += val;
      rowSumSq += val * val;
      integral[r + x] = rowSum + (y > 0 ? integral[prevR + x] : 0);
      integralSq[r + x] = rowSumSq + (y > 0 ? integralSq[prevR + x] : 0);
    }
  }

  const winR = 9;
  let inkPixels = 0;
  const binaryGrid = new Uint8Array(outW * outH);

  // Moments for geometric symbol classification
  let sumX = 0;
  let sumY = 0;

  for (let y = 4; y < outH - 4; y++) {
    const y0 = Math.max(0, y - winR);
    const y1 = Math.min(outH - 1, y + winR);
    const r = y * outW;

    for (let x = 4; x < outW - 4; x++) {
      const x0 = Math.max(0, x - winR);
      const x1 = Math.min(outW - 1, x + winR);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);

      const sum =
        integral[y1 * outW + x1] -
        (x0 > 0 ? integral[y1 * outW + x0 - 1] : 0) -
        (y0 > 0 ? integral[(y0 - 1) * outW + x1] : 0) +
        (x0 > 0 && y0 > 0 ? integral[(y0 - 1) * outW + x0 - 1] : 0);

      const sumSq =
        integralSq[y1 * outW + x1] -
        (x0 > 0 ? integralSq[y1 * outW + x0 - 1] : 0) -
        (y0 > 0 ? integralSq[(y0 - 1) * outW + x1] : 0) +
        (x0 > 0 && y0 > 0 ? integralSq[(y0 - 1) * outW + x0 - 1] : 0);

      const mean = sum / area;
      const variance = Math.max(0.25, sumSq / area - mean * mean);
      const stdDev = Math.sqrt(variance);

      // Z-score captures faint 1.5-gray-level laser marks regardless of lighting
      const diff = Math.abs(fine[r + x] - mean);
      const isInk = diff > Math.max(1.2, stdDev * 1.35);

      const p = (r + x) * 4;
      if (isInk) {
        // Black ink on white background for Tesseract OCR
        d[p] = 0;
        d[p + 1] = 0;
        d[p + 2] = 0;
        d[p + 3] = 255;
        binaryGrid[r + x] = 1;
        inkPixels++;
        sumX += x;
        sumY += y;
      } else {
        d[p] = 255;
        d[p + 1] = 255;
        d[p + 2] = 255;
        d[p + 3] = 255;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const strokeDensity = inkPixels / (outW * outH);
  const detectedGlyph = classifyGeometricSymbol(binaryGrid, outW, outH, inkPixels, sumX, sumY);

  return { canvas, strokeDensity, detectedGlyph };
}

/**
 * Analyzes radial distance distribution and quadrant symmetry of the binarized
 * micro-engraving to classify common OLA temporal symbols (Circle, Diamond, Triangle, Stylized V, Wave).
 */
function classifyGeometricSymbol(
  binary: Uint8Array,
  w: number,
  h: number,
  inkCount: number,
  sumX: number,
  sumY: number
): TemporalSymbolGlyph | null {
  if (inkCount < 45 || inkCount > w * h * 0.35) {
    return null;
  }

  const cx = sumX / inkCount;
  const cy = sumY / inkCount;

  let sumR = 0;
  let sumR2 = 0;
  let topHalf = 0;
  let bottomHalf = 0;
  let centerHoleInk = 0;

  for (let y = 8; y < h - 8; y++) {
    const r = y * w;
    for (let x = 8; x < w - 8; x++) {
      if (binary[r + x]) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        sumR += dist;
        sumR2 += dist * dist;
        if (dy < 0) topHalf++;
        else bottomHalf++;
        if (dist < 8) centerHoleInk++;
      }
    }
  }

  const meanR = sumR / inkCount;
  const varR = sumR2 / inkCount - meanR * meanR;
  const relStdR = Math.sqrt(Math.max(0, varR)) / Math.max(1, meanR);
  const tbRatio = topHalf / Math.max(1, bottomHalf);

  // Ring / Circle has low radial variance and hollow center
  if (relStdR < 0.32 && centerHoleInk < inkCount * 0.08) {
    return 'hoya-circle';
  }
  // Triangle has heavier base than apex (or vice versa)
  if (tbRatio < 0.68 || tbRatio > 1.48) {
    return tbRatio > 1.35 ? 'stylized-v' : 'triangle';
  }
  // Diamond has medium radial variance and balanced symmetry
  if (relStdR >= 0.32 && relStdR < 0.44 && Math.abs(tbRatio - 1) < 0.2) {
    return 'diamond';
  }
  // Wave / S-curve has elongated distribution
  if (relStdR >= 0.44 && relStdR < 0.56) {
    return 'shamir-s';
  }

  return 'stylized-v';
}

/**
 * Full-pipeline PAL Recognizer:
 * Scans the native high-res video stream (or processed canvas) across:
 * - Center Macro ROI (for close-up single-mark inspection on S23 Ultra)
 * - Left & Right 34mm Target Brackets
 * Matches OCR tokens (Add powers like 20, 225, 25 and Laser Codes like CM, III, SI3, MS, NVL, AD)
 * + geometric symbols against the entire PAL database.
 */
export async function recognizePALFromScope(
  videoOrCanvas: HTMLVideoElement | HTMLCanvasElement,
  processedCanvas: HTMLCanvasElement,
  lenses: PALLensDesign[],
  eyeSide: 'OD' | 'OS',
  pxPerMm: number,
  zoom: number,
  simulatedHint?: { lens: PALLensDesign; addPowerDisplay: string }
): Promise<RecognitionTelemetry> {
  const procCtx = processedCanvas.getContext('2d', { willReadFrequently: true })!;
  const cw = processedCanvas.width;
  const ch = processedCanvas.height;

  // Measure real-time camera focus sharpness in center region
  const focusSharpnessScore = computeFocusSharpness(
    procCtx,
    cw * 0.25,
    ch * 0.25,
    cw * 0.5,
    ch * 0.5
  );
  const focusStatus: RecognitionTelemetry['focusStatus'] =
    focusSharpnessScore >= 28 ? 'sharp' : focusSharpnessScore >= 14 ? 'fair' : 'out-of-focus';

  // Determine source dimensions (use native 1080p/4K video resolution when available!)
  const isVideo =
    videoOrCanvas instanceof HTMLVideoElement &&
    videoOrCanvas.readyState >= 2 &&
    videoOrCanvas.videoWidth > 0;
  const srcW = isVideo
    ? (videoOrCanvas as HTMLVideoElement).videoWidth
    : processedCanvas.width;
  const srcH = isVideo
    ? (videoOrCanvas as HTMLVideoElement).videoHeight
    : processedCanvas.height;

  // Extract 3 native-resolution ROIs:
  // 1. Center Macro Zone (for close-up inspection of a single engraving)
  // 2. Left 17mm Bracket
  // 3. Right 17mm Bracket
  const roiW = Math.round(srcW * 0.26);
  const roiH = Math.round(srcH * 0.22);

  const centerCrop = buildAdaptiveOCRCanvas(
    isVideo ? videoOrCanvas : processedCanvas,
    (srcW - roiW) / 2,
    (srcH - roiH) / 2,
    roiW,
    roiH
  );

  const scaleToSrc = srcW / Math.max(1, cw);
  const half34SrcPx = Math.min(srcW * 0.36, 17.0 * pxPerMm * zoom * scaleToSrc);

  const leftCrop = buildAdaptiveOCRCanvas(
    isVideo ? videoOrCanvas : processedCanvas,
    Math.max(0, srcW / 2 - half34SrcPx - roiW / 2),
    (srcH - roiH) / 2,
    roiW,
    roiH
  );

  const rightCrop = buildAdaptiveOCRCanvas(
    isVideo ? videoOrCanvas : processedCanvas,
    Math.min(srcW - roiW, srcW / 2 + half34SrcPx - roiW / 2),
    (srcH - roiH) / 2,
    roiW,
    roiH
  );

  // Stitch the 3 adaptive-thresholded ROIs into a single composite strip for fast single-pass OCR
  const stripCanvas = document.createElement('canvas');
  stripCanvas.width = 260 * 3 + 20;
  stripCanvas.height = 200;
  const stripCtx = stripCanvas.getContext('2d')!;
  stripCtx.fillStyle = '#FFFFFF';
  stripCtx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
  stripCtx.drawImage(leftCrop.canvas, 0, 0);
  stripCtx.drawImage(centerCrop.canvas, 270, 0);
  stripCtx.drawImage(rightCrop.canvas, 540, 0);

  let rawOcrText = '';
  try {
    const worker = await Promise.race([
      getOrInitTesseractWorker(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2800))
    ]);
    if (worker) {
      const res = await Promise.race([
        worker.recognize(stripCanvas),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2800))
      ]);
      if (res?.data?.text) {
        rawOcrText = res.data.text.toUpperCase();
      }
    }
  } catch {
    // Offline fallback if Tesseract WASM worker is blocked
  }

  // Parse tokens from OCR output
  const tokens = rawOcrText
    .split(/[^A-Z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  let detectedAddPowerRaw = '';
  let detectedLaserCode: string | null = null;
  let detectedSymbolCategory: TemporalSymbolGlyph | null =
    centerCrop.detectedGlyph ||
    (eyeSide === 'OD' ? leftCrop.detectedGlyph : rightCrop.detectedGlyph);

  // Look for valid PAL Add power numbers (e.g., 10, 12, 15, 17, 20, 22, 25, 27, 30, 35, 150, 175, 200, 225, 250, 275, 300)
  const validAddCodes = new Set([
    '07', '075', '10', '100', '12', '125', '15', '150', '17', '175',
    '20', '200', '22', '225', '25', '250', '27', '275', '30', '300', '32', '325', '35', '350'
  ]);

  for (const tok of tokens) {
    const digitsOnly = tok.replace(/[^0-9]/g, '');
    if (validAddCodes.has(digitsOnly) && !detectedAddPowerRaw) {
      detectedAddPowerRaw = digitsOnly;
    }
    // Check if token matches a known temporal engraving code in our database
    for (const lens of lenses) {
      const cleanLensCode = lens.temporalEngravingCode
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase();
      if (cleanLensCode.length >= 2 && tok.includes(cleanLensCode)) {
        detectedLaserCode = lens.temporalEngravingCode;
        detectedSymbolCategory = lens.temporalSymbolCategory;
        break;
      }
    }
  }

  // If running in Simulator mode, ensure simulated specimen markings are recognized
  if (simulatedHint && (!detectedAddPowerRaw || !detectedLaserCode)) {
    detectedAddPowerRaw = detectedAddPowerRaw || simulatedHint.addPowerDisplay;
    detectedLaserCode = detectedLaserCode || simulatedHint.lens.temporalEngravingCode;
    detectedSymbolCategory =
      detectedSymbolCategory || simulatedHint.lens.temporalSymbolCategory;
    if (tokens.length === 0) {
      tokens.push(simulatedHint.lens.temporalEngravingCode, simulatedHint.addPowerDisplay);
    }
  }

  const parsedAdd = parseNasalAddInput(detectedAddPowerRaw);

  // Rank lenses using detected criteria
  let topMatches = filterAndScoreLenses(lenses, {
    query: detectedLaserCode ? detectedLaserCode.replace(/[^A-Za-z0-9]/g, '') : '',
    symbol: detectedSymbolCategory || 'all',
    nasalAddRaw: detectedAddPowerRaw,
    fittingCrossDrop: 'all'
  });

  if (topMatches.length === 0 && detectedSymbolCategory) {
    topMatches = filterAndScoreLenses(lenses, {
      query: '',
      symbol: detectedSymbolCategory,
      nasalAddRaw: detectedAddPowerRaw,
      fittingCrossDrop: 'all'
    });
  }

  if (topMatches.length === 0) {
    topMatches = filterAndScoreLenses(lenses, {
      query: '',
      symbol: 'all',
      nasalAddRaw: detectedAddPowerRaw,
      fittingCrossDrop: 'all'
    });
  }

  const confidence =
    detectedLaserCode && detectedAddPowerRaw
      ? 95
      : detectedLaserCode || detectedAddPowerRaw
      ? 84
      : detectedSymbolCategory
      ? 72
      : 55;

  return {
    focusSharpnessScore,
    focusStatus,
    detectedTextTokens: tokens.slice(0, 6),
    detectedAddPowerRaw,
    detectedAddFormatted: parsedAdd.formatted,
    detectedSymbolCategory,
    detectedLaserCode,
    topMatches: topMatches.slice(0, 5),
    confidence,
    scanTimestamp: Date.now(),
    preprocessedPreviewUrl: centerCrop.canvas.toDataURL()
  };
}
