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
  WifiOff,
  Crosshair,
  Layers,
  AlertTriangle,
  Focus,
  HelpCircle,
  ScanLine,
  CheckCircle2
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
import {
  recognizePALFromScope,
  RecognitionTelemetry,
  computeFocusSharpness
} from './utils/palRecognizer';
import { ReticleOverlayHUD } from './components/ReticleOverlayHUD';
import { CalibrationModal } from './components/CalibrationModal';
import { IdentifierDrawer } from './components/IdentifierDrawer';
import { LensDetailModal } from './components/LensDetailModal';
import { AddCustomLensModal } from './components/AddCustomLensModal';
import { TemporalSymbolIcon } from './components/TemporalSymbolIcon';

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
    badge: 'Z-SCORE',
    desc: 'Amplifies 1% faint etchings on black'
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
  const centerLoupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightLoupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [useSimulatedBench, setUseSimulatedBench] = useState<boolean>(false);
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [cameraStatusNote, setCameraStatusNote] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [activeStreamResolution, setActiveStreamResolution] = useState<string>('');

  // Hardware camera capabilities (Native Zoom & Macro Focus Distance)
  const [hwZoomRange, setHwZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [hwFocusRange, setHwFocusRange] = useState<{ min: number; max: number } | null>(null);
  const [manualFocusDist, setManualFocusDist] = useState<number | null>(null);

  // Real-time focus sharpness meter & PAL Auto-Recognizer state
  const [liveSharpness, setLiveSharpness] = useState<number>(0);
  const [isScanningPAL, setIsScanningPAL] = useState<boolean>(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(false);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionTelemetry | null>(null);
  const frameCounterRef = useRef<number>(0);

  // Torch / Flashlight & iOS Darkfield Ring fallback
  const [torchActive, setTorchActive] = useState<boolean>(false);
  const [edgeRingLightActive, setEdgeRingLightActive] = useState<boolean>(false);
  const [torchNotice, setTorchNotice] = useState<string | null>(null);

  // Computer Vision Filter & Sensitivity state
  const [cvMode, setCvMode] = useState<CVFilterMode>('darkfield');
  const [cvSensitivity, setCvSensitivity] = useState<number>(2.25);
  const [glareSuppression, setGlareSuppression] = useState<number>(0.75);
  const [temporalDenoise, setTemporalDenoise] = useState<boolean>(true);
  const [showCvTuner, setShowCvTuner] = useState<boolean>(false);
  const [showMacroLoupes, setShowMacroLoupes] = useState<boolean>(true);
  const [showBenchTips, setShowBenchTips] = useState<boolean>(false);

  // Zoom, Focus Lock, Freeze Frame
  const [zoom, setZoom] = useState<number>(1.8);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1.8);

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

  // Simulated Specimen State
  const [simulatedSpecimen, setSimulatedSpecimen] = useState<SimulatedSpecimenConfig>({
    lens: SEED_PAL_LENSES[0],
    eyeSide: 'OD',
    addPowerDisplay: '20',
    materialCode: 'P',
    glareAngle: 0.4,
    etchContrast: 0.85
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

  // OCR Status inside drawer
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

  // Start Live Phone Camera Stream (Requests up to 4K 3840x2160 for Samsung S23 Ultra!)
  const startCameraStream = useCallback(async (deviceId?: string) => {
    setCameraErrorMsg(null);
    resetTemporalBuffer();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraErrorMsg(
        'Camera access requires HTTPS. Open https://jamesbrentlingeriv-spec.github.io/PAL/ on your S23 Ultra.'
      );
      setUseSimulatedBench(true);
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      // Request maximum optical resolution (4K UHD / 1080p) so tiny 2mm PAL markings have 100+ pixels
      const videoConstraints: MediaTrackConstraints = deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 3840, min: 1280 },
            height: { ideal: 2160, min: 720 },
            frameRate: { ideal: 30 }
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 3840, min: 1280 },
            height: { ideal: 2160, min: 720 },
            frameRate: { ideal: 30 }
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

      // Inspect S23 Ultra hardware camera track capabilities
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        if (settings.deviceId) {
          setSelectedDeviceId(settings.deviceId);
        }
        if (settings.width && settings.height) {
          setActiveStreamResolution(`${settings.width}×${settings.height}`);
        }

        if (typeof videoTrack.getCapabilities === 'function') {
          const caps = videoTrack.getCapabilities() as Record<string, unknown>;

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
              max: Number((caps.zoom as { max: number }).max) || 10
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
            const minFocus = Number((caps.focusDistance as { min: number }).min) || 0.02;
            const maxFocus = Number((caps.focusDistance as { max: number }).max) || 1.0;
            setHwFocusRange({ min: minFocus, max: maxFocus });
          } else {
            setHwFocusRange(null);
          }
        }
      }

      // Enumerate all back cameras on S23 Ultra (Main 1x, Ultra-Wide Macro 0.6x, 3x Telephoto, 10x Telephoto)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const allVideoInputs = devices.filter((d) => d.kind === 'videoinput');
      // Filter to rear/environment cameras if labels are available
      const rearCams = allVideoInputs.filter(
        (d) =>
          !d.label ||
          !d.label.toLowerCase().includes('front') ||
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
      );
      setVideoDevices(rearCams.length > 0 ? rearCams : allVideoInputs);

      setUseSimulatedBench(false);
      setCameraStatusNote(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera permission denied';
      setCameraErrorMsg(
        `Camera not active (${msg}). Tap "Activate S23 Camera" to allow access.`
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

  // Sync hardware optical zoom when user adjusts zoom
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

  // Torch / Flashlight hardware toggle
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
                ? 'S23 Flashlight ON — Tilt lens 35° over a dark cloth so light grazes the laser mark'
                : null
            );
            setTimeout(() => setTorchNotice(null), 5000);
            return;
          }
        } catch {
          // Fallback if torch not available on selected sensor
        }
      }
    }

    setTorchActive(nextState);
    setEdgeRingLightActive(nextState);
    setSimulatedSpecimen((prev) => ({
      ...prev,
      etchContrast: nextState ? 1.0 : 0.85
    }));
    setTorchNotice(
      nextState
        ? 'Darkfield Screen Ring ON — Tilt lens 35° over a dark surface'
        : null
    );
    setTimeout(() => setTorchNotice(null), 5000);
  };

  // Trigger Full-Resolution PAL Recognition (Single-Tap or Continuous Auto-Scan)
  const handleRunPALRecognition = useCallback(async () => {
    if (!canvasRef.current || isScanningPAL) return;
    setIsScanningPAL(true);

    try {
      const sourceElem =
        !useSimulatedBench &&
        videoRef.current &&
        videoRef.current.readyState >= 2 &&
        videoRef.current.videoWidth > 0
          ? videoRef.current
          : canvasRef.current;

      const scaleFactor = canvasRef.current.width / Math.max(1, viewportSize.width);
      const telemetry = await recognizePALFromScope(
        sourceElem,
        canvasRef.current,
        lenses,
        reticleConfig.eyeSide,
        reticleConfig.pxPerMm * scaleFactor,
        zoom,
        useSimulatedBench
          ? {
              lens: simulatedSpecimen.lens,
              addPowerDisplay: simulatedSpecimen.addPowerDisplay
            }
          : undefined
      );

      setRecognitionResult(telemetry);

      // Update search criteria automatically if Add power or symbol was recognized
      if (telemetry.detectedAddPowerRaw || telemetry.detectedSymbolCategory) {
        setSearchCriteria((prev) => ({
          ...prev,
          nasalAddRaw: telemetry.detectedAddPowerRaw || prev.nasalAddRaw,
          symbol: telemetry.detectedSymbolCategory || prev.symbol,
          query: telemetry.detectedLaserCode
            ? telemetry.detectedLaserCode.replace(/[^A-Za-z0-9]/g, '')
            : prev.query
        }));
      }

      setOcrStatusMessage(
        `Scanned: ${
          telemetry.detectedAddPowerRaw
            ? `Add "${telemetry.detectedAddPowerRaw}" (${telemetry.detectedAddFormatted})`
            : 'Symbol/Contour analyzed'
        } — ${telemetry.topMatches.length} PAL matches ranked`
      );
    } finally {
      setIsScanningPAL(false);
    }
  }, [
    isScanningPAL,
    useSimulatedBench,
    viewportSize.width,
    lenses,
    reticleConfig.eyeSide,
    reticleConfig.pxPerMm,
    zoom,
    simulatedSpecimen
  ]);

  // Continuous Auto-Scan interval when enabled
  useEffect(() => {
    if (!autoScanEnabled || isFrozen) return;
    const timer = setInterval(() => {
      handleRunPALRecognition();
    }, 2600);
    return () => clearInterval(timer);
  }, [autoScanEnabled, isFrozen, handleRunPALRecognition]);

  // Real-Time 60fps Vision Enhancement Render Loop + 1:1 Native Sensor Macro Loupes
  useEffect(() => {
    let animId: number;

    const renderFrame = (timestamp: number) => {
      if (!isFrozen && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // High-definition processing buffer
        const targetW = Math.min(1120, Math.max(800, Math.floor(viewportSize.width * 1.1)));
        const aspect = Math.max(320, viewportSize.height - 64) / Math.max(1, viewportSize.width);
        const targetH = Math.max(520, Math.floor(targetW * aspect));

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

          let sx = 0;
          let sy = 0;
          let finalCropW = targetW;
          let finalCropH = targetH;

          if (isLiveVideoValid && vid) {
            const vw = vid.videoWidth;
            const vh = vid.videoHeight;
            const canvasAspect = targetW / targetH;
            const videoAspect = vw / vh;

            let baseCropW = vw;
            let baseCropH = vh;
            if (videoAspect > canvasAspect) {
              baseCropW = vh * canvasAspect;
            } else {
              baseCropH = vw / canvasAspect;
            }

            const digitalZoomFactor = hwZoomRange
              ? Math.max(1.0, zoom / Math.min(hwZoomRange.max, zoom))
              : zoom;
            finalCropW = baseCropW / digitalZoomFactor;
            finalCropH = baseCropH / digitalZoomFactor;
            sx = (vw - finalCropW) / 2;
            sy = (vh - finalCropH) / 2;

            offCtx.drawImage(vid, sx, sy, finalCropW, finalCropH, 0, 0, targetW, targetH);
          } else {
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

          // Update Focus Sharpness Meter every 12 frames
          frameCounterRef.current++;
          if (frameCounterRef.current % 12 === 0) {
            const sharp = computeFocusSharpness(
              offCtx,
              targetW * 0.3,
              targetH * 0.3,
              targetW * 0.4,
              targetH * 0.4
            );
            setLiveSharpness(sharp);
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

          // Update Triple 1:1 Native Resolution Macro Loupes (Left -17mm, Center Close-Up, Right +17mm)
          if (
            showMacroLoupes &&
            leftLoupeCanvasRef.current &&
            centerLoupeCanvasRef.current &&
            rightLoupeCanvasRef.current
          ) {
            const cx = targetW / 2;
            const cy = targetH / 2;
            const half34Px = 17.0 * effectivePxPerMm * zoom;

            // Sample directly from 1:1 native video pixels when live camera is active for maximum S23 Ultra clarity!
            const renderNativeLoupe = (
              loupeCanvas: HTMLCanvasElement,
              normX: number,
              normY: number,
              borderColor: string
            ) => {
              const lCtx = loupeCanvas.getContext('2d', { willReadFrequently: true });
              if (!lCtx) return;
              const lw = loupeCanvas.width;
              const lh = loupeCanvas.height;

              if (isLiveVideoValid && vid) {
                // Map normalized canvas point (0..1) to exact native 4K/1080p video pixel coordinates
                const vidX = sx + normX * finalCropW;
                const vidY = sy + normY * finalCropH;
                // Sample a tight 1:1 native pixel window (no pre-downscaling!)
                const nativePatchW = Math.max(72, Math.round(lw * 0.85));
                const nativePatchH = Math.max(54, Math.round(lh * 0.85));
                lCtx.drawImage(
                  vid,
                  Math.max(0, vidX - nativePatchW / 2),
                  Math.max(0, vidY - nativePatchH / 2),
                  nativePatchW,
                  nativePatchH,
                  0,
                  0,
                  lw,
                  lh
                );
                // Apply CV filter directly to the 1:1 native loupe patch
                const loupeImg = lCtx.getImageData(0, 0, lw, lh);
                applyOpticalCVFilter(loupeImg, {
                  mode: cvMode === 'raw' ? 'darkfield' : cvMode,
                  sensitivity: cvSensitivity * 1.15,
                  glareSuppression,
                  temporalSmoothing: false
                });
                lCtx.putImageData(loupeImg, 0, 0);
              } else {
                const sampleR = Math.max(26, Math.round(4.2 * effectivePxPerMm * zoom));
                lCtx.drawImage(
                  canvas,
                  Math.max(0, normX * targetW - sampleR),
                  Math.max(0, normY * targetH - sampleR),
                  sampleR * 2,
                  sampleR * 2,
                  0,
                  0,
                  lw,
                  lh
                );
              }

              lCtx.strokeStyle = borderColor;
              lCtx.lineWidth = 1;
              lCtx.beginPath();
              lCtx.moveTo(lw / 2, 0);
              lCtx.lineTo(lw / 2, lh);
              lCtx.moveTo(0, lh / 2);
              lCtx.lineTo(lw, lh / 2);
              lCtx.stroke();
            };

            renderNativeLoupe(
              leftLoupeCanvasRef.current,
              Math.max(0.08, (cx - half34Px) / targetW),
              0.5,
              'rgba(226, 248, 4, 0.4)'
            );
            renderNativeLoupe(
              centerLoupeCanvasRef.current,
              0.5,
              0.5,
              'rgba(0, 255, 157, 0.45)'
            );
            renderNativeLoupe(
              rightLoupeCanvasRef.current,
              Math.min(0.92, (cx + half34Px) / targetW),
              0.5,
              'rgba(0, 240, 255, 0.4)'
            );
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

  // Tap-to-Focus & Pinch-to-Zoom Handlers
  const handleScopePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusPoint({ x, y });

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

  const handleDownloadSnapshot = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `pal-scope-snapshot-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const scoredMatches = useMemo(
    () => filterAndScoreLenses(lenses, searchCriteria),
    [lenses, searchCriteria]
  );

  const handleSavePxPerMm = (newScale: number) => {
    localStorage.setItem('palscope_px_per_mm', String(newScale));
    setReticleConfig((prev) => ({ ...prev, pxPerMm: newScale }));
  };

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

  const handleLoadLensIntoSimulator = (lens: PALLensDesign) => {
    setUseSimulatedBench(true);
    setSimulatedSpecimen({
      lens,
      eyeSide: reticleConfig.eyeSide,
      addPowerDisplay: lens.nasalExample.replace(/[^0-9]/g, '') || '20',
      materialCode: lens.materials[0]?.code || 'P',
      glareAngle: Math.random() * 2,
      etchContrast: 0.88
    });
    setPinnedLens(lens);
  };

  const handleCycleSimulatedSpecimen = () => {
    const currentIndex = lenses.findIndex((l) => l.id === simulatedSpecimen.lens.id);
    const nextLens = lenses[(currentIndex + 1) % Math.min(16, lenses.length)];
    if (nextLens) {
      handleLoadLensIntoSimulator(nextLens);
    }
  };

  const isOD = reticleConfig.eyeSide === 'OD';

  // Helper label for S23 Ultra multi-camera buttons
  const getCameraShortLabel = (dev: MediaDeviceInfo, idx: number) => {
    const lbl = (dev.label || '').toLowerCase();
    if (lbl.includes('ultra') || lbl.includes('0.6') || idx === 1) return `Cam ${idx + 1} (Macro/UW)`;
    if (lbl.includes('tele') || idx === 2) return `Cam ${idx + 1} (3x Tele)`;
    if (idx === 3) return `Cam ${idx + 1} (10x Zoom)`;
    return `Cam ${idx + 1} (Main)`;
  };

  return (
    <div className="relative w-full h-full bg-oled text-white overflow-hidden flex flex-col select-none">
      {/* Keep <video> active in DOM for hardware 4K decoding on Android Chrome & iOS Safari */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="fixed top-0 left-0 w-px h-px opacity-0 pointer-events-none -z-10"
      />

      {/* Bezel Darkfield Grazing Ring Light Overlay */}
      {edgeRingLightActive && (
        <div className="pointer-events-none fixed inset-0 z-40 border-[14px] border-white shadow-[inset_0_0_60px_rgba(255,255,255,0.85)] rounded-none" />
      )}

      {/* TOP TACTICAL BENCH HEADER BAR */}
      <header className="relative z-20 px-3 sm:px-5 py-2 bg-oled-panel/95 backdrop-blur-md border-b border-oled-border flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-oled border-2 border-optic-yellow flex items-center justify-center shadow-neon-yellow">
            <Crosshair className="w-5 h-5 text-optic-yellow" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-black tracking-wider uppercase text-white">
                PAL-SCOPE
              </h1>
              <span className="px-2 py-0.5 rounded bg-optic-yellow text-oled font-mono text-[10px] font-black uppercase">
                {useSimulatedBench
                  ? 'SIMULATOR'
                  : activeStreamResolution
                  ? `LIVE ${activeStreamResolution}`
                  : 'LIVE CAMERA'}
              </span>
              {/* Real-Time Focus Sharpness Pill */}
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${
                  liveSharpness >= 24
                    ? 'bg-optic-emerald/20 border-optic-emerald text-optic-emerald'
                    : liveSharpness >= 12
                    ? 'bg-optic-amber/20 border-optic-amber text-optic-amber'
                    : 'bg-optic-danger/20 border-optic-danger text-optic-danger'
                }`}
              >
                {liveSharpness >= 24
                  ? `FOCUS SHARP (${liveSharpness})`
                  : liveSharpness >= 12
                  ? `FOCUS FAIR (${liveSharpness})`
                  : `BLURRY (${liveSharpness}) - USE MACRO/3X`}
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 hidden sm:block">
              S23 Ultra Tip: Select Cam 2 (Macro/UW) or Cam 3 (3x Tele) so camera focuses sharply at close range!
            </p>
          </div>
        </div>

        {/* Center / Right Reticle & Hardware Controls */}
        <div className="flex items-center flex-wrap gap-1.5">
          <div className="flex rounded-xl bg-oled border border-oled-border p-0.5">
            {(['OD', 'OS'] as const).map((side) => (
              <button
                key={side}
                onClick={() =>
                  setReticleConfig((prev) => ({ ...prev, eyeSide: side }))
                }
                className={`px-2 py-1 rounded-lg font-mono text-xs font-extrabold transition-all ${
                  reticleConfig.eyeSide === side
                    ? 'bg-optic-cyan text-oled shadow-neon-cyan'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {side}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsCalibrationOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-oled border border-oled-border hover:border-optic-yellow text-slate-200 font-mono text-xs font-bold"
            title="Calibrate Physical 34.0 mm Screen Scale"
          >
            <Ruler className="w-3.5 h-3.5 text-optic-yellow" />
            <span className="hidden sm:inline">34mm</span>
          </button>

          <button
            onClick={handleToggleTorch}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-mono text-xs font-bold transition-all ${
              torchActive
                ? 'bg-optic-yellow text-oled border-optic-yellow shadow-neon-yellow'
                : 'bg-oled border-oled-border text-slate-200 hover:border-optic-yellow'
            }`}
          >
            <Flashlight className="w-3.5 h-3.5" />
            <span>{torchActive ? 'Torch ON' : 'Torch'}</span>
          </button>

          <button
            onClick={() => setIsFrozen((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-mono text-xs font-extrabold transition-all ${
              isFrozen
                ? 'bg-optic-cyan text-oled border-optic-cyan shadow-neon-cyan'
                : 'bg-oled border-oled-border text-white hover:border-optic-cyan'
            }`}
          >
            {isFrozen ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Live</span>
              </>
            ) : (
              <>
                <Snowflake className="w-3.5 h-3.5 text-optic-cyan" />
                <span>Freeze</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* MAIN LENS SCOPE VIEWPORT */}
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

        {/* TRIPLE 1:1 NATIVE SENSOR RESOLUTION MACRO LOUPES (Left -17mm, Center Close-Up, Right +17mm) */}
        {showMacroLoupes && (
          <div className="pointer-events-none absolute top-14 sm:top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-oled-panel/95 backdrop-blur-md border border-oled-border px-2.5 py-1.5 rounded-2xl shadow-2xl">
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-mono font-bold uppercase text-optic-yellow mb-0.5">
                {isOD ? '◄ -17mm Temporal' : '◄ -17mm Nasal'}
              </span>
              <canvas
                ref={leftLoupeCanvasRef}
                width={96}
                height={70}
                className="w-[88px] sm:w-[104px] h-[64px] sm:h-[74px] rounded-lg border-2 border-optic-yellow bg-oled"
              />
            </div>

            <div className="flex flex-col items-center">
              <span className="text-[9px] font-mono font-bold uppercase text-optic-emerald mb-0.5">
                ● Center 1:1 Macro
              </span>
              <canvas
                ref={centerLoupeCanvasRef}
                width={108}
                height={76}
                className="w-[98px] sm:w-[116px] h-[68px] sm:h-[78px] rounded-lg border-2 border-optic-emerald bg-oled"
              />
            </div>

            <div className="flex flex-col items-center">
              <span className="text-[9px] font-mono font-bold uppercase text-optic-cyan mb-0.5">
                {isOD ? '+17mm Nasal ►' : '+17mm Temporal ►'}
              </span>
              <canvas
                ref={rightLoupeCanvasRef}
                width={96}
                height={70}
                className="w-[88px] sm:w-[104px] h-[64px] sm:h-[74px] rounded-lg border-2 border-optic-cyan bg-oled"
              />
            </div>
          </div>
        )}

        {/* Top-Left S23 Ultra Multi-Lens Selector Bar */}
        <div className="absolute top-2.5 left-2.5 z-20 flex flex-col gap-1.5 max-w-[94vw] sm:max-w-md">
          <div className="flex flex-wrap items-center gap-1">
            {useSimulatedBench ? (
              <button
                onClick={() => startCameraStream(selectedDeviceId || undefined)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-optic-yellow text-oled font-mono text-xs font-extrabold shadow-neon-yellow animate-pulse"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Activate S23 Camera</span>
              </button>
            ) : videoDevices.length > 1 ? (
              videoDevices.slice(0, 4).map((dev, idx) => {
                const isSelected = dev.deviceId === selectedDeviceId;
                return (
                  <button
                    key={dev.deviceId || idx}
                    onClick={() => {
                      setSelectedDeviceId(dev.deviceId);
                      startCameraStream(dev.deviceId);
                    }}
                    className={`px-2.5 py-1 rounded-xl font-mono text-[11px] font-bold border transition-all ${
                      isSelected
                        ? 'bg-optic-cyan text-oled border-optic-cyan shadow-neon-cyan'
                        : 'bg-oled-panel/90 text-slate-200 border-oled-border hover:border-optic-cyan'
                    }`}
                  >
                    {getCameraShortLabel(dev, idx)}
                  </button>
                );
              })
            ) : (
              <button
                onClick={() => startCameraStream()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-oled-panel/90 border border-optic-cyan text-xs font-mono font-bold text-optic-cyan"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Camera Active</span>
              </button>
            )}

            <button
              onClick={() => setUseSimulatedBench((prev) => !prev)}
              className="px-2.5 py-1 rounded-xl bg-oled-panel/90 border border-oled-border hover:border-optic-yellow text-[11px] font-mono font-semibold text-slate-300"
            >
              {useSimulatedBench ? 'Sim Mode' : 'Demo Sim'}
            </button>

            {useSimulatedBench && (
              <button
                onClick={handleCycleSimulatedSpecimen}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-optic-yellow/15 border border-optic-yellow/60 text-optic-yellow text-[11px] font-mono font-bold"
              >
                <Sparkles className="w-3 h-3" />
                <span>{simulatedSpecimen.lens.designName}</span>
              </button>
            )}
          </div>

          {(cameraErrorMsg || cameraStatusNote || torchNotice) && (
            <div className="px-3 py-1.5 rounded-xl bg-oled-panel/95 border border-optic-yellow/60 text-[11px] font-mono text-slate-200 flex items-start gap-2 shadow-lg max-w-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-optic-yellow shrink-0 mt-0.5" />
              <span>{torchNotice || cameraStatusNote || cameraErrorMsg}</span>
            </div>
          )}
        </div>

        {/* Top-Right HUD Controls */}
        <div className="absolute top-2.5 right-2.5 z-20 flex flex-col items-end gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowMacroLoupes((prev) => !prev)}
              className={`px-2 py-1.5 rounded-xl border font-mono text-xs font-bold flex items-center gap-1 ${
                showMacroLoupes
                  ? 'bg-oled-panel/90 border-optic-yellow text-optic-yellow'
                  : 'bg-oled-panel/80 border-oled-border text-slate-400'
              }`}
            >
              <Focus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Loupes</span>
            </button>

            <button
              onClick={() =>
                setReticleConfig((prev) => ({ ...prev, showReticle: !prev.showReticle }))
              }
              className={`px-2 py-1.5 rounded-xl border font-mono text-xs font-bold flex items-center gap-1 ${
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
              className={`px-2.5 py-1.5 rounded-xl border font-mono text-xs font-bold flex items-center gap-1 ${
                showCvTuner
                  ? 'bg-optic-yellow text-oled border-optic-yellow'
                  : 'bg-oled-panel/90 border-oled-border text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Gain</span>
            </button>

            <button
              onClick={() => setShowBenchTips((prev) => !prev)}
              className={`p-1.5 rounded-xl border ${
                showBenchTips
                  ? 'bg-optic-cyan text-oled border-optic-cyan'
                  : 'bg-oled-panel/90 border-oled-border text-optic-cyan'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {isFrozen && (
            <button
              onClick={handleDownloadSnapshot}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-optic-yellow text-oled font-mono text-xs font-extrabold shadow-neon-yellow"
            >
              <Download className="w-3.5 h-3.5" />
              Save PNG
            </button>
          )}

          {showBenchTips && (
            <div className="w-72 sm:w-80 p-3.5 rounded-2xl bg-oled-panel/95 backdrop-blur-xl border-2 border-optic-cyan shadow-2xl space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-extrabold uppercase text-optic-cyan">
                  S23 Ultra PAL Scanning Guide
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
                  <strong className="text-optic-yellow">Select Cam 2 (Macro) or Cam 3 (3x Tele):</strong> S23 Ultra&apos;s default 1x camera cannot focus closer than 6 inches. Tap <strong>Cam 2 (Macro/UW)</strong> on the top-left bar for razor-sharp close-ups!
                </li>
                <li>
                  <strong className="text-optic-yellow">Center One Mark or Both 34mm Marks:</strong> Center the faint laser engraving inside the green <strong>Center 1:1 Macro Loupe</strong> (or align both 34mm circles) over a dark cloth with <strong>Torch ON</strong>.
                </li>
                <li>
                  <strong className="text-optic-yellow">Tap &ldquo;SCAN &amp; IDENTIFY PAL&rdquo;:</strong> The AI/OCR scanner extracts a high-contrast binarized stencil and ranks the matching progressive lenses on screen!
                </li>
              </ol>
            </div>
          )}

          {showCvTuner && (
            <div className="w-68 sm:w-72 p-3.5 rounded-2xl bg-oled-panel/95 backdrop-blur-xl border border-oled-border shadow-2xl space-y-3">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-slate-300">Laser Contrast Gain</span>
                  <span className="text-optic-yellow font-bold">{cvSensitivity.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="3.5"
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
                    <span className="text-optic-emerald">S23 Macro Focus Distance</span>
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

        {/* LIVE RECOGNITION RESULTS OVERLAY CARD (Pops up when SCAN & IDENTIFY PAL is tapped!) */}
        {recognitionResult && (
          <div className="absolute left-3 bottom-36 z-20 w-[300px] sm:w-[350px] bg-oled-panel/95 backdrop-blur-xl border-2 border-optic-cyan rounded-2xl p-3 shadow-2xl space-y-2.5">
            <div className="flex items-center justify-between border-b border-oled-border pb-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-optic-emerald" />
                <span className="text-xs font-mono font-extrabold uppercase text-white">
                  PAL Recognition Result ({recognitionResult.confidence}%)
                </span>
              </div>
              <button
                onClick={() => setRecognitionResult(null)}
                className="text-xs font-mono text-slate-400 hover:text-white px-1"
              >
                ✕
              </button>
            </div>

            {/* Extracted Stencil Preview + Detected Features */}
            <div className="flex items-center gap-2.5">
              {recognitionResult.preprocessedPreviewUrl && (
                <img
                  src={recognitionResult.preprocessedPreviewUrl}
                  alt="Extracted Laser Stencil"
                  className="w-16 h-12 rounded-lg border border-optic-yellow object-cover bg-white shrink-0"
                />
              )}
              <div className="text-[11px] font-mono space-y-0.5 flex-1">
                <div>
                  <span className="text-slate-400">Add Stamp: </span>
                  <strong className="text-optic-cyan">
                    {recognitionResult.detectedAddPowerRaw
                      ? `"${recognitionResult.detectedAddPowerRaw}" (${recognitionResult.detectedAddFormatted})`
                      : 'Any Add'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Code / Glyph: </span>
                  <strong className="text-optic-yellow">
                    {recognitionResult.detectedLaserCode ||
                      recognitionResult.detectedSymbolCategory ||
                      'Contour'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Top Matched PAL Designs (Tap to Open Spec or Pin to HUD) */}
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {recognitionResult.topMatches.slice(0, 3).map(({ lens }) => (
                <div
                  key={lens.id}
                  onClick={() => setSelectedLensDetail(lens)}
                  className="cursor-pointer p-2 rounded-xl bg-oled border border-oled-border hover:border-optic-yellow flex items-center justify-between gap-2 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-oled-surface border border-oled-border flex items-center justify-center text-optic-yellow shrink-0">
                      <TemporalSymbolIcon
                        symbol={lens.temporalSymbolCategory}
                        customDataUrl={lens.temporalCustomDataUrl}
                        className="w-4 h-4"
                      />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-white truncate">
                        {lens.brand} {lens.designName}
                      </div>
                      <div className="text-[10px] font-mono text-optic-yellow">
                        Code: {lens.temporalEngravingCode} • FC +{lens.fittingCrossDropMm}mm
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-optic-cyan shrink-0">
                    View →
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right-Side Optical/Digital Zoom Rail (1.0x to 4.0x) */}
        <div className="absolute right-3 bottom-36 z-20 flex flex-col items-center gap-1.5 bg-oled-panel/90 backdrop-blur-md border border-oled-border rounded-2xl p-2 shadow-xl">
          <button
            onClick={() => setZoom((z) => Math.min(4.0, Number((z + 0.25).toFixed(2))))}
            className="p-2 rounded-xl bg-oled border border-oled-border hover:border-optic-yellow text-slate-200 active:scale-95"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-optic-yellow" />
          </button>

          <div className="py-0.5 px-1 font-mono text-xs font-extrabold text-optic-yellow">
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

        {/* PROMINENT MAIN-SCREEN "SCAN & IDENTIFY PAL" ACTION BAR + CV FILTER DOCK */}
        <div className="absolute inset-x-3 bottom-20 z-20 flex flex-col items-center gap-2 pointer-events-none">
          {/* Primary Scan & Auto-Scan Trigger Bar */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              onClick={handleRunPALRecognition}
              disabled={isScanningPAL}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-optic-cyan text-oled font-mono text-xs sm:text-sm font-black uppercase tracking-wider shadow-neon-cyan hover:brightness-110 active:scale-95 transition-all"
            >
              <ScanLine className="w-4 h-4" />
              <span>{isScanningPAL ? 'Scanning Engraving...' : 'Scan & Identify PAL'}</span>
            </button>

            <button
              onClick={() => setAutoScanEnabled((prev) => !prev)}
              className={`px-3.5 py-2.5 rounded-2xl font-mono text-xs font-bold border transition-all ${
                autoScanEnabled
                  ? 'bg-optic-emerald text-oled border-optic-emerald shadow-lg'
                  : 'bg-oled-panel/95 text-slate-300 border-oled-border hover:border-optic-cyan'
              }`}
            >
              {autoScanEnabled ? 'Auto-Scan: ON' : 'Auto-Scan'}
            </button>
          </div>

          {/* 4-Mode Real-Time CV Filter Switcher */}
          <div className="pointer-events-auto bg-oled-panel/95 backdrop-blur-xl border-2 border-oled-border rounded-2xl p-1.5 shadow-2xl grid grid-cols-2 sm:grid-cols-4 gap-1.5 w-full max-w-3xl">
            {CV_FILTERS.map((filter) => {
              const active = cvMode === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setCvMode(filter.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-left transition-all border flex flex-col justify-between ${
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
        onTriggerOCRScan={handleRunPALRecognition}
        isScanningOCR={isScanningPAL}
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
