import { Server, Room, type Client } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Lobby } from "./lobby.js";

class DexRoom extends Room {
  maxClients = 4;
  lobby = new Lobby();
  lastReady = new Map<string, number>();
  onCreate() {
    this.onMessage("ready", (client, value: unknown) => {
      const now = Date.now();
      if (now - (this.lastReady.get(client.sessionId) ?? 0) < 150) return;
      this.lastReady.set(client.sessionId, now);
      const before = this.lobby.phase;
      this.lobby.ready(client.sessionId, value, now);
      if (before !== this.lobby.phase) this.lock();
      this.publish();
    });
    this.onMessage("snapshot", client => client.send("snapshot", this.lobby.snapshot(this.roomId, Date.now())));
    this.setSimulationInterval(() => { this.lobby.tick(Date.now()); this.publish(); }, 100);
  }
  onJoin(client: Client, options: { name?: unknown }) {
    try { this.lobby.join(client.sessionId, options.name); }
    catch (error) { client.leave(4000, (error as Error).message); return; }
    this.publish();
  }
  onLeave(client: Client) {
    this.lastReady.delete(client.sessionId);
    this.lobby.leave(client.sessionId);
    if (this.lobby.phase === "waiting") this.unlock();
    this.publish();
  }
  publish() { this.broadcast("snapshot", this.lobby.snapshot(this.roomId, Date.now())); }
}

const server = new Server({
  transport: new WebSocketTransport({ pingInterval: 2000, pingMaxRetries: 2 }),
  express: app => {
    app.get("/health", (_req, res) => res.json({ ok: true, service: "dexman-lobby", stage: "connection-test" }));
  },
});
server.define("dexman", DexRoom);
await server.listen(Number(process.env.PORT ?? 2567), "0.0.0.0");
console.log("Dexman lobby listening on port", process.env.PORT ?? 2567);
