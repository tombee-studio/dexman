import { Match, type Skill, type Roster } from "./game.js";
export type Team = "Glitch" | "Patch" | "";
export type Player = { id: string; name: string; ready: boolean; team: Team; skill: Skill };
export class Lobby {
  players: Player[] = [];
  spectators: Player[] = [];
  phase: "waiting" | "countdown" | "playing" | "result" = "waiting";
  startsAt = 0;
  host = "";
  match: Match | null = null;
  constructor(private random: () => number = Math.random) {}
  join(id: string, name: unknown) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 20) throw new Error("名前は1〜20文字で入力してください。");
    const player: Player = { id, name: name.trim(), ready: false, team: "", skill: "Dash" };
    if (this.phase === "waiting" && this.players.length < 4) this.players.push(player);
    else { if (this.spectators.length >= 4) throw new Error("観戦枠が満員です。"); this.spectators.push(player); }
    this.host ||= id;
  }
  selectSkill(id: string, skill: unknown) {
    if (this.phase !== "waiting" || !["Dash","Guard","Push"].includes(String(skill))) return;
    const p = this.players.find(p => p.id === id); if (p) { p.skill = skill as Skill; p.ready = false; }
  }
  ready(id: string, value: unknown, now: number) {
    if (this.phase !== "waiting" || typeof value !== "boolean") return;
    const player = this.players.find(p => p.id === id); if (!player) return;
    player.ready = value;
    if (this.players.length !== 4 || !this.players.every(p => p.ready)) return;
    const shuffled = [...this.players];
    for (let i=shuffled.length-1;i>0;i--) { const j = Math.floor(this.random()*(i+1)); [shuffled[i],shuffled[j]] = [shuffled[j],shuffled[i]]; }
    shuffled.forEach((p,i) => { p.team = i < 2 ? "Glitch" : "Patch"; });
    this.phase = "countdown"; this.startsAt = now+3000;
    this.match = new Match(this.players as Roster[],this.startsAt,this.random);
  }
  leave(id: string, now = Date.now()) {
    this.match?.disconnect(id,now);
    this.players = this.players.filter(p => p.id !== id); this.spectators = this.spectators.filter(p => p.id !== id);
    if (this.host === id) this.host = this.players[0]?.id ?? this.spectators[0]?.id ?? "";
    if (this.phase === "countdown") this.reset();
    else if (this.phase === "waiting") this.promote();
  }
  private promote() { while (this.players.length < 4 && this.spectators.length) this.players.push(this.spectators.shift()!); }
  private reset() {
    this.phase = "waiting"; this.startsAt = 0; this.match = null; this.promote();
    this.players.forEach(p => { p.ready = false; p.team = ""; });
  }
  rematch(id: string) { if (id === this.host && this.phase === "result") this.reset(); }
  tick(now: number) {
    if (this.phase === "countdown" && now >= this.startsAt) this.phase = "playing";
    if (this.phase === "playing") { this.match?.step(now); if (this.match?.state.winner) this.phase = "result"; }
  }
  snapshot(roomId: string, now: number) {
    return { protocol: 2, roomId, players: this.players, spectators: this.spectators, phase: this.phase, host: this.host, startsAt: this.startsAt, serverNow: now, game: this.match?.state ?? null };
  }
}