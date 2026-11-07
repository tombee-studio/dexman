export type MoveDirection = "up" | "down" | "left" | "right";
export const MOVE_VECTORS: Record<MoveDirection,[number,number]> = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
export type MotionBody = {x:number;y:number;targetX:number;targetY:number;moving:boolean;direction:MoveDirection};
export type MovementBoard = {width:number;height:number;tiles:readonly number[];cubes:readonly {x:number;y:number}[]};
const EPS=1e-7;
export function canEnter(board:MovementBoard,x:number,y:number,body:Pick<MotionBody,"x"|"y">) {
 if(x<0||x>=board.width||y<0||y>=board.height||board.tiles[y*board.width+x]!==0)return false;
 return !board.cubes.some(b=>b.x===x&&b.y===y&&(Math.round(body.x)!==x||Math.round(body.y)!==y));
}
export function resetMovement(body:MotionBody) {
 body.x=Math.round(body.x);body.y=Math.round(body.y);body.targetX=body.x;body.targetY=body.y;body.moving=false;
}
/** Integrates at a fixed speed; turns and key-up stop at tile centers. No diagonal corner cutting. */
export function advanceMovement(body:MotionBody,requested:MoveDirection|null,elapsedMs:number,board:MovementBoard,moveMs:number,onArrival?:()=>boolean|void) {
 let remaining=Math.max(0,elapsedMs)/moveMs;
 while(remaining>EPS) {
  if(!body.moving) {
   if(!requested)break;
   const [dx,dy]=MOVE_VECTORS[requested];body.direction=requested;
   const x=Math.round(body.x)+dx,y=Math.round(body.y)+dy;
   if(!canEnter(board,x,y,body))break;
   body.targetX=x;body.targetY=y;body.moving=true;
  }
  if(!canEnter(board,body.targetX,body.targetY,body)){resetMovement(body);break;}
  const dx=body.targetX-body.x,dy=body.targetY-body.y,distance=Math.abs(dx)+Math.abs(dy);
  const amount=Math.min(distance,remaining);
  body.x+=Math.sign(dx)*amount;body.y+=Math.sign(dy)*amount;remaining-=amount;
  if(distance-amount<=EPS){body.x=body.targetX;body.y=body.targetY;body.moving=false;if(onArrival?.()===false)break;}
 }
}
export type AcknowledgedMotion = MotionBody & {inputSequence:number;inputDirection:MoveDirection|null;stunnedUntil:number;connected:boolean};
type Command={sequence:number;direction:MoveDirection|null;at:number};
/** Replays only unacknowledged inputs over the latest authoritative snapshot. */
export class MovementPrediction {
 private authoritative: AcknowledgedMotion|null=null;
 private at=0;
 private commands:Command[]=[];
 private sequence=0;
 input(direction:MoveDirection|null,at:number) {
  const command={sequence:++this.sequence,direction,at};this.commands.push(command);this.commands=this.commands.slice(-128);return command;
 }
 receive(body:AcknowledgedMotion,at:number) {
  if(at<this.at)return;
  this.authoritative={...body};this.at=at;this.sequence=Math.max(this.sequence,body.inputSequence);
  this.commands=this.commands.filter(c=>c.sequence>body.inputSequence);
 }
 position(now:number,board:MovementBoard,moveMs:number) {
  if(!this.authoritative)return null;
  const body={...this.authoritative};
  if(!body.connected||body.stunnedUntil>now)return body;
  const end=Math.max(this.at,Math.min(now,this.at+300));
  let cursor=this.at,direction=body.inputDirection;
  for(const command of this.commands){
   if(command.at>end)break;
   const changeAt=Math.max(cursor,command.at);
   advanceMovement(body,direction,changeAt-cursor,board,moveMs);
   cursor=changeAt;direction=command.direction;
  }
  advanceMovement(body,direction,end-cursor,board,moveMs);return body;
 }
}
export type MotionSample={at:number;body:AcknowledgedMotion};
/** Remote players are interpolated from server timestamps, with bounded extrapolation for jitter. */
export function sampleMovement(samples:readonly MotionSample[],at:number,board:MovementBoard,moveMs:number) {
 if(!samples.length)return null;
 let first=samples[0];if(at<=first.at)return {...first.body};
 for(let i=1;i<samples.length;i++){
  const second=samples[i];
  if(at<=second.at){
   // Skills can change position discontinuously; do not draw a path across walls.
   if(Math.abs(second.body.x-first.body.x)+Math.abs(second.body.y-first.body.y)>1.5)return {...second.body};
   const alpha=(at-first.at)/Math.max(1,second.at-first.at);
   const a=first.body,b=second.body;
   if(a.moving&&Math.abs(b.x-a.x)>EPS&&Math.abs(b.y-a.y)>EPS){
    const corner={x:a.targetX,y:a.targetY},d1=Math.abs(corner.x-a.x)+Math.abs(corner.y-a.y),d2=Math.abs(b.x-corner.x)+Math.abs(b.y-corner.y);
    const travel=(d1+d2)*alpha;
    if(travel<=d1&&d1>EPS)return {...b,x:a.x+(corner.x-a.x)*travel/d1,y:a.y+(corner.y-a.y)*travel/d1};
    const t=d2>EPS?(travel-d1)/d2:1;return {...b,x:corner.x+(b.x-corner.x)*t,y:corner.y+(b.y-corner.y)*t};
   }
   return {...b,x:a.x+(b.x-a.x)*alpha,y:a.y+(b.y-a.y)*alpha};
  }
  first=second;
 }
 const body={...first.body};
 if(body.connected&&body.stunnedUntil<=at)advanceMovement(body,body.inputDirection,Math.min(100,at-first.at),board,moveMs);
 return body;
}