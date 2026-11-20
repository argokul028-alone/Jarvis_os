import React, { useState, useEffect, useRef } from 'react';
import { Power, Moon, RotateCw } from 'lucide-react';
import { SystemPowerPhase } from '../types/os';
import { sound } from '../utils/audio-fx';

interface PowerOverlayProps {
  phase: SystemPowerPhase;
  onWake: () => void;
  onPowerOn: () => void;
}

export const PowerOverlay: React.FC<PowerOverlayProps> = ({ phase, onWake, onPowerOn }) => {
  const [clock, setClock] = useState('');
  const [dateLabel, setDateLabel] = useState('');
  const [rebootProgress, setRebootProgress] = useState(0);

  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  useEffect(() => {
    if (phase !== 'sleeping') return;
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setDateLabel(
        now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
      );
    };
    tick();
    const timer = setInterval(tick, 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sound.playConfirm();
        onWakeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'restarting') {
      setRebootProgress(prev => (prev === 0 ? prev : 0));
      return;
    }
    setRebootProgress(15);
    const t1 = setTimeout(() => setRebootProgress(55), 550);
    const t2 = setTimeout(() => setRebootProgress(92), 1300);
    const t3 = setTimeout(() => {
      setRebootProgress(100);
      sound.playConfirm();
      onWakeRef.current();
    }, 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase]);

  if (phase === 'running') return null;

  if (phase === 'sleeping') {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950/96 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-slate-100 select-none">
        <div className="flex flex-col items-center space-y-6 text-center">
          <Moon className="w-8 h-8 text-cyan-400/80" />
          <div className="font-mono text-6xl font-bold tracking-tight tabular-nums text-slate-100">
            {clock}
          </div>
          <div className="text-sm text-slate-400">{dateLabel}</div>
          <div className="text-xs font-mono text-slate-500">
            JARVISOS Standby · Low-Power State Active
          </div>
          <button
            type="button"
            onClick={() => {
              sound.playConfirm();
              onWake();
            }}
            className="mt-2 px-5 py-2.5 text-xs font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap"
          >
            Wake System
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'restarting') {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 select-none">
        <div className="w-full max-w-xs flex flex-col items-center space-y-4 text-center">
          <RotateCw className="w-7 h-7 text-cyan-400 animate-spin" />
          <div className="font-display text-lg font-bold tracking-wider text-cyan-400">
            JARVISOS
          </div>
          <div className="text-xs font-mono text-slate-400">
            Restarting Aegis Microkernel &amp; Helios Compositor...
          </div>
          <div className="w-full h-1.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-500"
              style={{ width: `${rebootProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Shut Down state
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-slate-200 select-none">
      <div className="flex flex-col items-center space-y-5 text-center">
        <div className="text-xs font-mono text-slate-500">JARVISOS Powered Off</div>
        <button
          type="button"
          onClick={() => {
            sound.playReactorHum();
            onPowerOn();
          }}
          aria-label="Power on JARVISOS"
          className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-cyan-300 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <Power className="w-7 h-7" />
        </button>
        <div className="text-xs text-slate-400">Click Power On to boot JARVISOS</div>
      </div>
    </div>
  );
};
