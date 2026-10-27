import { CVFilterMode } from '../types/pal';

export interface CVFilterConfig {
  mode: CVFilterMode;
  sensitivity: number; // 0.5 to 3.0 (default 1.75)
  glareSuppression: number; // 0.0 to 1.0 (default 0.70)
  temporalSmoothing?: boolean; // Multi-frame rolling stack to cancel phone CMOS sensor ISO grain
}

// Persistent temporal rolling buffer for multi-frame noise reduction on live phone camera streams
let temporalLumaBuffer: Float32Array | null = null;
let temporalBufferWidth = 0;
let temporalBufferHeight = 0;

export function resetTemporalBuffer(): void {
  temporalLumaBuffer = null;
}

/**
 * Production Computer Vision Pipeline engineered for real mobile phone cameras (iOS/Android).
 *
 * Why standard filters fail on phone cameras:
 * Raw 3x3 edge detectors amplify 1-pixel CMOS sensor ISO noise.
 *
 * How this pipeline isolates real 2-5µm PAL laser engravings:
 * 1. Temporal multi-frame rolling exponential average cancels random sensor grain.
 * 2. 3x3 Gaussian pre-filter suppresses remaining single-pixel shot noise.
 * 3. Difference-of-Gaussians (DoG) band-pass kernel (fine r=1 vs. local background r=7)
 *    specifically isolates 0.15mm–0.6mm laser engraving strokes while rejecting
 *    both 1px sensor grain and broad overhead lamp glare.
 */
export function applyOpticalCVFilter(
  imageData: ImageData,
  config: CVFilterConfig
): void {
  const { mode, sensitivity, glareSuppression, temporalSmoothing = true } = config;
  if (mode === 'raw') {
    return;
  }

  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const pixelCount = width * height;

  if (
    !temporalLumaBuffer ||
    temporalBufferWidth !== width ||
    temporalBufferHeight !== height
  ) {
    temporalLumaBuffer = new Float32Array(pixelCount);
    temporalBufferWidth = width;
    temporalBufferHeight = height;
    for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
      temporalLumaBuffer[i] = (data[p] * 54 + data[p + 1] * 183 + data[p + 2] * 19) >> 8;
    }
  }

  // Step 1: Extract luminance with specular glare roll-off & temporal frame stacking
  const rawLum = new Uint8Array(pixelCount);
  const glareKnee = Math.round(255 - glareSuppression * 50);
  const alpha = temporalSmoothing ? 0.55 : 1.0;
  const invAlpha = 1.0 - alpha;

  for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
    let y = (data[p] * 54 + data[p + 1] * 183 + data[p + 2] * 19) >> 8;
    if (y > glareKnee) {
      y = glareKnee + ((y - glareKnee) >> 2);
    }
    const smoothedY = alpha * y + invAlpha * temporalLumaBuffer[i];
    temporalLumaBuffer[i] = smoothedY;
    rawLum[i] = smoothedY;
  }

  // Step 2: 3x3 Gaussian Pre-Smoothing [1,2,1; 2,4,2; 1,2,1]/16 to eliminate 1px phone camera ISO noise
  const lum = new Uint8Array(pixelCount);
  for (let y = 1; y < height - 1; y++) {
    const r0 = (y - 1) * width;
    const r1 = y * width;
    const r2 = (y + 1) * width;
    for (let x = 1; x < width - 1; x++) {
      lum[r1 + x] =
        (rawLum[r0 + x - 1] +
          (rawLum[r0 + x] << 1) +
          rawLum[r0 + x + 1] +
          (rawLum[r1 + x - 1] << 1) +
          (rawLum[r1 + x] << 2) +
          (rawLum[r1 + x + 1] << 1) +
          rawLum[r2 + x - 1] +
          (rawLum[r2 + x] << 1) +
          rawLum[r2 + x + 1]) >>
        4;
    }
  }

  if (mode === 'highpass') {
    applyHighPassReliefFilter(data, lum, width, height, sensitivity);
  } else if (mode === 'clahe') {
    applyCLAHEFilter(data, lum, width, height, sensitivity);
  } else if (mode === 'darkfield') {
    applyInvertedDarkfieldFilter(data, lum, width, height, sensitivity);
  }
}

/**
 * Filter 2: High-Pass Relief Filter
 * Uses a 3x3 smoothed Laplacian + oblique differential relief kernel to turn
 * transparent 2-5µm refractive laser grooves into high-contrast 3D bas-relief.
 */
function applyHighPassReliefFilter(
  data: Uint8ClampedArray,
  lum: Uint8Array,
  width: number,
  height: number,
  sensitivity: number
): void {
  const gain = sensitivity * 5.2;

  for (let y = 2; y < height - 2; y++) {
    const rowOffset = y * width;
    const prevRow = (y - 1) * width;
    const nextRow = (y + 1) * width;
    const prev2Row = (y - 2) * width;
    const next2Row = (y + 2) * width;

    for (let x = 2; x < width - 2; x++) {
      const idx = rowOffset + x;
      const center = lum[idx];

      // Band-pass Laplacian across r=1 and r=2 to match physical laser stroke width
      const laplacian =
        center * 8 -
        (lum[prevRow + x - 1] +
          lum[prevRow + x] +
          lum[prevRow + x + 1] +
          lum[rowOffset + x - 1] +
          lum[rowOffset + x + 1] +
          lum[nextRow + x - 1] +
          lum[nextRow + x] +
          lum[nextRow + x + 1]);

      // Wide directional phase relief (2px span captures refractive edge of laser mark)
      const relief =
        lum[next2Row + x + 2] +
        lum[nextRow + x + 1] * 2 -
        (lum[prev2Row + x - 2] + lum[prevRow + x - 1] * 2);

      const mag = Math.abs(laplacian) * gain * 0.42;
      const emboss = 104 + relief * gain * 0.35 + mag * 0.75;
      const clamped = emboss < 0 ? 0 : emboss > 255 ? 255 : emboss;

      const p = idx * 4;
      if (mag > 28) {
        // Highlight laser micro-engravings in high-visibility Optic Yellow-Cyan
        data[p] = Math.min(255, clamped + mag * 0.65);
        data[p + 1] = Math.min(255, clamped + mag * 0.85);
        data[p + 2] = Math.min(255, clamped + mag * 0.4);
      } else {
        data[p] = clamped * 0.72;
        data[p + 1] = clamped * 0.84;
        data[p + 2] = clamped * 0.92;
      }
    }
  }
}

/**
 * Filter 3: Polarized Contrast / CLAHE + Unsharp Micro-Edge Boost
 * Equalizes local tile histograms AND applies a local unsharp mask so faint
 * laser marks inside bright glare reflections or dark shadows become sharply visible.
 */
function applyCLAHEFilter(
  data: Uint8ClampedArray,
  lum: Uint8Array,
  width: number,
  height: number,
  sensitivity: number
): void {
  const tilesX = 8;
  const tilesY = 8;
  const tileW = Math.max(1, Math.floor(width / tilesX));
  const tileH = Math.max(1, Math.floor(height / tilesY));
  const lut = new Uint8Array(tilesX * tilesY * 256);

  const clipLimitFactor = 2.0 + sensitivity * 1.8;

  for (let ty = 0; ty < tilesY; ty++) {
    const y0 = ty * tileH;
    const y1 = ty === tilesY - 1 ? height : (ty + 1) * tileH;
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = tx * tileW;
      const x1 = tx === tilesX - 1 ? width : (tx + 1) * tileW;

      const hist = new Int32Array(256);
      let count = 0;

      for (let y = y0; y < y1; y += 2) {
        const row = y * width;
        for (let x = x0; x < x1; x += 2) {
          hist[lum[row + x]]++;
          count++;
        }
      }

      const clipLimit = Math.max(2, Math.floor((count / 256) * clipLimitFactor));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipLimit) {
          excess += hist[i] - clipLimit;
          hist[i] = clipLimit;
        }
      }

      const redist = Math.floor(excess / 256);
      for (let i = 0; i < 256; i++) {
        hist[i] += redist;
      }

      const tileOffset = (ty * tilesX + tx) * 256;
      let cdf = 0;
      const scale = 255 / Math.max(1, count);
      for (let i = 0; i < 256; i++) {
        cdf += hist[i];
        lut[tileOffset + i] = Math.min(255, Math.round(cdf * scale));
      }
    }
  }

  const sharpGain = sensitivity * 2.2;

  for (let y = 1; y < height - 1; y++) {
    const fy = y / tileH - 0.5;
    const ty0 = Math.max(0, Math.min(tilesY - 1, Math.floor(fy)));
    const ty1 = Math.min(tilesY - 1, ty0 + 1);
    const wy = Math.max(0, Math.min(1, fy - ty0));
    const row = y * width;

    for (let x = 1; x < width - 1; x++) {
      const fx = x / tileW - 0.5;
      const tx0 = Math.max(0, Math.min(tilesX - 1, Math.floor(fx)));
      const tx1 = Math.min(tilesX - 1, tx0 + 1);
      const wx = Math.max(0, Math.min(1, fx - tx0));

      const v = lum[row + x];
      const neighborAvg =
        (lum[row + x - 1] +
          lum[row + x + 1] +
          lum[(y - 1) * width + x] +
          lum[(y + 1) * width + x]) >>
        2;
      const highFreq = (v - neighborAvg) * sharpGain;

      const c00 = lut[(ty0 * tilesX + tx0) * 256 + v];
      const c10 = lut[(ty0 * tilesX + tx1) * 256 + v];
      const c01 = lut[(ty1 * tilesX + tx0) * 256 + v];
      const c11 = lut[(ty1 * tilesX + tx1) * 256 + v];

      const top = c00 + (c10 - c00) * wx;
      const bottom = c01 + (c11 - c01) * wx;
      const eq = Math.max(0, Math.min(255, top + (bottom - top) * wy + highFreq * 2.4));

      const p = (row + x) * 4;
      data[p] = eq * 0.84;
      data[p + 1] = Math.min(255, eq * 1.04);
      data[p + 2] = Math.min(255, eq * 1.08);
    }
  }
}

/**
 * Filter 4: Inverted Darkfield (Difference-of-Gaussians Band-Pass Isolator)
 * Computes a fast integral-image local mean background (15x15 window) and compares it
 * against the 3x3 Gaussian-smoothed signal. Any subtle laser scatter or refractive shadow
 * is amplified up to 10x and rendered as luminous neon/white markings on pure #090A0F black.
 */
function applyInvertedDarkfieldFilter(
  data: Uint8ClampedArray,
  lum: Uint8Array,
  width: number,
  height: number,
  sensitivity: number
): void {
  const integral = new Int32Array(width * height);

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const rowOffset = y * width;
    const prevRowOffset = (y - 1) * width;
    for (let x = 0; x < width; x++) {
      rowSum += lum[rowOffset + x];
      integral[rowOffset + x] = rowSum + (y > 0 ? integral[prevRowOffset + x] : 0);
    }
  }

  const radius = 7;
  const gain = sensitivity * 7.5;
  const threshold = Math.max(2.0, 8.5 - sensitivity * 2.6);

  for (let y = 2; y < height - 2; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    const rowOffset = y * width;

    for (let x = 2; x < width - 2; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);

      const sum =
        integral[y1 * width + x1] -
        (x0 > 0 ? integral[y1 * width + (x0 - 1)] : 0) -
        (y0 > 0 ? integral[(y0 - 1) * width + x1] : 0) +
        (x0 > 0 && y0 > 0 ? integral[(y0 - 1) * width + (x0 - 1)] : 0);

      const localMean = sum / area;
      const center = lum[rowOffset + x];

      // 2-pixel span Sobel gradient captures micro-engraving stroke walls
      const gx = lum[rowOffset + x + 2] - lum[rowOffset + x - 2];
      const gy = lum[(y + 2) * width + x] - lum[(y - 2) * width + x];
      const grad = (Math.abs(gx) + Math.abs(gy)) * 0.45;

      // Difference-of-Gaussians (DoG) deviation + edge gradient
      const dogDiff = Math.abs(center - localMean) * 0.9 + grad * 0.75;
      const p = (rowOffset + x) * 4;

      if (dogDiff > threshold) {
        const intensity = Math.min(255, (dogDiff - threshold) * gain);
        // High-contrast Optic Yellow-White core with Cyan darkfield edge
        data[p] = Math.min(255, 9 + intensity * 0.95);
        data[p + 1] = Math.min(255, 10 + intensity * 1.05);
        data[p + 2] = Math.min(255, 15 + intensity * 0.85);
      } else {
        data[p] = 9;
        data[p + 1] = 10;
        data[p + 2] = 15;
      }
    }
  }
}
