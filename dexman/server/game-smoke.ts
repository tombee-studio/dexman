import { Client, type Room } from "@colyseus/sdk";
import assert from "node:assert/strict";
import type { Lobby } from "./lobby.js";
import type { GameEvent } from "./game.js";
type Snapshot=ReturnType<Lobby["snapshot"]>;
const endpoint=process.env.SERVER_URL??"http://127.0.0.1:2567";
const rooms:Room[]=[],states=new Map<string,Snapshot>(),events:GameEvent[]=[],notices=new Map<string,string[]>();
async function wait(check:()=>boolean,label:string){const end=Date.now()+15000;while(!check()){if(Date.now()>end)throw new Error(`Timeout: ${label}`);await new Promise(r=>setTimeout(r,40));}}
function track(room:Room){rooms.push(room);notices.set(room.sessionId,[]);room.onMessage("snapshot",(s:Snapshot)=>states.set(room.sessionId,s));room.onMessage("event",(e:GameEvent)=>{if(room===rooms[0])events.push(e);});room.onMessage("notice",(s:string)=>notices.get(room.sessionId)!.push(s));room.send("snapshot");return room;}
try{
 const health=await(await fetch(`${endpoint}/health`)).json() as {protocol:number};assert.equal(health.protocol,2);
 const host=track(await new Client(endpoint).create("dexman",{name:"Game QA 1"}));
 for(let i=2;i<=4;i++)track(await new Client(endpoint).joinById(host.roomId,{name:`Game QA ${i}`}));
 await wait(()=>rooms.every(r=>states.get(r.sessionId)?.players.length===4),"four players");
 rooms[1].send("selectSkill","Guard");rooms[2].send("selectSkill","Push");
 await wait(()=>states.get(host.sessionId)?.players[1].skill==="Guard","skill selection");
 for(const room of rooms)room.send("ready",true);
 await wait(()=>rooms.every(r=>states.get(r.sessionId)?.phase==="playing"),"match started");
 const observer=track(await new Client(endpoint).joinById(host.roomId,{name:"Spectator"}));
 await wait(()=>states.get(observer.sessionId)?.spectators.length===1,"spectator joined mid-match");
 const fighter=()=>states.get(host.sessionId)!.game!.fighters.find(p=>p.id===host.sessionId)!;
 const origin=fighter().x;
 const interval=setInterval(()=>host.send("input","right"),100);
 host.send("input","right");
 try{await wait(()=>fighter().x!==origin,"authoritative movement");}finally{clearInterval(interval);host.send("input",null);}
 host.send("place");
 await wait(()=>states.get(host.sessionId)!.game!.cubes.length===1,"cube placed");
 host.send("place");observer.send("place");
 await new Promise(r=>setTimeout(r,250));assert.equal(states.get(host.sessionId)!.game!.cubes.length,1);
 await wait(()=>events.some(e=>e.kind==="explode"),"cube exploded");
 await wait(()=>rooms.every(r=>states.get(r.sessionId)!.game!.cubes.length===0),"explosion synchronized");
 const bugs=JSON.stringify(states.get(host.sessionId)!.game!.bugs);
 assert.ok(rooms.every(r=>JSON.stringify(states.get(r.sessionId)!.game!.bugs)===bugs));
 host.send("skill");await wait(()=>events.some(e=>e.kind==="skill"&&e.playerId===host.sessionId),"skill event");
 host.send("skill");await wait(()=>notices.get(host.sessionId)!.length>0,"private cooldown notice");
 assert.ok(rooms.filter(r=>r!==host).every(r=>notices.get(r.sessionId)!.length===0));
 const departed=rooms[3];await departed.leave();rooms.splice(3,1);
 await wait(()=>states.get(host.sessionId)!.game!.fighters.find(p=>p.id===departed.sessionId)?.connected===false,"disconnect recorded");
 console.log("PASS: 4 players + spectator, skills, movement, cube limit, explosion, identical bugs, private cooldown, disconnect.");
}finally{await Promise.allSettled(rooms.map(r=>r.leave()));}