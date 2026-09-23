// Per-level remaining-move targets. Two stars use the median successful
// newcomer run; three stars use the median successful practiced run from the
// seeded difficulty evaluation. Recalibrate when real play data is available.
const targets = [
  null,
  [95, 96], [29, 36], [18, 30], [8, 20], [5, 17],
  [7, 21], [5, 19], [6, 20], [7, 21], [2, 11],
  [5, 19], [11, 24], [4, 19], [3, 17], [2, 10],
  [3, 18], [2, 9], [3, 18], [1, 9], [5, 20],
  [8, 22], [18, 34], [5, 19], [4, 17], [8, 23],
  [2, 10], [8, 25], [7, 21], [11, 27], [4, 18],
];

export function starTargets(levelId) {
  const pair = targets[levelId];
  if (!pair) throw new RangeError(`Missing star targets for level ${levelId}`);
  return { two:pair[0], three:pair[1] };
}

export function starsForRemaining(levelId, remaining) {
  const { two, three } = starTargets(levelId);
  return remaining >= three ? 3 : remaining >= two ? 2 : 1;
}
