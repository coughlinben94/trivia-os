export const BEAT_MS = 700;

export function runningTotals(beats) {
  if (!beats.length) return [];
  const laneCount = beats[0].values.length;
  const running = new Array(laneCount).fill(0);
  return beats.map((beat) => {
    beat.values.forEach((v, i) => {
      running[i] += Number.isFinite(v) ? v : 0;
    });
    return [...running];
  });
}

export function computeFractions(beats) {
  const totals = runningTotals(beats);
  const finalTotals = totals[totals.length - 1] || [];
  const winnerFinal = finalTotals.length ? Math.max(...finalTotals) : 0;
  const fractions = totals.map((row) =>
    row.map((v) => (winnerFinal > 0 ? v / winnerFinal : 0))
  );
  return { totals, fractions, winnerFinal };
}

function leaderOfRow(row) {
  const max = Math.max(...row);
  const leaders = row.reduce((acc, v, i) => (v === max ? [...acc, i] : acc), []);
  return leaders.length === 1 ? leaders[0] : null;
}

export function computeWinner(contenders, beats) {
  const { totals } = computeFractions(beats);
  if (!totals.length) {
    return { winnerIndex: null, winnerName: '', tie: false, leaderPerBeat: [], finalTotals: [], margin: 0 };
  }
  const finalTotals = totals[totals.length - 1];
  const winnerIndex = leaderOfRow(finalTotals);
  const leaderPerBeat = totals.map(leaderOfRow);
  const sorted = [...finalTotals].sort((a, b) => b - a);
  const margin = sorted.length > 1 ? sorted[0] - sorted[1] : sorted[0] || 0;
  return {
    winnerIndex,
    winnerName: winnerIndex !== null ? contenders[winnerIndex]?.name || '' : '',
    tie: winnerIndex === null,
    leaderPerBeat,
    finalTotals,
    margin,
  };
}

export function keyframeStops(beats) {
  const { fractions } = computeFractions(beats);
  const laneCount = fractions[0]?.length ?? 0;
  const n = beats.length;
  // Gate at top of ellipse: -90 degrees
  const gateAngle = -90;
  const gateRad = (gateAngle * Math.PI) / 180;
  const gate = { percent: 0, angleDeg: gateAngle, flip: Math.sin(gateRad) < 0 };
  return Array.from({ length: laneCount }, (_, i) => {
    const stops = [gate];
    for (let k = 0; k < n; k += 1) {
      const f = fractions[k][i];
      const angleDeg = -90 - f * 360;
      const rad = (angleDeg * Math.PI) / 180;
      stops.push({
        percent: ((k + 1) / n) * 100,
        angleDeg,
        flip: Math.sin(rad) < 0,
      });
    }
    return stops;
  });
}

export function formatWinnerLine(contenders, beats) {
  const { tie, winnerName, leaderPerBeat, margin } = computeWinner(contenders, beats);
  if (tie) return 'Two contenders tie — the race has no winner, fix the data';
  if (beats.length < 2) return 'Add at least 2 beats to see a winner';

  const changes = [];
  let currentLeader = leaderPerBeat[0];
  let rangeStart = 1;
  for (let k = 1; k <= leaderPerBeat.length; k += 1) {
    const leader = leaderPerBeat[k];
    if (leader !== currentLeader || k === leaderPerBeat.length) {
      const rangeEnd = k;
      const name = currentLeader !== null ? contenders[currentLeader]?.name || '?' : 'nobody';
      const range = rangeEnd === rangeStart ? `beat ${rangeStart}` : `beats ${rangeStart}–${rangeEnd}`;
      changes.push(`${name} leads ${range}`);
      rangeStart = k + 1;
      currentLeader = leader;
    }
  }
  const marginText = Number.isInteger(margin) ? margin : margin.toFixed(1);
  return `🏆 ${winnerName} wins by ${marginText} — ${changes.join(', ')}`;
}
