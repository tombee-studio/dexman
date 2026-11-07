import { test } from "node:test";
import assert from "node:assert/strict";
import { Lobby } from "./lobby.js";

function four() {
  const lobby = new Lobby(() => 0.4);
  for (let i = 0; i < 4; i++) lobby.join(String(i), `Dex ${i}`);
  return lobby;
}
test("4人全員の準備完了で2対2を確定してから3秒後に開始する", () => {
  const l = four();
  for (let i = 0; i < 3; i++) l.ready(String(i), true, 1000);
  assert.equal(l.phase, "waiting");
  l.ready("3", true, 1000);
  assert.equal(l.phase, "countdown");
  assert.equal(l.players.filter(p => p.team === "Glitch").length, 2);
  assert.equal(l.players.filter(p => p.team === "Patch").length, 2);
  l.tick(3999); assert.equal(l.phase, "countdown");
  l.tick(4000); assert.equal(l.phase, "playing");
});
test("開始前切断は割り当てと準備完了を取り消し、ホストを引き継ぐ", () => {
  const l = four();
  l.players.forEach(p => l.ready(p.id, true, 1000));
  l.leave("0");
  assert.equal(l.phase, "waiting");
  assert.equal(l.host, "1");
  assert.ok(l.players.every(p => !p.ready && !p.team));
  l.join("4", "replacement");
  l.players.forEach(p => l.ready(p.id, true, 2000));
  assert.equal(l.startsAt, 5000);
});
test("3人以下、不正な入力、重複準備完了で試合を開始しない", () => {
  const l = four();
  l.leave("3");
  l.players.forEach(p => l.ready(p.id, true, 1000));
  l.ready("0", true, 1000);
  l.ready("missing", true, 1000);
  l.ready("1", "true", 1000);
  assert.equal(l.phase, "waiting");
  assert.throws(() => l.join("invalid", " "));
});

test("試合中の参加は観戦、全除去後にホストが再戦待機へ戻し観戦者を昇格", () => {
  const l=four();l.players.forEach(p=>l.ready(p.id,true,1000));l.tick(4000);
  l.join("watch","Viewer");assert.equal(l.spectators.length,1);assert.equal(l.players.length,4);
  l.ready("watch",true,5000);assert.equal(l.phase,"playing");
  l.leave("1",5000);l.match!.state.bugs.fill(0);l.tick(5050);assert.equal(l.phase,"result");
  l.rematch("watch");assert.equal(l.phase,"result");l.rematch(l.host);
  assert.equal(l.phase,"waiting");assert.equal(l.players.length,4);assert.equal(l.spectators.length,0);
  assert.ok(l.players.every(p=>!p.ready&&!p.team));
});
test("待機中のスキル選択は準備完了を解除し、不正スキルを無視",()=>{
  const l=four();l.ready("0",true,1000);l.selectSkill("0","Guard");assert.equal(l.players[0].ready,false);
  l.selectSkill("0","infinite");assert.equal(l.players[0].skill,"Guard");
});
test("1人のホストだけがCPU3人を追加でき、連打しても重複しない",()=>{
 const l=new Lobby(()=>.4);l.join("host","Solo");assert.equal(l.debugStart("other",1000),false);
 assert.equal(l.debugStart("host",1000),true);assert.equal(l.players.length,4);assert.equal(l.players.filter(p=>p.bot).length,3);
 assert.equal(l.debugStart("host",1001),false);assert.equal(l.players.length,4);assert.equal(l.phase,"countdown");
});
test("実参加者や観戦者がいる場合にデバッグ開始で置き換えない",()=>{
 const l=new Lobby();l.join("host","Solo");l.join("human","Other");assert.equal(l.debugStart("host",1000),false);assert.equal(l.players.length,2);
});
test("CPUは移動・設置・スキルを実行し、再戦待機後はホストだけの準備で再開できる",()=>{
 const l=new Lobby(()=>.4);l.join("host","Solo");l.debugStart("host",1000);
 for(let now=4000;now<=4500;now+=50)l.tick(now);
 assert.ok(l.match!.state.fighters.filter(p=>p.bot).every(p=>p.inputSequence>0));
 assert.ok(l.match!.state.events.some(e=>e.kind==="place"));assert.ok(l.match!.state.events.some(e=>e.kind==="skill"));
 l.match!.state.bugs.fill(0);l.tick(4550);assert.equal(l.phase,"result");l.rematch("host");
 assert.ok(l.players.filter(p=>p.bot).every(p=>p.ready));l.ready("host",true,5000);assert.equal(l.phase,"countdown");
});
test("CPUを外して通常待機に戻せる。ホスト役はCPUに引き継がない",()=>{
 const l=new Lobby();l.join("host","Solo");l.debugStart("host",1000);l.tick(4000);l.match!.state.bugs.fill(0);l.tick(4050);l.rematch("host");
 l.removeBots("other");assert.equal(l.players.length,4);l.removeBots("host");assert.equal(l.players.length,1);assert.equal(l.players[0].ready,false);
 const k=new Lobby();k.join("host","Solo");k.debugStart("host",1000);k.join("watch","Viewer");k.leave("host",2000);assert.equal(k.host,"watch");
});
test("デバッグ対戦はホストが途中終了でき、通常対戦では途中終了できない",()=>{
 const l=new Lobby();l.join("host","Solo");l.debugStart("host",1000);l.tick(4000);
 l.endDebug("other");assert.equal(l.phase,"playing");l.endDebug("host");assert.equal(l.phase,"waiting");assert.equal(l.players.length,1);assert.equal(l.match,null);
 const k=four();k.players.forEach(p=>k.ready(p.id,true,1000));k.tick(4000);k.endDebug(k.host);assert.equal(k.phase,"playing");
});