const express = require("express");
const http = require("http");
const helmet = require("helmet");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const crypto = require("crypto");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "64kb" }));
app.use(express.static("public"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const ADMIN_PIN = process.env.ADMIN_PIN || "2027";
const GIFT_WEBHOOK_TOKEN = process.env.GIFT_WEBHOOK_TOKEN || "";
const rooms = new Map();
const COLORS = ["red", "yellow", "green", "blue"];
const VALUES = ["0","1","2","3","4","5","6","7","8","9","skip","reverse","draw2"];
const MAX_PLAYERS = 6;

function code() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }
function makeDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ id: crypto.randomUUID(), color, value: "0" });
    for (let n=1;n<=9;n++) for(let k=0;k<2;k++) deck.push({id:crypto.randomUUID(),color,value:String(n)});
    for (const value of ["skip","reverse","draw2"]) for(let k=0;k<2;k++) deck.push({id:crypto.randomUUID(),color,value});
  }
  for(let k=0;k<4;k++) deck.push({id:crypto.randomUUID(),color:"wild",value:"wild"});
  for(let k=0;k<4;k++) deck.push({id:crypto.randomUUID(),color:"wild",value:"draw4"});
  return shuffle(deck);
}
function shuffle(a) { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function roomPublic(r) {
  return {
    code:r.code, status:r.status, hostId:r.hostId, currentPlayerId:r.currentPlayerId,
    direction:r.direction, topCard:r.discard[r.discard.length-1], activeColor:r.activeColor,
    players:r.players.map(p=>({id:p.id,name:p.name,handCount:p.hand.length,host:p.host,connected:p.connected,saidUno:p.saidUno})),
    discardCount:r.discard.length, drawCount:r.deck.length, winner:r.winner,
    turnNumber:r.turnNumber, notice:r.notice
  };
}
function emitRoom(r) { io.to(r.code).emit("room:update", roomPublic(r)); }
function playerOf(r,id){ return r.players.find(p=>p.id===id); }
function nextIndex(r, fromIndex, steps=1) {
  let i=fromIndex;
  for(let n=0;n<steps;n++) i=(i+r.direction+r.players.length)%r.players.length;
  return i;
}
function currentIndex(r){ return r.players.findIndex(p=>p.id===r.currentPlayerId); }
function advance(r, steps=1) {
  const i=currentIndex(r);
  if(i<0) return;
  r.currentPlayerId=r.players[nextIndex(r,i,steps)].id;
  r.turnNumber++;
}
function drawCards(r,p,count) {
  for(let n=0;n<count;n++){
    if(!r.deck.length){
      if(r.discard.length<=1) break;
      const top=r.discard.pop();
      r.deck=shuffle(r.discard.splice(0));
      r.discard=[top];
    }
    const c=r.deck.pop(); if(c) p.hand.push(c);
  }
}
function validPlay(r, card) {
  const top=r.discard[r.discard.length-1];
  if(card.color==="wild") return true;
  return card.color===r.activeColor || card.value===top.value;
}
function startGame(r) {
  if(r.players.length<2) throw new Error("Cần ít nhất 2 người chơi.");
  r.deck=makeDeck(); r.discard=[]; r.direction=1; r.winner=null; r.status="playing"; r.turnNumber=1;
  for(const p of r.players){p.hand=[];p.saidUno=false;p.drawnThisTurn=null;}
  for(let n=0;n<7;n++) for(const p of r.players) drawCards(r,p,1);
  let first=r.deck.pop();
  while(first && first.color==="wild"){r.deck.unshift(first);first=r.deck.pop();}
  r.discard.push(first); r.activeColor=first.color;
  r.currentPlayerId=r.players[0].id;
  if(first.value==="skip") advance(r,2);
  else if(first.value==="reverse"){r.direction=-1; r.currentPlayerId=r.players[0].id;}
  else if(first.value==="draw2"){drawCards(r,r.players[1],2);r.currentPlayerId=r.players[1].id;advance(r,1);}
  r.notice="Ván mới bắt đầu! Chúc may mắn đầu năm!";
}
function requireTurn(r,p) {
  if(r.status!=="playing") throw new Error("Ván chưa bắt đầu.");
  if(r.currentPlayerId!==p.id) throw new Error("Chưa đến lượt của bạn.");
}
function playCard(r,p,cardId,colorChoice) {
  requireTurn(r,p);
  const idx=p.hand.findIndex(c=>c.id===cardId);
  if(idx<0) throw new Error("Không tìm thấy lá bài.");
  const card=p.hand[idx];
  if(!validPlay(r,card)) throw new Error("Lá bài không hợp lệ.");
  if(card.value==="draw4" && p.hand.some(c=>c.color===r.activeColor && c.color!=="wild"))
    throw new Error("Bạn chỉ được đánh +4 khi không có lá cùng màu.");
  p.hand.splice(idx,1); p.drawnThisTurn=null; p.saidUno=p.hand.length===1;
  r.discard.push(card);
  if(card.color==="wild"){
    if(!COLORS.includes(colorChoice)) throw new Error("Hãy chọn màu cho lá Wild.");
    r.activeColor=colorChoice;
  } else r.activeColor=card.color;

  if(p.hand.length===0){r.winner=p.id;r.status="finished";r.notice=`${p.name} đã UNO và chiến thắng!`;return;}
  let steps=1;
  if(card.value==="skip") steps=2;
  if(card.value==="reverse"){r.direction*=-1; if(r.players.length===2) steps=2;}
  if(card.value==="draw2"){
    const target=r.players[nextIndex(r,currentIndex(r),1)];
    drawCards(r,target,2); steps=2; r.notice=`${target.name} rút 2 lá và mất lượt.`;
  } else if(card.value==="draw4"){
    const target=r.players[nextIndex(r,currentIndex(r),1)];
    drawCards(r,target,4); steps=2; r.notice=`${target.name} rút 4 lá và mất lượt.`;
  } else if(card.value==="skip") r.notice=`${p.name} bỏ lượt người kế tiếp.`;
  else r.notice=`${p.name} đã đánh ${card.value==="wild"?"Đổi màu":card.value==="draw4"?"Wild +4":card.value}.`;
  advance(r,steps);
}
function publicHand(p){ return p.hand.map(c=>({...c})); }
function sendPrivateHand(r,p){io.to(p.id).emit("hand:update",publicHand(p));}

app.get("/api/health",(req,res)=>res.json({ok:true,rooms:rooms.size}));
app.post("/api/room/create",(req,res)=>{
  const name=String(req.body?.name||"Chủ LIVE").trim().slice(0,24)||"Chủ LIVE";
  let roomCode=code(); while(rooms.has(roomCode)) roomCode=code();
  const hostId=crypto.randomUUID();
  const r={code:roomCode,hostId,players:[{id:hostId,name,host:true,hand:[],connected:false,saidUno:false,drawnThisTurn:null}],status:"lobby",deck:[],discard:[],direction:1,currentPlayerId:null,activeColor:null,winner:null,turnNumber:0,notice:"Chủ LIVE đã tạo phòng. Mời mọi người quét QR!"};
  rooms.set(roomCode,r);
  res.json({code:roomCode,hostId});
});
app.get("/api/room/:code/qr",async(req,res)=>{
  const r=rooms.get(req.params.code.toUpperCase()); if(!r)return res.status(404).json({error:"Không tìm thấy phòng"});
  const base=PUBLIC_BASE_URL||`${req.protocol}://${req.get("host")}`;
  const url=`${base}/?room=${r.code}`;
  try{res.json({url,qr:await QRCode.toDataURL(url,{width:480,margin:1,color:{dark:"#6b1020",light:"#fff8e8"}})});}catch(e){res.status(500).json({error:"Không tạo được QR"});}
});
app.post("/api/gift",(req,res)=>{
  if(GIFT_WEBHOOK_TOKEN && req.get("x-gift-token")!==GIFT_WEBHOOK_TOKEN)return res.status(401).json({error:"Unauthorized"});
  const {roomCode,username,giftName}=req.body||{};
  const r=rooms.get(String(roomCode||"").toUpperCase()); if(!r)return res.status(404).json({error:"Room not found"});
  const name=String(username||"Khán giả").trim().slice(0,24);
  r.notice=`🎁 ${name} vừa tặng ${String(giftName||"quà LIVE").slice(0,32)}. Mời vào phòng nếu còn chỗ!`;
  io.to(r.code).emit("gift:notice",{username:name,giftName:String(giftName||"quà LIVE")});
  emitRoom(r);res.json({ok:true});
});

io.on("connection",socket=>{
  socket.on("room:join",({code:rawCode,name,hostId}={})=>{
    const r=rooms.get(String(rawCode||"").toUpperCase()); if(!r)return socket.emit("game:error","Không tìm thấy phòng.");
    let p;
    if(hostId && hostId===r.hostId){p=playerOf(r,r.hostId); if(!p)return;}
    else {
      if(r.status!=="lobby")return socket.emit("game:error","Ván đã bắt đầu, không thể vào thêm.");
      if(r.players.length>=MAX_PLAYERS)return socket.emit("game:error","Phòng đã đủ 6 người, tính cả chủ LIVE.");
      p={id:socket.id,name:String(name||"Khách Tết").trim().slice(0,24)||"Khách Tết",host:false,hand:[],connected:false,saidUno:false,drawnThisTurn:null};
      r.players.push(p);
    }
    p.connected=true;p.socketId=socket.id;socket.data.roomCode=r.code;socket.data.playerId=p.id;socket.join(r.code);socket.join(p.id);
    socket.emit("room:joined",{playerId:p.id,host:p.host,code:r.code});
    if(r.status==="playing"||r.status==="finished")sendPrivateHand(r,p);
    emitRoom(r);
  });
  socket.on("game:start",()=>{
    const r=rooms.get(socket.data.roomCode);if(!r)return;
    const p=playerOf(r,socket.data.playerId);if(!p?.host)return socket.emit("game:error","Chỉ chủ LIVE mới được bắt đầu.");
    try{startGame(r);r.players.forEach(x=>sendPrivateHand(r,x));emitRoom(r);}catch(e){socket.emit("game:error",e.message);}
  });
  socket.on("card:play",({cardId,color}={})=>{
    const r=rooms.get(socket.data.roomCode);if(!r)return;const p=playerOf(r,socket.data.playerId);if(!p)return;
    try{playCard(r,p,cardId,color);r.players.forEach(x=>sendPrivateHand(r,x));emitRoom(r);}catch(e){socket.emit("game:error",e.message);}
  });
  socket.on("card:draw",()=>{
    const r=rooms.get(socket.data.roomCode);if(!r)return;const p=playerOf(r,socket.data.playerId);if(!p)return;
    try{requireTurn(r,p);if(p.drawnThisTurn)throw new Error("Bạn đã rút bài trong lượt này.");
      drawCards(r,p,1);p.drawnThisTurn=p.hand[p.hand.length-1]?.id||null;
      r.notice=`${p.name} đã rút 1 lá. Có thể đánh lá vừa rút nếu hợp lệ.`;
      sendPrivateHand(r,p);emitRoom(r);
    }catch(e){socket.emit("game:error",e.message);}
  });
  socket.on("turn:pass",()=>{
    const r=rooms.get(socket.data.roomCode);if(!r)return;const p=playerOf(r,socket.data.playerId);if(!p)return;
    try{requireTurn(r,p);if(!p.drawnThisTurn)throw new Error("Bạn phải rút bài trước khi bỏ lượt.");
      advance(r);r.notice=`${p.name} đã kết thúc lượt.`;emitRoom(r);
    }catch(e){socket.emit("game:error",e.message);}
  });
  socket.on("uno:call",()=>{
    const r=rooms.get(socket.data.roomCode);if(!r)return;const p=playerOf(r,socket.data.playerId);if(!p)return;
    if(p.hand.length===1){p.saidUno=true;r.notice=`${p.name} hô UNO!`;emitRoom(r);}
    else socket.emit("game:error","Chỉ hô UNO khi còn đúng 1 lá.");
  });
  socket.on("uno:catch",({targetId}={})=>{
    const r=rooms.get(socket.data.roomCode);if(!r)return;const target=playerOf(r,targetId);
    if(!target||target.hand.length!==1||target.saidUno||r.currentPlayerId===target.id)return socket.emit("game:error","Không thể bắt UNO lúc này.");
    drawCards(r,target,2);target.saidUno=true;r.notice=`${target.name} bị bắt quên UNO và rút phạt 2 lá!`;target.hand.length&&sendPrivateHand(r,target);emitRoom(r);
  });
  socket.on("game:restart",()=>{
    const r=rooms.get(socket.data.roomCode);if(!r)return;const p=playerOf(r,socket.data.playerId);if(!p?.host)return;
    try{startGame(r);r.players.forEach(x=>sendPrivateHand(r,x));emitRoom(r);}catch(e){socket.emit("game:error",e.message);}
  });
  socket.on("disconnect",()=>{
    const r=rooms.get(socket.data.roomCode);if(!r)return;const p=playerOf(r,socket.data.playerId);if(p){p.connected=false;emitRoom(r);}
  });
});

const html404 = (req,res)=>res.status(404).send("Không tìm thấy trang.");
app.get("*",(req,res,next)=>{if(req.path.startsWith("/api/"))return next();res.sendFile(require("path").join(__dirname,"public","index.html"));});
server.listen(PORT,()=>console.log(`UNO TET 2027 listening on ${PORT}`));
