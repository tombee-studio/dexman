import {test} from "node:test";
import assert from "node:assert/strict";
import {advanceMovement,MovementPrediction,sampleMovement,type AcknowledgedMotion,type MovementBoard} from "../shared/movement.js";
const board=():MovementBoard=>({width:13,height:11,tiles:Array(143).fill(0),cubes:[]});
const body=():AcknowledgedMotion=>({x:1,y:1,targetX:1,targetY:1,moving:false,direction:"right",inputSequence:0,inputDirection:null,stunnedUntil:0,connected:true});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test("フレーム周期が違っても250msで同じ1マスを移動する",()=>{
 const a=body(),b=body(),world=board();for(let i=0;i<5;i++)advanceMovement(a,"right",50,world,250);
 for(let i=0;i<15;i++)advanceMovement(b,"right",16,world,250);advanceMovement(b,"right",10,world,250);
 close(a.x,2);close(b.x,2);close(a.y,b.y);
});
test("曲がる入力はマス中心まで保持し、角を斜め抜けしない",()=>{
 const p=body(),world=board();advanceMovement(p,"right",100,world,250);close(p.x,1.4);
 advanceMovement(p,"down",100,world,250);close(p.x,1.8);close(p.y,1);
 advanceMovement(p,"down",100,world,250);close(p.x,2);close(p.y,1.2);
});
test("キーを離したら進行中のマスまで進んで止まる。壁・キューブを通り抜けない",()=>{
 const p=body(),world=board();advanceMovement(p,"right",100,world,250);advanceMovement(p,null,300,world,250);close(p.x,2);
 (world.tiles as number[])[1*13+3]=1;advanceMovement(p,"right",500,world,250);close(p.x,2);
 const q=body();world.cubes=[{x:2,y:1}];advanceMovement(q,"right",250,world,250);close(q.x,1);
});
test("自分のマスのキューブからは出られ、遅い描画でも壁を飛び越さない",()=>{
 const p=body(),world=board();world.cubes=[{x:1,y:1}];(world.tiles as number[])[1*13+3]=2;
 advanceMovement(p,"right",2000,world,250);close(p.x,2);
});
test("未確認の入力をすぐ予測し、サーバーの確認後は二重適用しない",()=>{
 const predictor=new MovementPrediction(),p=body(),world=board();predictor.receive(p,1000);
 const command=predictor.input("right",1000);assert.equal(command.sequence,1);
 close(predictor.position(1016,world,250)!.x,1.064);
 const acknowledged={...p,x:1.4,targetX:2,targetY:1,moving:true,inputSequence:1,inputDirection:"right" as const};
 predictor.receive(acknowledged,1100);close(predictor.position(1150,world,250)!.x,1.6);
 predictor.receive(p,1000);close(predictor.position(1150,world,250)!.x,1.6);
});
test("遅延中のキー解除も再生し、通信が止まっても予測は300msまでに制限する",()=>{
 const predictor=new MovementPrediction(),p=body(),world=board();predictor.receive(p,1000);
 predictor.input("right",1000);predictor.input(null,1100);close(predictor.position(1600,world,250)!.x,2);
 const other=new MovementPrediction();other.receive(p,1000);other.input("right",1000);close(other.position(3000,world,250)!.x,2.2);
});
test("スタン・切断中は予測移動をしない",()=>{
 for(const extra of [{stunnedUntil:2000},{connected:false}]){
  const predictor=new MovementPrediction(),p={...body(),...extra};predictor.receive(p,1000);predictor.input("right",1000);close(predictor.position(1100,board(),250)!.x,1);
 }
});
test("他プレイヤーも曲がり角の中心を経由し、パケット間で斜め抜けしない",()=>{
 const first={...body(),x:1.8,targetX:2,targetY:1,moving:true,inputDirection:"right" as const};
 const second={...first,x:2,y:1.2,targetY:2,direction:"down" as const,inputDirection:"down" as const};
 const samples=[{at:100,body:first},{at:200,body:second}];
 const a=sampleMovement(samples,125,board(),250)!;close(a.x,1.9);close(a.y,1);
 const b=sampleMovement(samples,150,board(),250)!;close(b.x,2);close(b.y,1);
 const c=sampleMovement(samples,175,board(),250)!;close(c.x,2);close(c.y,1.1);
});