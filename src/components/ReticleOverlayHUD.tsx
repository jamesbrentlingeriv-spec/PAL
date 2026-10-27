import React from 'react';
import { PALLensDesign, ReticleConfig } from '../types/pal';

interface ReticleOverlayHUDProps {
  config: ReticleConfig;
  zoom: number;
  pinnedLens: PALLensDesign | null;
  viewportWidth: number;
  viewportHeight: number;
  focusPoint: { x: number; y: number } | null;
}

export const ReticleOverlayHUD: React.FC<ReticleOverlayHUDProps> = ({
  config,
  zoom,
  pinnedLens,
  viewportWidth,
  viewportHeight,
  focusPoint
}) => {
  if (!config.showReticle) return null;

  const cx = viewportWidth / 2;
  const cy = viewportHeight / 2;
  // Effective pixels per millimeter accounts for calibrated physical scale AND active digital zoom
  const effectivePxPerMm = config.pxPerMm * zoom;

  const half34MmPx = 17.0 * effectivePxPerMm;
  const activeFcDropMm = pinnedLens ? pinnedLens.fittingCrossDropMm : config.fittingCrossOffsetMm;
  const fcY = cy - activeFcDropMm * effectivePxPerMm;

  // For OD (Right Eye) viewed from front: Left is Temporal, Right is Nasal
  // For OS (Left Eye) viewed from front: Left is Nasal, Right is Temporal
  const isOD = config.eyeSide === 'OD';
  const leftRole = isOD ? 'TEMPORAL (SYM)' : 'NASAL (ADD)';
  const rightRole = isOD ? 'NASAL (ADD)' : 'TEMPORAL (SYM)';

  const nearInsetMm = pinnedLens ? pinnedLens.nearInsetMm : 2.5;
  const corridorMm = pinnedLens ? (pinnedLens.corridorLengthsMm[1] || pinnedLens.corridorLengthsMm[0] || 14) : 14;
  // Nasal direction is +X for OD, -X for OS
  const nearCenterX = isOD
    ? cx + nearInsetMm * effectivePxPerMm
    : cx - nearInsetMm * effectivePxPerMm;
  const nearCenterY = fcY + corridorMm * effectivePxPerMm;
  const minFitHeightMm = pinnedLens ? pinnedLens.minFittingHeightMm : 14;
  const minFitLineY = fcY + minFitHeightMm * effectivePxPerMm;

  // Generate millimeter ruler ticks along 180° line (-22mm to +22mm)
  const ticks: number[] = [];
  for (let mm = -22; mm <= 22; mm++) {
    ticks.push(mm);
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
      <svg
        width={viewportWidth}
        height={viewportHeight}
        viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
        className="w-full h-full"
      >
        <defs>
          <filter id="hud-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`rotate(${config.rotationDeg}, ${cx}, ${cy})`}>
          {/* Optional background millimeter grid */}
          {config.showGridRule && (
            <g opacity="0.16" stroke="#00F0FF" strokeWidth="0.75">
              {[-20, -15, -10, -5, 5, 10, 15, 20].map((mm) => (
                <React.Fragment key={`grid-${mm}`}>
                  <line
                    x1={cx + mm * effectivePxPerMm}
                    y1={cy - 25 * effectivePxPerMm}
                    x2={cx + mm * effectivePxPerMm}
                    y2={cy + 25 * effectivePxPerMm}
                    strokeDasharray="2 4"
                  />
                  <line
                    x1={cx - 28 * effectivePxPerMm}
                    y1={cy + mm * effectivePxPerMm}
                    x2={cx + 28 * effectivePxPerMm}
                    y2={cy + mm * effectivePxPerMm}
                    strokeDasharray="2 4"
                  />
                </React.Fragment>
              ))}
            </g>
          )}

          {/* Outer Lens Reference Circle (54mm diameter guide) */}
          <circle
            cx={cx}
            cy={cy}
            r={27 * effectivePxPerMm}
            fill="none"
            stroke="#00F0FF"
            strokeWidth="1.2"
            strokeDasharray="8 6"
            opacity="0.38"
          />

          {/* 180° Horizontal Layout Reference Line */}
          <line
            x1={cx - 29 * effectivePxPerMm}
            y1={cy}
            x2={cx + 29 * effectivePxPerMm}
            y2={cy}
            stroke="#00F0FF"
            strokeWidth="1.6"
            opacity="0.85"
          />

          {/* 180° Degree Labels */}
          <text
            x={cx - 29.5 * effectivePxPerMm - 6}
            y={cy + 4}
            textAnchor="end"
            fill="#00F0FF"
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="700"
          >
            180°
          </text>
          <text
            x={cx + 29.5 * effectivePxPerMm + 6}
            y={cy + 4}
            textAnchor="start"
            fill="#00F0FF"
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="700"
          >
            0°
          </text>

          {/* Millimeter Ruler Ticks along 180° Line */}
          {ticks.map((mm) => {
            if (mm === 0 || Math.abs(mm) === 17) return null;
            const tx = cx + mm * effectivePxPerMm;
            const isMajor = mm % 5 === 0;
            const tickH = isMajor ? 6 : 3;
            return (
              <line
                key={`tick-${mm}`}
                x1={tx}
                y1={cy - tickH}
                x2={tx}
                y2={cy + tickH}
                stroke="#00F0FF"
                strokeWidth={isMajor ? '1.3' : '0.8'}
                opacity={isMajor ? '0.75' : '0.45'}
              />
            );
          })}

          {/* Vertical 90° Central Axis Line */}
          <line
            x1={cx}
            y1={cy - 18 * effectivePxPerMm}
            x2={cx}
            y2={cy + 24 * effectivePxPerMm}
            stroke="#00F0FF"
            strokeWidth="1.2"
            strokeDasharray="5 4"
            opacity="0.65"
          />

          {/* Center Prism Reference Point (PRP) / Distance Reference Bracket */}
          <g filter="url(#hud-glow)">
            <circle
              cx={cx}
              cy={cy}
              r={Math.max(4, 0.9 * effectivePxPerMm)}
              fill="#00F0FF"
            />
            <circle
              cx={cx}
              cy={cy}
              r={Math.max(10, 2.2 * effectivePxPerMm)}
              fill="none"
              stroke="#00F0FF"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <text
              x={cx + 8}
              y={cy + 15}
              fill="#00F0FF"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
            >
              PRP (0,0)
            </text>
          </g>

          {/* All 3 Fitting Cross Drop Reference Ticks (+2mm, +4mm, +6mm) with active one highlighted */}
          {[2, 4, 6].map((offsetMm) => {
            const yPos = cy - offsetMm * effectivePxPerMm;
            const isSelected = activeFcDropMm === offsetMm;
            return (
              <g key={`fc-level-${offsetMm}`} opacity={isSelected ? 1 : 0.42}>
                <line
                  x1={cx - (isSelected ? 4.2 : 2.2) * effectivePxPerMm}
                  y1={yPos}
                  x2={cx + (isSelected ? 4.2 : 2.2) * effectivePxPerMm}
                  y2={yPos}
                  stroke={isSelected ? '#E2F804' : '#00F0FF'}
                  strokeWidth={isSelected ? '2.4' : '1.2'}
                />
                {isSelected && (
                  <>
                    <line
                      x1={cx}
                      y1={yPos - 3.5 * effectivePxPerMm}
                      x2={cx}
                      y2={yPos + 3.5 * effectivePxPerMm}
                      stroke="#E2F804"
                      strokeWidth="2.4"
                    />
                    <rect
                      x={cx + 4.8 * effectivePxPerMm}
                      y={yPos - 9}
                      width="92"
                      height="18"
                      rx="4"
                      fill="#090A0F"
                      stroke="#E2F804"
                      strokeWidth="1.2"
                    />
                    <text
                      x={cx + 4.8 * effectivePxPerMm + 46}
                      y={yPos + 4}
                      textAnchor="middle"
                      fill="#E2F804"
                      fontSize="10.5"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="700"
                    >
                      FC +{offsetMm}.0mm
                    </text>
                  </>
                )}
                {!isSelected && (
                  <text
                    x={cx - 2.8 * effectivePxPerMm}
                    y={yPos + 3}
                    textAnchor="end"
                    fill="#00F0FF"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    +{offsetMm}
                  </text>
                )}
              </g>
            );
          })}

          {/* LEFT 17.0 mm Reference Target Bracket (Total 34.0 mm separation) */}
          <g filter="url(#hud-glow)">
            <circle
              cx={cx - half34MmPx}
              cy={cy}
              r={Math.max(14, 2.6 * effectivePxPerMm)}
              fill="rgba(226, 248, 4, 0.06)"
              stroke="#E2F804"
              strokeWidth="2.2"
            />
            <circle
              cx={cx - half34MmPx}
              cy={cy}
              r="2.5"
              fill="#E2F804"
            />
            {/* Corner target ticks */}
            <path
              d={`
                M ${cx - half34MmPx - 3.8 * effectivePxPerMm} ${cy - 1.8 * effectivePxPerMm}
                V ${cy - 3.8 * effectivePxPerMm}
                H ${cx - half34MmPx - 1.8 * effectivePxPerMm}
                M ${cx - half34MmPx + 1.8 * effectivePxPerMm} ${cy - 3.8 * effectivePxPerMm}
                H ${cx - half34MmPx + 3.8 * effectivePxPerMm}
                V ${cy - 1.8 * effectivePxPerMm}
                M ${cx - half34MmPx - 3.8 * effectivePxPerMm} ${cy + 1.8 * effectivePxPerMm}
                V ${cy + 3.8 * effectivePxPerMm}
                H ${cx - half34MmPx - 1.8 * effectivePxPerMm}
                M ${cx - half34MmPx + 1.8 * effectivePxPerMm} ${cy + 3.8 * effectivePxPerMm}
                H ${cx - half34MmPx + 3.8 * effectivePxPerMm}
                V ${cy + 1.8 * effectivePxPerMm}
              `}
              stroke="#E2F804"
              strokeWidth="1.5"
              fill="none"
            />
            <rect
              x={cx - half34MmPx - 54}
              y={cy - 4.4 * effectivePxPerMm - 24}
              width="108"
              height="19"
              rx="4"
              fill="rgba(9, 10, 15, 0.88)"
              stroke="#E2F804"
              strokeWidth="1"
            />
            <text
              x={cx - half34MmPx}
              y={cy - 4.4 * effectivePxPerMm - 11}
              textAnchor="middle"
              fill="#E2F804"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
            >
              {leftRole}
            </text>
            <text
              x={cx - half34MmPx}
              y={cy + 4.4 * effectivePxPerMm + 14}
              textAnchor="middle"
              fill="#E2F804"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
            >
              -17.0 mm
            </text>
          </g>

          {/* RIGHT 17.0 mm Reference Target Bracket */}
          <g filter="url(#hud-glow)">
            <circle
              cx={cx + half34MmPx}
              cy={cy}
              r={Math.max(14, 2.6 * effectivePxPerMm)}
              fill="rgba(226, 248, 4, 0.06)"
              stroke="#E2F804"
              strokeWidth="2.2"
            />
            <circle
              cx={cx + half34MmPx}
              cy={cy}
              r="2.5"
              fill="#E2F804"
            />
            <path
              d={`
                M ${cx + half34MmPx - 3.8 * effectivePxPerMm} ${cy - 1.8 * effectivePxPerMm}
                V ${cy - 3.8 * effectivePxPerMm}
                H ${cx + half34MmPx - 1.8 * effectivePxPerMm}
                M ${cx + half34MmPx + 1.8 * effectivePxPerMm} ${cy - 3.8 * effectivePxPerMm}
                H ${cx + half34MmPx + 3.8 * effectivePxPerMm}
                V ${cy - 1.8 * effectivePxPerMm}
                M ${cx + half34MmPx - 3.8 * effectivePxPerMm} ${cy + 1.8 * effectivePxPerMm}
                V ${cy + 3.8 * effectivePxPerMm}
                H ${cx + half34MmPx - 1.8 * effectivePxPerMm}
                M ${cx + half34MmPx + 1.8 * effectivePxPerMm} ${cy + 3.8 * effectivePxPerMm}
                H ${cx + half34MmPx + 3.8 * effectivePxPerMm}
                V ${cy + 1.8 * effectivePxPerMm}
              `}
              stroke="#E2F804"
              strokeWidth="1.5"
              fill="none"
            />
            <rect
              x={cx + half34MmPx - 54}
              y={cy - 4.4 * effectivePxPerMm - 24}
              width="108"
              height="19"
              rx="4"
              fill="rgba(9, 10, 15, 0.88)"
              stroke="#E2F804"
              strokeWidth="1"
            />
            <text
              x={cx + half34MmPx}
              y={cy - 4.4 * effectivePxPerMm - 11}
              textAnchor="middle"
              fill="#E2F804"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
            >
              {rightRole}
            </text>
            <text
              x={cx + half34MmPx}
              y={cy + 4.4 * effectivePxPerMm + 14}
              textAnchor="middle"
              fill="#E2F804"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
            >
              +17.0 mm
            </text>
          </g>

          {/* 34.0 mm Dimension Span Callout Bar */}
          <g opacity="0.88">
            <line
              x1={cx - half34MmPx}
              y1={cy - 12 * effectivePxPerMm}
              x2={cx + half34MmPx}
              y2={cy - 12 * effectivePxPerMm}
              stroke="#E2F804"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
            <line
              x1={cx - half34MmPx}
              y1={cy - 13 * effectivePxPerMm}
              x2={cx - half34MmPx}
              y2={cy - 11 * effectivePxPerMm}
              stroke="#E2F804"
              strokeWidth="1.8"
            />
            <line
              x1={cx + half34MmPx}
              y1={cy - 13 * effectivePxPerMm}
              x2={cx + half34MmPx}
              y2={cy - 11 * effectivePxPerMm}
              stroke="#E2F804"
              strokeWidth="1.8"
            />
            <rect
              x={cx - 64}
              y={cy - 12 * effectivePxPerMm - 10}
              width="128"
              height="20"
              rx="10"
              fill="#090A0F"
              stroke="#E2F804"
              strokeWidth="1.2"
            />
            <text
              x={cx}
              y={cy - 12 * effectivePxPerMm + 4}
              textAnchor="middle"
              fill="#E2F804"
              fontSize="11"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
            >
              ◄ 34.0 mm REF ►
            </text>
          </g>

          {/* Progressive Corridor & Near Reading Zone Overlay */}
          {config.showCorridorZone && (
            <g opacity="0.85">
              {/* Progressive Corridor Channel Path from FC to Near Circle */}
              <path
                d={`
                  M ${cx - 3.2 * effectivePxPerMm} ${fcY}
                  C ${cx - 2.4 * effectivePxPerMm} ${cy + 5 * effectivePxPerMm},
                    ${nearCenterX - 4.5 * effectivePxPerMm} ${nearCenterY - 4 * effectivePxPerMm},
                    ${nearCenterX - 5.2 * effectivePxPerMm} ${nearCenterY}
                  M ${cx + 3.2 * effectivePxPerMm} ${fcY}
                  C ${cx + 2.4 * effectivePxPerMm} ${cy + 5 * effectivePxPerMm},
                    ${nearCenterX + 4.5 * effectivePxPerMm} ${nearCenterY - 4 * effectivePxPerMm},
                    ${nearCenterX + 5.2 * effectivePxPerMm} ${nearCenterY}
                `}
                stroke="#00F0FF"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                fill="none"
              />

              {/* Near Reading Verification Circle */}
              <circle
                cx={nearCenterX}
                cy={nearCenterY}
                r={4.2 * effectivePxPerMm}
                fill="rgba(0, 240, 255, 0.08)"
                stroke="#00F0FF"
                strokeWidth="1.8"
              />
              <text
                x={nearCenterX}
                y={nearCenterY + 3}
                textAnchor="middle"
                fill="#00F0FF"
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
              >
                NEAR ({nearInsetMm}mm)
              </text>

              {/* Minimum Fitting Height Cutoff Line */}
              <line
                x1={cx - 14 * effectivePxPerMm}
                y1={minFitLineY}
                x2={cx + 14 * effectivePxPerMm}
                y2={minFitLineY}
                stroke="#00FF9D"
                strokeWidth="1.4"
                strokeDasharray="6 4"
              />
              <rect
                x={cx - 14 * effectivePxPerMm}
                y={minFitLineY + 4}
                width="124"
                height="17"
                rx="3"
                fill="rgba(9, 10, 15, 0.9)"
                stroke="#00FF9D"
                strokeWidth="1"
              />
              <text
                x={cx - 14 * effectivePxPerMm + 62}
                y={minFitLineY + 15}
                textAnchor="middle"
                fill="#00FF9D"
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
              >
                MIN FIT HT: {minFitHeightMm}mm
              </text>
            </g>
          )}
        </g>

        {/* Tap-to-Focus Lock Reticle Animation */}
        {focusPoint && (
          <g transform={`translate(${focusPoint.x}, ${focusPoint.y})`}>
            <rect
              x="-26"
              y="-26"
              width="52"
              height="52"
              rx="6"
              fill="none"
              stroke="#E2F804"
              strokeWidth="2"
            />
            <line x1="-32" y1="0" x2="-20" y2="0" stroke="#E2F804" strokeWidth="2" />
            <line x1="20" y1="0" x2="32" y2="0" stroke="#E2F804" strokeWidth="2" />
            <line x1="0" y1="-32" x2="0" y2="-20" stroke="#E2F804" strokeWidth="2" />
            <line x1="0" y1="20" x2="0" y2="32" stroke="#E2F804" strokeWidth="2" />
            <text
              x="0"
              y="40"
              textAnchor="middle"
              fill="#E2F804"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
            >
              AF LOCK
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
