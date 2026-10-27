import { PALLensDesign } from '../types/pal';

export interface SimulatedSpecimenConfig {
  lens: PALLensDesign;
  eyeSide: 'OD' | 'OS';
  addPowerDisplay: string; // e.g., '20' or '225'
  materialCode: string; // e.g., 'P' or '67'
  glareAngle: number;
  etchContrast: number; // 0.35 to 1.0 (simulates 2-5µm faintness)
}

/**
 * Renders a realistic physical progressive lens specimen onto an offscreen canvas,
 * complete with AR coating reflections, overhead fluorescent glare hotspots, lens bevel,
 * and faint 2-5µm excimer laser micro-engravings positioned at the exact 34.0 mm reference spacing.
 */
export function renderSimulatedLensFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pxPerMm: number,
  specimen: SimulatedSpecimenConfig,
  timestampMs: number
): void {
  const cx = width / 2;
  const cy = height / 2;

  // 1. Dark bench mat background with subtle illuminated stage glow
  const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(width, height) * 0.62);
  bgGrad.addColorStop(0, '#222938');
  bgGrad.addColorStop(0.55, '#151A24');
  bgGrad.addColorStop(1, '#090A0F');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle bench illumination grid lines in background
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.lineWidth = 1;
  const gridStep = Math.max(24, Math.round(pxPerMm * 5));
  for (let x = cx % gridStep; x < width; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = cy % gridStep; y < height; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 2. Physical lens blank contour (edger bevel shape, ~62mm x 46mm)
  const lensRx = 31 * pxPerMm;
  const lensRy = 23.5 * pxPerMm;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, lensRx, lensRy, 0, 0, Math.PI * 2);

  // Internal glass transmission gradient
  const lensGrad = ctx.createLinearGradient(cx - lensRx, cy - lensRy, cx + lensRx, cy + lensRy);
  lensGrad.addColorStop(0, 'rgba(42, 56, 72, 0.55)');
  lensGrad.addColorStop(0.45, 'rgba(26, 35, 48, 0.42)');
  lensGrad.addColorStop(1, 'rgba(48, 64, 80, 0.58)');
  ctx.fillStyle = lensGrad;
  ctx.fill();

  // Safety bevel rim (ground edge scatter)
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(180, 210, 230, 0.28)';
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(230, 245, 255, 0.42)';
  ctx.stroke();
  ctx.clip();

  // 3. Ambient overhead lab lamp specular glare (slowly drifting to simulate handheld inspection)
  const driftX = Math.sin(timestampMs * 0.0009 + specimen.glareAngle) * (pxPerMm * 6.5);
  const driftY = Math.cos(timestampMs * 0.0007 + specimen.glareAngle) * (pxPerMm * 3.5);

  const glareGrad = ctx.createRadialGradient(
    cx + driftX - pxPerMm * 8,
    cy + driftY - pxPerMm * 6,
    2,
    cx + driftX - pxPerMm * 6,
    cy + driftY - pxPerMm * 4,
    pxPerMm * 18
  );
  glareGrad.addColorStop(0, 'rgba(220, 255, 245, 0.36)');
  glareGrad.addColorStop(0.35, 'rgba(120, 215, 195, 0.16)');
  glareGrad.addColorStop(1, 'rgba(20, 40, 50, 0)');
  ctx.fillStyle = glareGrad;
  ctx.fillRect(cx - lensRx, cy - lensRy, lensRx * 2, lensRy * 2);

  // Secondary fluorescent tube reflection bar
  ctx.save();
  ctx.translate(cx - driftX * 0.6, cy - pxPerMm * 9 + driftY * 0.4);
  ctx.rotate(-0.18);
  const tubeGrad = ctx.createLinearGradient(0, -pxPerMm * 2.5, 0, pxPerMm * 2.5);
  tubeGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  tubeGrad.addColorStop(0.5, 'rgba(215, 245, 255, 0.19)');
  tubeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = tubeGrad;
  ctx.fillRect(-pxPerMm * 18, -pxPerMm * 2.5, pxPerMm * 36, pxPerMm * 5);
  ctx.restore();

  // 4. Excimer Laser 2-5µm Micro-Engravings at exact 34.0 mm separation (17.0 mm left & right of PRP)
  const halfRefPx = 17.0 * pxPerMm;
  // For OD (Right Eye) viewed from front of lens: Left side on screen is Temporal, Right side is Nasal.
  // For OS (Left Eye) viewed from front of lens: Left side on screen is Nasal, Right side is Temporal.
  const temporalX = specimen.eyeSide === 'OD' ? cx - halfRefPx : cx + halfRefPx;
  const nasalX = specimen.eyeSide === 'OD' ? cx + halfRefPx : cx - halfRefPx;

  // Faint micro-etching alpha so Raw mode looks realistically subtle, while CV filters make it pop!
  const etchAlpha = 0.17 * specimen.etchContrast;
  const shadowAlpha = 0.11 * specimen.etchContrast;

  // Draw Reference Micro-Circles (2mm diameter at ±17mm)
  drawLaserMicroMark(ctx, temporalX, cy, pxPerMm, etchAlpha, shadowAlpha, () => {
    // Small reference micro-circle or symbol at y = cy
    drawTemporalMicroGlyph(ctx, temporalX, cy, pxPerMm, specimen.lens.temporalSymbolCategory);

    // Temporal brand/design code 3.2mm below reference mark
    const fontSize = Math.max(9, Math.round(pxPerMm * 2.15));
    ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cleanCode = specimen.lens.temporalEngravingCode.replace(/^[^\w\d]+\s*/, '') || 'CM';
    ctx.fillText(`${cleanCode}${specimen.materialCode}`, temporalX, cy + pxPerMm * 3.4);
  });

  // Draw Nasal Reference Mark & Add Power Engraving
  drawLaserMicroMark(ctx, nasalX, cy, pxPerMm, etchAlpha, shadowAlpha, () => {
    // Nasal reference circle/arc at y = cy
    ctx.beginPath();
    ctx.arc(nasalX, cy, pxPerMm * 0.95, 0, Math.PI * 2);
    ctx.stroke();

    // Nasal Add Power 3.2mm above or below reference mark
    const fontSize = Math.max(10, Math.round(pxPerMm * 2.35));
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(specimen.addPowerDisplay, nasalX, cy - pxPerMm * 3.2);
  });

  ctx.restore();
}

function drawLaserMicroMark(
  ctx: CanvasRenderingContext2D,
  _x: number,
  _y: number,
  pxPerMm: number,
  etchAlpha: number,
  shadowAlpha: number,
  drawCallback: () => void
): void {
  // Pass 1: Dark refractive trough offset by 1px (simulating 3µm laser ablation groove)
  ctx.save();
  ctx.translate(-0.8, -0.8);
  ctx.strokeStyle = `rgba(5, 8, 14, ${shadowAlpha})`;
  ctx.fillStyle = `rgba(5, 8, 14, ${shadowAlpha})`;
  ctx.lineWidth = Math.max(1.1, pxPerMm * 0.24);
  drawCallback();
  ctx.restore();

  // Pass 2: Bright oblique scattered edge
  ctx.save();
  ctx.strokeStyle = `rgba(225, 248, 255, ${etchAlpha})`;
  ctx.fillStyle = `rgba(225, 248, 255, ${etchAlpha})`;
  ctx.lineWidth = Math.max(1.2, pxPerMm * 0.26);
  drawCallback();
  ctx.restore();
}

function drawTemporalMicroGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pxPerMm: number,
  category: PALLensDesign['temporalSymbolCategory']
): void {
  const r = pxPerMm * 1.25;
  ctx.beginPath();

  switch (category) {
    case 'stylized-v':
      ctx.moveTo(x - r, y - r * 0.7);
      ctx.lineTo(x, y + r * 0.9);
      ctx.lineTo(x + r * 0.85, y - r * 0.7);
      ctx.quadraticCurveTo(x + r * 1.2, y - r * 0.9, x + r * 1.35, y - r * 0.4);
      ctx.stroke();
      break;
    case 'shamir-s':
      ctx.moveTo(x + r * 0.8, y - r * 0.7);
      ctx.bezierCurveTo(x - r * 1.1, y - r * 0.9, x + r * 1.1, y + r * 0.9, x - r * 0.8, y + r * 0.7);
      ctx.stroke();
      break;
    case 'zeiss-z':
      ctx.strokeRect(x - r, y - r * 0.85, r * 2, r * 1.7);
      ctx.moveTo(x - r * 0.55, y - r * 0.45);
      ctx.lineTo(x + r * 0.55, y - r * 0.45);
      ctx.lineTo(x - r * 0.55, y + r * 0.45);
      ctx.lineTo(x + r * 0.55, y + r * 0.45);
      ctx.stroke();
      break;
    case 'hoya-circle':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'diamond':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'triangle':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.85);
      ctx.lineTo(x - r, y + r * 0.85);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'infinity':
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x - r * 1.3, y - r, x - r * 1.3, y + r, x, y);
      ctx.bezierCurveTo(x + r * 1.3, y - r, x + r * 1.3, y + r, x, y);
      ctx.stroke();
      break;
    case 'bird-wing':
      ctx.moveTo(x - r * 1.2, y + r * 0.2);
      ctx.quadraticCurveTo(x - r * 0.5, y - r * 0.9, x, y + r * 0.1);
      ctx.quadraticCurveTo(x + r * 0.5, y - r * 0.9, x + r * 1.2, y + r * 0.2);
      ctx.stroke();
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const hx = x + r * Math.cos(angle);
        const hy = y + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    default:
      ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
}
