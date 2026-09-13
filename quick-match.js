"use strict";
module.exports = function installQuickMatch({io, eligible, match, delayMs = 8000}) {
  const entries = new Map();
  const tokenOwners = new Map();
  let timer = null;
  let deadline = null;
  function ready() {return [...entries.values()].filter(e => e.ready && e.socket.connected);}
  function remove(socket) {
    const entry = entries.get(socket.id);
    if (!entry) return;
    entries.delete(socket.id);
    if (tokenOwners.get(entry.token) === socket.id) tokenOwners.delete(entry.token);
  }
  function update() {
    const count = ready().length;
    if (count < 2 && timer) {clearTimeout(timer);timer=null;deadline=null;}
    if (count >= 2 && !timer) {
      deadline = Date.now()+delayMs;
      timer=setTimeout(flush,delayMs);timer.unref?.();
    }
    for (const entry of ready()) entry.socket.emit("quick:queued", {count,deadline});
  }
  async function flush() {
    timer=null;deadline=null;
    const group=ready().slice(0,6);
    if(group.length<2){update();return;}
    // Keep these entries reserved until formation is finished.
    for(const entry of group){entry.ready=false;entry.matching=true;}
    update();
    try {await match(group);}
    catch(err){for(const entry of group)entry.socket.emit("quick:error",{error:err.message || "Recherche interrompue."});}
    finally{for(const entry of group)remove(entry.socket);update();}
  }
  function cancel(socket) {
    if(entries.get(socket.id)?.matching)return false;
    remove(socket);update();return true;
  }
  io.on("connection",socket=>{
    socket.on("quick:join",async(profile={},cb=()=>{})=>{
      if(entries.has(socket.id))return cb({ok:true,queued:true});
      const token=String(profile.walletToken||socket.data.walletToken||"");
      if(!/^[a-f0-9]{48}$/i.test(token))return cb({ok:false,error:"Attends le chargement du profil puis réessaie."});
      if(tokenOwners.has(token))return cb({ok:false,error:"Ce profil recherche déjà une partie sur une autre connexion."});
      const entry={socket,profile,token,ready:false};entries.set(socket.id,entry);tokenOwners.set(token,socket.id);
      try{
        const checked=await eligible(socket,profile);
        if(entries.get(socket.id)!==entry||!socket.connected)return cb({ok:false,cancelled:true});
        entry.profile=checked;entry.ready=true;cb({ok:true,queued:true});update();
      }catch(err){remove(socket);cb({ok:false,error:err.message||"Recherche indisponible."});update();}
    });
    socket.on("quick:cancel",(_payload,cb=()=>{})=>cb({ok:cancel(socket)}));
    socket.on("disconnect",()=>cancel(socket));
  });
  return {cancel, close(){clearTimeout(timer);entries.clear();tokenOwners.clear();}};
};
