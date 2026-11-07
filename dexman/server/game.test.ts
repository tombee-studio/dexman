import { test } from "node:test";
import assert from "node:assert/strict";
import { Match, RULES, cell, type Roster } from "./game.js";
const roster: Roster[] = [0,1,2,3].map(i => ({ id: String(i), name: `Dex ${i}`, team: i<2 ? "Glitch" : "Patch", skill: "Dash" }));
function arena() {
  const match = new Match(roster,1000,() => 0.99);
  match.state.tiles = match.state.tiles.map(t => t === 2 ? 0 : t);
  match.state.bugs.fill(0); match.state.bugs[cell(11,9)] = 1;
  return match;
}
test("13x11の対称マップ、逃げ道、初期バグと固定分母", () => {
  const m = new Match(roster,1000);
  assert.equal(m.state.tiles.length,143);
  for (let y=0;y<11;y++) for (let x=0;x<13;x++) {
    assert.equal(m.state.tiles[cell(x,y)],m.state.tiles[cell(12-x,y)]);
    assert.equal(m.state.bugs[cell(x,y)],m.state.bugs[cell(x,10-y)]);
  }
  assert.ok(m.state.bugCount > 0);
  assert.equal(m.state.tiles[cell(1,1)],0); assert.equal(m.state.tiles[cell(2,1)],0); assert.equal(m.state.tiles[cell(1,2)],0);
});
test("移動は連続的に毎秒4マス進み、壁と不正方向を検証する", () => {
 const m=arena(),p=m.state.fighters[0];m.input(p.id,"right",1000);m.step(1000);m.step(1050);
 assert.ok(Math.abs(p.x-1.2)<1e-6);
 for(let t=1100;t<=1250;t+=50)m.step(t);assert.equal(p.x,2);
 m.input(p.id,"right",1250);for(let t=1300;t<=1500;t+=50)m.step(t);assert.equal(p.x,3);
 m.input(p.id,"up",1500);m.step(1550);assert.equal(p.y,1);
 m.input(p.id,"__proto__",1550);m.step(1600);assert.equal(p.y,1);
});
test("2秒後に十字爆発、重複生成なし、設置上限と自爆スタンなし", () => {
  const m = arena(), p = m.state.fighters[0]; p.x=3; p.y=3;
  assert.ok(m.place(p.id,1000)); assert.equal(m.place(p.id,1000),false);
  m.step(2999); assert.equal(m.state.cubes.length,1);
  m.step(3000); assert.equal(m.state.cubes.length,0); assert.equal(m.state.bugs[cell(3,3)],1);
  assert.equal(p.stunnedUntil,0);
  const n = m.state.bugCount; m.place(p.id,3100); m.step(5100); assert.equal(m.state.bugCount,n);
});
test("ブロックは壊れて爆風を遮り、壊せない壁も遮る。占有率の分母は固定", () => {
  const m = arena(), p = m.state.fighters[0]; p.x=3;p.y=3;
  m.state.tiles[cell(4,3)]=2; m.state.tiles[cell(3,2)]=1;
  const total = m.state.totalFloor;
  m.place(p.id,1000);m.step(3000);
  assert.equal(m.state.tiles[cell(4,3)],0); assert.equal(m.state.bugs[cell(5,3)],0); assert.equal(m.state.bugs[cell(3,1)],0);
  assert.equal(m.state.totalFloor,total);
});
test("敵キューブへの誘爆も所有チームを保ち、同時処理順が安定する", () => {
  const m = arena(), a=m.state.fighters[0], b=m.state.fighters[2];a.x=3;a.y=3;b.x=5;b.y=3;
  m.place(a.id,1000); m.place(b.id,1500); m.step(3000);
  assert.equal(m.state.cubes.length,0);
  assert.equal(m.state.blasts.length,2);
  assert.equal(m.state.bugs[cell(5,3)],0);
  assert.deepEqual(m.state.blasts.map(b=>b.team),["Glitch","Patch"]);
});
test("敵の爆風で1秒スタン＋2秒耐性、味方は無傷、スタン中は設置不可", () => {
  const m=arena(), a=m.state.fighters[0], ally=m.state.fighters[1], enemy=m.state.fighters[2];
  a.x=3;a.y=3;ally.x=3;ally.y=1;enemy.x=5;enemy.y=3;
  m.place(a.id,1000);m.step(3000);
  assert.equal(ally.stunnedUntil,0);assert.equal(enemy.stunnedUntil,4000);assert.equal(enemy.immuneUntil,6000);
  assert.equal(m.place(enemy.id,3100),false);
  m.state.blasts.push({id:99,team:"Glitch",cells:[cell(enemy.x,enemy.y)],expiresAt:5900});m.step(4500);
  assert.equal(enemy.stunnedUntil,4000);
});
test("Guardは同じ爆風への再接触を防御し、別の爆風はスタンさせる", () => {
  const m=arena(), p=m.state.fighters[2];p.skill="Guard";
  assert.ok(m.skill(p.id,1000).ok);
  m.state.blasts.push({id:1,team:"Glitch",cells:[cell(p.x,p.y)],expiresAt:1800});m.step(1100);m.step(1150);
  assert.equal(p.stunnedUntil,0); assert.equal(p.guardUntil,0);
  m.state.blasts.push({id:2,team:"Glitch",cells:[cell(p.x,p.y)],expiresAt:1800});m.step(1200);
  assert.equal(p.stunnedUntil,2200);
});
test("Dashは最大2マス、途中の爆風で停止し、クールダウンをサーバーで検証", () => {
  const m=arena(),p=m.state.fighters[0];p.x=1;p.y=1;p.direction="right";
  m.state.blasts.push({id:1,team:"Patch",cells:[cell(2,1)],expiresAt:2000});
  assert.ok(m.skill(p.id,1000).ok);assert.equal(p.x,2);assert.equal(p.stunnedUntil,2000);
  assert.equal(m.skill(p.id,2100).ok,false);assert.equal(p.skillReadyAt,9000);
});
test("Pushは最大3マス、壁で停止し、キューブの時限を変更しない", () => {
  const m=arena(),p=m.state.fighters[0];p.skill="Push";p.x=3;p.y=3;p.direction="right";
  m.state.cubes.push({id:1,owner:p.id,team:p.team,x:4,y:3,placedAt:1000,explodeAt:3000,range:2});
  m.state.tiles[cell(7,3)]=1;assert.ok(m.skill(p.id,1100).ok);
  assert.equal(m.state.cubes[0].x,6);assert.equal(m.state.cubes[0].explodeAt,3000);
});
test("アイテムは1段階強化、最大5まで、爆風で消えない", () => {
  const m=arena(),p=m.state.fighters[0];p.capacity=5;
  m.state.items[cell(2,1)]="capacity";m.input(p.id,"right",1000);for(let t=1000;t<=1250;t+=50)m.step(t);
  assert.equal(p.capacity,5);assert.equal(m.state.items[cell(2,1)],undefined);
  m.state.items[cell(3,1)]="range";m.input(p.id,"right",1250);for(let t=1300;t<=1500;t+=50)m.step(t);assert.equal(p.range,3);
});
test("60%以上を連続5秒維持して勝利、途中で下がれば維持秒数をリセット", () => {
  const m=arena();const cells=m.state.tiles.flatMap((t,i)=>t===0?[i]:[]);
  for(const i of cells)m.state.bugs[i]=1;m.evaluate(1000);assert.equal(m.state.holdSince,1000);
  m.state.bugs.fill(0);m.state.bugs[cells[0]]=1;m.evaluate(3000);assert.equal(m.state.holdSince,null);
  for(const i of cells)m.state.bugs[i]=1;m.evaluate(4000);m.evaluate(8999);assert.equal(m.state.winner,"");
  m.evaluate(9000);assert.equal(m.state.winner,"Glitch");
});
test("全除去はPatch勝利、時間切れは丸め前30%ちょうどをGlitch勝利とする", () => {
  const empty=arena();empty.state.bugs.fill(0);empty.evaluate(1100);assert.equal(empty.state.winner,"Patch");
  for(const [count,winner] of [[29,"Patch"],[30,"Glitch"],[31,"Glitch"]] as const){
    const m=arena();m.state.totalFloor=100;m.state.bugs=m.state.bugs.map((_,i)=>i<count?1:0);
    m.evaluate(m.state.endsAt);assert.equal(m.state.winner,winner);
  }
});
test("切断後のプレイヤーは動作不可。ログは50件、個別クールダウン失敗を公開ログへ載せない",()=>{
  const m=arena(),p=m.state.fighters[0];m.disconnect(p.id,1000);assert.equal(m.place(p.id,1100),false);
  const b=m.state.fighters[1];b.skill="Guard";
  for(let i=0;i<60;i++){ b.skillReadyAt=0; m.skill(b.id,1000+i); }
  assert.equal(m.state.events.length,50);
  const n=m.state.events.length;m.skill(b.id,1100);assert.equal(m.state.events.length,n);
});
test("持続中の爆風へ置いたキューブは時限を待たず誘爆する",()=>{
 const m=arena(),p=m.state.fighters[0];
 m.state.blasts.push({id:90,team:p.team,cells:[cell(p.x,p.y)],expiresAt:1500});
 assert.ok(m.place(p.id,1000));m.step(1050);assert.equal(m.state.cubes.length,0);
 assert.equal(m.state.blasts.length,2);
});
test("入力の重複と古い順序を無視し、移動中のキューブは整数マスへ設置する",()=>{
 const m=arena(),p=m.state.fighters[0];m.input(p.id,{direction:"right",sequence:2},1000);
 m.input(p.id,{direction:"left",sequence:1},1001);m.input(p.id,{direction:"left",sequence:2},1002);
 m.step(1000);m.step(1050);assert.equal(p.inputDirection,"right");assert.equal(p.inputSequence,2);
 assert.ok(m.place(p.id,1050));assert.ok(Number.isInteger(m.state.cubes[0].x));
 assert.ok(Number.isInteger(m.state.cubes[0].y));assert.equal(m.state.cubes[0].x,1);
});
test("50ms未満の短いタップもサーバーの更新間で消えず1マス移動する",()=>{
 const m=arena(),p=m.state.fighters[0];m.step(1000);
 m.input(p.id,{direction:"right",sequence:1},1010);m.input(p.id,{direction:null,sequence:2},1020);
 for(let t=1050;t<=1500;t+=50)m.step(t);
 assert.equal(p.x,2);assert.equal(p.moving,false);assert.equal(p.inputDirection,null);
});