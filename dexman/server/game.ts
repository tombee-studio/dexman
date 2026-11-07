import { advanceMovement, resetMovement } from "../shared/movement.js";
export type Team = "Glitch" | "Patch";
export type Skill = "Dash" | "Guard" | "Push";
export type Direction = "up" | "down" | "left" | "right";
export const RULES = { version: "dexman-2", width: 13, height: 11, duration: 180000, moveMs: 250, fuseMs: 2000, flameMs: 500, stunMs: 1000, immunityMs: 2000, holdMs: 5000, target: 0.6, timeoutTarget: 0.3, dropChance: 0.3, maxPower: 5, skillMs: { Dash: 8000, Guard: 15000, Push: 10000 } };
export const VECTORS: Record<Direction, [number, number]> = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] };
export type Roster = { id: string; name: string; team: Team; skill: Skill; bot?: boolean };
export type Fighter = Roster & { x: number; y: number; slot: number; direction: Direction; connected: boolean; stunnedUntil: number; immuneUntil: number; guardUntil: number; skillReadyAt: number; capacity: number; range: number; targetX: number; targetY: number; moving: boolean; inputSequence: number; inputDirection: Direction | null };
export type Cube = { id: number; owner: string; team: Team; x: number; y: number; placedAt: number; explodeAt: number; range: number };
export type Blast = { id: number; team: Team; cells: number[]; expiresAt: number };
export type GameEvent = { id: number; at: number; playerId: string; team: Team | ""; kind: string; text: string };
export type MatchState = { version: string; matchId: string; width: number; height: number; tiles: number[]; bugs: number[]; items: Record<number, "capacity" | "range">; fighters: Fighter[]; cubes: Cube[]; blasts: Blast[]; events: GameEvent[]; startedAt: number; endsAt: number; holdSince: number | null; bugCount: number; totalFloor: number; winner: Team | ""; reason: string; finishedAt: number };
export type SkillResult = { ok: boolean; message?: string };
export const cell = (x: number, y: number) => Math.round(y) * RULES.width + Math.round(x);
const starts: [number, number][] = [[1,1],[11,9],[11,1],[1,9]];

export class Match {
  state: MatchState;
  pending: GameEvent[] = [];
  private lastStep = 0;
  private lastInput = new Map<string, number>();
  private queuedTaps = new Map<string, Direction>();
  private ignored = new Map<string, Set<number>>();
  private sequence = 0;
  private cubeSequence = 0;
  private blastSequence = 0;
  constructor(roster: Roster[], now: number, private random = Math.random) {
    this.lastStep = now;
    const duration = roster.some(p=>p.bot) ? 15000 : RULES.duration;
    const tiles = Array<number>(RULES.width * RULES.height).fill(0);
    for (let y = 0; y < RULES.height; y++) for (let x = 0; x < RULES.width; x++) {
      const index = cell(x,y), a = Math.min(x,12-x), b = Math.min(y,10-y);
      if (x === 0 || y === 0 || x === 12 || y === 10 || (x % 2 === 0 && y % 2 === 0)) tiles[index] = 1;
      else if (!starts.some(([sx,sy]) => Math.abs(x-sx) + Math.abs(y-sy) <= 1) && (a*3+b*5)%7 < 3) tiles[index] = 2;
    }
    const free = tiles.map((t,i) => t === 0 ? i : -1).filter(i => i >= 0);
    const bugs = tiles.map(() => 0);
    const orbitKeys = [...new Set(free.map(i => cell(Math.min(i%13,12-i%13),Math.min(Math.floor(i/13),10-Math.floor(i/13)))))].sort((a,b) => (a*37%101)-(b*37%101));
    let seeded = 0;
    for (const key of orbitKeys) {
      if (seeded >= free.length*0.2) break;
      const a = key%13, b = Math.floor(key/13);
      for (const index of new Set([cell(a,b),cell(12-a,b),cell(a,10-b),cell(12-a,10-b)])) if (tiles[index] === 0) { bugs[index] = 1; seeded++; }
    }
    this.state = { version: RULES.version, matchId: `${now}`, width: 13, height: 11, tiles, bugs, items: {}, fighters: roster.map((p,i) => ({ ...p, x: starts[i][0], y: starts[i][1], slot: i, direction: i%2 ? "left" : "right", connected: true, stunnedUntil: 0, immuneUntil: 0, guardUntil: 0, skillReadyAt: 0, capacity: 1, range: 2, targetX: starts[i][0], targetY: starts[i][1], moving: false, inputSequence: 0, inputDirection: null })), cubes: [], blasts: [], events: [], startedAt: now, endsAt: now+duration, holdSince: null, bugCount: seeded, totalFloor: tiles.filter(t => t !== 1).length, winner: "", reason: "", finishedAt: 0 };
    this.emit(null, now, "start", `run match --teams=Glitch,Patch --duration=${duration/1000}s`);
  }
  private emit(p: Fighter | null, now: number, kind: string, text: string) {
    const event: GameEvent = { id: ++this.sequence, at: now, playerId: p?.id ?? "", team: p?.team ?? "", kind, text };
    this.state.events.push(event); this.state.events = this.state.events.slice(-50); this.pending.push(event);
  }
  takeEvents() { const events = this.pending; this.pending = []; return events; }
  private fighter(id: string) { return this.state.fighters.find(p => p.id === id && p.connected); }
  private canAct(p: Fighter | undefined, now: number): p is Fighter { return !!p && !this.state.winner && now >= this.state.startedAt && now < this.state.endsAt && now >= p.stunnedUntil; }
  input(id: string, payload: unknown, now: number) {
    const p=this.fighter(id);if(!p)return;
    const packet=payload!==null&&typeof payload==="object" ? payload as {direction?:unknown;sequence?:unknown} : null;
    const direction=packet?packet.direction:payload;
    if(direction!==null&&(typeof direction!=="string"||!Object.hasOwn(VECTORS,direction)))return;
    const sequence=packet?packet.sequence:p.inputSequence+1;
    if(typeof sequence!=="number"||!Number.isSafeInteger(sequence)||sequence<=p.inputSequence)return;
    if(direction!==null&&p.inputDirection===null&&!p.moving&&this.canAct(p,now))this.queuedTaps.set(id,direction as Direction);
    p.inputSequence=sequence;p.inputDirection=direction as Direction|null;this.lastInput.set(id,now);
  }
  disconnect(id: string, now: number) {
    const p = this.fighter(id); if (!p) return;
    p.connected = false; p.inputDirection = null; p.moving = false; this.queuedTaps.delete(id); this.emit(p,now,"disconnect","connection lost --spectate-on-rejoin");
  }
  private open(x: number, y: number) {
    return x >= 0 && y >= 0 && x < 13 && y < 11 && this.state.tiles[cell(x,y)] === 0 && !this.state.cubes.some(b => b.x === x && b.y === y);
  }
  private collect(p: Fighter, now: number) {
    const index = cell(p.x,p.y), item = this.state.items[index];
    if (!item) return;
    if (item === "capacity") p.capacity = Math.min(RULES.maxPower,p.capacity+1); else p.range = Math.min(RULES.maxPower,p.range+1);
    delete this.state.items[index]; this.emit(p,now,"item",`upgrade --${item}=${item === "capacity" ? p.capacity : p.range}`);
  }
  place(id: string, now: number) {
    const p = this.fighter(id);
    if (!this.canAct(p,now) || this.state.cubes.filter(b => b.owner === id).length >= p.capacity || this.state.cubes.some(b => b.x === Math.round(p.x) && b.y === Math.round(p.y))) return false;
    this.state.cubes.push({ id: ++this.cubeSequence, owner: id, team: p.team, x: Math.round(p.x), y: Math.round(p.y), placedAt: now, explodeAt: now+RULES.fuseMs, range: p.range });
    this.emit(p,now,"place",p.team === "Glitch" ? "deploy bug_cube --fuse=2s" : "run debug --scope=cross --fuse=2s"); return true;
  }
  skill(id: string, now: number): SkillResult {
    const p = this.fighter(id);
    if (!this.canAct(p,now)) return { ok: false, message: "Action unavailable while stunned or spectating." };
    if (p.skillReadyAt > now) return { ok: false, message: `Cooldown active. Retry in ${Math.ceil((p.skillReadyAt-now)/1000)}s.` };
    const [dx,dy] = VECTORS[p.direction];
    if (p.skill === "Dash") {
      resetMovement(p);
      this.emit(p,now,"skill","run dash --distance=2");
      let moved = 0;
      for (let i=0;i<2;i++) {
        if (!this.open(p.x+dx,p.y+dy)) break;
        p.x += dx; p.y += dy; moved++; this.collect(p,now); this.hit(p,now);
        if (p.stunnedUntil > now) break;
      }
      p.targetX=p.x;p.targetY=p.y;
      this.emit(p,now,"skill-result",`Dash completed: ${moved} cells.`);
    } else if (p.skill === "Guard") {
      p.guardUntil = now+1000; this.emit(p,now,"skill","enable guard --duration=1s");
    } else {
      this.emit(p,now,"skill","push cube --distance=3");
      const cube = this.state.cubes.find(b => b.x === Math.round(p.x)+dx && b.y === Math.round(p.y)+dy);
      let moved = 0;
      if (cube) for (let i=0;i<3;i++) { if (!this.open(cube.x+dx,cube.y+dy)) break; cube.x += dx; cube.y += dy; moved++; }
      this.emit(p,now,"skill-result",moved ? `Cube transferred: ${moved} cells.` : "No movable cube. Push skipped.");
    }
    p.skillReadyAt = now+RULES.skillMs[p.skill]; return { ok: true };
  }
  private hit(p: Fighter, now: number) {
    if (!p.connected || p.immuneUntil > now) return;
    let ignored = this.ignored.get(p.id); if (!ignored) { ignored = new Set(); this.ignored.set(p.id,ignored); }
    for (const blast of this.state.blasts) {
      if (blast.team === p.team || blast.expiresAt <= now || !blast.cells.includes(cell(p.x,p.y)) || ignored.has(blast.id)) continue;
      if (p.guardUntil > now) { p.guardUntil = 0; ignored.add(blast.id); this.emit(p,now,"guard","Incoming blast blocked."); continue; }
      p.stunnedUntil = now+RULES.stunMs; p.immuneUntil = p.stunnedUntil+RULES.immunityMs;
      this.emit(p,now,"stun","process interrupted --stun=1s --recovery=2s"); break;
    }
    // Keep protection records bounded to the blasts still on screen.
    for (const id of ignored) if (!this.state.blasts.some(b => b.id === id)) ignored.delete(id);
  }
  private explode(cube: Cube, now: number) {
    this.state.cubes = this.state.cubes.filter(b => b.id !== cube.id);
    const cells = [cell(cube.x,cube.y)];
    for (const [dx,dy] of Object.values(VECTORS)) for (let d=1;d<=cube.range;d++) {
      const x = cube.x+dx*d, y = cube.y+dy*d;
      if (x<0 || x>=13 || y<0 || y>=11) break;
      const index = cell(x,y), tile = this.state.tiles[index]; if (tile === 1) break;
      cells.push(index);
      const other = this.state.cubes.find(b => b.x === x && b.y === y);
      if (other) { other.explodeAt = Math.min(other.explodeAt,now); break; }
      if (tile === 2) {
        this.state.tiles[index] = 0;
        if (this.random() < RULES.dropChance) this.state.items[index] = this.random() < 0.5 ? "capacity" : "range";
        break;
      }
    }
    let changed = 0;
    for (const index of cells) {
      const next = cube.team === "Glitch" ? 1 : 0;
      if (this.state.bugs[index] !== next) { this.state.bugs[index] = next; changed++; }
    }
    this.state.blasts.push({ id: ++this.blastSequence, team: cube.team, cells, expiresAt: now+RULES.flameMs });
    const owner = this.state.fighters.find(p => p.id === cube.owner) ?? null;
    this.emit(owner,now,"explode",`Bugs ${cube.team === "Glitch" ? "added" : "removed"}: ${changed} cells.`);
  }
  step(now: number) {
    if (this.state.winner || now < this.state.startedAt) return;
    now = Math.min(now,this.state.endsAt);
    const elapsed=Math.max(0,Math.min(100,now-this.lastStep));this.lastStep=now;
    this.state.blasts = this.state.blasts.filter(b => b.expiresAt > now);
    for (const p of this.state.fighters) {
      this.hit(p,now);
      if(now-(this.lastInput.get(p.id)??0)>500)p.inputDirection=null;
      if(this.canAct(p,now)&&elapsed>0){
        advanceMovement(p,p.inputDirection??this.queuedTaps.get(p.id)??null,elapsed,this.state,RULES.moveMs,()=>{
          this.collect(p,now);this.hit(p,now);return now>=p.stunnedUntil;
        });
        this.queuedTaps.delete(p.id);
      }
    }
    for (const cube of this.state.cubes) if (this.state.blasts.some(b => b.expiresAt > now && b.cells.includes(cell(cube.x,cube.y)))) cube.explodeAt = Math.min(cube.explodeAt,now);
    let due: Cube | undefined;
    while ((due = this.state.cubes.filter(b => b.explodeAt <= now).sort((a,b) => a.explodeAt-b.explodeAt || a.id-b.id)[0])) this.explode(due,now);
    for (const p of this.state.fighters) this.hit(p,now);
    this.evaluate(now);
  }
  evaluate(now: number) {
    if (this.state.winner) return;
    const s = this.state; s.bugCount = s.bugs.reduce((a,b) => a+b,0);
    const ratio = s.bugCount/s.totalFloor;
    if (s.bugCount === 0) this.finish("Patch","すべてのバグを除去",now);
    else if (ratio >= RULES.target) {
      s.holdSince ??= now;
      if (now-s.holdSince >= RULES.holdMs) this.finish("Glitch","バグ占有率60%以上を5秒維持",now);
    } else s.holdSince = null;
    if (!s.winner && now >= s.endsAt) this.finish(ratio >= RULES.timeoutTarget ? "Glitch" : "Patch","時間切れ：占有率30%で判定",now);
  }
  private finish(team: Team, reason: string, now: number) {
    this.state.winner = team; this.state.reason = reason; this.state.finishedAt = now;
    this.emit(null,now,"finish",`BUILD COMPLETE. winner=${team}`);
  }
}