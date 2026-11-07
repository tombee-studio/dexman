import { Server, Room, type Client } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Lobby } from "./lobby.js";
import type { ServerResponse } from "node:http";
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
class DexRoom extends Room {
  maxClients = 8;
  lobby = new Lobby();
  limits = new Map<string, { at: number; count: number }>();
  onCreate() {
    this.onMessage("ready", (c,v: unknown) => { if (this.allowed(c)) { this.lobby.ready(c.sessionId,v,Date.now()); this.publish(); } });
    this.onMessage("selectSkill", (c,v: unknown) => { if (this.allowed(c)) { this.lobby.selectSkill(c.sessionId,v); this.publish(); } });
    this.onMessage("input", (c,v: unknown) => { if (this.allowed(c) && this.lobby.phase === "playing") this.lobby.match?.input(c.sessionId,v,Date.now()); });
    this.onMessage("place", c => { if (this.allowed(c) && this.lobby.phase === "playing") this.lobby.match?.place(c.sessionId,Date.now()); });
    this.onMessage("skill", c => {
      if (!this.allowed(c) || this.lobby.phase !== "playing") return;
      const result = this.lobby.match?.skill(c.sessionId,Date.now());
      if (result && !result.ok) c.send("notice",result.message);
    });
    this.onMessage("rematch", c => { if (this.allowed(c)) { this.lobby.rematch(c.sessionId); this.publish(); } });
    this.onMessage("snapshot", c => { if (this.allowed(c)) c.send("snapshot",this.lobby.snapshot(this.roomId,Date.now())); });
    let tick = 0;
    this.setSimulationInterval(() => {
      const before = this.lobby.phase;
      this.lobby.tick(Date.now());
      if ((++tick%2 === 0 && ["playing","countdown"].includes(this.lobby.phase)) || before !== this.lobby.phase) this.publish();
      this.flushEvents();
    },50);
  }
  allowed(c: Client) {
    const now = Date.now(); let rate = this.limits.get(c.sessionId);
    if (!rate || now-rate.at >= 1000) { rate = { at: now, count: 0 }; this.limits.set(c.sessionId,rate); }
    return ++rate.count <= 30;
  }
  onAuth(_c: Client, options: { name?: unknown }) {
    if (typeof options.name !== "string" || !options.name.trim() || options.name.trim().length > 20) throw new Error("名前は1〜20文字で入力してください。");
    return true;
  }
  onJoin(c: Client, options: { name?: unknown }) {
    try { this.lobby.join(c.sessionId,options.name); }
    catch (error) { c.leave(4000,(error as Error).message); return; }
    this.publish();
  }
  onLeave(c: Client) { this.limits.delete(c.sessionId); this.lobby.leave(c.sessionId); this.publish(); this.flushEvents(); }
  flushEvents() { for (const event of this.lobby.match?.takeEvents() ?? []) this.broadcast("event",{ ...event, matchId: this.lobby.match?.state.matchId }); }
  publish() { const snapshot = this.lobby.snapshot(this.roomId,Date.now()); this.broadcast("snapshot",{ ...snapshot, game: snapshot.game ? { ...snapshot.game, events: [] } : null }); }
}
const frontendRoot=fileURLToPath(new URL("../web/dist/",import.meta.url));
const frontendIndex=fileURLToPath(new URL("../web/dist/index.html",import.meta.url));
const server = new Server({
 transport:new WebSocketTransport({pingInterval:2000,pingMaxRetries:2,maxPayload:4096}),
 express:app=>{
  app.get("/health",(_req:unknown,res:ServerResponse)=>{
   res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json");
   res.end(JSON.stringify({ok:true,service:"dexman",stage:"game",protocol:2,frontend:existsSync(frontendIndex)}));
  });
  app.use("/assets",express.static(fileURLToPath(new URL("../web/dist/assets/",import.meta.url)),{immutable:true,maxAge:"1y"}));
  app.use(express.static(frontendRoot,{index:"index.html",maxAge:0}));
  app.get("/",(_req:unknown,res:ServerResponse)=>{res.statusCode=503;res.setHeader("Content-Type","text/plain; charset=utf-8");res.end("ゲーム画面を準備中です。しばらくしてから再度アクセスしてください。");});
 },
});
server.define("dexman",DexRoom);
await server.listen(Number(process.env.PORT??2567),"0.0.0.0");
console.log("Dexman game listening on port",process.env.PORT??2567);
console.log(existsSync(frontendIndex)?"Frontend ready at /":"Frontend missing: set Render Root Directory to dexman and build both server and web.");