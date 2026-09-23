import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { starTargets, starsForRemaining } from '../src/ratings.js';

const levels=JSON.parse(readFileSync(new URL('../public/levels.json',import.meta.url))).levels;

test('every level has ordered, reachable remaining-move star targets',()=>{
  for(const level of levels){
    const {two,three}=starTargets(level.id);
    assert.ok(Number.isInteger(two)&&two>0&&two<three&&three<=level.moves,`level ${level.id}`);
  }
});

test('a win earns one star by default and upgrades at each exact target',()=>{
  for(const level of levels){
    const {two,three}=starTargets(level.id);
    assert.equal(starsForRemaining(level.id,two-1),1);
    assert.equal(starsForRemaining(level.id,two),2);
    assert.equal(starsForRemaining(level.id,three-1),2);
    assert.equal(starsForRemaining(level.id,three),3);
    assert.equal(starsForRemaining(level.id,three+5),3);
  }
});
