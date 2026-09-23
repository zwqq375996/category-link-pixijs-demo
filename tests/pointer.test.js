import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindPointer } from '../src/pointer.js';
import { Game } from '../src/model.js';
function fixture(captureFails=false) {
  const canvas=new EventTarget(), host=new EventTarget();
  let captured=false, releases=0, cancels=0, selection=[];
  canvas.setPointerCapture=()=>{if(captureFails)throw Error('Capture unavailable');captured=true;};
  canvas.hasPointerCapture=()=>captured;
  canvas.releasePointerCapture=()=>{captured=false;canvas.dispatchEvent(new Event('lostpointercapture'));};
  const game=new Game({cols:3,rows:1,moves:10,seconds:60,groups:[{}],pending:[],tiles:[0,1,2].map(x=>({x,y:0,group:0,image:0}))});
  const controller=bindPointer(canvas,host,{
    begin:e=>{selection=[e.tile];return true;},
    move:e=>{selection=game.extend(selection,e.tile);},
    release:()=>{releases++;game.submit(selection);},
    cancel:()=>{cancels++;selection=[];}
  });
  const emit=(target,type,extra={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,pointerType:'mouse',button:0,buttons:1,tile:1,...extra});target.dispatchEvent(e);};
  const select=()=>{emit(canvas,'pointerdown');emit(host,'pointermove',{tile:3});};
  return {canvas,host,game,controller,emit,select,counts:()=>({releases,cancels})};
}
test('horizontal three tiles commit when released outside canvas, exactly once',()=>{
  const f=fixture();f.select();f.emit(f.host,'pointerup',{buttons:0});f.emit(f.host,'pointerup',{buttons:0});
  assert.equal(f.game.status,'won');assert.equal(f.game.turn,1);assert.deepEqual(f.counts(),{releases:1,cancels:0});
});
test('lost capture before pointerup preserves preview until release',()=>{
  const f=fixture();f.select();f.emit(f.canvas,'lostpointercapture');f.emit(f.host,'pointerup',{buttons:0});
  assert.equal(f.game.status,'won');assert.deepEqual(f.counts(),{releases:1,cancels:0});
});
test('unavailable pointer capture still allows completion',()=>{
  const f=fixture(true);f.select();f.emit(f.host,'pointerup',{buttons:0});assert.equal(f.game.status,'won');
});
test('missed mouse release is recovered on next unpressed move',()=>{
  const f=fixture();f.select();f.emit(f.host,'pointermove',{buttons:0});f.emit(f.host,'pointerup',{buttons:0});
  assert.equal(f.game.status,'won');assert.equal(f.counts().releases,1);
});
test('cancellation, blur, reset and unrelated fingers cannot submit a selection',()=>{
  for(const reason of ['pointercancel','blur','reset']){
    const f=fixture();f.select();f.emit(f.host,'pointerup',{pointerId:2,buttons:0});assert.equal(f.game.turn,0);
    if(reason==='reset')f.controller.cancel();else f.emit(f.host,reason);
    f.emit(f.host,'pointerup',{buttons:0});assert.equal(f.game.turn,0);
    assert.equal(f.counts().cancels,reason==='reset'?0:1);
  }
});
