/**
 * Aegis Microkernel Energy-Aware Scheduler (EAS) Logic Module
 * Implements mathematical power modeling, core selection, and deadline verification
 */

export interface CpuCore {
  id: number;
  type: 'prime' | 'perf' | 'efficiency';
  clockMhz: number;
  maxMhz: number;
  activeCapacitancePf: number;
  voltageV: number;
  idlePowerMw: number;
  currentLoadPercent: number;
}

export interface ThreadTask {
  id: string;
  name: string;
  priority: number; // 0 (highest) to 255 (lowest)
  requiredMhz: number;
  deadlineMs?: number;
  isRealtime: boolean;
}

/**
 * Calculates dynamic power consumption: P = C * V^2 * f + P_idle
 */
export function calculateCorePowerMw(core: CpuCore, targetMhz: number): number {
  const fGhz = targetMhz / 1000;
  const cFarads = core.activeCapacitancePf * 1e-12;
  const v = core.voltageV;
  // P_dynamic in Watts = C * V^2 * f
  const dynamicWatts = cFarads * v * v * (fGhz * 1e9);
  const dynamicMw = dynamicWatts * 1000;
  return dynamicMw + core.idlePowerMw;
}

/**
 * Calculates the energy delta for assigning task load to a candidate core:
 * Delta E = P(c, f_new) - P(c, f_current)
 */
export function calculateEnergyDelta(core: CpuCore, taskLoadMhz: number): number {
  const currentP = calculateCorePowerMw(core, core.clockMhz);
  const newMhz = Math.min(core.maxMhz, core.clockMhz + taskLoadMhz);
  const newP = calculateCorePowerMw(core, newMhz);
  return newP - currentP;
}

/**
 * Selects the optimal CPU core for a task based on Energy-Aware Scheduling (EAS).
 * Realtime/deadline tasks prioritize high-performance or prime cores.
 * Background batch tasks favor efficiency cores.
 */
export function selectOptimalCore(cores: CpuCore[], task: ThreadTask): CpuCore {
  if (cores.length === 0) {
    throw new Error('No CPU cores available');
  }

  // Hard realtime or display deadline tasks must meet latency
  if (task.isRealtime || (task.deadlineMs !== undefined && task.deadlineMs <= 8.33)) {
    // Prefer Prime or highest-clocked Perf core
    const candidateCores = cores.filter(c => c.type === 'prime' || c.type === 'perf');
    const pool = candidateCores.length > 0 ? candidateCores : cores;
    return pool.reduce((best, curr) => (curr.clockMhz < best.clockMhz ? curr : best));
  }

  // Energy-efficient placement for normal tasks: minimize Delta E
  let minDelta = Infinity;
  let selected = cores[0];

  for (const core of cores) {
    // Check if core can accommodate the task
    if (core.currentLoadPercent >= 95) continue;
    const delta = calculateEnergyDelta(core, task.requiredMhz);
    if (delta < minDelta) {
      minDelta = delta;
      selected = core;
    }
  }

  return selected;
}

/**
 * Verifies if display rendering frame meets 120Hz (8.33ms) or 60Hz (16.67ms) budget
 */
export function verifyFrameDeadline(
  inputTimeMs: number,
  layoutTimeMs: number,
  gpuRenderTimeMs: number,
  compositionTimeMs: number,
  targetHz: number = 120
): { meetsDeadline: boolean; totalMs: number; deadlineMs: number; marginMs: number } {
  const deadlineMs = 1000 / targetHz;
  const totalMs = inputTimeMs + layoutTimeMs + gpuRenderTimeMs + compositionTimeMs;
  const marginMs = deadlineMs - totalMs;
  return {
    meetsDeadline: marginMs >= 0,
    totalMs: Number(totalMs.toFixed(2)),
    deadlineMs: Number(deadlineMs.toFixed(2)),
    marginMs: Number(marginMs.toFixed(2)),
  };
}
