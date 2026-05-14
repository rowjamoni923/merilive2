import { describe, it, expect } from 'vitest';
import { replaySampleSet, type SampleSet } from '@/lib/face-pose';
import fixtures from './fixtures/face-pose-samples.json';

const sets = (fixtures as { sets: SampleSet[] }).sets;

describe('Face pose threshold regression', () => {
  for (const set of sets) {
    it(`[${set.id}] ${set.label}`, () => {
      const r = replaySampleSet(set);
      // Helpful diagnostics on failure
      if (!r.ok) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
          set: r.setId,
          calibration: r.calibration,
          perStep: r.perStep,
          errors: r.errors,
        }, null, 2));
      }
      expect(r.missingSteps, `${r.setId} missing expected pass`).toEqual([]);
      expect(r.unexpectedPasses, `${r.setId} unexpected pass`).toEqual([]);
      if (set.expected.minPassRate != null) {
        expect(r.overallPassRate).toBeGreaterThanOrEqual(set.expected.minPassRate);
      }
    });
  }

  it('all sets together produce non-zero coverage of every step', () => {
    const seen = new Set<string>();
    for (const set of sets) {
      const r = replaySampleSet(set);
      r.stepsPassed.forEach(s => seen.add(s));
    }
    ['center', 'left', 'right', 'up', 'down'].forEach(s => {
      expect(seen.has(s), `step ${s} never passed across all fixtures`).toBe(true);
    });
  });
});
