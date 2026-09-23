import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/model.js';
const sample = () => ({ cols:3, rows:2, moves:10, seconds:60, groups:[{name:'A'},{name:'B'}], tiles:[{group:0,image:0,x:0,y:0},{group:0,image:1,x:1,y:0},{group:1,image:0,x:2,y:0}], pending:[[{group:0,image:2,x:0,y:0},{group:1,image:1,x:1,y:0}]] });
test('partial merge retains group inventory and final tile identity',()=>{const g=new Game(sample());const r=g.submit([1,2]);assert.equal(r.kind,'merge');assert.equal(g.tile(2).count,2);assert.equal(g.moves,9);g.assertValid();});
test('mixed category costs one move and removes nothing',()=>{const g=new Game(sample());assert.equal(g.submit([2,3]).kind,'wrong');assert.equal(g.tiles.length,3);assert.equal(g.moves,9);});
test('single, missing and duplicate selection is ignored',()=>{const g=new Game(sample());for(const ids of [[1],[1,99],[1,1]])assert.equal(g.submit(ids).kind,'ignored');assert.equal(g.moves,10);});
test('line cannot silently jump over an occupied tile',()=>{const g=new Game(sample());assert.deepEqual(g.connection(1,3),[2,3]);assert.equal(g.submit([1,3]).kind,'ignored');});
test('backtracking removes selection tail',()=>{const g=new Game(sample());assert.deepEqual(g.extend([1,2,3],1),[1]);});
test('hint and transitions can clear all groups including queued content',()=>{const g=new Game(sample());for(let n=0;n<20&&g.status==='playing';n++){let h=g.hint();if(!h.length){g.shuffle(()=>0.3);h=g.hint();}assert.ok(h.length>1);g.submit(h);}assert.equal(g.status,'won');assert.equal(g.tiles.length,0);assert.equal(g.pending.length,0);});
test('timeout starts only after an action and terminal input is disabled',()=>{const g=new Game(sample());g.tick(100);assert.equal(g.status,'playing');g.submit([1,2]);g.tick(61);assert.equal(g.status,'lost');const state=g.snapshot();g.submit([3,5]);assert.deepEqual(g.snapshot(),state);});
test('last legal move can still win',()=>{const d=sample();d.groups=[{name:'A'}];d.pending=[];d.tiles=d.tiles.slice(0,2);d.moves=1;const g=new Game(d);g.submit([1,2]);assert.equal(g.status,'won');});

test('sparse diagonal drag and release agree on all intervening tiles', () => {
  const level = {cols:4, rows:6, moves:20, seconds:0, groups:[{name:'A'}], pending:[],
    tiles:[{x:1,y:4},{x:1,y:2},{x:1,y:1},{x:2,y:0}].map(t=>({...t,group:0,image:0}))};
  const g = new Game(level);
  // The original raster returned [1,2,4], but release rasterized 2->4 via tile 3.
  const selection = g.extend([1],4);
  assert.deepEqual(selection,[1,2,3,4]);
  assert.equal(g.submit(selection).kind,'complete');
  assert.equal(g.status,'won');
});

test('sparse diagonal does not omit an intervening different category', () => {
  const level = {cols:4, rows:6, moves:20, seconds:0, groups:[{name:'A'},{name:'B'}], pending:[],
    tiles:[{x:1,y:4,group:0},{x:1,y:2,group:0},{x:1,y:1,group:1},{x:2,y:0,group:0}].map(t=>({...t,image:0}))};
  const g = new Game(level), selection=g.extend([1],4);
  assert.deepEqual(selection,[1,2,3,4]);
  assert.equal(g.submit(selection).kind,'wrong');
  assert.equal(g.moves,19);
  assert.equal(g.tiles.length,4);
});

test('generated sparse boards: every displayed extension and backtrack is submittable', () => {
  let seed=18271;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(let trial=0;trial<60;trial++) {
    const tiles=[];
    for(let y=0;y<6;y++)for(let x=0;x<4;x++)if(random()<.45)tiles.push({x,y,group:0,image:0});
    const level={cols:4,rows:6,moves:99,seconds:0,groups:[{}],tiles,pending:[]};
    const g=new Game(level);
    for(const a of g.tiles)for(const b of g.tiles) {
      if(a===b)continue;
      const chain=g.extend([a.id],b.id);
      if(chain.length<2)continue;
      assert.notEqual(new Game(level).submit(chain).kind,'ignored',JSON.stringify({trial,chain}));
      if(chain.length>2){const back=g.extend(chain,chain[chain.length-2]);assert.notEqual(new Game(level).submit(back).kind,'ignored');}
    }
  }
});

test('hidden tiles block selection until adjacent merges remove every cover layer', () => {
  const level={cols:3,rows:2,moves:10,seconds:0,groups:[{name:'A'},{name:'B'}],pending:[],tiles:[
    {x:0,y:0,group:0,image:0},{x:1,y:0,group:0,image:0},
    {x:0,y:1,group:1,image:0,hiddenCounter:2},
    {x:1,y:1,group:1,image:0,hiddenCounter:1},
    {x:2,y:1,group:1,image:0},
  ]};
  const g=new Game(level);
  assert.deepEqual(g.extend([1],3),[1]);
  assert.equal(g.submit([1,3]).kind,'ignored');
  const result=g.submit([1,2]);
  assert.equal(result.kind,'complete');
  assert.equal(g.tile(3).hiddenCounter,1);
  assert.equal(g.tile(4).hiddenCounter,0);
  assert.deepEqual(result.revealed,[4]);
  assert.equal(g.submit([5,4]).kind,'merge');
  assert.equal(g.tile(3).hiddenCounter,0);
  assert.deepEqual(g.extend([4],3),[4,3]);
  assert.equal(g.submit([4,3]).kind,'complete');
  assert.equal(g.status,'won');
});

test('hidden tile on a path cannot be skipped to connect ordinary tiles', () => {
  const level={cols:3,rows:1,moves:10,seconds:0,groups:[{}],pending:[],tiles:[
    {x:0,y:0,group:0,image:0},{x:1,y:0,group:0,image:0,hiddenCounter:1},{x:2,y:0,group:0,image:0}
  ]};
  const g=new Game(level);
  assert.deepEqual(g.extend([1],3),[1]);
  assert.equal(g.submit([1,2,3]).kind,'ignored');
});

test('a matched key unlocks its paired tile, including lock id zero', () => {
  const level={cols:3,rows:2,moves:10,seconds:0,groups:[{},{}],pending:[],tiles:[
    {x:0,y:0,group:0,image:0,restriction:5,unlocksLockId:0},
    {x:1,y:0,group:0,image:1},
    {x:2,y:0,group:1,image:0,restriction:4,lockId:0},
    {x:2,y:1,group:1,image:1},
  ]};
  const g=new Game(level);
  assert.deepEqual(g.extend([4],3),[4]);
  assert.equal(g.submit([4,3]).kind,'ignored');
  const result=g.submit([1,2]);
  assert.deepEqual(result.unlocked,[3]);
  assert.equal(g.tile(3).restriction,0);
  assert.deepEqual(g.extend([4],3),[4,3]);
});

test('bonus tile is tapped separately and awards configured moves', () => {
  const level={cols:3,rows:1,moves:10,seconds:0,groups:[{}],pending:[],tiles:[
    {x:0,y:0,group:0,image:0},
    {x:1,y:0,group:-1,image:-1,restriction:7,extraMoves:5},
    {x:2,y:0,group:0,image:1},
  ]};
  const g=new Game(level);
  assert.deepEqual(g.extend([1],2),[1]);
  assert.equal(g.submit([1,2]).kind,'ignored');
  assert.deepEqual(g.collectExtra(2),{kind:'extraMoves',id:2,amount:5});
  assert.equal(g.moves,15);
  assert.equal(g.tile(2),undefined);
  assert.equal(g.submit([1,3]).kind,'complete');
});
