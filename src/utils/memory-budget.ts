/**
 * Memory Budget & Stasis Compaction Logic Module
 * Specialized for low-spec hardware (Lenovo E41-25: 4GB RAM, 256GB SSD)
 * and Aegis Stasis Engine eviction scoring.
 */

export interface SystemMemoryAllocation {
  osKernelKioskMb: number;   // Minimal Debian / Cage Wayland base (~185MB)
  sttEngineMb: number;       // Vosk / whisper.cpp tiny.en (~95MB)
  ttsEngineMb: number;       // Piper-TTS CPU neural voice (~48MB)
  slmModelMb: number;        // Qwen-2.5-1.5B or Llama-3.2-1B Q4_K_M (~1040MB)
  hudInterfaceMb: number;    // Webview / Terminal HUD runtime (~112MB)
  userAppsMb: number;        // Extra running apps/tabs
}

export interface StasisAppCandidate {
  name: string;
  residentMemoryMb: number;
  returnProbability: number; // 0.0 to 1.0 (P_resume)
  coldStartLatencyMs: number; // T_cold_start
  priorityWeight: number;     // W_priority (higher = more protected)
}

/**
 * Computes memory budget metrics for 4GB RAM hardware with zRAM compression
 */
export function calculateMemoryBudget(
  allocations: SystemMemoryAllocation,
  physicalRamMb: number = 4096,
  zramRatio: number = 0.5,
  compressionMultiplier: number = 2.5
): {
  totalPhysicalMb: number;
  usedPhysicalMb: number;
  freePhysicalMb: number;
  zramPoolMb: number;
  effectiveTotalAvailableMb: number;
  headroomMb: number;
  isSafeBudget: boolean;
} {
  const usedPhysicalMb =
    allocations.osKernelKioskMb +
    allocations.sttEngineMb +
    allocations.ttsEngineMb +
    allocations.slmModelMb +
    allocations.hudInterfaceMb +
    allocations.userAppsMb;

  const zramPoolMb = Math.round(physicalRamMb * zramRatio);
  // With zRAM compression, 2048MB of RAM stores ~5120MB of text/uncompressed data
  const effectiveTotalAvailableMb = physicalRamMb + Math.round(zramPoolMb * (compressionMultiplier - 1.0));
  const freePhysicalMb = Math.max(0, physicalRamMb - usedPhysicalMb);
  const headroomMb = effectiveTotalAvailableMb - usedPhysicalMb;
  const isSafeBudget = freePhysicalMb >= 1024; // Ensure at least 1GB uncompressed physical buffer

  return {
    totalPhysicalMb: physicalRamMb,
    usedPhysicalMb,
    freePhysicalMb,
    zramPoolMb,
    effectiveTotalAvailableMb,
    headroomMb,
    isSafeBudget,
  };
}

/**
 * Computes Stasis Eviction Score:
 * S = (M_resident * (1.0 - P_resume)) / (T_cold_start * W_priority)
 * The app with the highest score is evicted or compressed to SSD first.
 */
export function calculateStasisEvictionScore(app: StasisAppCandidate): number {
  const pResume = Math.min(1.0, Math.max(0.0, app.returnProbability));
  const tCold = Math.max(1, app.coldStartLatencyMs);
  const wPri = Math.max(0.1, app.priorityWeight);

  const numerator = app.residentMemoryMb * (1.0 - pResume);
  const denominator = tCold * wPri;
  const score = numerator / denominator;

  return Number(score.toFixed(6));
}

/**
 * Selects the optimal application to hibernate/compress to NovaFS
 */
export function selectAppForStasisEviction(apps: StasisAppCandidate[]): StasisAppCandidate | null {
  if (apps.length === 0) return null;
  let highestScore = -1;
  let bestCandidate: StasisAppCandidate | null = null;

  for (const app of apps) {
    const score = calculateStasisEvictionScore(app);
    if (score > highestScore) {
      highestScore = score;
      bestCandidate = app;
    }
  }

  return bestCandidate;
}
