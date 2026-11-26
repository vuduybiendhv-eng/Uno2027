const socket=io();
const $=id=>document.getElementById(id);
let playerId=null,isHost=false,roomState=null,hand=[];
const params=new URLSearchParams(location.search);
if(params.get("room"))$("roomCode").value=params.get("room").toUpperCase();
function toast(msg){const t=$("toast");t.textContent=msg;t.style.display="block";clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.style.display="none",2800);}
function label(v){return ({skip:"CẤM",reverse:"ĐẢO",draw2:"+2",wild:"ĐỔI MÀU",draw4:"+4"})[v]||v;}
function cardText(c){return c.color==="wild"?(c.value==="draw4"?"+4":"ĐỔI\nMÀU"):label(c.value);}
function paintCard(el,c){el.className="uno-card "+c.color;el.textContent=cardText(c);}
$("joinBtn").onclick=()=>join($("roomCode").value.trim().toUpperCase(),$("playerName").value.trim());
function join(code,name){if(!code||code.length!==6)return toast("Nhập mã phòng 6 ký tự.");localStorage.setItem("unoName",name);socket.emit("room:join",{code,name});}
$("playerName").value=localStorage.getItem("unoName")||"";
socket.on("connect",()=>{const c=params.get("room")||localStorage.getItem("unoRoom");if(c&&playerId)join(c,localStorage.getItem("unoName")||"Khách Tết");});
socket.on("room:joined",d=>{playerId=d.playerId;isHost=d.host;localStorage.setItem("unoRoom",d.code);$("entry").classList.add("hidden");$("game").classList.remove("hidden");$("roomLabel").textContent=d.code;toast(isHost?"Chủ LIVE đã vào bàn!":"Vào phòng thành công!");});
socket.on("room:update",s=>{roomState=s;renderRoom();});
socket.on("hand:update",h=>{hand=h;renderHand();});
socket.on("game:error",toast);
socket.on("gift:notice",d=>toast(`🎁 ${d.username} tặng ${d.giftName}`));
function renderRoom(){const s=roomState;if(!s)return;$("statusLabel").textContent=s.status==="lobby"?"Đang chờ":s.status==="playing"?"Đang chơi":"Kết thúc";$("turnLabel").textContent=s.players.find(p=>p.id===s.currentPlayerId)?.name||"-";$("drawCount").textContent=`${s.drawCount} lá`; $("notice").textContent=s.notice||"";$("players").innerHTML="";
s.players.forEach(p=>{const d=document.createElement("div");d.className="player-chip"+(p.id===s.currentPlayerId?" active":"");d.innerHTML=`${escapeHtml(p.name)} ${p.host?"👑":""}<small>${p.handCount} lá · ${p.connected?"Đang kết nối":"Mất kết nối"}</small>`;$("players").append(d);});
if(s.topCard){paintCard($("topCard"),s.topCard);$("activeColor").textContent=({red:"ĐỎ",yellow:"VÀNG",green:"XANH LÁ",blue:"XANH DƯƠNG"})[s.activeColor]||s.activeColor;}
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderHand(){const area=$("hand");area.innerHTML="";hand.forEach(c=>{const b=document.createElement("button");b.className="playing-card "+c.color;b.innerHTML=`<span>${cardText(c).replace("\n","<br>")}</span>`;b.onclick=()=>play(c);area.append(b);});}
function play(c){let color;if(c.color==="wild"){const choice=prompt("Chọn màu: red / yellow / green / blue","red");if(!choice)return;color=choice.toLowerCase();}socket.emit("card:play",{cardId:c.id,color});}
$("drawBtn").onclick=()=>socket.emit("card:draw");
$("passBtn").onclick=()=>socket.emit("turn:pass");
$("unoBtn").onclick=()=>socket.emit("uno:call");
$("catchBtn").onclick=()=>{const s=roomState;if(!s)return;const p=s.players.find(x=>x.handCount===1&&!x.saidUno&&x.id!==playerId);if(!p)return toast("Không có ai để bắt UNO.");socket.emit("uno:catch",{targetId:p.id});};
