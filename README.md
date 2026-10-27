# PAL-Scope — Bench-Side Progressive Addition Lens (PAL) Identifier PWA

**PAL-Scope** is a production-grade, 100% offline-capable Progressive Web App (PWA) engineered for optical dispensary and laboratory bench workstations. It assists opticians and lab technicians in identifying unmarked or faded progressive lenses using real-time computer vision darkfield filters, calibrated 34.0 mm alignment reticles, and an instant multi-criteria OLA/Vision Council symbol and nasal add power lookup engine.

---

## Core Modules & Capabilities

### Module A: Live Camera & Vision Enhancement ("The Lens Scope")
- **Live Camera & Sensor Switcher**: Supports rear `environment` cameras (Macro / Main / Telephoto presets) and includes an interactive **34.0 mm Optical Bench Specimen Simulator** for training or camera-restricted workstations.
- **Oblique Grazing Illumination**: Hardware Torch (`applyConstraints({ advanced: [{ torch: true }] })`) toggle with automatic **Edge-Lit Darkfield Bezel Ring** fallback on iOS Safari and desktop displays.
- **Real-Time Computer Vision Filter Pipeline**:
  1. **Raw Passthrough**: Unmodified optical sensor stream.
  2. **High-Pass Relief Filter**: 3×3 Laplacian + directional emboss operator isolating 2–5µm laser micro-etch relief from ambient glare.
  3. **Polarized Contrast / CLAHE**: 8×8 tile Contrast Limited Adaptive Histogram Equalization with bilinear interpolation and AR glare suppression.
  4. **Inverted Darkfield**: Integral-image local background subtraction rendering faint etched channels as bright luminous lines on pure `#090A0F` OLED black.
- **Pinch-to-Zoom (1.0× – 4.0×), Tap-to-Focus Lock & Freeze Frame**: Two-finger pinch zoom, `AF LOCK` target indicator, and high-resolution canvas freeze-frame snapshot with PNG download.

### Module B: Interactive 34.0 mm Reticle Overlay
- **Standardized 34.0 mm HUD**: Dual circular target brackets at `-17.0 mm` and `+17.0 mm`, `180°` reference line with millimeter ticks, Center Prism Reference Point (**PRP**), and **OD / OS** orientation switcher.
- **Fitting Cross & Corridor Verification**: Toggleable `+2 mm`, `+4 mm`, and `+6 mm` fitting cross vertical offset indicators, progressive corridor channel overlay, and minimum fitting height line.
- **On-Screen Physical Scale Calibration**: Calibrate exact physical `px/mm` ratio using an ISO ID-1 credit/PD card (`53.98 mm`) or metric bench PD ruler (`50.0 mm`).

### Module C: Instant Multi-Criteria Identifier & Search Engine
- **Visual Symbol Picker**: Vector glyph grid for manufacturer temporal symbols (Stylized V, Shamir S-Wave, Zeiss Z-Box, Hoya Circles, Diamond, Triangle, Infinity Loop, Bird Wing, Hexagon, Alphanumeric Prefix, and Custom Lab Glyphs).
- **Nasal Add Power Keypad & On-Demand OCR**: Quick tactile keypad (`"20"` → `+2.00 D`, `"225"` → `+2.25 D`) plus on-demand local OCR (`Tesseract.js` + canvas binarization crop).
- **Detailed Match View & Printable Spec Chart**: Interactive OD/OS vector layout schematic, material suffix table, fitting parameters, printable bench ticket, and one-tap **Pin to Scope HUD**.

### Module D: Preloaded Seed Database & Custom Lab Extensibility
- **30 Preloaded Industry PAL Designs**: Varilux (Comfort Max, Comfort DRx, XR Design, X Design, Physio W3+, Liberty 3.0, Definity, Ovation, Natural), Shamir (Autograph III, Autograph Intelligence, Spectrum+, Genesis HD, Element), Zeiss (SmartLife Individual 3, SmartLife Plus, Light D, Precision Pure), Hoya (iD MyStyle V+, iD LifeStyle 4, Array 2, Amplitude), Younger Optics (Image, Adage, Camber), Vision Ease (Novel, Illumina), Seiko Surmount, Rodenstock Impression FreeSign 3, Nikon Presio Master, Kodak Unique DRO, and IOT Alpha H45.
- **Add Custom Lens Design (IndexedDB)**: Local form with SVG/PNG glyph upload persisted via `Dexie.js` so optical labs can catalog proprietary in-house digital freeform designs.

---

## Development & Build Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build production offline PWA bundle (outputs to dist/)
npm run build

# Preview production build locally
npm run preview
```
