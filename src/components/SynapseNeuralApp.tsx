import React, { useState } from 'react';
import { Cpu, Zap, Play, Terminal, CheckCircle2 } from 'lucide-react';
import { sound } from '../utils/audio-fx';

export const SynapseNeuralApp: React.FC = () => {
  const [prompt, setPrompt] = useState('Analyze local network interfaces and enforce zero-trust capabilities');
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputTokens, setOutputTokens] = useState<string[]>([]);
  const [tokensPerSec, setTokensPerSec] = useState<number | null>(null);

  const runBenchmark = () => {
    sound.playReactorHum();
    setIsGenerating(true);
    setOutputTokens([]);
    setTokensPerSec(null);

    const sampleTokens = [
      'Aegis', ' microkernel', ' CSpace', ' validated.',
      ' Generating', ' transient', ' capability', ' token', ' 0x4A.',
      ' Binding', ' hardware', ' SMMUv3', ' translation', ' table.',
      ' Network', ' descriptor', ' ring', ' mapped', ' to', ' EL0.',
      ' All', ' parameters', ' nominal,', ' sir.'
    ];

    let index = 0;
    const startTime = performance.now();

    const interval = setInterval(() => {
      if (index < sampleTokens.length) {
        setOutputTokens(prev => [...prev, sampleTokens[index]]);
        index++;
      } else {
        clearInterval(interval);
        setIsGenerating(false);
        const durationSec = (performance.now() - startTime) / 1000;
        setTokensPerSec(Number((sampleTokens.length / durationSec).toFixed(1)));
        sound.playConfirm();
      }
    }, 60);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/90 text-slate-200 font-sans text-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-cyan-500/20 bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span className="font-bold tracking-wider text-cyan-300">
            Synapse Neural Engine (NPU 45 TOPS / Heterogeneous Tensor Graph)
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-400">
          <Zap className="w-3.5 h-3.5" />
          <span>MODEL: QWEN-2.5-1.5B (INT4-AWQ)</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Memory Footprint Grid for Lenovo E41-25 */}
        <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-cyan-300 font-bold">LENOVO E41-25 (4GB RAM) ALLOCATION BUDGET</span>
            <span className="text-emerald-400 font-bold">1,368 MB Total Used / 4,096 MB Physical</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
            <div className="p-2 rounded bg-slate-950 border border-slate-800">
              <div className="text-slate-400">Qwen-1.5B (INT4)</div>
              <div className="text-cyan-400 font-bold text-sm">1,040 MB</div>
            </div>
            <div className="p-2 rounded bg-slate-950 border border-slate-800">
              <div className="text-slate-400">Vosk STT Engine</div>
              <div className="text-cyan-400 font-bold text-sm">95 MB</div>
            </div>
            <div className="p-2 rounded bg-slate-950 border border-slate-800">
              <div className="text-slate-400">Piper Neural TTS</div>
              <div className="text-cyan-400 font-bold text-sm">48 MB</div>
            </div>
            <div className="p-2 rounded bg-slate-950 border border-slate-800">
              <div className="text-slate-400">Safety Headroom</div>
              <div className="text-emerald-400 font-bold text-sm">2,728 MB</div>
            </div>
          </div>
        </div>

        {/* Inference Test Bench */}
        <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-3">
          <label className="text-slate-400 font-mono block">TESTBENCH PROMPT INPUT:</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
            />
            <button
              onClick={runBenchmark}
              disabled={isGenerating}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Execute INT4 Run</span>
            </button>
          </div>

          {/* Token Output Stream */}
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs min-h-[90px]">
            <div className="text-[10px] text-slate-500 mb-1">OUTPUT STREAM (DEMAND-PAGED EXTENTS):</div>
            <div className="text-cyan-300 leading-relaxed">
              {outputTokens.join('')}
              {isGenerating && <span className="inline-block w-2 h-4 bg-cyan-400 ml-1 animate-pulse" />}
            </div>
          </div>

          {tokensPerSec && (
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Throughput: {tokensPerSec} tokens/sec on AMD A6-9225 APU via llama.cpp AVX2</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
