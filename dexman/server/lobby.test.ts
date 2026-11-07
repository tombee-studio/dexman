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
