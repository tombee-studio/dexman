import { Client, type Room } from "@colyseus/sdk";
import assert from "node:assert/strict";

type Snapshot = {
  roomId: string;
  phase: string;
  host: string;
  players: { id: string; ready: boolean; team: string }[];
};
const endpoint = process.env.SERVER_URL ?? "http://127.0.0.1:2567";
const rooms: Room[] = [];
const states = new Map<string, Snapshot>();
async function waitFor(check: () => boolean, label: string) {
  const deadline = Date.now() + 12000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timeout: ${label}`);
    await new Promise(r => setTimeout(r, 40));
  }
}
function track(room: Room) {
  rooms.push(room);
  room.onMessage("snapshot", (state: Snapshot) => states.set(room.sessionId, state));
  room.send("snapshot");
  return room;
}
try {
  const response = await fetch(`${endpoint}/health`);
  assert.equal(response.status, 200);
  const first = track(await new Client(endpoint).create("dexman", { name: "Dex 1" }));
  for (let i = 2; i <= 4; i++) track(await new Client(endpoint).joinById(first.roomId, { name: `Dex ${i}` }));
  await waitFor(() => rooms.every(r => states.get(r.sessionId)?.players.length === 4), "4 clients joined");
  for (const room of rooms) room.send("ready", true);
  await waitFor(() => rooms.every(r => states.get(r.sessionId)?.phase === "countdown"), "team assignment");
  const assignment = states.get(first.sessionId)!.players;
  assert.equal(assignment.filter(p => p.team === "Glitch").length, 2);
  assert.equal(assignment.filter(p => p.team === "Patch").length, 2);
  for (const room of rooms) assert.deepEqual(states.get(room.sessionId)!.players, assignment);
  const removed = rooms.pop()!;
  await removed.leave();
  await waitFor(() => rooms.every(r => states.get(r.sessionId)?.phase === "waiting"), "countdown cancelled");
  assert.ok(states.get(first.sessionId)!.players.every(p => !p.ready && !p.team));
  track(await new Client(endpoint).joinById(first.roomId, { name: "Replacement" }));
  await waitFor(() => rooms.every(r => states.get(r.sessionId)?.players.length === 4), "replacement joined");
  // Wait beyond the ready-message rate limit before the next round.
  await new Promise(r => setTimeout(r, 200));
  for (const room of rooms) room.send("ready", true);
  await waitFor(() => rooms.every(r => states.get(r.sessionId)?.phase === "playing"), "3 second countdown");
  console.log("PASS: health, four clients, identical 2v2 teams, cancel on disconnect, replacement, countdown.");
} finally {
  await Promise.allSettled(rooms.map(r => r.leave()));
}
