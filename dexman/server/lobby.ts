import { Match, VECTORS, RULES, cell, type Direction, type Skill, type Roster } from "./game.js";
export type Team = "Glitch" | "Patch" | "";
export type Player = { id: string; name: string; ready: boolean; team: Team; skill: Skill; bot?: boolean };
export class Lobby {
  players: Player[] = [];
  spectators: Player[] = [];
  phase: "waiting" | "countdown" | "playing" | "result" = "waiting";
  startsAt = 0;
  host = "";
  match: Match | null = null;
  private botActions=new Map<string,number>();
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
    this.botActions.clear();
    this.phase = "countdown"; this.startsAt = now+3000;
    this.match = new Match(this.players as Roster[],this.startsAt,this.random);
  }
  leave(id: string, now = Date.now()) {
    this.match?.disconnect(id,now);
    this.players = this.players.filter(p => p.id !== id); this.spectators = this.spectators.filter(p => p.id !== id);
    if (this.host === id) this.host = this.players.find(p=>!p.bot)?.id ?? this.spectators[0]?.id ?? "";
    if (this.phase === "countdown") this.reset();
    else if (this.phase === "waiting") this.promote();
  }
  private promote() { while (this.players.length < 4 && this.spectators.length) this.players.push(this.spectators.shift()!); }
  private reset() {
    this.phase = "waiting"; this.startsAt = 0; this.match = null; this.promote();
    this.players.forEach(p => { p.ready = !!p.bot; p.team = ""; });
  }
  rematch(id: string) { if (id === this.host && this.phase === "result") this.reset(); }
  tick(now: number) {
    if (this.phase === "countdown" && now >= this.startsAt) this.phase = "playing";
    if (this.phase === "playing") { this.runBots(now); this.match?.step(now); if (this.match?.state.winner) this.phase = "result"; }
  }
  debugStart(id:string,now:number) {
    if(this.phase!=="waiting"||id!==this.host||this.players.length!==1||this.spectators.length)return false;
    const skills:Skill[]=["Dash","Guard","Push"];
    for(let i=0;i<3;i++)this.players.push({id:`cpu-${i+1}`,name:`CPU ${i+1}`,ready:true,team:"",skill:skills[i],bot:true});
    this.ready(id,true,now);return this.phase as string === "countdown";
  }
  removeBots(id:string) {
    if(id!==this.host||this.phase!=="waiting")return;
    this.players=this.players.filter(p=>!p.bot);this.promote();this.botActions.clear();
    this.players.forEach(p=>{p.ready=false;p.team="";});
  }
  endDebug(id:string){if(id!==this.host||!this.players.some(p=>p.bot))return;this.reset();this.removeBots(id);}
  private runBots(now:number) {
    const match=this.match;if(!match)return;
    for(const p of match.state.fighters){
      if(!p.bot||!p.connected)continue;
      let direction=p.direction;
      if(!p.moving){
        const choices=(Object.keys(VECTORS) as Direction[]).filter(d=>{
          const [dx,dy]=VECTORS[d],x=Math.round(p.x)+dx,y=Math.round(p.y)+dy;
          return x>0&&x<RULES.width&&y>0&&y<RULES.height&&match.state.tiles[cell(x,y)]===0&&!match.state.cubes.some(c=>c.x===x&&c.y===y);
        });
        if(choices.length)direction=choices[Math.floor(this.random()*choices.length)];
      }
      match.input(p.id,direction,now);
      if(now>=(this.botActions.get(p.id)??0)){
        match.place(p.id,now);
        if(now>=p.skillReadyAt&&now>=p.stunnedUntil)match.skill(p.id,now);
        this.botActions.set(p.id,now+1500+Math.floor(this.random()*1000));
      }
    }
  }
  snapshot(roomId: string, now: number) {
    return { protocol: 3, roomId, players: this.players, spectators: this.spectators, phase: this.phase, host: this.host, startsAt: this.startsAt, serverNow: now, game: this.match?.state ?? null };
  }
}