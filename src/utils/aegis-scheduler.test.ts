import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCorePowerMw,
  calculateEnergyDelta,
  selectOptimalCore,
  verifyFrameDeadline,
  type CpuCore,
  type ThreadTask,
} from './aegis-scheduler.ts';

test('EAS calculateCorePowerMw computes non-zero dynamic plus idle power', () => {
  const core: CpuCore = {
    id: 0,
    type: 'efficiency',
    clockMhz: 1000,
    maxMhz: 2000,
    activeCapacitancePf: 150,
    voltageV: 0.75,
    idlePowerMw: 15,
    currentLoadPercent: 20,
  };
  const power = calculateCorePowerMw(core, 1500);
  assert.ok(power > core.idlePowerMw, 'Total power should exceed idle power');
  assert.ok(power < 500, 'Efficiency core power should remain under 500mW');
});

test('EAS energy delta correctly reflects increased frequency', () => {
  const core: CpuCore = {
    id: 1,
    type: 'perf',
    clockMhz: 1800,
    maxMhz: 2800,
    activeCapacitancePf: 300,
    voltageV: 0.9,
    idlePowerMw: 50,
    currentLoadPercent: 40,
  };
  const delta = calculateEnergyDelta(core, 400);
  assert.ok(delta > 0, 'Energy delta for adding clock load must be positive');
});

test('EAS routes hard realtime display task to Prime or Perf core', () => {
  const cores: CpuCore[] = [
    { id: 0, type: 'efficiency', clockMhz: 800, maxMhz: 1800, activeCapacitancePf: 120, voltageV: 0.7, idlePowerMw: 10, currentLoadPercent: 10 },
    { id: 1, type: 'efficiency', clockMhz: 800, maxMhz: 1800, activeCapacitancePf: 120, voltageV: 0.7, idlePowerMw: 10, currentLoadPercent: 15 },
    { id: 2, type: 'perf', clockMhz: 2000, maxMhz: 2800, activeCapacitancePf: 300, voltageV: 0.9, idlePowerMw: 40, currentLoadPercent: 30 },
    { id: 3, type: 'prime', clockMhz: 3200, maxMhz: 3400, activeCapacitancePf: 500, voltageV: 1.1, idlePowerMw: 120, currentLoadPercent: 10 },
  ];

  const realtimeTask: ThreadTask = {
    id: 'display-vsync-120',
    name: 'HeliosCompositorScanout',
    priority: 0,
    requiredMhz: 600,
    deadlineMs: 8.33,
    isRealtime: true,
  };

  const chosenCore = selectOptimalCore(cores, realtimeTask);
  assert.ok(chosenCore.type === 'prime' || chosenCore.type === 'perf', 'Realtime tasks must route to prime/perf');
});

test('verifyFrameDeadline evaluates 120Hz LTPO 8.33ms deadline accurately', () => {
  // Scenario 1: Nominal 120Hz frame (7.2ms total <= 8.33ms)
  const nominal = verifyFrameDeadline(0.8, 1.4, 3.2, 1.8, 120);
  assert.equal(nominal.meetsDeadline, true);
  assert.equal(nominal.totalMs, 7.2);
  assert.ok(nominal.marginMs > 0);

  // Scenario 2: Overrun frame (9.5ms total > 8.33ms)
  const overrun = verifyFrameDeadline(1.5, 2.5, 4.0, 1.5, 120);
  assert.equal(overrun.meetsDeadline, false);
  assert.ok(overrun.marginMs < 0);
});
