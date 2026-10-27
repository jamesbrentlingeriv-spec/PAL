/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        oled: {
          DEFAULT: '#090A0F',
          panel: '#10131C',
          surface: '#161A26',
          border: '#252B3D',
        },
        optic: {
          yellow: '#E2F804',
          cyan: '#00F0FF',
          amber: '#FFB800',
          emerald: '#00FF9D',
          danger: '#FF3366',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        'neon-yellow': '0 0 14px rgba(226, 248, 4, 0.35)',
        'neon-cyan': '0 0 14px rgba(0, 240, 255, 0.35)',
      }
    },
  },
  plugins: [],
}
