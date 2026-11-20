import React, { useState } from 'react';
import { HardDrive, RefreshCw, Shield, FileText, CheckCircle2, Lock } from 'lucide-react';
import { sound } from '../utils/audio-fx';
import {
  calculateGcEfficiencyScore,
  calculateExtentCompressionSavings,
  type NovaSegment,
  type NovaExtent,
} from '../utils/novafs-engine';

export const NovaFsApp: React.FC = () => {
  const [segments, setSegments] = useState<NovaSegment[]>([
    { id: 0, totalBlocks: 512, validBlocks: 512, ageEpochSeconds: 1000, isPinned: true, eraseCount: 4 }, // Superblock & NAT
    { id: 1, totalBlocks: 512, validBlocks: 480, ageEpochSeconds: 2400, isPinned: true, eraseCount: 6 }, // System Kernel Image
    { id: 2, totalBlocks: 512, validBlocks: 95, ageEpochSeconds: 3200, isPinned: false, eraseCount: 18 }, // Log Inode extents (Ideal GC candidate)
    { id: 3, totalBlocks: 512, validBlocks: 420, ageEpochSeconds: 1800, isPinned: false, eraseCount: 12 },
    { id: 4, totalBlocks: 512, validBlocks: 140, ageEpochSeconds: 4100, isPinned: false, eraseCount: 22 }, // GC candidate
    { id: 5, totalBlocks: 512, validBlocks: 310, ageEpochSeconds: 900, isPinned: false, eraseCount: 8 },
  ]);

  const [activeTab, setActiveTab] = useState<'segments' | 'files' | 'merkle'>('segments');
  const [isCompacting, setIsCompacting] = useState(false);
  const [lastCompactedSeg, setLastCompactedSeg] = useState<number | null>(null);

  const sampleExtents: NovaExtent[] = [
    { logicalBlockOffset: 0, physicalBlockAddress: 0x88000, blockCount: 64, isCompressed: true, compressedSizeBytes: 65536 },
    { logicalBlockOffset: 64, physicalBlockAddress: 0x88040, blockCount: 128, isCompressed: true, compressedSizeBytes: 131072 },
    { logicalBlockOffset: 192, physicalBlockAddress: 0x880c0, blockCount: 32, isCompressed: false, compressedSizeBytes: 131072 },
  ];

  const savings = calculateExtentCompressionSavings(sampleExtents, 4096);

  const runGarbageCollection = () => {
    sound.playBlip();
    setIsCompacting(true);

    setTimeout(() => {
      // Find candidate segment with highest rho
      const currentEpoch = 5000;
      let highestRho = -1;
      let candidateIdx = -1;

      segments.forEach((seg, idx) => {
        if (!seg.isPinned) {
          const rho = calculateGcEfficiencyScore(seg, currentEpoch);
          if (rho > highestRho) {
            highestRho = rho;
            candidateIdx = idx;
          }
        }
      });

      if (candidateIdx !== -1) {
        setSegments(prev => {
          const next = [...prev];
          const target = next[candidateIdx];
          next[candidateIdx] = {
            ...target,
            validBlocks: 512, // Compacted to fresh contiguous blocks
            ageEpochSeconds: currentEpoch,
            eraseCount: target.eraseCount + 1,
          };
          return next;
        });
        setLastCompactedSeg(segments[candidateIdx].id);
        sound.playConfirm();
      }
      setIsCompacting(false);
    }, 800);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/90 text-slate-200 font-sans text-xs overflow-hidden">
      {/* Top Controller Bar */}
      <div className="flex items-center justify-between p-3 border-b border-cyan-500/20 bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          <span className="font-bold tracking-wider text-cyan-300">NovaFS Flash Engine (256 GB SSD / ZNS)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('segments')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              activeTab === 'segments' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Segments &amp; SIT
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              activeTab === 'files' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Inodes &amp; Extents
          </button>
          <button
            onClick={() => setActiveTab('merkle')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              activeTab === 'merkle' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Merkle Trees
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'segments' && (
          <div className="space-y-4">
            {/* Wear Leveling & GC Action Header */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div>
                <div className="text-slate-400 text-[11px]">NAND FLASH WEAR INDEX</div>
                <div className="text-lg font-bold font-mono text-emerald-400">0.8% (Nominal / 3,000 P/E Cycles Max)</div>
              </div>
              <button
                onClick={runGarbageCollection}
                disabled={isCompacting}
                className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCompacting ? 'animate-spin' : ''}`} />
                <span>Trigger novafs_gcd Compaction</span>
              </button>
            </div>

            {/* Segment Grid */}
            <div className="space-y-2">
              <div className="text-xs font-mono text-slate-400">
                ACTIVE 2MB FLASH SEGMENTS (Block Utilization &amp; GC Efficiency Score):
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {segments.map(seg => {
                  const utilPct = Math.round((seg.validBlocks / seg.totalBlocks) * 100);
                  const rho = calculateGcEfficiencyScore(seg, 5000);
                  const isHighPriority = !seg.isPinned && rho > 1.0;

                  return (
                    <div
                      key={seg.id}
                      className={`p-3 rounded-lg border transition-all ${
                        lastCompactedSeg === seg.id
                          ? 'border-emerald-500 bg-emerald-950/20'
                          : isHighPriority
                          ? 'border-amber-500/50 bg-amber-950/20'
                          : 'border-slate-800 bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5 font-mono">
                        <span className="font-bold text-cyan-300">Segment #{seg.id} (2MB)</span>
                        <span className={`text-[10px] ${seg.isPinned ? 'text-amber-400' : 'text-slate-400'}`}>
                          {seg.isPinned ? 'PINNED METADATA' : `GC RHO: ${rho}`}
                        </span>
                      </div>

                      {/* Progress bar of valid blocks */}
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full transition-all duration-500 ${
                            utilPct < 40 ? 'bg-amber-500' : 'bg-cyan-400'
                          }`}
                          style={{ width: `${utilPct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>Valid: {seg.validBlocks} / 512 Blocks</span>
                        <span>Erase Cycles: {seg.eraseCount}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-3 font-mono">
            <div className="text-xs text-slate-400">ACTIVE INODE EXTENTS &amp; ZSTD COMPRESSION RATIOS:</div>
            <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span>Total Raw Extents: {savings.rawSizeBytes / 1024} KB</span>
                <span className="text-emerald-400 font-bold">Stored: {savings.storedSizeBytes / 1024} KB</span>
                <span className="text-cyan-400 font-bold">Ratio: {savings.compressionRatio}:1 (ZSTD)</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span>/system/ai/models/core_slm.jmdl</span>
                  </div>
                  <span className="text-emerald-400">1,040 MB (INT4 AWQ Extent)</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>/vault/credentials/device_identity.enc</span>
                  </div>
                  <span className="text-slate-400">4 KB (Wrapped DEK / S-EL1)</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span>/boot/jbl2/kernel.img</span>
                  </div>
                  <span className="text-slate-400">18.4 MB (SHA3-512 Signed)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'merkle' && (
          <div className="space-y-3 font-mono">
            <div className="text-xs text-slate-400">CRYPTOGRAPHIC MERKLE TREE INTEGRITY PARITY:</div>
            <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Root Tree Digest: 0x4a21e09988ffbc12...</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                Every 4KB block has its cryptographic hash verified before being delivered to unprivileged userspace. Any bit-flip caused by flash cell degradation or unauthorized physical bus tampering triggers a hardware interrupt and immediate block invalidation.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
