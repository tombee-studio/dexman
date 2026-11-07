export type Team = "Glitch" | "Patch" | "";
export type Player = { id: string; name: string; ready: boolean; team: Team };
export class Lobby {
  players: Player[] = [];
  phase: "waiting" | "countdown" | "playing" = "waiting";
  startsAt = 0;
  host = "";
  constructor(private random: () => number = Math.random) {}
  join(id: string, name: unknown) {
    if (this.players.length >= 4 || this.phase !== "waiting") throw new Error("参加できる待機枠がありません。");
    if (typeof name !== "string" || !name.trim() || name.trim().length > 20) throw new Error("名前は1〜20文字で入力してください。");
    this.players.push({ id, name: name.trim(), ready: false, team: "" });
    this.host ||= id;
  }
  ready(id: string, value: unknown, now: number) {
    if (this.phase !== "waiting" || typeof value !== "boolean") return;
    const player = this.players.find(p => p.id === id);
    if (!player) return;
    player.ready = value;
    if (this.players.length !== 4 || !this.players.every(p => p.ready)) return;
    const shuffled = [...this.players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((p, i) => { p.team = i < 2 ? "Glitch" : "Patch"; });
    this.phase = "countdown";
    this.startsAt = now + 3000;
  }
  leave(id: string) {
    this.players = this.players.filter(p => p.id !== id);
    if (this.host === id) this.host = this.players[0]?.id ?? "";
    if (this.phase === "countdown") {
      this.phase = "waiting";
      this.startsAt = 0;
      this.players.forEach(p => { p.ready = false; p.team = ""; });
    }
  }
  tick(now: number) {
    if (this.phase === "countdown" && now >= this.startsAt) this.phase = "playing";
  }
  snapshot(roomId: string, now: number) {
    return { roomId, players: this.players, phase: this.phase, host: this.host, startsAt: this.startsAt, serverNow: now };
  }
}
