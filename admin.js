const socket=io();const $=id=>document.getElementById(id);let hostId=null,roomCode=null,playerId=null,joined=false,latest=null;
function say(m){const e=$("adminToast");e.textContent=m;e.style.display="block";clearTimeout(say.t);say.t=setTimeout(()=>e.style.display="none",2800);}
$("createBtn").onclick=async()=>{try{const r=await fetch("/api/room/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:$("hostName").value})});const d=await r.json();if(!r.ok)throw Error(d.error);roomCode=d.code;hostId=d.hostId;socket.emit("room:join",{code:roomCode,name:$("hostName").value,hostId});}catch(e){say(e.message);}};
socket.on("room:joined",async d=>{playerId=d.playerId;joined=true;$("roomAdmin").classList.remove("hidden");$("adminCode").textContent=d.code;try{const r=await fetch(`/api/room/${d.code}/qr`);const q=await r.json();$("qrImage").src=q.qr;$("joinUrl").textContent=q.url;}catch(e){say("Không tải được QR");}});
socket.on("room:update",s=>{latest=s;$("adminCode").textContent=s.code;$("adminPlayers").innerHTML=s.players.map(p=>`<div>${p.host?"👑 ":""}${esc(p.name)} — ${p.handCount} lá — ${p.connected?"Online":"Offline"}</div>`).join("");$("startBtn").disabled=s.players.length<2||s.status==="playing";});
socket.on("game:error",say);
$("startBtn").onclick=()=>socket.emit("game:start");
$("restartBtn").onclick=()=>{if(confirm("Chia ván mới?"))socket.emit("game:restart");};
$("copyBtn").onclick=async()=>{try{await navigator.clipboard.writeText($("joinUrl").textContent);say("Đã sao chép link phòng.");}catch(e){say("Không sao chép được.");}};
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
