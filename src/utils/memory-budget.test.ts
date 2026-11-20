import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMemoryBudget,
  calculateStasisEvictionScore,
  selectAppForStasisEviction,
  type SystemMemoryAllocation,
  type StasisAppCandidate,
} from './memory-budget.ts';

test('Lenovo E41-25 4GB RAM configuration safely accommodates JARVISOS + Qwen-1.5B', () => {
  const baseAllocation: SystemMemoryAllocation = {
    osKernelKioskMb: 185,
    sttEngineMb: 95,
    ttsEngineMb: 48,
    slmModelMb: 1040,
    hudInterfaceMb: 112,
    userAppsMb: 120,
  };

  const budget = calculateMemoryBudget(baseAllocation, 4096, 0.5, 2.5);

  assert.equal(budget.usedPhysicalMb, 1600, 'Baseline memory footprint should be ~1.6 GB');
  assert.ok(budget.freePhysicalMb > 2000, 'Free physical RAM should exceed 2 GB');
  assert.equal(budget.isSafeBudget, true, 'Hardware configuration must be safely flagged as viable');
  assert.ok(budget.effectiveTotalAvailableMb > 5000, 'Effective memory with zRAM exceeds 5 GB');
});

test('Stasis eviction score prioritizes high-memory idle apps with low return probability', () => {
  // App A: Heavy background browser tab, low chance of return, fast restart
  const appA: StasisAppCandidate = {
    name: 'BackgroundTab',
    residentMemoryMb: 350,
    returnProbability: 0.1, // 10%
    coldStartLatencyMs: 250,
    priorityWeight: 1.0,
  };

  // App B: User actively editing document, high return probability, high priority
  const appB: StasisAppCandidate = {
    name: 'DocEditor',
    residentMemoryMb: 200,
    returnProbability: 0.95, // 95%
    coldStartLatencyMs: 600,
    priorityWeight: 5.0,
  };

  const scoreA = calculateStasisEvictionScore(appA);
  const scoreB = calculateStasisEvictionScore(appB);

  assert.ok(scoreA > scoreB, 'Unused heavy app must have significantly higher eviction score');
});

test('selectAppForStasisEviction selects top scored candidate', () => {
  const candidates: StasisAppCandidate[] = [
    { name: 'ActiveMusic', residentMemoryMb: 80, returnProbability: 0.9, coldStartLatencyMs: 300, priorityWeight: 3.0 },
    { name: 'OldPdfViewer', residentMemoryMb: 220, returnProbability: 0.05, coldStartLatencyMs: 150, priorityWeight: 1.0 },
  ];

  const evicted = selectAppForStasisEviction(candidates);
  assert.ok(evicted !== null);
  assert.equal(evicted.name, 'OldPdfViewer');
});
