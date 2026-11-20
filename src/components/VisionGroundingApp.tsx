import React, { useState, useEffect, useRef } from 'react';
import { Eye, Crosshair, Camera, RefreshCw, Shield, AlertCircle } from 'lucide-react';
import { sound } from '../utils/audio-fx';

export const VisionGroundingApp: React.FC = () => {
  const [useRealCamera, setUseRealCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'hud' | 'thermal' | 'wireframe'>('hud');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Targets for the HUD overlay
  const [targets, setTargets] = useState([
    { id: 1, label: 'USER_FACIAL_LOCK', x: 42, y: 35, w: 16, h: 25, dist: '0.64m', confidence: 99.4 },
    { id: 2, label: 'HARDWARE_TERMINAL', x: 68, y: 55, w: 22, h: 28, dist: '1.20m', confidence: 98.1 },
    { id: 3, label: 'AMBIENT_ACOUSTIC_SOURCE', x: 20, y: 70, w: 14, h: 18, dist: '2.10m', confidence: 95.8 },
  ]);

  const startCamera = async () => {
    sound.playBlip();
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setUseRealCamera(true);
      sound.playConfirm();
    } catch (err: any) {
      console.warn('Camera access prevented or unavailable:', err);
      setCameraError('Camera unavailable or permission denied. Using synthetic spatial HUD stream.');
      setUseRealCamera(false);
    }
  };

  const stopCamera = () => {
    sound.playBlip();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setUseRealCamera(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-950/95 text-slate-200 font-sans text-xs overflow-hidden select-none">
      {/* Top Controls */}
      <div className="flex items-center justify-between p-3 border-b border-cyan-500/20 bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-cyan-400" />
          <span className="font-bold tracking-wider text-cyan-300">
            Helios Vision &amp; Spatial Grounding Engine (MIPI-CSI2 Zero-Copy)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterMode('hud')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
              filterMode === 'hud' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Tactical HUD
          </button>
          <button
            onClick={() => setFilterMode('thermal')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
              filterMode === 'thermal' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Thermal
          </button>
          <button
            onClick={() => setFilterMode('wireframe')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
              filterMode === 'wireframe' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Depth Wireframe
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
        {/* Real Video Stream if active */}
        {useRealCamera && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover transition-all ${
              filterMode === 'thermal'
                ? 'hue-rotate-180 invert brightness-125 contrast-150'
                : filterMode === 'wireframe'
                ? 'grayscale contrast-200'
                : ''
            }`}
          />
        )}

        {/* Synthetic Spatial Stream if camera inactive */}
        {!useRealCamera && (
          <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center hud-grid bg-slate-950">
            {/* Concentric Radar Rings */}
            <div className="absolute w-96 h-96 rounded-full border border-cyan-500/20 animate-ping opacity-20 pointer-events-none" />
            <div className="absolute w-80 h-80 rounded-full border border-cyan-500/30" />
            <div className="absolute w-48 h-48 rounded-full border border-dashed border-cyan-500/40 animate-spin" style={{ animationDuration: '30s' }} />

            <div className="relative z-10 flex flex-col items-center text-center p-6 space-y-3">
              <Crosshair className="w-12 h-12 text-cyan-400 animate-pulse" />
              <div className="font-mono text-cyan-300 font-bold tracking-wider">
                SYNTHETIC SPATIAL HUD ACTIVE
              </div>
              <p className="text-slate-400 max-w-sm text-xs leading-relaxed">
                Connect your physical webcam to overlay live computer vision bounding boxes and real-time facial/environment telemetry.
              </p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(0,229,255,0.4)]"
              >
                <Camera className="w-4 h-4" />
                <span>Initialize Physical Sensor</span>
              </button>
              {cameraError && (
                <div className="text-[11px] text-amber-400 flex items-center gap-1.5 pt-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{cameraError}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Holographic Tactical Reticle Overlays */}
        <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between font-mono text-[11px] text-cyan-400">
          <div className="flex justify-between">
            <div className="bg-slate-950/80 p-2 rounded border border-cyan-500/30">
              <div>AZIMUTH: 184.2° · ELEV: +12.4°</div>
              <div>FOV: 94° ULTRA-WIDE · FPS: 120.0</div>
            </div>
            <div className="bg-slate-950/80 p-2 rounded border border-cyan-500/30 text-right">
              <div>SMMUv3 DMA: ZERO-COPY</div>
              <div className="text-emerald-400">STATUS: RECOGNITION LOCKED</div>
            </div>
          </div>

          {/* Bounding Boxes on Targets */}
          {targets.map(t => (
            <div
              key={t.id}
              className="absolute border border-cyan-400 transition-all duration-300"
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: `${t.w}%`,
                height: `${t.h}%`,
              }}
            >
              <div className="absolute -top-5 left-0 bg-cyan-950/90 border border-cyan-500/50 px-1 py-0.5 text-[9px] text-cyan-300 whitespace-nowrap">
                {t.label} [{t.dist} · {t.confidence}%]
              </div>
              <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-cyan-400" />
              <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-cyan-400" />
            </div>
          ))}

          <div className="flex justify-between items-end">
            <div className="text-slate-400 text-[10px]">
              JARVISOS SPATIAL TELEMETRY · COMPOSITOR: PRISM
            </div>
            {useRealCamera && (
              <button
                onClick={stopCamera}
                className="pointer-events-auto px-3 py-1 bg-red-600/80 hover:bg-red-500 text-white rounded text-xs transition-colors"
              >
                Disengage Camera
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
