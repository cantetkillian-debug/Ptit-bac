(() => {
  "use strict";
  let queueTimer=null;
  function closePanel(){clearInterval(queueTimer);queueTimer=null;document.getElementById("walletPanel")?.remove();}
  function panel(title,html){
    closePanel();
    const overlay=document.createElement("div");overlay.id="walletPanel";overlay.className="wallet-panel-backdrop";
    overlay.innerHTML=`<section class="wallet-panel" role="dialog" aria-modal="true" aria-labelledby="walletPanelTitle"><h2 id="walletPanelTitle">${title}</h2>${html}</section>`;
    document.body.appendChild(overlay);return overlay;
  }
  let joining=false, queueState=null;
  window.startQuickPlay=profile=>{
    if(joining)return;
    if(!socket.connected||!session.walletToken)return toast("Attends la connexion au serveur puis réessaie.");
    joining=true;
    socket.timeout(15000).emit("quick:join",{name:profile.name,avatar:profile.icon,walletToken:session.walletToken},(err,res)=>{
      joining=false;
      if(err||!res?.ok){socket.emit("quick:cancel",{});if(!res?.cancelled)toast(res?.error||"La recherche n’a pas répondu. Réessaie.");}
    });
  };
  socket.on("quick:queued",state=>{
    queueState=state;
    clearInterval(queueTimer);
    const update=()=>{
      const status=document.getElementById("quickStatus");if(!status){clearInterval(queueTimer);return;}
      status.textContent=state.deadline
        ? `${state.count} joueurs · préparation dans ${Math.max(0,Math.ceil((state.deadline-Date.now())/1000))} s`
        : "Recherche d’autres joueurs… Tu peux annuler sans perdre de vie.";
    };update();queueTimer=setInterval(update,500);
  });
  socket.on("quick:matched",res=>{
    queueState=null;closePanel();setWalletState(res.walletToken,res.balance);saveSession(res.code,res.playerId);session.state=res.state;render();
  });
  socket.on("quick:error",res=>{closePanel();toast(res?.error||"Recherche interrompue.");});
  socket.on("disconnect",()=>{
    joining=false;
    if(document.getElementById("quickStatus")){closePanel();clearSession();renderHome();toast("Recherche annulée après la perte de connexion.");}
  });
  socket.on("room:closed",res=>{
    if(res?.reason!=="match_cancelled")return;
    closePanel();clearSession();renderHome();toast(res.message||"Lancement annulé.");
  });
  window.openWalletHistory=()=>{
    const el=panel("Mon portefeuille",`<p>Solde : <strong>${getCoins()} pièces</strong></p><div id="walletHistory" role="status">Chargement…</div><button id="walletClose" type="button">Fermer</button>`);
    el.querySelector("#walletClose").onclick=closePanel;
    socket.timeout(8000).emit("wallet:history",{token:session.walletToken,limit:30},(err,res)=>{
      const list=el.querySelector("#walletHistory");if(!list?.isConnected)return;
      if(err||!res?.ok){list.textContent="Historique indisponible. Réessaie dans un instant.";return;}
      list.innerHTML=res.transactions.length?res.transactions.map(tx=>`<div class="wallet-history-row"><span>${escapeHtml(tx.note||tx.type)}<small>${escapeHtml(new Date(tx.at).toLocaleString("fr-FR"))}</small></span><strong>${tx.delta>0?"+":""}${Number(tx.delta)||0}</strong></div>`).join(""):"Aucun mouvement récent.";
    });
  };
  // The primary socket receives game rewards and debits; refresh the HUD too.
  socket.on("economy:update",()=>window.PtitBacEconomy?.refresh());
  socket.on("wallet:update",()=>window.PtitBacEconomy?.refresh());
  const originalScreen=setScreen;
  setScreen=function(html){
    originalScreen(html);
    const quick=session.state?.mode==="quick";
    document.documentElement.classList.toggle("ptb-quick-game",quick);
    if(quick && session.state?.phase==="lobby"){
      const note=document.createElement("p");note.className="wallet-mode-note";note.id="quickStatus";note.setAttribute("role","status");
      note.textContent=queueState?.deadline
        ? queueState.count+" joueurs · préparation dans "+Math.max(0,Math.ceil((queueState.deadline-Date.now())/1000))+" s"
        : "Recherche d’autres joueurs… Tu peux quitter sans perdre de vie.";
      const players=app.querySelector(".lobby-v5-actions");
      (players||app).append(note);
    }

  };
})();
