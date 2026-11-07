"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type * as PhaserTypes from "phaser";
import type { MatchState, Direction, GameEvent } from "../lib/game-protocol";
import "./arena.css";
type Props = { game: MatchState; self: string; phase: string; now: number; host: boolean; stale: boolean; logPanel: ReactNode; event: (GameEvent & { matchId: string }) | null; send: (type: string, value?: unknown) => void };
const COLORS = [0xff7e8c,0x80c5ff,0x8fe392,0xffd479];
const T=48;
export default function Arena(props: Props) {
  const { game, self, phase, now, host, stale, send } = props;
  const viewport = useRef<HTMLDivElement>(null);
  const live = useRef(props); live.current = props;
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState("");
  const [focused,setFocused]=useState(false);
  const [muted,setMuted]=useState(false);
  const audio=useRef<AudioContext | null>(null);
  const me=game.fighters.find(p=>p.id===self && p.connected);
  const ratio=game.bugCount/game.totalFloor*100;
  const seconds=Math.ceil(Math.max(0,game.endsAt-Math.max(now,game.startedAt))/1000);
  const hold=game.holdSince===null?0:Math.max(0,Math.min(5,(now-game.holdSince)/1000));
  const cooldown=me?Math.ceil(Math.max(0,me.skillReadyAt-now)/1000):0;
  function unlockAudio(){ if(!audio.current)audio.current=new AudioContext();void audio.current.resume(); }
  useEffect(()=>{
    const e=props.event;
    if(!e||e.matchId!==game.matchId||muted||!audio.current)return;
    const frequencies:Record<string,number>={place:250,explode:85,item:900,skill:650,guard:1100,stun:160,finish:740,start:520};
    const hz=frequencies[e.kind];if(!hz)return;
    const ctx=audio.current,osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=e.kind==="explode"?"sawtooth":"square";osc.frequency.setValueAtTime(hz,ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35,hz*.65),ctx.currentTime+.12);
    gain.gain.setValueAtTime(.035,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.16);
    osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.18);
  },[props.event,muted,game.matchId]);
  useEffect(()=>()=>{void audio.current?.close();},[]);
  useEffect(()=>{
    const el=viewport.current;if(!el)return;
    let cancelled=false,instance:PhaserTypes.Game|undefined;
    void import("phaser").then(({default:Phaser})=>{
      if(cancelled)return;
      class ArenaScene extends Phaser.Scene {
        graphics!:PhaserTypes.GameObjects.Graphics;
        labels=new Map<string,PhaserTypes.GameObjects.Text>();
        positions=new Map<string,{x:number;y:number}>();
        create(){this.graphics=this.add.graphics();setLoading(false);}
        update(_time:number,delta:number){
          const current=live.current,s=current.game,g=this.graphics;if(!g)return;
          const time=current.now;g.clear();
          for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
            const i=y*s.width+x,px=x*T,py=y*T,tile=s.tiles[i];
            g.fillStyle((x+y)%2?0x18231d:0x1c2921);g.fillRect(px,py,T-1,T-1);
            if(s.bugs[i]){
              g.fillStyle(0x633773,.48);g.fillRect(px+2,py+2,T-5,T-5);
              g.lineStyle(2,0xd39aff,.8);g.strokeEllipse(px+24,py+25,13,17);
              g.lineBetween(px+24,py+16,px+24,py+34);
              for(const d of [-1,1])for(const h of [20,26,32])g.lineBetween(px+24+d*6,py+h,px+24+d*11,py+h-3);
            }
            if(tile===1){
              g.fillStyle(0x0d1713);g.fillRoundedRect(px+2,py+5,T-5,T-6,5);
              g.fillStyle(0x3d5143);g.fillRoundedRect(px+2,py+2,T-5,T-8,5);
              g.lineStyle(1,0x617b63,.7);g.strokeRoundedRect(px+5,py+5,T-11,T-14,3);
              g.fillStyle(0xa3c996,.5);g.fillRect(px+10,py+12,19,2);g.fillRect(px+10,py+20,12,2);
            }else if(tile===2){
              g.fillStyle(0x111810);g.fillRoundedRect(px+5,py+7,38,37,4);
              g.fillStyle(0x665a3f);g.fillRoundedRect(px+5,py+4,38,36,4);
              g.lineStyle(2,0x9c8c5e);g.strokeRoundedRect(px+8,py+7,32,29,2);
              g.lineBetween(px+9,py+8,px+38,py+35);g.lineBetween(px+38,py+8,px+9,py+35);
              g.fillStyle(0xd6c17f);g.fillRect(px+20,py+17,8,8);
            }
            const item=s.items[i];if(item){g.fillStyle(item==="range"?0xffbf6b:0x8dcfff);g.fillRoundedRect(px+12,py+12,24,24,5);g.fillStyle(0x142219);g.fillRect(px+21,py+17,6,14);g.fillRect(px+17,py+21,14,6);}
          }
          for(const cube of s.cubes){
            const x=cube.x*T+24,y=cube.y*T+24,color=cube.team==="Glitch"?0xc993ff:0xbafa68;
            const pulse=1+Math.sin(time/80)*.06;
            g.fillStyle(0x090f0b,.5);g.fillEllipse(x,y+12,31,17);
            g.fillStyle(color);g.fillRoundedRect(x-13*pulse,y-13*pulse,26*pulse,26*pulse,5);
            g.fillStyle(0x15201a);g.fillRoundedRect(x-8,y-7,16,12,2);
            g.lineStyle(3,0xf5f8e9);g.lineBetween(x+5,y-13,x+8,y-19);g.fillStyle(0xffe58a);g.fillCircle(x+8,y-19,3);
            g.fillStyle(0x1a261b,.8);g.fillRect(x-14,y+18,28,3);g.fillStyle(color);g.fillRect(x-14,y+18,28*Math.max(0,(cube.explodeAt-time)/2000),3);
          }
          for(const blast of s.blasts){const alpha=Math.max(.2,Math.min(.8,(blast.expiresAt-time)/500));g.fillStyle(blast.team==="Glitch"?0xe29aff:0xd1ff95,alpha);for(const i of blast.cells){const x=i%s.width*T,y=Math.floor(i/s.width)*T;g.fillRoundedRect(x+3,y+3,T-7,T-7,6);g.fillStyle(0xffffff,alpha*.6);g.fillRect(x+20,y+7,7,33);g.fillRect(x+7,y+20,33,7);g.fillStyle(blast.team==="Glitch"?0xe29aff:0xd1ff95,alpha);}}
          for(const p of s.fighters){
            let label=this.labels.get(p.id);if(!label){label=this.add.text(0,0,"",{fontFamily:"monospace",fontSize:"10px",color:"#ffffff",stroke:"#0a1710",strokeThickness:3}).setOrigin(.5).setDepth(10);this.labels.set(p.id,label);}
            label.setVisible(p.connected);if(!p.connected)continue;
            const target={x:p.x*T+24,y:p.y*T+24},pos=this.positions.get(p.id)??target;
            const lerp=Math.min(1,delta/65);pos.x+=(target.x-pos.x)*lerp;pos.y+=(target.y-pos.y)*lerp;this.positions.set(p.id,pos);
            const {x,y}=pos,color=COLORS[p.slot],stunned=p.stunnedUntil>time;
            const opacity=p.immuneUntil>time&&!stunned?(Math.sin(time/65)>0?.45:1):1;
            g.fillStyle(0x000000,.35);g.fillEllipse(x,y+15,31,13);
            if(p.id===current.self){g.lineStyle(2,0xffffff,.9);g.strokeEllipse(x,y+14,37,18);}
            g.fillStyle(color,opacity);g.fillRoundedRect(x-15,y-16,30,24,5);g.fillRoundedRect(x-10,y+10,20,9,2);
            g.fillRect(x-2,y-23,4,8);g.fillCircle(x,y-25,3);
            g.fillStyle(0x12201b,opacity);g.fillRoundedRect(x-10,y-10,20,13,3);
            g.fillStyle(stunned?0xfff0a0:0xf1ffe5,opacity);g.fillRect(x-6,y-6,4,5);g.fillRect(x+3,y-6,4,5);
            g.fillStyle(p.team==="Glitch"?0xc993ff:0xbafa68);g.fillCircle(x+16,y+10,4);
            if(p.guardUntil>time){g.lineStyle(3,0x8beaff,.85);g.strokeCircle(x,y,23);}
            if(stunned){g.fillStyle(0xffdb7d);g.fillCircle(x-15,y-23,3);g.fillCircle(x+14,y-25,3);}
            label.setPosition(x,y-35).setText(`${p.slot+1} ${p.name.slice(0,10)}`);
          }
        }
      }
      instance=new Phaser.Game({type:Phaser.AUTO,parent:el,width:624,height:528,backgroundColor:"#111b15",scene:ArenaScene,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true},audio:{noAudio:true},fps:{target:60}});
    }).catch(()=>{if(!cancelled){setLoading(false);setLoadError("描画の読み込みに失敗しました。ページを再読み込みしてください。");}});
    return()=>{cancelled=true;instance?.destroy(true);};
  },[]);
  useEffect(()=>{
    const el=viewport.current;if(!el)return;
    const keys=new Map<string,Direction>();
    const directions:Record<string,Direction>={ArrowUp:"up",KeyW:"up",ArrowDown:"down",KeyS:"down",ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right"};
    const canControl=()=>live.current.phase==="playing"&&!live.current.stale&&!!live.current.game.fighters.find(p=>p.id===live.current.self&&p.connected);
    function transmit(){const direction=[...keys.values()].at(-1)??null;live.current.send("input",direction);}
    function down(e:KeyboardEvent){
      if(!directions[e.code]&&!['Space','ShiftLeft','ShiftRight'].includes(e.code))return;
      e.preventDefault();if(!canControl())return;
      if(directions[e.code]){if(!keys.has(e.code)){keys.set(e.code,directions[e.code]);transmit();}}
      else if(!e.repeat)live.current.send(e.code==="Space"?"place":"skill");
    }
    function up(e:KeyboardEvent){if(directions[e.code]){e.preventDefault();keys.delete(e.code);transmit();}}
    function release(){keys.clear();live.current.send("input",null);setFocused(false);}
    const timer=setInterval(()=>{if(keys.size&&canControl())transmit();},100);
    el.addEventListener("keydown",down);el.addEventListener("keyup",up);el.addEventListener("blur",release);window.addEventListener("blur",release);
    return()=>{clearInterval(timer);el.removeEventListener("keydown",down);el.removeEventListener("keyup",up);el.removeEventListener("blur",release);window.removeEventListener("blur",release);release();};
  },[]);
  return <section className="arena-layout">
    <div className="arena-main panel">
      <div className="arena-topline"><div><span className="eyebrow">LIVE MATCH</span><h2>{me?<>あなたは <b className={me.team.toLowerCase()}>{me.team}</b></>:"観戦モード"}</h2></div><div className={`game-timer ${seconds<30?'urgent':''}`}>{String(Math.floor(seconds/60)).padStart(2,"0")}<span>:</span>{String(seconds%60).padStart(2,"0")}</div></div>
      <div className="occupancy"><div className="occupancy-label"><span>Glitch <b>{ratio.toFixed(1)}%</b></span><span>BUG OCCUPANCY</span><span>Patch <b>{(100-ratio).toFixed(1)}%</b></span></div><div className="occupancy-track"><div style={{width:`${ratio}%`}}/><i style={{left:'30%'}} title="時間切れの判定基準30%"/><i style={{left:'60%'}} title="Glitch勝利の維持基準60%"/></div><p>{hold>0?`Glitch勝利まであと ${Math.max(0,5-hold).toFixed(1)} 秒`:`残りバグ ${game.bugCount} マス / 全床 ${game.totalFloor} マス`}</p></div>
      <div className="arena-wrap">
        <div className="arena-viewport" ref={viewport} tabIndex={0} role="application" aria-label="Dexman対戦フィールド。矢印キーかWASDで移動、スペースでキューブ、Shiftでスキル。" onFocus={()=>setFocused(true)} onPointerDown={()=>{viewport.current?.focus();unlockAudio();}}/>
        {loading&&<div className="arena-overlay"><p>フィールドを準備中…</p></div>}
        {loadError&&<div className="arena-overlay"><p role="alert">{loadError}</p></div>}
        {phase==="countdown"&&<div className="arena-overlay countdown-overlay"><span>TEAM ASSIGNED</span><strong>{Math.max(1,Math.ceil((game.startedAt-now)/1000))}</strong><p>{me?`${me.team} / ${me.team==='Glitch'?'バグを広げよう':'バグをすべて消そう'}`:'試合開始を待っています'}</p></div>}
        {phase==="result"&&<div className={`arena-overlay result-overlay ${game.winner.toLowerCase()}`}><span>BUILD COMPLETE</span><h2>{game.winner} WINS</h2><p>{game.reason}</p><p>最終バグ占有率 {ratio.toFixed(1)}%</p>{host?<button className="primary" onClick={()=>send("rematch")}>再戦の待機画面へ →</button>:<p>ルーム作成者の再戦操作を待っています。</p>}</div>}
        {stale&&phase!=="result"&&<div className="arena-overlay"><p>通信の復帰を待っています…</p><small>操作を一時停止しています。</small></div>}
      </div>
      <div className="arena-controls"><span><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> 移動</span><span><kbd>Space</kbd> キューブ</span><span><kbd>Shift</kbd> スキル</span><button className="text-button" onClick={()=>{unlockAudio();setMuted(v=>!v);}}>{muted?'音：OFF':'音：ON'}</button></div>
      {me&&phase==="playing"&&<p className="focus-hint">{focused?'操作中 — フィールド外をクリックすると操作を解除します。':'フィールドをクリックしてキーボード操作を開始してください。'}</p>}
    </div>
    <aside className="battle-sidebar">
      <div className="panel mission-card"><p className="eyebrow">YOUR MISSION</p><h3>{me?(me.team==='Glitch'?'バグを広げる':'世界を修復する'):'試合を観戦中'}</h3><p>{me?.team==='Glitch'?'占有率60%以上を5秒間維持。時間切れ時は30%以上で勝利。':'バグをすべて消せば勝利。時間切れ時は占有率30%未満で勝利。'}</p></div>
      {me&&<div className="panel loadout-card"><p className="eyebrow">LOADOUT</p><div><span>キューブ</span><b>{game.cubes.filter(b=>b.owner===self).length} / {me.capacity}</b></div><div><span>範囲</span><b>{me.range} マス</b></div><div className="skill-display"><strong>{me.skill}</strong><span>{cooldown?`${cooldown}s`:'READY'}</span></div><p>{me.stunnedUntil>now?'⚡ スタン中':me.immuneUntil>now?'スタン耐性中':cooldown?'再使用まで待機中':'Shiftキーで発動'}</p></div>}
      {props.logPanel}
      <div className="panel squad-card"><p className="eyebrow">PLAYERS</p>{game.fighters.map(p=><div key={p.id} className={!p.connected?'disconnected':''}><i style={{background:`#${COLORS[p.slot].toString(16).padStart(6,'0')}`}}/><span>{p.name}<small>{p.team} / {p.skill}</small></span><b>{!p.connected?'切断':p.stunnedUntil>now?'⚡':p.id===self?'YOU':`P${p.slot+1}`}</b></div>)}</div>
      <p className="battle-note">敵の爆風で1秒スタン。自分・味方の爆風は安全です。バグのある床も通れます。</p>
    </aside>
  </section>;
}