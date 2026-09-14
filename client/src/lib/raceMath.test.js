import { describe, it, expect } from 'vitest';
import {
  runningTotals,
  computeFractions,
  computeWinner,
  keyframeStops,
  formatWinnerLine,
  BEAT_MS,
} from './raceMath';

const contenders = [
  { id: 'a', name: 'Lion King' },
  { id: 'b', name: 'Forrest Gump' },
  { id: 'c', name: 'True Lies' },
  { id: 'd', name: 'Speed' },
];

const beats = [
  { label: 'Week 1', values: [40.9, 24.5, 25.9, 14.5] },
  { label: 'Week 2', values: [10.0, 20.0, 8.0, 6.0] },
  { label: 'Week 3', values: [5.0, 25.0, 3.0, 4.0] },
];

describe('runningTotals', () => {
  it('sums per-contender values cumulatively across beats', () => {
    expect(runningTotals(beats)).toEqual([
      [40.9, 24.5, 25.9, 14.5],
      [50.9, 44.5, 33.9, 20.5],
      [55.9, 69.5, 36.9, 24.5],
    ]);
  });

  it('treats a missing cell as 0', () => {
    const withGap = [{ label: 'Week 1', values: [1, undefined, 3, 4] }];
    expect(runningTotals(withGap)).toEqual([[1, 0, 3, 4]]);
  });

  it('returns an empty array for no beats', () => {
    expect(runningTotals([])).toEqual([]);
  });
});

describe('computeFractions', () => {
  it('normalises every lane against the WINNER final total, not per-beat', () => {
    const { fractions, winnerFinal } = computeFractions(beats);
    expect(winnerFinal).toBe(69.5); // Forrest Gump's final total
    // winner's own last fraction is exactly 1
    expect(fractions[2][1]).toBeCloseTo(1, 10);
    // a mid-race leader (Lion King, beat 1) never exceeds 1
    fractions.flat().forEach((f) => expect(f).toBeLessThanOrEqual(1));
    // Lion King leads beat 1: 40.9 / 69.5
    expect(fractions[0][0]).toBeCloseTo(40.9 / 69.5, 10);
  });

  it('returns fraction 0 everywhere when all totals are 0', () => {
    const zero = [{ label: 'Week 1', values: [0, 0, 0, 0] }];
    const { fractions, winnerFinal } = computeFractions(zero);
    expect(winnerFinal).toBe(0);
    expect(fractions[0]).toEqual([0, 0, 0, 0]);
  });
});

describe('computeWinner', () => {
  it('finds the winner, the lead-change sequence, and the margin', () => {
    const result = computeWinner(contenders, beats);
    expect(result.tie).toBe(false);
    expect(result.winnerIndex).toBe(1);
    expect(result.winnerName).toBe('Forrest Gump');
    // beat 1: Lion King leads (40.9 highest); beat 2: Lion King still ahead
    // (50.9 vs 44.5); beat 3: Gump takes it (69.5 vs 55.9)
    expect(result.leaderPerBeat).toEqual([0, 0, 1]);
    expect(result.margin).toBeCloseTo(69.5 - 55.9, 10);
  });

  it('reports a tie with no winner', () => {
    const tiedBeats = [{ label: 'Week 1', values: [10, 10, 5, 5] }];
    const result = computeWinner(contenders, tiedBeats);
    expect(result.tie).toBe(true);
    expect(result.winnerIndex).toBeNull();
    expect(result.winnerName).toBe('');
  });
});

describe('keyframeStops', () => {
  it('emits a gate stop plus one stop per beat, per lane', () => {
    const lanes = keyframeStops(beats);
    expect(lanes).toHaveLength(4);
    lanes.forEach((stops) => expect(stops).toHaveLength(beats.length + 1));
    // gate stop is always the top of the ellipse, 0%
    lanes.forEach((stops) => {
      expect(stops[0]).toEqual({ percent: 0, angleDeg: -90, flip: true });
    });
    // winner's final stop lands exactly one full lap from the gate: -90 - 360
    const winnerLane = lanes[1];
    expect(winnerLane[winnerLane.length - 1].angleDeg).toBeCloseTo(-90 - 360, 10);
  });

  it('flips a lane exactly when its angle is on the top half of the ellipse (sin < 0)', () => {
    const lanes = keyframeStops(beats);
    lanes.flat().forEach((stop) => {
      const rad = (stop.angleDeg * Math.PI) / 180;
      expect(stop.flip).toBe(Math.sin(rad) < 0);
    });
  });
});

describe('formatWinnerLine', () => {
  it('names the winner, the margin, and the lead changes', () => {
    const line = formatWinnerLine(contenders, beats);
    expect(line).toContain('Forrest Gump');
    expect(line).toContain('Lion King');
    expect(line).toMatch(/wins by/);
  });

  it('flags a tie instead of a winner', () => {
    const tiedBeats = [{ label: 'Week 1', values: [10, 10, 5, 5] }];
    expect(formatWinnerLine(contenders, tiedBeats)).toMatch(/tie/i);
  });

  it('flags too few beats', () => {
    expect(formatWinnerLine(contenders, [beats[0]])).toMatch(/at least 2 beats/i);
  });
});

it('BEAT_MS is the 700ms pace constant', () => {
  expect(BEAT_MS).toBe(700);
});
