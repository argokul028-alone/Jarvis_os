/**
 * NovaFS Production Filesystem Logic Module
 * Implements segment wear-leveling, garbage collector cost-benefit scoring,
 * and extent mapping math.
 */

export interface NovaSegment {
  id: number;
  totalBlocks: number; // Standard 512 blocks per 2MB segment
  validBlocks: number;
  ageEpochSeconds: number;
  isPinned: boolean;
  eraseCount: number;
}

export interface NovaExtent {
  logicalBlockOffset: number;
  physicalBlockAddress: number;
  blockCount: number;
  isCompressed: boolean;
  compressedSizeBytes: number;
}

/**
 * Computes the Garbage Collection Efficiency Metric:
 * rho = ((1 - U) * Age) / (2 * U)
 * where U is the segment utilization ratio (validBlocks / totalBlocks).
 * High rho indicates high priority for compaction and reclamation.
 */
export function calculateGcEfficiencyScore(segment: NovaSegment, currentEpochSeconds: number): number {
  if (segment.isPinned) return 0;
  if (segment.totalBlocks <= 0) return 0;

  const valid = Math.max(1, segment.validBlocks);
  const u = valid / segment.totalBlocks;

  if (u >= 1.0) {
    // 100% full segment has 0 reclaimed space
    return 0;
  }

  const age = Math.max(1, currentEpochSeconds - segment.ageEpochSeconds);
  const rho = ((1.0 - u) * age) / (2.0 * u);
  return Number(rho.toFixed(4));
}

/**
 * Identifies the best candidate segment for compaction from a segment array
 */
export function selectBestGcSegment(segments: NovaSegment[], currentEpochSeconds: number): NovaSegment | null {
  let highestRho = -1;
  let bestSegment: NovaSegment | null = null;

  for (const seg of segments) {
    if (seg.isPinned || seg.validBlocks === seg.totalBlocks) continue;
    const score = calculateGcEfficiencyScore(seg, currentEpochSeconds);
    if (score > highestRho) {
      highestRho = score;
      bestSegment = seg;
    }
  }

  return bestSegment;
}

/**
 * Calculates raw flash space saved through ZSTD/LZ4 compression across extents
 */
export function calculateExtentCompressionSavings(extents: NovaExtent[], blockSizeBytes: number = 4096): {
  rawSizeBytes: number;
  storedSizeBytes: number;
  savedBytes: number;
  compressionRatio: number;
} {
  let rawSizeBytes = 0;
  let storedSizeBytes = 0;

  for (const ext of extents) {
    const raw = ext.blockCount * blockSizeBytes;
    rawSizeBytes += raw;
    if (ext.isCompressed && ext.compressedSizeBytes > 0) {
      storedSizeBytes += ext.compressedSizeBytes;
    } else {
      storedSizeBytes += raw;
    }
  }

  const savedBytes = Math.max(0, rawSizeBytes - storedSizeBytes);
  const ratio = rawSizeBytes > 0 ? Number((rawSizeBytes / storedSizeBytes).toFixed(2)) : 1.0;

  return {
    rawSizeBytes,
    storedSizeBytes,
    savedBytes,
    compressionRatio: ratio,
  };
}

/**
 * Simulates 32-bit CRC32c or Merkle hash parity
 */
export function simulateMerkleValidation(chunkHashes: string[]): string {
  if (chunkHashes.length === 0) return '0000000000000000';
  let acc = 0x811c9dc5;
  for (const h of chunkHashes) {
    for (let i = 0; i < h.length; i++) {
      acc ^= h.charCodeAt(i);
      acc = Math.imul(acc, 0x01000193);
    }
  }
  return (acc >>> 0).toString(16).padStart(8, '0');
}
