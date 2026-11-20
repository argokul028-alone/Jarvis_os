import React, { useState } from 'react';
import { Shield, ShieldAlert, Key, Lock, CheckCircle2, RefreshCw } from 'lucide-react';
import { sound } from '../utils/audio-fx';

export const VaultSecurityApp: React.FC = () => {
  const [mteTestResult, setMteTestResult] = useState<string | null>(null);
  const [transientToken, setTransientToken] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const simulateMteTest = (shouldMatch: boolean) => {
    sound.playBlip();
    if (shouldMatch) {
      setMteTestResult('TAG_MATCH: Pointer Tag 0x4 == Memory Granule 0x4 -> Access Granted (0-cycle overhead)');
      sound.playConfirm();
    } else {
      sound.playAlert();
      setMteTestResult('TAG_MISMATCH: Pointer Tag 0x4 != Memory Granule 0xB -> Hardware Fault ESR_EL1 -> Process Terminated by Sanctuary Sandbox');
    }
  };

  const generateTransientToken = () => {
    sound.playBlip();
    const token = 'CAP_TRN_' + Math.random().toString(36).substring(2, 10).toUpperCase() + '_EXPIRES_120S';
    setTransientToken(token);
    sound.playConfirm();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/90 text-slate-200 font-sans text-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-cyan-500/20 bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="font-bold tracking-wider text-cyan-300">
            VaultOS Hardware Secure Enclave (S-EL1 Zero-Trust Architecture)
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-400">
          <Lock className="w-3.5 h-3.5" />
          <span>CRYPTO ROOT: DILITHIUM-3 / ED25519</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono">
        {/* Hardware Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
            <div className="text-slate-400 text-[10px]">MONOTONIC eFUSE COUNTER</div>
            <div className="text-lg font-bold text-cyan-400">0x00000004</div>
            <div className="text-[10px] text-emerald-400">Anti-Rollback Enforced</div>
          </div>
          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
            <div className="text-slate-400 text-[10px]">TRUE RANDOM NUMBER GENERATOR</div>
            <div className="text-lg font-bold text-emerald-400">99.8% ENTROPY</div>
            <div className="text-[10px] text-slate-400">Quantum Noise Source</div>
          </div>
          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
            <div className="text-slate-400 text-[10px]">ARMv9 MEMORY TAGGING (MTE)</div>
            <div className="text-lg font-bold text-cyan-400">SYNCHRONOUS</div>
            <div className="text-[10px] text-slate-400">16-Byte Hardware Granules</div>
          </div>
        </div>

        {/* Hardware Memory Tagging Simulator */}
        <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-3">
          <div className="text-cyan-300 font-bold">ARMv9.2-A MTE MEMORY INTEGRITY SIMULATION:</div>
          <p className="text-slate-400 font-sans text-xs">
            Test how Sanctuary Sandbox prevents use-after-free and buffer overflows at the silicon level:
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => simulateMteTest(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Simulate Valid Access (Tag 0x4)</span>
            </button>
            <button
              onClick={() => simulateMteTest(false)}
              className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Simulate Buffer Overflow (Tag 0xB)</span>
            </button>
          </div>

          {mteTestResult && (
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
              <span className={mteTestResult.includes('TAG_MATCH') ? 'text-emerald-400' : 'text-red-400'}>
                {mteTestResult}
              </span>
            </div>
          )}
        </div>

        {/* Transient Capability Token Generator */}
        <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-3">
          <div className="text-cyan-300 font-bold">TRANSIENT CAPABILITY DISPATCHER:</div>
          <p className="text-slate-400 font-sans text-xs">
            Generate temporary capability tokens issued by VaultOS for dynamic peripheral access:
          </p>
          <button
            onClick={generateTransientToken}
            className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Issue Signed Transient Token</span>
          </button>
          {transientToken && (
            <div className="p-2.5 bg-slate-950 rounded border border-cyan-500/40 text-cyan-300">
              TOKEN: {transientToken}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
