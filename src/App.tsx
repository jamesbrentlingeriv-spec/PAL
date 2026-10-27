import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Camera,
  Flashlight,
  Snowflake,
  Play,
  ZoomIn,
  ZoomOut,
  Ruler,
  Eye,
  Sliders,
  Sparkles,
  Download,
  RefreshCw,
  WifiOff,
  Crosshair,
  Plus,
  Layers,
  AlertTriangle
} from 'lucide-react';
import {
  CVFilterMode,
  PALLensDesign,
  ReticleConfig
} from './types/pal';
import {
  initializePALDatabase,
  saveCustomLensDesign,
  deleteCustomLensDesign
} from './db/palDatabase';
import { SEED_PAL_LENSES } from './data/seedLenses';
import { applyOpticalCVFilter } from './utils/cvFilters';
import {
  renderSimulatedLensFrame,
  SimulatedSpecimenConfig
} from './utils/syntheticLensGenerator';
import {
  filterAndScoreLenses,
  SearchFilterCriteria
} from './utils/palMatcher';
import { scanNasalEngravingOCR } from './utils/ocrHelper';
import { ReticleOverlayHUD } from './components/ReticleOverlayHUD';
import { CalibrationModal } from './components/CalibrationModal';
import { IdentifierDrawer } from './components/IdentifierDrawer';
import { LensDetailModal } from './components/LensDetailModal';
import { AddCustomLensModal } from './components/AddCustomLensModal';

const CV_FILTERS: {
  id: CVFilterMode;
  label: string;
  shortLabel: string;
  badge: string;
  desc: string;
}[] = [
  {
    id: 'raw',
    label: 'Raw Passthrough',
    shortLabel: '1. Raw Feed',
    badge: 'PASSTHROUGH',
    desc: 'Unmodified optical sensor feed'
  },
  {
    id: 'highpass',
    label: 'High-Pass Relief Filter',
    shortLabel: '2. High-Pass Relief',
    badge: 'LAPLACIAN 3x3',
    desc: 'Isolates 2–5µm laser micro-etch relief'
  },
  {
    id: 'clahe',
    label: 'Polarized Contrast / CLAHE',
    shortLabel: '3. Polarized CLAHE',
    badge: 'ANTI-GLARE',
    desc: 'Adaptive local contrast & glare suppression'
  },
  {
    id: 'darkfield',
    label: 'Inverted Darkfield',
    shortLabel: '4. Inv. Darkfield',
    badge: 'DARKFIELD',
    desc: 'Bright white etched channels on pure black'
  }
];

export const App: React.FC = () => {
  // Database state
  const [lenses, setLenses] = useState<PALLensDesign[]>(SEED_PAL_LENSES);

  // Camera & Video Stream state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [useSimulatedBench, setUseSimulatedBench] = useState<boolean>(false);
  const [cameraStatusNote, setCameraStatusNote] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [sensorPreset, setSensorPreset] = useState<'macro' | 'main' | 'tele'>('macro');

  // Torch / Flashlight & iOS Darkfield Ring fallback
  const [torchActive, setTorchActive] = useState<boolean>(false);
  const [edgeRingLightActive, setEdgeRingLightActive] = useState<boolean>(false);
  const [torchNotice, setTorchNotice] = useState<string | null>(null);

  // Computer Vision Filter & Sensitivity state
  const [cvMode, setCvMode] = useState<CVFilterMode>('darkfield');
  const [cvSensitivity, setCvSensitivity] = useState<number>(1.55);
  const [glareSuppression, setGlareSuppression] = useState<number>(0.7);
  const [showCvTuner, setShowCvTuner] = useState<boolean>(false);

  // Zoom, Focus Lock, Freeze Frame
  const [zoom, setZoom] = useState<number>(1.0);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1.0);

  // Viewport size tracking for accurate SVG Reticle HUD
  const scopeContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Reticle Configuration (Module B)
  const [reticleConfig, setReticleConfig] = useState<ReticleConfig>(() => {
    const savedScale = localStorage.getItem('palscope_px_per_mm');
    return {
      showReticle: true,
      fittingCrossOffsetMm: 4,
      eyeSide: 'OD',
      showCorridorZone: true,
      showGridRule: false,
      rotationDeg: 0,
      pxPerMm: savedScale ? parseFloat(savedScale) || 5.2 : 5.2
    };
  });

  // Simulated Specimen State (for camera-free bench testing or training)
  const [simulatedSpecimen, setSimulatedSpecimen] = useState<SimulatedSpecimenConfig>({
    lens: SEED_PAL_LENSES[0], // Varilux Comfort Max
    eyeSide: 'OD',
    addPowerDisplay: '20',
    materialCode: 'P',
    glareAngle: 0.4,
    etchContrast: 0.78
  });

  // Search & Multi-Criteria Identifier State (Module C)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [searchCriteria, setSearchCriteria] = useState<SearchFilterCriteria>({
    query: '',
    symbol: 'all',
    nasalAddRaw: '',
    fittingCrossDrop: 'all'
  });

  // Modals & Pinned Lens State
  const [selectedLensDetail, setSelectedLensDetail] = useState<PALLensDesign | null>(null);
  const [pinnedLens, setPinnedLens] = useState<PALLensDesign | null>(null);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);
  const [isAddCustomOpen, setIsAddCustomOpen] = useState<boolean>(false);

  // OCR Status
  const [isScanningOCR, setIsScanningOCR] = useState<boolean>(false);
  const [ocrStatusMessage, setOcrStatusMessage] = useState<string | null>(null);

  // Load IndexedDB lenses on startup
  useEffect(() => {
    initializePALDatabase().then((loaded) => {
      setLenses(loaded);
    });
  }, []);

  // Track viewport resize
  useEffect(() => {
    const updateSize = () => {
      if (scopeContainerRef.current) {
        setViewportSize({
          width: scopeContainerRef.current.clientWidth,
          height: scopeContainerRef.current.clientHeight
        });
      } else {
        setViewportSize({
          width: window.innerWidth,
          height: window.innerHeight
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Initialize WebRTC Camera or fallback cleanly to Simulated Bench Scope
  const startCameraStream = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setUseSimulatedBench(true);
        setCameraStatusNote(
          'WebRTC camera API unavailable on this workstation — Active Optical Specimen Simulator engaged.'
        );
        return;
      }

      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: deviceId
            ? {
                deviceId: { exact: deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
              }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
              }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === 'videoinput');
        setVideoDevices(cams);

        setUseSimulatedBench(false);
        setCameraStatusNote(null);
      } catch {
        // Fallback to high-precision Optical Specimen Simulator when no camera is attached or permission denied
        setUseSimulatedBench(true);
        setCameraStatusNote(
          'Live camera unavailable or restricted — Interactive 34mm Laser Engraving Simulator active.'
        );
      }
    },
    []
  );

  useEffect(() => {
    startCameraStream();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCameraStream]);

  // Torch / Flashlight hardware toggle with iOS Safari Edge-Light Darkfield fallback
  const handleToggleTorch = async () => {
    const nextState = !torchActive;
    if (streamRef.current && !useSimulatedBench) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities =
            typeof videoTrack.getCapabilities === 'function'
              ? (videoTrack.getCapabilities() as Record<string, unknown>)
              : {};
          if (capabilities && 'torch' in capabilities) {
            await videoTrack.applyConstraints({
              advanced: [{ torch: nextState } as unknown as MediaTrackConstraintSet]
            });
            setTorchActive(nextState);
            setTorchNotice(
              nextState
                ? 'Hardware Torch Active — Hold lens at 35° oblique grazing angle'
                : null
            );
            return;
          }
        } catch {
          // Hardware torch unsupported on iOS Safari or desktop webcam
        }
      }
    }

    // Fallback: Activate High-Luminance OLED Bezel Grazing Light Ring & boost simulated oblique scatter
    setTorchActive(nextState);
    setEdgeRingLightActive(nextState);
    setSimulatedSpecimen((prev) => ({
      ...prev,
      etchContrast: nextState ? 1.0 : 0.78
    }));
    setTorchNotice(
      nextState
        ? 'Darkfield Grazing Illumination Active (Hardware Torch restricted on iOS/Desktop; Bezel Ring Light + Grazing Boost enabled)'
        : null
    );
    setTimeout(() => setTorchNotice(null), 4200);
  };

  // Sensor Preset Switcher (Macro / Main / Telephoto)
  const handleCycleSensor = () => {
    const order: ('macro' | 'main' | 'tele')[] = ['macro', 'main', 'tele'];
    const nextPreset = order[(order.indexOf(sensorPreset) + 1) % order.length];
    setSensorPreset(nextPreset);

    if (videoDevices.length > 1) {
      const currentIdx = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId);
      const nextDevice = videoDevices[(currentIdx + 1) % videoDevices.length];
      if (nextDevice) {
        setSelectedDeviceId(nextDevice.deviceId);
        startCameraStream(nextDevice.deviceId);
      }
    } else {
      // Adjust optical magnification preset when single sensor is present
      if (nextPreset === 'macro') setZoom(1.5);
      else if (nextPreset === 'tele') setZoom(2.2);
      else setZoom(1.0);
    }
  };

  // Real-Time 60fps Vision Enhancement Render Loop
  useEffect(() => {
    let animId: number;

    const renderFrame = (timestamp: number) => {
      if (!isFrozen && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Keep internal processing resolution crisp yet fast for 60fps CV filters
        const targetW = Math.min(960, Math.max(640, Math.floor(viewportSize.width * 0.85)));
        const aspect = viewportSize.height / Math.max(1, viewportSize.width);
        const targetH = Math.max(400, Math.floor(targetW * aspect));

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }
        const offCanvas = offscreenCanvasRef.current;
        if (offCanvas.width !== targetW || offCanvas.height !== targetH) {
          offCanvas.width = targetW;
          offCanvas.height = targetH;
        }
        const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

        if (ctx && offCtx) {
          const scaleFactor = targetW / Math.max(1, viewportSize.width);
          const effectivePxPerMm = reticleConfig.pxPerMm * scaleFactor;

          if (
            !useSimulatedBench &&
            videoRef.current &&
            videoRef.current.readyState >= 2 &&
            videoRef.current.videoWidth > 0
          ) {
            const vid = videoRef.current;
            const vw = vid.videoWidth;
            const vh = vid.videoHeight;
            // Apply digital zoom crop around center
            const cropW = vw / zoom;
            const cropH = vh / zoom;
            const sx = (vw - cropW) / 2;
            const sy = (vh - cropH) / 2;
            offCtx.drawImage(vid, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
          } else {
            // Render realistic progressive lens specimen with faint 2-5µm laser markings
            offCtx.save();
            if (zoom !== 1) {
              offCtx.translate(targetW / 2, targetH / 2);
              offCtx.scale(zoom, zoom);
              offCtx.translate(-targetW / 2, -targetH / 2);
            }
            renderSimulatedLensFrame(
              offCtx,
              targetW,
              targetH,
              effectivePxPerMm,
              {
                ...simulatedSpecimen,
                eyeSide: reticleConfig.eyeSide
              },
              timestamp
            );
            offCtx.restore();
          }

          // Run Real-Time Computer Vision Shader / Matrix Pipeline
          const imageData = offCtx.getImageData(0, 0, targetW, targetH);
          applyOpticalCVFilter(imageData, {
            mode: cvMode,
            sensitivity: cvSensitivity,
            glareSuppression
          });
          ctx.putImageData(imageData, 0, 0);
        }
      }

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [
    isFrozen,
    viewportSize,
    useSimulatedBench,
    zoom,
    cvMode,
    cvSensitivity,
    glareSuppression,
    reticleConfig.pxPerMm,
    reticleConfig.eyeSide,
    simulatedSpecimen
  ]);

  // Tap-to-Focus & Pinch-to-Zoom Handlers on Scope Viewport
  const handleScopePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusPoint({ x, y });

    // Attempt hardware point-of-interest focus lock if supported
    if (streamRef.current && !useSimulatedBench) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        track
          .applyConstraints({
            advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet]
          })
          .catch(() => {});
      }
    }

    setTimeout(() => {
      setFocusPoint((prev) => (prev && prev.x === x && prev.y === y ? null : prev));
    }, 1800);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / Math.max(1, pinchStartDistRef.current);
      const nextZoom = Math.min(4.0, Math.max(1.0, pinchStartZoomRef.current * ratio));
      setZoom(Number(nextZoom.toFixed(2)));
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
  };

  // Download Frozen Frame Snapshot
  const handleDownloadSnapshot = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `pal-scope-snapshot-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  // Trigger On-Demand Nasal Add OCR
  const handleTriggerOCRScan = async () => {
    if (!canvasRef.current) return;
    setIsScanningOCR(true);
    setOcrStatusMessage('Scanning nasal 34.0 mm target bracket via local OCR...');

    const canvas = canvasRef.current;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const scaleFactor = canvas.width / Math.max(1, viewportSize.width);
    const halfRefPx = 17.0 * reticleConfig.pxPerMm * scaleFactor * zoom;
    const nasalX = reticleConfig.eyeSide === 'OD' ? cx + halfRefPx : cx - halfRefPx;

    const result = await scanNasalEngravingOCR(
      canvas,
      nasalX,
      cy,
      reticleConfig.pxPerMm * scaleFactor * zoom,
      useSimulatedBench
        ? {
            addCode: simulatedSpecimen.addPowerDisplay,
            temporalCode: simulatedSpecimen.lens.temporalEngravingCode
          }
        : undefined
    );

    setIsScanningOCR(false);
    setSearchCriteria((prev) => ({
      ...prev,
      nasalAddRaw: result.detectedAddCode,
      symbol: useSimulatedBench
        ? simulatedSpecimen.lens.temporalSymbolCategory
        : prev.symbol
    }));
    setOcrStatusMessage(
      `OCR Detected Nasal Stamp "${result.detectedAddCode}" (${result.confidence}% conf) — Filtered matches!`
    );
    setTimeout(() => setOcrStatusMessage(null), 5000);
  };

  // Filtered and scored lenses
  const scoredMatches = useMemo(
    () => filterAndScoreLenses(lenses, searchCriteria),
    [lenses, searchCriteria]
  );

  // Save calibration scale to localStorage
  const handleSavePxPerMm = (newScale: number) => {
    localStorage.setItem('palscope_px_per_mm', String(newScale));
    setReticleConfig((prev) => ({ ...prev, pxPerMm: newScale }));
  };

  // Add or Delete Custom Lens in IndexedDB
  const handleSaveCustomLens = async (customLens: PALLensDesign) => {
    const updated = await saveCustomLensDesign(customLens);
    setLenses(updated);
    setPinnedLens(customLens);
  };

  const handleDeleteCustomLens = async (id: string) => {
    const updated = await deleteCustomLensDesign(id);
    setLenses(updated);
    if (pinnedLens?.id === id) setPinnedLens(null);
  };

  // Load any lens from the catalog onto the simulated bench stage
  const handleLoadLensIntoSimulator = (lens: PALLensDesign) => {
    setUseSimulatedBench(true);
    setSimulatedSpecimen({
      lens,
      eyeSide: reticleConfig.eyeSide,
      addPowerDisplay: lens.nasalExample.replace(/[^0-9]/g, '') || '20',
      materialCode: lens.materials[0]?.code || 'P',
      glareAngle: Math.random() * 2,
      etchContrast: 0.85
    });
    setPinnedLens(lens);
  };

  // Cycle simulated specimen for quick bench demonstration
  const handleCycleSimulatedSpecimen = () => {
    const currentIndex = lenses.findIndex((l) => l.id === simulatedSpecimen.lens.id);
    const nextLens = lenses[(currentIndex + 1) % Math.min(16, lenses.length)];
    if (nextLens) {
      handleLoadLensIntoSimulator(nextLens);
    }
  };

  return (
    <div className="relative w-full h-full bg-oled text-white overflow-hidden flex flex-col select-none">
      {/* Hidden WebRTC Video Element */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="hidden"
      />

      {/* iOS / Tablet Bezel Darkfield Grazing Ring Light Overlay */}
      {edgeRingLightActive && (
        <div className="pointer-events-none fixed inset-0 z-40 border-[14px] border-white shadow-[inset_0_0_60px_rgba(255,255,255,0.85)] rounded-none" />
      )}

      {/* TOP TACTICAL BENCH HEADER BAR */}
      <header className="relative z-20 px-3 sm:px-5 py-2.5 bg-oled-panel/95 backdrop-blur-md border-b border-oled-border flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Brand & Offline Ready Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-oled border-2 border-optic-yellow flex items-center justify-center shadow-neon-yellow">
            <Crosshair className="w-6 h-6 text-optic-yellow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-wider uppercase text-white">
                PAL-SCOPE
              </h1>
              <span className="px-2 py-0.5 rounded bg-optic-yellow text-oled font-mono text-[10px] font-black uppercase">
                34.0 MM BENCH HUD
              </span>
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-optic-emerald/15 border border-optic-emerald/40 text-optic-emerald font-mono text-[10px] font-bold">
                <WifiOff className="w-3 h-3" />
                100% OFFLINE DB ({lenses.length} PALs)
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400 hidden sm:block">
              Excimer Laser Micro-Engraving Darkfield Identifier & OLA Reference Scope
            </p>
          </div>
        </div>

        {/* Center / Right Reticle & Hardware Controls */}
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
          {/* OD / OS Eye Side Toggle */}
          <div className="flex rounded-xl bg-oled border border-oled-border p-0.5">
            {(['OD', 'OS'] as const).map((side) => (
              <button
                key={side}
                onClick={() =>
                  setReticleConfig((prev) => ({ ...prev, eyeSide: side }))
                }
                className={`px-2.5 py-1.5 rounded-lg font-mono text-xs font-extrabold transition-all ${
                  reticleConfig.eyeSide === side
                    ? 'bg-optic-cyan text-oled shadow-neon-cyan'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {side}
              </button>
            ))}
          </div>

          {/* Fitting Cross Vertical Drop Selector (+2mm, +4mm, +6mm) */}
          <div className="flex items-center rounded-xl bg-oled border border-oled-border p-0.5">
            <span className="px-2 text-[10px] font-mono uppercase text-slate-400 hidden xl:inline">
              FC Drop:
            </span>
            {([2, 4, 6] as const).map((drop) => {
              const activeDrop = pinnedLens
                ? pinnedLens.fittingCrossDropMm
                : reticleConfig.fittingCrossOffsetMm;
              return (
                <button
                  key={drop}
                  onClick={() => {
                    if (pinnedLens) setPinnedLens(null);
                    setReticleConfig((prev) => ({
                      ...prev,
                      fittingCrossOffsetMm: drop
                    }));
                  }}
                  className={`px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold transition-all ${
                    activeDrop === drop
                      ? 'bg-optic-yellow text-oled shadow-neon-yellow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  +{drop}mm
                </button>
              );
            })}
          </div>

          {/* 34mm Scale Calibration Trigger */}
          <button
            onClick={() => setIsCalibrationOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-oled border border-oled-border hover:border-optic-yellow text-slate-200 font-mono text-xs font-bold transition-colors"
            title="Calibrate Physical 34.0 mm Screen Scale"
          >
            <Ruler className="w-4 h-4 text-optic-yellow" />
            <span className="hidden sm:inline">Calibrate</span>
          </button>

          {/* Torch / Grazing Flashlight Toggle */}
          <button
            onClick={handleToggleTorch}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-mono text-xs font-bold transition-all ${
              torchActive
                ? 'bg-optic-yellow text-oled border-optic-yellow shadow-neon-yellow'
                : 'bg-oled border-oled-border text-slate-200 hover:border-optic-yellow'
            }`}
            title="Toggle Oblique Grazing Torch / Darkfield Ring"
          >
            <Flashlight className="w-4 h-4" />
            <span className="hidden sm:inline">{torchActive ? 'Torch ON' : 'Torch'}</span>
          </button>

          {/* Freeze Frame / Snapshot Toggle */}
          <button
            onClick={() => setIsFrozen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border font-mono text-xs font-extrabold transition-all ${
              isFrozen
                ? 'bg-optic-cyan text-oled border-optic-cyan shadow-neon-cyan'
                : 'bg-oled border-oled-border text-white hover:border-optic-cyan'
            }`}
          >
            {isFrozen ? (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Snowflake className="w-4 h-4 text-optic-cyan" />
                <span>Freeze</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* MAIN LENS SCOPE VIEWPORT (MODULE A + MODULE B) */}
      <main
        ref={scopeContainerRef}
        onClick={handleScopePointerDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative flex-1 w-full bg-oled overflow-hidden flex items-center justify-center pb-16"
      >
        {/* Real-Time Computer Vision Processed Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover"
        />

        {/* Interactive 34.0 mm SVG Reticle Overlay HUD */}
        <ReticleOverlayHUD
          config={reticleConfig}
          zoom={zoom}
          pinnedLens={pinnedLens}
          viewportWidth={viewportSize.width}
          viewportHeight={viewportSize.height - 64}
          focusPoint={focusPoint}
        />

        {/* Top-Left Status & Simulated Specimen Selector Pill */}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 max-w-xs sm:max-w-md">
          <div className="flex flex-wrap items-center gap-2">
            {/* Live Camera vs Simulated Specimen Mode Toggle */}
            <button
              onClick={() => {
                if (useSimulatedBench) {
                  startCameraStream(selectedDeviceId || undefined);
                } else {
                  setUseSimulatedBench(true);
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-oled-panel/90 backdrop-blur-md border border-oled-border hover:border-optic-cyan text-xs font-mono font-bold text-slate-200 shadow-lg"
            >
              <Camera className="w-3.5 h-3.5 text-optic-cyan" />
              <span>
                {useSimulatedBench ? 'Mode: Bench Specimen Sim' : `Live Sensor (${sensorPreset.toUpperCase()})`}
              </span>
              <RefreshCw className="w-3 h-3 text-slate-400" />
            </button>

            {!useSimulatedBench && (
              <button
                onClick={handleCycleSensor}
                className="px-2.5 py-1.5 rounded-xl bg-oled-panel/90 backdrop-blur-md border border-oled-border hover:border-optic-yellow text-xs font-mono font-bold text-optic-yellow"
              >
                Lens: {sensorPreset.toUpperCase()}
              </button>
            )}

            {useSimulatedBench && (
              <button
                onClick={handleCycleSimulatedSpecimen}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-optic-yellow/15 backdrop-blur-md border border-optic-yellow/60 text-optic-yellow text-xs font-mono font-bold hover:bg-optic-yellow/25 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  Specimen: {simulatedSpecimen.lens.designName} (+{simulatedSpecimen.addPowerDisplay})
                </span>
              </button>
            )}
          </div>

          {/* Camera Fallback or Torch Guidance Banner */}
          {(cameraStatusNote || torchNotice) && (
            <div className="px-3 py-2 rounded-xl bg-oled-panel/90 backdrop-blur-md border border-oled-border text-[11px] font-mono text-slate-300 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-optic-yellow shrink-0" />
              <span>{torchNotice || cameraStatusNote}</span>
            </div>
          )}

          {/* Active Pinned Lens Banner */}
          {pinnedLens && (
            <div className="px-3.5 py-2 rounded-xl bg-oled-panel/95 backdrop-blur-md border-2 border-optic-emerald shadow-lg flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-optic-emerald font-bold block">
                  Pinned Reticle Verification
                </span>
                <span className="text-xs font-bold text-white">
                  {pinnedLens.brand} {pinnedLens.designName} (FC +{pinnedLens.fittingCrossDropMm}mm | Min {pinnedLens.minFittingHeightMm}mm)
                </span>
              </div>
              <button
                onClick={() => setPinnedLens(null)}
                className="px-2 py-1 rounded bg-oled border border-oled-border text-xs font-mono text-slate-300 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Top-Right HUD Controls (Reticle Visibility, Corridor Zone, Snapshot Save) */}
        <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() =>
                setReticleConfig((prev) => ({ ...prev, showReticle: !prev.showReticle }))
              }
              className={`px-3 py-1.5 rounded-xl border font-mono text-xs font-bold transition-colors flex items-center gap-1.5 ${
                reticleConfig.showReticle
                  ? 'bg-oled-panel/90 border-optic-cyan text-optic-cyan'
                  : 'bg-oled-panel/80 border-oled-border text-slate-400'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>HUD</span>
            </button>

            <button
              onClick={() =>
                setReticleConfig((prev) => ({
                  ...prev,
                  showCorridorZone: !prev.showCorridorZone
                }))
              }
              className={`px-3 py-1.5 rounded-xl border font-mono text-xs font-bold transition-colors flex items-center gap-1.5 ${
                reticleConfig.showCorridorZone
                  ? 'bg-oled-panel/90 border-optic-emerald text-optic-emerald'
                  : 'bg-oled-panel/80 border-oled-border text-slate-400'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Corridor</span>
            </button>

            <button
              onClick={() => setShowCvTuner((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl border font-mono text-xs font-bold transition-colors flex items-center gap-1.5 ${
                showCvTuner
                  ? 'bg-optic-yellow text-oled border-optic-yellow'
                  : 'bg-oled-panel/90 border-oled-border text-slate-200 hover:border-optic-yellow'
              }`}
              title="Fine-Tune Edge Gain & Glare Suppression"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gain</span>
            </button>
          </div>

          {/* Snapshot Save Button when Frozen */}
          {isFrozen && (
            <button
              onClick={handleDownloadSnapshot}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-optic-yellow text-oled font-mono text-xs font-extrabold shadow-neon-yellow animate-pulse"
            >
              <Download className="w-4 h-4" />
              Save Frozen Frame PNG
            </button>
          )}

          {/* CV Filter Gain & Glare Suppression Popover */}
          {showCvTuner && (
            <div className="w-64 p-3.5 rounded-2xl bg-oled-panel/95 backdrop-blur-xl border border-oled-border shadow-2xl space-y-3">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Laser Etch Gain</span>
                  <span className="text-optic-yellow font-bold">{cvSensitivity.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="2.5"
                  step="0.05"
                  value={cvSensitivity}
                  onChange={(e) => setCvSensitivity(parseFloat(e.target.value))}
                  className="w-full bench-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">AR Glare Suppression</span>
                  <span className="text-optic-cyan font-bold">
                    {Math.round(glareSuppression * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={glareSuppression}
                  onChange={(e) => setGlareSuppression(parseFloat(e.target.value))}
                  className="w-full bench-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Reticle Axis Tilt</span>
                  <span className="text-white font-bold">{reticleConfig.rotationDeg}°</span>
                </div>
                <input
                  type="range"
                  min="-25"
                  max="25"
                  step="1"
                  value={reticleConfig.rotationDeg}
                  onChange={(e) =>
                    setReticleConfig((prev) => ({
                      ...prev,
                      rotationDeg: parseInt(e.target.value, 10)
                    }))
                  }
                  className="w-full bench-slider"
                />
              </div>
            </div>
          )}
        </div>

        {/* Right-Side Digital Zoom Rail (1.0x to 4.0x) */}
        <div className="absolute right-3 bottom-36 z-20 flex flex-col items-center gap-1.5 bg-oled-panel/90 backdrop-blur-md border border-oled-border rounded-2xl p-2 shadow-xl">
          <button
            onClick={() => setZoom((z) => Math.min(4.0, Number((z + 0.5).toFixed(1))))}
            className="p-2 rounded-xl bg-oled border border-oled-border hover:border-optic-yellow text-slate-200 active:scale-95"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-optic-yellow" />
          </button>

          <div className="py-1 px-1.5 font-mono text-xs font-extrabold text-optic-yellow">
            {zoom.toFixed(1)}x
          </div>

          <button
            onClick={() => setZoom((z) => Math.max(1.0, Number((z - 0.5).toFixed(1))))}
            className="p-2 rounded-xl bg-oled border border-oled-border hover:border-optic-cyan text-slate-200 active:scale-95"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-optic-cyan" />
          </button>
        </div>

        {/* Floating Real-Time CV Filter Switcher Dock (Module A Bottom Toolbar) */}
        <div className="absolute inset-x-3 bottom-20 z-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto bg-oled-panel/95 backdrop-blur-xl border-2 border-oled-border rounded-2xl p-1.5 shadow-2xl grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full max-w-3xl">
            {CV_FILTERS.map((filter) => {
              const active = cvMode === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setCvMode(filter.id)}
                  className={`px-3 py-2 rounded-xl text-left transition-all border flex flex-col justify-between ${
                    active
                      ? 'bg-optic-yellow text-oled border-optic-yellow shadow-neon-yellow'
                      : 'bg-oled/90 text-slate-200 border-oled-border hover:border-optic-cyan/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs font-extrabold tracking-tight truncate">
                      {filter.shortLabel}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                        active
                          ? 'bg-oled text-optic-yellow'
                          : 'bg-oled-surface text-optic-cyan'
                      }`}
                    >
                      {filter.badge}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 truncate hidden sm:block ${
                      active ? 'text-oled/80 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {filter.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* MODULE C: INSTANT MULTI-CRITERIA IDENTIFIER & SEARCH DRAWER */}
      <IdentifierDrawer
        isOpen={isDrawerOpen}
        onToggleOpen={() => setIsDrawerOpen((prev) => !prev)}
        criteria={searchCriteria}
        onChangeCriteria={setSearchCriteria}
        matches={scoredMatches}
        pinnedLens={pinnedLens}
        onSelectLensDetail={(lens) => setSelectedLensDetail(lens)}
        onPinToReticle={(lens) => setPinnedLens(lens)}
        onOpenAddCustomModal={() => setIsAddCustomOpen(true)}
        onTriggerOCRScan={handleTriggerOCRScan}
        isScanningOCR={isScanningOCR}
        ocrStatusMessage={ocrStatusMessage}
      />

      {/* MODULE B: 34.0 MM PHYSICAL SCALE CALIBRATION MODAL */}
      <CalibrationModal
        isOpen={isCalibrationOpen}
        currentPxPerMm={reticleConfig.pxPerMm}
        onSavePxPerMm={handleSavePxPerMm}
        onClose={() => setIsCalibrationOpen(false)}
      />

      {/* MODULE C: DETAILED MATCH VIEW MODAL */}
      <LensDetailModal
        lens={selectedLensDetail}
        isPinnedToReticle={
          Boolean(selectedLensDetail && pinnedLens?.id === selectedLensDetail.id)
        }
        onPinToReticle={(lens) => setPinnedLens(lens)}
        onDeleteCustomLens={handleDeleteCustomLens}
        onLoadIntoSimulator={handleLoadLensIntoSimulator}
        onClose={() => setSelectedLensDetail(null)}
      />

      {/* MODULE D: ADD CUSTOM LENS DESIGN MODAL (INDEXEDDB) */}
      <AddCustomLensModal
        isOpen={isAddCustomOpen}
        onSaveLens={handleSaveCustomLens}
        onClose={() => setIsAddCustomOpen(false)}
      />
    </div>
  );
};
export default App;
