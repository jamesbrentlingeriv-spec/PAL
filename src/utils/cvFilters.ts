import { CVFilterMode } from '../types/pal';

export interface CVFilterConfig {
  mode: CVFilterMode;
  sensitivity: number; // 0.5 to 2.5 (default 1.35)
  glareSuppression: number; // 0.0 to 1.0 (default 0.65)
}

/**
 * High-performance real-time optical computer vision pixel pipeline
 * Engineered specifically for isolating 2-5µm excimer laser PAL engravings.
 */
export function applyOpticalCVFilter(
  imageData: ImageData,
  config: CVFilterConfig
): void {
  const { mode, sensitivity, glareSuppression } = config;
  if (mode === 'raw') {
    return;
  }

  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const pixelCount = width * height;

  // Step 1: Convert RGBA to luminance buffer (0..255) with optional glare roll-off
  const lum = new Uint8Array(pixelCount);
  const glareKnee = Math.round(255 - glareSuppression * 45);

  for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
    // Rec.709 luma weights approximated via fast integer shift
    let y = (data[p] * 54 + data[p + 1] * 183 + data[p + 2] * 19) >> 8;
    // Soft-knee specular glare compression for glossy AR-coated lenses
    if (y > glareKnee) {
      y = glareKnee + ((y - glareKnee) >> 2);
    }
    lum[i] = y;
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
 * Uses a 3x3 Laplacian + directional relief kernel to isolate high-frequency
 * 2-5µm laser micro-engravings while rejecting low-frequency room light gradients.
 */
function applyHighPassReliefFilter(
  data: Uint8ClampedArray,
  lum: Uint8Array,
  width: number,
  height: number,
  sensitivity: number
): void {
  const gain = sensitivity * 3.8;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const prevRow = (y - 1) * width;
    const nextRow = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x;
      const center = lum[idx];

      // 8-neighbor Laplacian operator for isotropic micro-edge detection
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

      // Directional emboss relief gradient (top-left to bottom-right oblique light)
      const relief =
        (lum[nextRow + x + 1] + lum[rowOffset + x + 1] + lum[nextRow + x]) -
        (lum[prevRow + x - 1] + lum[rowOffset + x - 1] + lum[prevRow + x]);

      const mag = Math.abs(laplacian) * gain * 0.45;
      const emboss = 96 + relief * gain * 0.35 + mag * 0.65;
      const clamped = emboss < 0 ? 0 : emboss > 255 ? 255 : emboss;

      const p = idx * 4;
      // High-contrast metallic cyan/silver relief tint for dark-room legibility
      if (mag > 42) {
        // Highlight sharp micro-edges in Optic Cyan/Yellow-White
        data[p] = Math.min(255, clamped + mag * 0.35);
        data[p + 1] = Math.min(255, clamped + mag * 0.65);
        data[p + 2] = Math.min(255, clamped + mag * 0.75);
      } else {
        data[p] = clamped * 0.78;
        data[p + 1] = clamped * 0.88;
        data[p + 2] = clamped * 0.96;
      }
    }
  }
}

/**
 * Filter 3: Polarized Contrast / CLAHE
 * Contrast Limited Adaptive Histogram Equalization across an 8x8 tile grid
 * with bilinear interpolation and glare suppression.
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

  // Clip limit scaled by user sensitivity
  const clipLimitFactor = 1.8 + sensitivity * 1.6;

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

      // Build cumulative distribution LUT for this tile
      const tileOffset = (ty * tilesX + tx) * 256;
      let cdf = 0;
      const scale = 255 / Math.max(1, count);
      for (let i = 0; i < 256; i++) {
        cdf += hist[i];
        lut[tileOffset + i] = Math.min(255, Math.round(cdf * scale));
      }
    }
  }

  // Bilinear interpolation across tile centers + local unsharp mask boost
  for (let y = 0; y < height; y++) {
    const fy = (y / tileH) - 0.5;
    const ty0 = Math.max(0, Math.min(tilesY - 1, Math.floor(fy)));
    const ty1 = Math.min(tilesY - 1, ty0 + 1);
    const wy = Math.max(0, Math.min(1, fy - ty0));
    const row = y * width;

    for (let x = 0; x < width; x++) {
      const fx = (x / tileW) - 0.5;
      const tx0 = Math.max(0, Math.min(tilesX - 1, Math.floor(fx)));
      const tx1 = Math.min(tilesX - 1, tx0 + 1);
      const wx = Math.max(0, Math.min(1, fx - tx0));

      const v = lum[row + x];
      const c00 = lut[(ty0 * tilesX + tx0) * 256 + v];
      const c10 = lut[(ty0 * tilesX + tx1) * 256 + v];
      const c01 = lut[(ty1 * tilesX + tx0) * 256 + v];
      const c11 = lut[(ty1 * tilesX + tx1) * 256 + v];

      const top = c00 + (c10 - c00) * wx;
      const bottom = c01 + (c11 - c01) * wx;
      const eq = top + (bottom - top) * wy;

      // Polarized green/cyan optical tint reduces eye strain on bench
      const p = (row + x) * 4;
      data[p] = eq * 0.85;
      data[p + 1] = Math.min(255, eq * 1.02);
      data[p + 2] = Math.min(255, eq * 1.06);
    }
  }
}

/**
 * Filter 4: Inverted Darkfield
 * Computes a fast integral-image local mean background (15x15 window) and isolates
 * both positive scattering (bright laser etchings under oblique light) and negative
 * phase shadows, rendering etched channels as pure luminous white/neon lines on #090A0F black.
 */
function applyInvertedDarkfieldFilter(
  data: Uint8ClampedArray,
  lum: Uint8Array,
  width: number,
  height: number,
  sensitivity: number
): void {
  // Compute integral image for O(1) local window background estimation
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

  const radius = 6;
  const gain = sensitivity * 5.2;
  const threshold = Math.max(3, 11 - sensitivity * 3.5);

  for (let y = 1; y < height - 1; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    const rowOffset = y * width;

    for (let x = 1; x < width - 1; x++) {
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

      // Local gradient magnitude (Sobel fast approximation)
      const gx = lum[rowOffset + x + 1] - lum[rowOffset + x - 1];
      const gy = lum[(y + 1) * width + x] - lum[(y - 1) * width + x];
      const grad = (Math.abs(gx) + Math.abs(gy)) * 0.5;

      // Combine local deviation from background with micro-edge gradient
      const diff = Math.abs(center - localMean) * 0.75 + grad * 0.65;
      const p = (rowOffset + x) * 4;

      if (diff > threshold) {
        const intensity = Math.min(255, (diff - threshold) * gain);
        // Pure white core with subtle optic-cyan/yellow halo on OLED black (#090A0F)
        data[p] = Math.min(255, 9 + intensity * 0.96);
        data[p + 1] = Math.min(255, 10 + intensity * 1.02);
        data[p + 2] = Math.min(255, 15 + intensity);
      } else {
        // Pure OLED Darkfield background (#090A0F)
        data[p] = 9;
        data[p + 1] = 10;
        data[p + 2] = 15;
      }
    }
  }
}
