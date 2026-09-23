import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, play, profiles } from '../scripts/evaluate-levels.mjs';

const level=JSON.parse(readFileSync(new URL('../public/levels.json',import.meta.url))).levels[0];

test('a seeded player simulation is repeatable and uses valid game actions', () => {
  const first=play(level,profiles.newcomer,41893);
  assert.deepEqual(play(level,profiles.newcomer,41893),first);
  assert.equal(first.status,'won');
  assert.equal(first.completed,level.groups.length);
});

test('evaluation reports bounded completion intervals for each play style', () => {
  const result=evaluate([level],{runs:4,seed:1337,levelNumbers:[1]})[1];
  for(const name of Object.keys(profiles)){
    const summary=result[name];
    assert.equal(summary.runs,4);
    assert.ok(summary.winRate95[0]>=0&&summary.winRate95[1]<=1);
    assert.ok(summary.winRate95[0]<=summary.winRate&&summary.winRate<=summary.winRate95[1]);
  }
});
