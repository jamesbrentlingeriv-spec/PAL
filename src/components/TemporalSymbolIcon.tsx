import React from 'react';
import { TemporalSymbolGlyph } from '../types/pal';

interface TemporalSymbolIconProps {
  symbol: TemporalSymbolGlyph;
  customDataUrl?: string;
  className?: string;
  strokeColor?: string;
}

export const TemporalSymbolIcon: React.FC<TemporalSymbolIconProps> = ({
  symbol,
  customDataUrl,
  className = 'w-7 h-7',
  strokeColor = 'currentColor'
}) => {
  if (symbol === 'custom' && customDataUrl) {
    return (
      <img
        src={customDataUrl}
        alt="Custom Temporal Mark"
        className={`${className} object-contain rounded`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {symbol === 'stylized-v' && (
        <g stroke={strokeColor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 12L19 30L28 13C29.8 10 33 10.5 34 14" />
          <circle cx="20" cy="7" r="1.5" fill={strokeColor} stroke="none" />
        </g>
      )}

      {symbol === 'shamir-s' && (
        <g stroke={strokeColor} strokeWidth="2.6" strokeLinecap="round">
          <path d="M28 11C17 6 10 15 20 20C30 25 23 34 12 29" />
          <path d="M10 19H30" strokeWidth="1.4" strokeDasharray="2 3" opacity="0.7" />
        </g>
      )}

      {symbol === 'zeiss-z' && (
        <g stroke={strokeColor} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="8" width="26" height="24" rx="3" />
          <path d="M14 14H26L14 26H26" strokeWidth="2.6" />
        </g>
      )}

      {symbol === 'hoya-circle' && (
        <g stroke={strokeColor} strokeWidth="2.5">
          <circle cx="20" cy="20" r="12" />
          <circle cx="20" cy="20" r="5" />
          <circle cx="20" cy="20" r="1.5" fill={strokeColor} stroke="none" />
        </g>
      )}

      {symbol === 'diamond' && (
        <g stroke={strokeColor} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M20 6L33 20L20 34L7 20Z" />
          <circle cx="20" cy="20" r="2.2" fill={strokeColor} stroke="none" />
        </g>
      )}

      {symbol === 'triangle' && (
        <g stroke={strokeColor} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M20 7L33 31H7L20 7Z" />
          <circle cx="20" cy="23" r="2" fill={strokeColor} stroke="none" />
        </g>
      )}

      {symbol === 'infinity' && (
        <g stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round">
          <path d="M20 20C14 11 6 12 6 20C6 28 14 29 20 20C26 11 34 12 34 20C34 28 26 29 20 20Z" />
        </g>
      )}

      {symbol === 'bird-wing' && (
        <g stroke={strokeColor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 24C9 13 16 13 20 22C24 13 31 13 35 24" />
          <path d="M11 28H29" strokeWidth="1.6" opacity="0.65" />
        </g>
      )}

      {symbol === 'hexagon' && (
        <g stroke={strokeColor} strokeWidth="2.4" strokeLinejoin="round">
          <path d="M20 6L32 13V27L20 34L8 27V13L20 6Z" />
          <path d="M15 20H25M20 15V25" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {symbol === 'alphanumeric' && (
        <g stroke={strokeColor} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 28L13 12L18 28M9.5 23H16.5" />
          <path d="M23 13H32L23 27H32" />
        </g>
      )}

      {symbol === 'custom' && (
        <g stroke={strokeColor} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="7" width="26" height="26" rx="5" strokeDasharray="4 3" />
          <path d="M20 13V27M13 20H27" strokeWidth="2.6" />
        </g>
      )}
    </svg>
  );
};
