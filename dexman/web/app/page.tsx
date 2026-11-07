"use client";

import { useEffect, useRef, useState } from "react";
import { Client, type Room } from "@colyseus/sdk";
import "./lobby.css";
import Arena from "./Arena";
import type { MatchState, GameEvent, Skill } from "../lib/game-protocol";

type Player = { id: string; name: string; ready: boolean; team: "Glitch" | "Patch" | ""; skill: Skill; bot?: boolean };
type Snapshot = { roomId: string; protocol: number; spectators: Player[]; game: MatchState | null; phase: "waiting" | "countdown" | "playing" | "result"; host: string; players: Player[]; startsAt: number; serverNow: number };
type Log = { id: number; time: string; text: string };
const ENDPOINT = import.meta.env.VITE_GAME_SERVER || window.location.origin;
const TEAM_ROLE = { Glitch: "バグを作る", Patch: "バグを消す" };

export default function Home() {
  const [name, setName] = useState("");
  const [mounted,setMounted]=useState(false);
  const [code, setCode] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [self, setSelf] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [logs, setLogs] = useState<Log[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const roomRef = useRef<Room | null>(null);
  const attempt = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const previous = useRef<Snapshot | null>(null);
  const logSequence = useRef(0);
  const logEnd = useRef<HTMLDivElement>(null);
  const readyPending = useRef(false);
  const [pending, setPending] = useState(false);
  const [latestEvent,setLatestEvent] = useState<(GameEvent & { matchId: string }) | null>(null);
  const seenEvents = useRef(new Set<string>());
  const lastPacket = useRef(Date.now());
  const clockTimer=useRef<ReturnType<typeof setInterval>|null>(null);
  const syncedOffset=useRef<number|null>(null);
  const bestRtt=useRef(Infinity);
  function stopClock(){if(clockTimer.current)clearInterval(clockTimer.current);clockTimer.current=null;}
  function send(type: string,value?: unknown) { roomRef.current?.send(type,value); }
  function ingest(event: GameEvent, matchId: string, startedAt: number) {
    const key = `${matchId}:${event.id}`;
    if (seenEvents.current.has(key)) return;
    seenEvents.current.add(key);
    if (seenEvents.current.size > 200) seenEvents.current.delete(seenEvents.current.values().next().value!);
    const elapsed = Math.max(0,Math.floor((event.at-startedAt)/1000));
    const actor = previous.current?.game?.fighters.find(p=>p.id===event.playerId);
    const tag = actor ? `P${actor.slot+1} ${actor.name} [${event.team}]` : event.team;
    setLogs(items=>[...items,{id:++logSequence.current,time:`${String(Math.floor(elapsed/60)).padStart(2,"0")}:${String(elapsed%60).padStart(2,"0")}`,text:`${tag ? tag+" > " : ""}${event.text}`}].slice(-50));
  }

  function log(text: string) {
    const id = ++logSequence.current;
    const time = new Date().toLocaleTimeString("ja-JP", { hour12: false });
    setLogs(items => [...items, { id, time, text }].slice(-50));
  }
  useEffect(() => {
    setCode(new URLSearchParams(window.location.search).get("room") ?? "");
    try { setName(localStorage.getItem("dexman.name") ?? ""); } catch {}
    setMounted(true);
    const interval = window.setInterval(() => setClock(Date.now()), 100);
    return () => { stopClock(); clearInterval(interval); attempt.current++; controller.current?.abort(); void roomRef.current?.leave(); };
  }, []);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: "nearest" }); }, [logs, showLogs]);

  function receive(state: Snapshot) {
    lastPacket.current = Date.now();
    const old = previous.current;
    if (!old) log(`connected room=${state.roomId}`);
    const oldIds = new Set(old?.players.map(p => p.id) ?? []);
    const newIds = new Set(state.players.map(p => p.id));
    state.players.filter(p => !oldIds.has(p.id)).forEach(p => log(`join ${p.name}`));
    old?.players.filter(p => !newIds.has(p.id)).forEach(p => log(`leave ${p.name}`));
    state.players.forEach(p => {
      const before = old?.players.find(v => v.id === p.id);
      if (before && before.ready !== p.ready) log(`${p.name} ${p.ready ? "ready" : "not_ready"}`);
    });
    if (old?.phase !== state.phase) {
      if (state.phase === "countdown") {
        log("assign --teams=Glitch,Patch --size=2");
        log("countdown --seconds=3");
      }
      if (state.phase === "playing") log("run match --controls=WASD,Space,Shift");
      if (old?.phase === "countdown" && state.phase === "waiting") log("countdown cancelled. waiting for 4 ready players.");
    }
    previous.current = state;
    for(const event of state.game?.events ?? []) ingest(event,state.game!.matchId,state.game!.startedAt);
    if(syncedOffset.current===null)setOffset(state.serverNow-Date.now());
    setSnapshot(state);
    readyPending.current = false;
    setPending(false);
  }

  async function connect(mode: "create" | "join") {
    if (busy || roomRef.current) return;
    if (!name.trim()) { setError("プレイヤー名を入力してください。"); return; }
    if (mode === "join" && !code.trim()) { setError("ルームコードを入力してください。"); return; }
    const current = ++attempt.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setError(""); setMessage("サーバーに接続しています…");
    previous.current = null;
    let joined: Room | undefined;
    try {
      try { localStorage.setItem("dexman.name", name.trim()); } catch {}
      // Wake Render before creating a room, so a timeout cannot create duplicate rooms.
      const deadline = Date.now() + 95000;
      let healthy = false;
      while (Date.now() < deadline) {
        if (abort.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        try {
          const response = await fetch(`${ENDPOINT}/health`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(12000)]), cache: "no-store" });
          if(response.ok) {
            const health = await response.json() as {ok?:boolean;protocol?:number};
            if(health.ok && health.protocol===3) { healthy=true;break; }
          }
        } catch (e) { if (abort.signal.aborted) throw e; }
        if (current !== attempt.current) return;
        setMessage("サーバーの起動を待っています。最大約1分かかる場合があります…");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (!healthy) throw new Error("サーバーに接続できませんでした。少し待って再試行してください。");
      if (current !== attempt.current) return;
      const client = new Client(ENDPOINT);
      joined = mode === "create"
        ? await client.create("dexman", { name: name.trim() })
        : await client.joinById(code.trim(), { name: name.trim() });
      if (current !== attempt.current) { await joined.leave(); return; }
      const room = joined;
      roomRef.current = room;
      setSelf(room.sessionId); setCode(room.roomId);
      setLogs([]); seenEvents.current.clear(); log("session established. awaiting snapshot.");
      room.onMessage("snapshot", receive);
      syncedOffset.current=null;bestRtt.current=Infinity;stopClock();
      room.onMessage("pong",(reply:{sentAt:number;serverNow:number})=>{
        const received=Date.now(),rtt=received-reply.sentAt;
        if(!Number.isFinite(rtt)||rtt<0||rtt>3000)return;
        bestRtt.current=Math.min(bestRtt.current,rtt);
        if(rtt>bestRtt.current*1.5+20)return;
        const measured=reply.serverNow-(reply.sentAt+received)/2;
        const next=syncedOffset.current===null?measured:syncedOffset.current*.8+measured*.2;
        syncedOffset.current=next;setOffset(next);
      });
      clockTimer.current=setInterval(()=>{if(roomRef.current===room)room.send("ping",Date.now());},2000);
      room.send("ping",Date.now());
      room.onMessage("event", (event: GameEvent & {matchId:string})=>{
        ingest(event,event.matchId,previous.current?.game?.startedAt ?? event.at);
        setLatestEvent(event);
      });
      room.onMessage("notice",(text:string)=>log(`! ${text}`));
      room.onError((_code, detail) => setError(detail || "通信エラーが発生しました。"));
      room.onLeave(() => {
        if (roomRef.current !== room) return;
        stopClock(); roomRef.current = null; previous.current = null;
        setSnapshot(null); setSelf(""); setPending(false);
        setError("接続が切れました。ルームが残っている場合はコードで再参加してください。");
        log("connection closed.");
      });
      room.send("snapshot");
      const url = new URL(window.location.href); url.searchParams.set("room", room.roomId);
      window.history.replaceState({}, "", url);
      setMessage("");
    } catch (e) {
      if (current !== attempt.current) return;
      if (joined && roomRef.current !== joined) void joined.leave();
      const raw = e instanceof Error ? e.message : "接続に失敗しました。";
      setError(/not found|locked|full|seat|expired/i.test(raw) ? "ルームが見つからないか、満員・開始済みです。コードを確認してください。" : raw);
    } finally {
      if (current === attempt.current) { setBusy(false); controller.current = null; }
    }
  }
  function leave() {
    stopClock(); syncedOffset.current=null;
    attempt.current++; controller.current?.abort(); controller.current = null;
    const room = roomRef.current; roomRef.current = null;
    void room?.leave(); previous.current = null;
    setLatestEvent(null); setSnapshot(null); setSelf(""); setBusy(false); setPending(false); setMessage(""); setError("");
    const url = new URL(window.location.href); url.searchParams.delete("room");
    window.history.replaceState({}, "", url);
    if (room) log("left room.");
  }
  async function copyInvite() {
    if (!snapshot) return;
    const url = new URL(window.location.href); url.searchParams.set("room", snapshot.roomId);
    try { await navigator.clipboard.writeText(url.toString()); setMessage("招待リンクをコピーしました。"); }
    catch { setError(`コピーできませんでした。ルームコード「${snapshot.roomId}」を共有してください。`); }
  }
  function toggleReady() {
    if (!roomRef.current || !snapshot || snapshot.phase !== "waiting" || readyPending.current) return;
    const player = snapshot.players.find(p => p.id === self);
    if (!player) return;
    readyPending.current = true; setPending(true);
    roomRef.current.send("ready", !player.ready);
  }
  const me = snapshot?.players.find(p => p.id === self);
  const count = snapshot?.players.length ?? 0;
  const readyCount = snapshot?.players.filter(p => p.ready).length ?? 0;
  const countdown = snapshot?.phase === "countdown" ? Math.max(0, Math.ceil((snapshot.startsAt - clock - offset) / 1000)) : 0;
  const phase = snapshot?.phase ?? "waiting";

  const terminal = (<section className="terminal panel"><button className="terminal-heading" onClick={() => setShowLogs(v => !v)} aria-expanded={showLogs}><span><span className="terminal-dots">● ● ●</span> execution.log</span><span>{showLogs ? "−" : "+"}</span></button>{showLogs && <div className="terminal-body" role="log" aria-label="接続・実行ログ">{logs.length === 0 ? <p className="terminal-idle"><span>&gt;</span> システム待機中。ルームへの接続でログが表示されます。<b className="cursor">▌</b></p> : logs.map(item => <p key={item.id}><time>{item.time}</time><span className="log-arrow">›</span>{item.text}</p>)}<div ref={logEnd} /></div>}</section>);
  return (
    <main className="dex-shell">
      <header className="topbar"><a className="brand" href="/" aria-label="Dexman ホーム"><span className="brand-mark">&gt;_</span> DEXMAN<span className="version">ARENA / 01</span></a><span className="connection"><i className={snapshot ? "online" : ""} />{snapshot ? "CONNECTED" : busy ? "CONNECTING" : "STANDBY"}</span></header>
      <div className={`workspace ${snapshot?.game ? "match-mode" : ""}`}>
        <section className="intro"><div><p className="eyebrow">MULTIPLAYER CODE ARENA</p><h1>バグを広げるか。<br />世界を直すか<span className="mint">。</span></h1><p className="subtitle">Glitch × Patch。4人で集まり、2対2のコードバトルへ。</p></div><div className="match-label"><span>2 <em>vs</em> 2</span><small>PC BROWSER / ONLINE</small></div></section>
        {snapshot?.game ? <><div className="match-toolbar"><span>ROOM <code>{snapshot.roomId}</code> · 観戦 {snapshot.spectators.length}人</span><div>{snapshot.host===self&&snapshot.players.some(p=>p.bot)&&<button className="secondary" onClick={()=>send("endDebug")}>テストを終了</button>}<button className="secondary" onClick={copyInvite}>招待リンク ↗</button><button className="text-button" onClick={leave}>退出する</button></div></div><Arena key={snapshot.game.matchId} game={snapshot.game} self={self} phase={phase} now={snapshot.game.winner ? snapshot.game.finishedAt : clock+offset} serverNow={snapshot.serverNow} clockOffset={offset} host={snapshot.host===self} stale={clock-lastPacket.current>5000} event={latestEvent} logPanel={terminal} send={send}/><div className="status-messages" aria-live="polite">{message&&<p className="notice">{message}</p>}{error&&<p className="error">{error}</p>}</div></> : <div className="main-grid">
          <section className="lobby-panel panel">
            <div className="panel-heading"><h2><span className="section-number">01</span> ルーム</h2><span className="chip">{phase === "playing" ? "接続確認完了" : phase === "countdown" ? "チーム確定" : "参加者を募集中"}</span></div>
            {!snapshot ? <div className="entry-form"><label htmlFor="name">プレイヤー名 <span>最大20文字</span></label><input id="name" autoComplete="nickname" placeholder="例：Dex Coder" maxLength={20} value={name} disabled={busy || !mounted} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void connect(code.trim() ? "join" : "create"); }} /><button className="primary create" disabled={busy || !name.trim()} onClick={() => void connect("create")}>新しいルームを作成 <span>↗</span></button><div className="divider"><span>またはコードで参加</span></div><label htmlFor="code">ルームコード</label><div className="join-row"><input id="code" placeholder="共有されたコード" value={code} disabled={busy} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void connect("join"); }} /><button className="secondary" disabled={busy || !name.trim() || !code.trim()} onClick={() => void connect("join")}>参加 →</button></div>{busy && <button className="text-button" onClick={leave}>接続をキャンセル</button>}<p className="entry-note">アカウント登録不要。名前を入力して参加できます。</p></div> : <div className="room-details"><p className="field-label">ROOM CODE</p><div className="room-code"><code>{snapshot.roomId}</code><button className="secondary" onClick={copyInvite}>招待リンクをコピー ↗</button></div><p className="room-help">友達にリンクかコードを共有してください。<br />4人全員の準備完了で、自動的にチームが決まります。</p>{me&&<div className="skill-picker"><label>スキルを選択</label><div className="skill-options">{(["Dash","Guard","Push"] as const).map(skill=><button key={skill} className={me.skill===skill?"selected":""} onClick={()=>send("selectSkill",skill)}>{skill}</button>)}</div><p className="skill-help">{me.skill==="Dash"?"2マス素早く移動。再使用8秒。":me.skill==="Guard"?"1秒間、敵の爆風を1回防御。再使用15秒。":"目の前のキューブを最大3マス押す。再使用10秒。"}</p></div>}{!me&&<p className="spectator-label">観戦枠です。次の試合で空席があれば参加できます。</p>}{phase==="waiting"&&snapshot.host===self&&<div className="debug-controls">{snapshot.players.some(p=>p.bot)?<button className="secondary" onClick={()=>send("removeBots")}>CPUを外して通常の待機に戻す</button>:snapshot.players.length===1&&snapshot.spectators.length===0?<><button className="secondary" onClick={()=>send("debugStart")}>▶ CPU3人でテスト</button><p>1人用デバッグ。CPUを補充し、3秒後に開始します。</p></>:null}</div>}<div className="progress-label"><span>READY CHECK</span><b>{readyCount}<span> / 4</span></b></div><div className="progress-track"><div style={{ width: `${readyCount * 25}%` }} /></div>{phase === "waiting" ? <button className={`primary ready-button ${me?.ready ? "is-ready" : ""}`} disabled={pending || !me} onClick={toggleReady}>{pending ? "同期中…" : me?.ready ? "✓ 準備完了 — クリックで解除" : "準備完了にする →"}</button> : <div className="launch-state" aria-live="polite">{phase === "countdown" ? <>開始まで <strong>{countdown}</strong> 秒</> : <>✓ 4人の接続・チーム分け完了</>}</div>}<button className="text-button leave" onClick={leave}>ルームから退出</button></div>}
            <div className="status-messages" aria-live="polite">{message && <p className="notice">{message}</p>}{error && <p className="error" role="alert">{error}</p>}</div>
            <div className="panel-foot"><span className="tiny-square" /> GLITCH VS PATCH / ONLINE</div>
          </section>
          <section className="players-panel panel"><div className="panel-heading"><h2><span className="section-number">02</span> プレイヤー</h2><span className="player-count">{count}<span> / 4</span></span></div><div className="player-grid">{Array.from({ length: 4 }, (_, i) => { const p = snapshot?.players[i]; return <article key={i} className={`player-card ${p ? "occupied" : "empty"} ${p?.team?.toLowerCase() ?? ""}`}><div className="slot-top"><span>P{String(i + 1).padStart(2, "0")}</span>{p && <span className={`player-status ${p.ready ? "ready" : ""}`}>{p.ready ? "✓ READY" : "WAITING"}</span>}</div><div className={`bot bot-${i} ${!p ? "ghost" : ""}`} aria-hidden="true"><span className="antenna" /><div className="bot-face"><i /><i /></div><span className="bot-body">&gt;_</span></div><h3>{p ? p.name : "参加を待っています"}{p?.id === self && <small>YOU</small>}</h3><p className="team-name">{p?.team ? <><b>{p.team}</b><span>{TEAM_ROLE[p.team]}</span></> : p ? "チームは準備完了後に決定" : "OPEN SLOT"}</p>{p?.bot&&<span className="cpu-label">CPU</span>}{p && p.id === snapshot?.host && <span className="host-label">HOST</span>}</article>; })}</div><div className="team-explainer"><div><span className="team-dot glitch-dot" /><b>Glitch</b><span>バグを作る</span></div><span className="versus">VS</span><div><span className="team-dot patch-dot" /><b>Patch</b><span>バグを消す</span></div></div><p className="assignment-note">チームは全員の準備完了後、カウントダウン前にランダムで割り当てます。</p></section>
        </div>}
        {!snapshot?.game && terminal}
        <footer className="bottom-note"><span>DEXMAN <span className="mint">/</span> GLITCH VS PATCH</span><p>Glitchは占有率60%を5秒維持。Patchは全除去。時間切れは30%で勝敗を判定。</p></footer>
      </div>
    </main>
  );
}