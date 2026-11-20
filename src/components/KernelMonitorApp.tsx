import React, { useState, useEffect } from 'react';
import { Cpu, Activity, Zap, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import { sound } from '../utils/audio-fx';
import { SystemTelemetry } from '../types/os';
import { verifyFrameDeadline } from '../utils/aegis-scheduler';

interface KernelMonitorAppProps {
  telemetry: SystemTelemetry;
}

export const KernelMonitorApp: React.FC<KernelMonitorAppProps> = ({ telemetry }) => {
  const [coreLoads, setCoreLoads] = useState([
    { id: 0, cluster: 'Efficiency A520 #0', freq: 1200, load: 18, powerMw: 25 },
    { id: 1, cluster: 'Efficiency A520 #1', freq: 1200, load: 14, powerMw: 22 },
    { id: 2, cluster: 'Perf A720 #0', freq: 2400, load: 38, powerMw: 95 },
    { id: 3, cluster: 'Perf A720 #1', freq: 2400, load: 42, powerMw: 105 },
    { id: 4, cluster: 'Prime Cortex-X4', freq: 3400, load: 12, powerMw: 140 },
  ]);

  const [inputMs, setInputMs] = useState(0.8);
  const [layoutMs, setLayoutMs] = useState(1.4);
  const [gpuMs, setGpuMs] = useState(3.2);
  const [compMs, setCompMs] = useState(1.8);

  const deadlineCheck = verifyFrameDeadline(inputMs, layoutMs, gpuMs, compMs, 120);

  // Slight jitter to simulate live scheduler telemetry
  useEffect(() => {
    const interval = setInterval(() => {
      setCoreLoads(prev =>
        prev.map(c => ({
          ...c,
          load: Math.min(95, Math.max(5, c.load + (Math.floor(Math.random() * 9) - 4))),
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-950/90 text-slate-200 font-sans text-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-cyan-500/20 bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="font-bold tracking-wider text-cyan-300">
            Aegis Microkernel EL1 Scheduler (EAS &amp; 120Hz LTPO Pipeline)
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-400">
          <Zap className="w-3.5 h-3.5" />
          <span>DVFS: PID GOVERNOR ACTIVE</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* CPU Cluster Matrix */}
        <div className="space-y-2">
          <div className="text-xs font-mono text-slate-400">
            HETEROGENEOUS ASYMMETRIC CPU CLUSTERS (ARMv9-A Topology):
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {coreLoads.map(core => (
              <div key={core.id} className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-bold text-cyan-300">{core.cluster}</span>
                  <span className="text-slate-400 text-[10px]">{core.freq} MHz</span>
                </div>
                {/* Load Bar */}
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      core.load > 70 ? 'bg-amber-400' : 'bg-cyan-400'
                    }`}
                    style={{ width: `${core.load}%` }}
                  />
                </div>
                <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
                  <span>Load: {core.load}%</span>
                  <span>Est Power: {core.powerMw} mW</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 120Hz LTPO Frame Deadline Interactive Simulator */}
        <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span className="text-cyan-300 font-bold">120Hz DISPLAY TIMELINE BUDGET (8.33ms Target)</span>
            </div>
            <div className="flex items-center gap-1.5">
              {deadlineCheck.meetsDeadline ? (
                <div className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ON SCHEDULE (+{deadlineCheck.marginMs}ms)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-red-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span>FRAME DROP MISSED ({deadlineCheck.marginMs}ms)</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Input IRQ: {inputMs}ms</label>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.1"
                value={inputMs}
                onChange={e => setInputMs(parseFloat(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">UI Layout: {layoutMs}ms</label>
              <input
                type="range"
                min="0.5"
                max="4.0"
                step="0.1"
                value={layoutMs}
                onChange={e => setLayoutMs(parseFloat(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">GPU Compute: {gpuMs}ms</label>
              <input
                type="range"
                min="1.0"
                max="6.0"
                step="0.1"
                value={gpuMs}
                onChange={e => setGpuMs(parseFloat(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">DPU Commit: {compMs}ms</label>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={compMs}
                onChange={e => setCompMs(parseFloat(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>
          </div>

          <div className="text-xs text-slate-300 font-sans pt-1">
            Total Frame Presentation Latency: <span className="font-mono text-cyan-300 font-bold">{deadlineCheck.totalMs}ms</span> / 8.33ms.
            Prism automatically offloads layers to DPU hardware planes if GPU execution exceeds 4.0ms.
          </div>
        </div>
      </div>
    </div>
  );
};
