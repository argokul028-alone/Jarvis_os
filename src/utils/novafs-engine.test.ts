import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGcEfficiencyScore,
  selectBestGcSegment,
  calculateExtentCompressionSavings,
  simulateMerkleValidation,
  type NovaSegment,
  type NovaExtent,
} from './novafs-engine.ts';

test('NovaFS GC efficiency score prioritizes older segments with low valid block ratio', () => {
  const currentEpoch = 10000;

  // Segment A: 50 blocks valid out of 512, modified 2000s ago
  const segA: NovaSegment = {
    id: 1,
    totalBlocks: 512,
    validBlocks: 50,
    ageEpochSeconds: 8000,
    isPinned: false,
    eraseCount: 12,
  };

  // Segment B: 450 blocks valid out of 512, modified 2000s ago
  const segB: NovaSegment = {
    id: 2,
    totalBlocks: 512,
    validBlocks: 450,
    ageEpochSeconds: 8000,
    isPinned: false,
    eraseCount: 14,
  };

  const scoreA = calculateGcEfficiencyScore(segA, currentEpoch);
  const scoreB = calculateGcEfficiencyScore(segB, currentEpoch);

  assert.ok(scoreA > scoreB, 'Segment with lower utilization must have higher GC priority');
});

test('NovaFS selectBestGcSegment ignores pinned and fully utilized segments', () => {
  const currentEpoch = 5000;
  const segments: NovaSegment[] = [
    { id: 1, totalBlocks: 512, validBlocks: 512, ageEpochSeconds: 1000, isPinned: false, eraseCount: 5 }, // 100% full
    { id: 2, totalBlocks: 512, validBlocks: 10, ageEpochSeconds: 1000, isPinned: true, eraseCount: 1 },  // Pinned
    { id: 3, totalBlocks: 512, validBlocks: 80, ageEpochSeconds: 2000, isPinned: false, eraseCount: 8 },  // Valid candidate
  ];

  const best = selectBestGcSegment(segments, currentEpoch);
  assert.ok(best !== null);
  assert.equal(best.id, 3, 'Candidate 3 must be selected');
});

test('NovaFS extent compression savings calculates ratio correctly', () => {
  const extents: NovaExtent[] = [
    { logicalBlockOffset: 0, physicalBlockAddress: 100, blockCount: 16, isCompressed: true, compressedSizeBytes: 16384 }, // 64KB -> 16KB (4:1)
    { logicalBlockOffset: 16, physicalBlockAddress: 116, blockCount: 8, isCompressed: false, compressedSizeBytes: 0 },     // 32KB raw
  ];

  const savings = calculateExtentCompressionSavings(extents, 4096);
  assert.equal(savings.rawSizeBytes, 98304); // (16 + 8) * 4096 = 98304 bytes
  assert.equal(savings.storedSizeBytes, 49152); // 16384 + 32768 = 49152 bytes
  assert.equal(savings.savedBytes, 49152);
  assert.equal(savings.compressionRatio, 2.0);
});

test('NovaFS simulateMerkleValidation returns deterministic hex hash', () => {
  const hash1 = simulateMerkleValidation(['block0_hash', 'block1_hash', 'block2_hash']);
  const hash2 = simulateMerkleValidation(['block0_hash', 'block1_hash', 'block2_hash']);
  assert.equal(hash1, hash2, 'Hash must be strictly deterministic');
  assert.equal(hash1.length, 8, 'Hash must be 8-digit hex');
});
