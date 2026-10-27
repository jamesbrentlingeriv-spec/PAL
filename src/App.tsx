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
  Layers,
  AlertTriangle,
  Focus,
  HelpCircle
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
import { applyOpticalCVFilter, resetTemporalBuffer } from './utils/cvFilters';
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
    desc: 'Unmodified phone camera feed'
  },
  {
    id: 'highpass',
    label: 'High-Pass Relief Filter',
    shortLabel: '2. High-Pass Relief',
    badge: '3D RELIEF',
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
  const leftLoupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightLoupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [useSimulatedBench, setUseSimulatedBench] = useState<boolean>(false);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [cameraStatusNote, setCameraStatusNote] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Hardware camera capabilities (Native Zoom & Macro Focus Distance)
  const [hwZoomRange, setHwZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [hwFocusRange, setHwFocusRange] = useState<{ min: number; max: number } | null>(null);
  const [manualFocusDist, setManualFocusDist] = useState<number | null>(null);

  // Torch / Flashlight & iOS Darkfield Ring fallback
  const [torchActive, setTorchActive] = useState<boolean>(false);
  const [edgeRingLightActive, setEdgeRingLightActive] = useState<boolean>(false);
  const [torchNotice, setTorchNotice] = useState<string | null>(null);

  // Computer Vision Filter & Sensitivity state
  const [cvMode, setCvMode] = useState<CVFilterMode>('darkfield');
  const [cvSensitivity, setCvSensitivity] = useState<number>(1.85);
  const [glareSuppression, setGlareSuppression] = useState<number>(0.75);
  const [temporalDenoise, setTemporalDenoise] = useState<boolean>(true);
  const [showCvTuner, setShowCvTuner] = useState<boolean>(false);
  const [showMacroLoupes, setShowMacroLoupes] = useState<boolean>(true);
  const [showBenchTips, setShowBenchTips] = useState<boolean>(false);

  // Zoom, Focus Lock, Freeze Frame
  const [zoom, setZoom] = useState<number>(1.5);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1.5);

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
    lens: SEED_PAL_LENSES[0],
    eyeSide: 'OD',
    addPowerDisplay: '20',
    materialCode: 'P',
    glareAngle: 0.4,
    etchContrast: 0.82
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

  // Start Live Phone Camera Stream (Optimized for iOS Safari & Android Chrome high-res macro)
  const startCameraStream = useCallback(async (deviceId?: string) => {
    setCameraErrorMsg(null);
    resetTemporalBuffer();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraReady(false);
      setCameraErrorMsg(
        'Camera access requires HTTPS (e.g. GitHub Pages or localhost). Using Simulator until HTTPS camera is opened.'
      );
      setUseSimulatedBench(true);
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      // Request high-resolution rear camera stream so 2-5µm engravings have plenty of pixels
      const videoConstraints: MediaTrackConstraints = deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60, min: 24 }
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60, min: 24 }
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints
      });

      streamRef.current = stream;

      if (videoRef.current) {
        const v = videoRef.current;
        v.srcObject = stream;
        v.setAttribute('playsinline', 'true');
        v.setAttribute('webkit-playsinline', 'true');
        v.muted = true;
        await v.play();
      }

      // Inspect hardware camera track capabilities (Macro Focus, Continuous AF, Native Zoom)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        if (settings.deviceId) {
          setSelectedDeviceId(settings.deviceId);
        }

        if (typeof videoTrack.getCapabilities === 'function') {
          const caps = videoTrack.getCapabilities() as Record<string, unknown>;

          // Enable continuous autofocus for close-range lens inspection
          if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
            videoTrack
              .applyConstraints({
                advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet]
              })
              .catch(() => {});
          }

          if (
            caps.zoom &&
            typeof caps.zoom === 'object' &&
            'min' in caps.zoom &&
            'max' in caps.zoom
          ) {
            setHwZoomRange({
              min: Number((caps.zoom as { min: number }).min) || 1,
              max: Number((caps.zoom as { max: number }).max) || 4
            });
          } else {
            setHwZoomRange(null);
          }

          if (
            caps.focusDistance &&
            typeof caps.focusDistance === 'object' &&
            'min' in caps.focusDistance &&
            'max' in caps.focusDistance
          ) {
            const minFocus = Number((caps.focusDistance as { min: number }).min) || 0.05;
            const maxFocus = Number((caps.focusDistance as { max: number }).max) || 1.0;
            setHwFocusRange({ min: minFocus, max: maxFocus });
          } else {
            setHwFocusRange(null);
          }
        }
      }

      // Enumerate all rear/macro/telephoto cameras once permission is granted
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      setVideoDevices(cams);

      setCameraReady(true);
      setUseSimulatedBench(false);
      setCameraStatusNote(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera permission denied';
      setCameraReady(false);
      setCameraErrorMsg(
        `Phone camera not active (${msg}). Tap "Activate Phone Camera" to grant permission, or use Demo Sim.`
      );
      setUseSimulatedBench(true);
    }
  }, []);

  useEffect(() => {
    startCameraStream();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCameraStream]);

  // Sync hardware optical zoom when user adjusts zoom slider
  useEffect(() => {
    if (!useSimulatedBench && streamRef.current && hwZoomRange) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        const clampedHwZoom = Math.min(hwZoomRange.max, Math.max(hwZoomRange.min, zoom));
        track
          .applyConstraints({
            advanced: [{ zoom: clampedHwZoom } as unknown as MediaTrackConstraintSet]
          })
          .catch(() => {});
      }
    }
  }, [zoom, useSimulatedBench, hwZoomRange]);

  // Apply manual macro focus distance when adjusted by user
  const handleManualFocusChange = (dist: number) => {
    setManualFocusDist(dist);
    if (!useSimulatedBench && streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        track
          .applyConstraints({
            advanced: [
              {
                focusMode: 'manual',
                focusDistance: dist
              } as unknown as MediaTrackConstraintSet
            ]
          })
          .catch(() => {});
      }
    }
  };

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
                ? 'Phone Flashlight ON — Tilt lens 30°–45° over a dark background so light grazes the surface'
                : null
            );
            setTimeout(() => setTorchNotice(null), 5000);
            return;
          }
        } catch {
          // Hardware torch unsupported on iOS Safari
        }
      }
    }

    setTorchActive(nextState);
    setEdgeRingLightActive(nextState);
    setSimulatedSpecimen((prev) => ({
      ...prev,
      etchContrast: nextState ? 1.0 : 0.82
    }));
    setTorchNotice(
      nextState
        ? 'Darkfield Screen Ring ON — Tilt lens 35° over a black cloth or dark surface to see engravings'
        : null
    );
    setTimeout(() => setTorchNotice(null), 5000);
  };

  // Switch between multiple phone rear lenses (e.g., Main 1x, Ultra-Wide Macro 0.5x, Telephoto 2x/3x)
  const handleCycleCameraDevice = () => {
    if (videoDevices.length > 1) {
      const currentIdx = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId);
      const nextDevice = videoDevices[(currentIdx + 1) % videoDevices.length];
      if (nextDevice) {
        setSelectedDeviceId(nextDevice.deviceId);
        startCameraStream(nextDevice.deviceId);
        setCameraStatusNote(
          `Switched Sensor: ${nextDevice.label || `Camera ${(currentIdx + 1) % videoDevices.length + 1}`}`
        );
        setTimeout(() => setCameraStatusNote(null), 3500);
      }
    } else {
      startCameraStream();
    }
  };

  // Real-Time 60fps Vision Enhancement Render Loop + Dual 34mm Target Macro Loupes
  useEffect(() => {
    let animId: number;

    const renderFrame = (timestamp: number) => {
      if (!isFrozen && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // High-definition processing buffer so 2-5µm laser marks remain crisp on mobile
        const targetW = Math.min(1080, Math.max(720, Math.floor(viewportSize.width * 0.95)));
        const aspect = Math.max(320, viewportSize.height - 64) / Math.max(1, viewportSize.width);
        const targetH = Math.max(480, Math.floor(targetW * aspect));

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
          resetTemporalBuffer();
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

          const vid = videoRef.current;
          const isLiveVideoValid =
            !useSimulatedBench &&
            vid &&
            vid.readyState >= 2 &&
            vid.videoWidth > 0 &&
            vid.videoHeight > 0;

          if (isLiveVideoValid && vid) {
            const vw = vid.videoWidth;
            const vh = vid.videoHeight;
            const canvasAspect = targetW / targetH;
            const videoAspect = vw / vh;

            // Compute distortion-free `object-fit: cover` crop from native phone camera frame
            let baseCropW = vw;
            let baseCropH = vh;
            if (videoAspect > canvasAspect) {
              baseCropW = vh * canvasAspect;
            } else {
              baseCropH = vw / canvasAspect;
            }

            // If hardware zoom is active, only apply residual digital zoom; otherwise full digital zoom
            const digitalZoomFactor = hwZoomRange ? Math.max(1.0, zoom / Math.min(hwZoomRange.max, zoom)) : zoom;
            const finalCropW = baseCropW / digitalZoomFactor;
            const finalCropH = baseCropH / digitalZoomFactor;
            const sx = (vw - finalCropW) / 2;
            const sy = (vh - finalCropH) / 2;

            offCtx.drawImage(vid, sx, sy, finalCropW, finalCropH, 0, 0, targetW, targetH);
          } else {
            // Render realistic progressive lens specimen when in Demo/Simulator mode
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
            glareSuppression,
            temporalSmoothing: temporalDenoise
          });
          ctx.putImageData(imageData, 0, 0);

          // Update Dual 4x Target Macro Loupes (Left -17mm & Right +17mm Brackets)
          if (showMacroLoupes && leftLoupeCanvasRef.current && rightLoupeCanvasRef.current) {
            const cx = targetW / 2;
            const cy = targetH / 2;
            const half34Px = 17.0 * effectivePxPerMm * zoom;
            const sampleRadius = Math.max(28, Math.round(4.6 * effectivePxPerMm * zoom));

            const renderLoupe = (
              loupeCanvas: HTMLCanvasElement,
              targetCenterX: number,
              targetCenterY: number
            ) => {
              const lCtx = loupeCanvas.getContext('2d');
              if (!lCtx) return;
              const lw = loupeCanvas.width;
              const lh = loupeCanvas.height;
              lCtx.fillStyle = '#090A0F';
              lCtx.fillRect(0, 0, lw, lh);
              lCtx.drawImage(
                canvas,
                Math.max(0, targetCenterX - sampleRadius),
                Math.max(0, targetCenterY - sampleRadius),
                sampleRadius * 2,
                sampleRadius * 2,
                0,
                0,
                lw,
                lh
              );
              // Subtle center alignment crosshair inside each macro loupe
              lCtx.strokeStyle = 'rgba(226, 248, 4, 0.35)';
              lCtx.lineWidth = 1;
              lCtx.beginPath();
              lCtx.moveTo(lw / 2, 0);
              lCtx.lineTo(lw / 2, lh);
              lCtx.moveTo(0, lh / 2);
              lCtx.lineTo(lw, lh / 2);
              lCtx.stroke();
            };

            renderLoupe(leftLoupeCanvasRef.current, cx - half34Px, cy);
            renderLoupe(rightLoupeCanvasRef.current, cx + half34Px, cy);
          }
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
    hwZoomRange,
    cvMode,
    cvSensitivity,
    glareSuppression,
    temporalDenoise,
    showMacroLoupes,
    reticleConfig.pxPerMm,
    reticleConfig.eyeSide,
    simulatedSpecimen
  ]);

  // Tap-to-Focus & Pinch-to-Zoom Handlers on Scope Viewport
  const handleScopePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusPoint({ x, y });

    // Trigger hardware continuous/single-shot autofocus re-lock on tap
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

  const isOD = reticleConfig.eyeSide === 'OD';

  return (
    <div className="relative w-full h-full bg-oled text-white overflow-hidden flex flex-col select-none">
      {/* IMPORTANT: Never use display:none ('hidden') on <video> for iOS Safari / Mobile WebKit! */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="fixed top-0 left-0 w-px h-px opacity-0 pointer-events-none -z-10"
      />

      {/* iOS / Tablet Bezel Darkfield Grazing Ring Light Overlay */}
      {edgeRingLightActive && (
        <div className="pointer-events-none fixed inset-0 z-40 border-[14px] border-white shadow-[inset_0_0_60px_rgba(255,255,255,0.85)] rounded-none" />
      )}

      {/* TOP TACTICAL BENCH HEADER BAR */}
      <header className="relative z-20 px-3 sm:px-5 py-2.5 bg-oled-panel/95 backdrop-blur-md border-b border-oled-border flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Brand & Offline Ready Status */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-oled border-2 border-optic-yellow flex items-center justify-center shadow-neon-yellow">
            <Crosshair className="w-5 h-5 sm:w-6 sm:h-6 text-optic-yellow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-lg font-black tracking-wider uppercase text-white">
                PAL-SCOPE
              </h1>
              <span className="px-2 py-0.5 rounded bg-optic-yellow text-oled font-mono text-[10px] font-black uppercase">
                {useSimulatedBench ? 'SIMULATOR' : 'LIVE CAMERA'}
              </span>
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-optic-emerald/15 border border-optic-emerald/40 text-optic-emerald font-mono text-[10px] font-bold">
                <WifiOff className="w-3 h-3" />
                OFFLINE ({lenses.length} PALs)
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400 hidden sm:block">
              Hold lens over dark background • Use Torch at 35° angle • Align 34mm targets
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
                  className={`px-2 py-1.5 rounded-lg font-mono text-xs font-bold transition-all ${
                    activeDrop === drop
                      ? 'bg-optic-yellow text-oled shadow-neon-yellow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  +{drop}
                </button>
              );
            })}
          </div>

          {/* 34mm Scale Calibration Trigger */}
          <button
            onClick={() => setIsCalibrationOpen(true)}
            className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-oled border border-oled-border hover:border-optic-yellow text-slate-200 font-mono text-xs font-bold transition-colors"
            title="Calibrate Physical 34.0 mm Screen Scale"
          >
            <Ruler className="w-4 h-4 text-optic-yellow" />
            <span className="hidden sm:inline">34mm Scale</span>
          </button>

          {/* Torch / Grazing Flashlight Toggle */}
          <button
            onClick={handleToggleTorch}
            className={`flex items-center gap-1 px-2.5 py-2 rounded-xl border font-mono text-xs font-bold transition-all ${
              torchActive
                ? 'bg-optic-yellow text-oled border-optic-yellow shadow-neon-yellow'
                : 'bg-oled border-oled-border text-slate-200 hover:border-optic-yellow'
            }`}
            title="Toggle Phone Flashlight / Darkfield Grazing Light"
          >
            <Flashlight className="w-4 h-4" />
            <span className="hidden sm:inline">{torchActive ? 'Torch ON' : 'Torch'}</span>
          </button>

          {/* Freeze Frame / Snapshot Toggle */}
          <button
            onClick={() => setIsFrozen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-mono text-xs font-extrabold transition-all ${
              isFrozen
                ? 'bg-optic-cyan text-oled border-optic-cyan shadow-neon-cyan'
                : 'bg-oled border-oled-border text-white hover:border-optic-cyan'
            }`}
          >
            {isFrozen ? (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Live</span>
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

        {/* DUAL 4X MACRO TARGET LOUPE WINDOWS (Shows Left -17mm & Right +17mm Brackets Magnified!) */}
        {showMacroLoupes && (
          <div className="pointer-events-none absolute top-14 sm:top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-oled-panel/90 backdrop-blur-md border border-oled-border px-3 py-2 rounded-2xl shadow-2xl">
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-mono font-bold uppercase text-optic-yellow mb-1">
                {isOD ? '◄ Left (-17mm Temporal)' : '◄ Left (-17mm Nasal Add)'}
              </span>
              <canvas
                ref={leftLoupeCanvasRef}
                width={104}
                height={76}
                className="w-[104px] h-[76px] rounded-lg border-2 border-optic-yellow bg-oled"
              />
            </div>

            <div className="flex flex-col items-center">
              <span className="text-[9px] font-mono font-bold uppercase text-optic-cyan mb-1">
                {isOD ? 'Right (+17mm Nasal Add) ►' : 'Right (+17mm Temporal) ►'}
              </span>
              <canvas
                ref={rightLoupeCanvasRef}
                width={104}
                height={76}
                className="w-[104px] h-[76px] rounded-lg border-2 border-optic-cyan bg-oled"
              />
            </div>
          </div>
        )}

        {/* Top-Left Camera Selector & Simulator Switcher */}
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 max-w-[260px] sm:max-w-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Activate Live Phone Camera or Switch to Demo Sim */}
            {useSimulatedBench ? (
              <button
                onClick={() => startCameraStream(selectedDeviceId || undefined)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-optic-yellow text-oled font-mono text-xs font-extrabold shadow-neon-yellow animate-pulse"
              >
                <Camera className="w-4 h-4" />
                <span>Activate Phone Camera</span>
              </button>
            ) : (
              <button
                onClick={handleCycleCameraDevice}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-oled-panel/90 backdrop-blur-md border border-optic-cyan text-xs font-mono font-bold text-optic-cyan shadow-lg"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>
                  {videoDevices.length > 1
                    ? `Switch Camera (${videoDevices.length} Lenses)`
                    : 'Phone Camera Active'}
                </span>
                <RefreshCw className="w-3 h-3" />
              </button>
            )}

            <button
              onClick={() => setUseSimulatedBench((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-xl bg-oled-panel/90 backdrop-blur-md border border-oled-border hover:border-optic-yellow text-[11px] font-mono font-semibold text-slate-300"
            >
              {useSimulatedBench ? 'Sim Mode' : 'Try Demo Lens'}
            </button>

            {useSimulatedBench && (
              <button
                onClick={handleCycleSimulatedSpecimen}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-optic-yellow/15 backdrop-blur-md border border-optic-yellow/60 text-optic-yellow text-[11px] font-mono font-bold"
              >
                <Sparkles className="w-3 h-3" />
                <span>{simulatedSpecimen.lens.designName}</span>
              </button>
            )}
          </div>

          {/* Camera Error / Guidance Banner */}
          {(cameraErrorMsg || cameraStatusNote || torchNotice) && (
            <div className="px-3 py-2 rounded-xl bg-oled-panel/95 backdrop-blur-md border border-optic-yellow/60 text-[11px] font-mono text-slate-200 flex items-start gap-2 shadow-lg">
              <AlertTriangle className="w-4 h-4 text-optic-yellow shrink-0 mt-0.5" />
              <span>{torchNotice || cameraStatusNote || cameraErrorMsg}</span>
            </div>
          )}

          {/* Active Pinned Lens Banner */}
          {pinnedLens && (
            <div className="px-3 py-2 rounded-xl bg-oled-panel/95 backdrop-blur-md border-2 border-optic-emerald shadow-lg flex items-center justify-between gap-2">
              <div>
                <span className="text-[9px] font-mono uppercase text-optic-emerald font-bold block">
                  Pinned Reticle Overlay
                </span>
                <span className="text-xs font-bold text-white">
                  {pinnedLens.brand} {pinnedLens.designName} (+{pinnedLens.fittingCrossDropMm}mm)
                </span>
              </div>
              <button
                onClick={() => setPinnedLens(null)}
                className="px-2 py-0.5 rounded bg-oled border border-oled-border text-xs font-mono text-slate-300 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Top-Right HUD Controls (Macro Loupes, HUD, Gain/Focus Tuner, Viewing Guide) */}
        <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowMacroLoupes((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl border font-mono text-xs font-bold transition-colors flex items-center gap-1 ${
                showMacroLoupes
                  ? 'bg-oled-panel/90 border-optic-yellow text-optic-yellow'
                  : 'bg-oled-panel/80 border-oled-border text-slate-400'
              }`}
              title="Toggle 4x Target Macro Loupes"
            >
              <Focus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">4x Loupes</span>
            </button>

            <button
              onClick={() =>
                setReticleConfig((prev) => ({ ...prev, showReticle: !prev.showReticle }))
              }
              className={`px-2.5 py-1.5 rounded-xl border font-mono text-xs font-bold transition-colors flex items-center gap-1 ${
                reticleConfig.showReticle
                  ? 'bg-oled-panel/90 border-optic-cyan text-optic-cyan'
                  : 'bg-oled-panel/80 border-oled-border text-slate-400'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">HUD</span>
            </button>

            <button
              onClick={() => setShowCvTuner((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl border font-mono text-xs font-bold transition-colors flex items-center gap-1 ${
                showCvTuner
                  ? 'bg-optic-yellow text-oled border-optic-yellow'
                  : 'bg-oled-panel/90 border-oled-border text-slate-200 hover:border-optic-yellow'
              }`}
              title="Adjust Laser Contrast Gain & Macro Focus"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Enhance</span>
            </button>

            <button
              onClick={() => setShowBenchTips((prev) => !prev)}
              className={`p-1.5 rounded-xl border transition-colors ${
                showBenchTips
                  ? 'bg-optic-cyan text-oled border-optic-cyan'
                  : 'bg-oled-panel/90 border-oled-border text-optic-cyan'
              }`}
              title="How to See Faint PAL Markings with Phone Camera"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {/* Snapshot Save Button when Frozen */}
          {isFrozen && (
            <button
              onClick={handleDownloadSnapshot}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-optic-yellow text-oled font-mono text-xs font-extrabold shadow-neon-yellow"
            >
              <Download className="w-4 h-4" />
              Save Snapshot PNG
            </button>
          )}

          {/* How to See Real PAL Markings Bench Technique Card */}
          {showBenchTips && (
            <div className="w-72 sm:w-80 p-4 rounded-2xl bg-oled-panel/95 backdrop-blur-xl border-2 border-optic-cyan shadow-2xl space-y-2.5 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-extrabold uppercase text-optic-cyan">
                  Phone Camera PAL Viewing Technique
                </span>
                <button
                  onClick={() => setShowBenchTips(false)}
                  className="text-xs font-mono text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <ol className="text-xs text-slate-200 space-y-1.5 list-decimal list-inside">
                <li>
                  <strong className="text-optic-yellow">Dark Background:</strong> Hold the glasses 3–4 inches above a matte black cloth or dark table (never against a bright ceiling light).
                </li>
                <li>
                  <strong className="text-optic-yellow">Grazing Light (35°):</strong> Turn on <strong>Torch</strong> or shine a penlight across the lens edge at an oblique 35° angle so the 2–5µm laser grooves scatter light into the camera.
                </li>
                <li>
                  <strong className="text-optic-yellow">Switch Camera / 1.5x–2.5x Zoom:</strong> Tap <strong>Switch Camera</strong> if your phone has a Macro/Ultra-Wide lens, or set zoom to <strong>1.5x–2.5x</strong> so the phone focuses sharply.
                </li>
                <li>
                  <strong className="text-optic-yellow">Use Filter #4 (Inv. Darkfield) or #2 (Relief):</strong> Adjust the <strong>Enhance</strong> slider until the faint engraving pops inside the <strong>4x Macro Loupes</strong>!
                </li>
              </ol>
            </div>
          )}

          {/* CV Filter Gain, Glare Suppression, Macro Focus & Denoise Popover */}
          {showCvTuner && (
            <div className="w-68 sm:w-72 p-3.5 rounded-2xl bg-oled-panel/95 backdrop-blur-xl border border-oled-border shadow-2xl space-y-3">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Laser Etch Contrast Gain</span>
                  <span className="text-optic-yellow font-bold">{cvSensitivity.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="3.0"
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

              {hwFocusRange && (
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-optic-emerald">Hardware Macro Focus</span>
                    <span className="text-optic-emerald font-bold">
                      {manualFocusDist !== null ? `${manualFocusDist.toFixed(2)}m` : 'Auto'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={hwFocusRange.min}
                    max={Math.min(0.6, hwFocusRange.max)}
                    step="0.01"
                    value={manualFocusDist ?? hwFocusRange.min}
                    onChange={(e) => handleManualFocusChange(parseFloat(e.target.value))}
                    className="w-full bench-slider"
                  />
                </div>
              )}

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

              <div className="flex items-center justify-between pt-1 border-t border-oled-border">
                <span className="text-xs font-mono text-slate-300">
                  Multi-Frame Sensor Denoise
                </span>
                <button
                  onClick={() => setTemporalDenoise((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold ${
                    temporalDenoise
                      ? 'bg-optic-emerald text-oled'
                      : 'bg-oled border border-oled-border text-slate-400'
                  }`}
                >
                  {temporalDenoise ? 'ON (Stacking)' : 'OFF'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right-Side Optical/Digital Zoom Rail (1.0x to 4.0x) */}
        <div className="absolute right-3 bottom-36 z-20 flex flex-col items-center gap-1.5 bg-oled-panel/90 backdrop-blur-md border border-oled-border rounded-2xl p-2 shadow-xl">
          <button
            onClick={() => setZoom((z) => Math.min(4.0, Number((z + 0.25).toFixed(2))))}
            className="p-2 rounded-xl bg-oled border border-oled-border hover:border-optic-yellow text-slate-200 active:scale-95"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-optic-yellow" />
          </button>

          <div className="py-1 px-1 font-mono text-xs font-extrabold text-optic-yellow">
            {zoom.toFixed(1)}x
          </div>

          <button
            onClick={() => setZoom((z) => Math.max(1.0, Number((z - 0.25).toFixed(2))))}
            className="p-2 rounded-xl bg-oled border border-oled-border hover:border-optic-cyan text-slate-200 active:scale-95"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-optic-cyan" />
          </button>

          <button
            onClick={() =>
              setReticleConfig((prev) => ({
                ...prev,
                showCorridorZone: !prev.showCorridorZone
              }))
            }
            title="Toggle Corridor Overlay"
            className={`p-2 rounded-xl border transition-colors ${
              reticleConfig.showCorridorZone
                ? 'bg-oled border-optic-emerald text-optic-emerald'
                : 'bg-oled border-oled-border text-slate-500'
            }`}
          >
            <Layers className="w-4 h-4" />
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
