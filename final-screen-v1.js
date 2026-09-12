(() => {
  "use strict";

  function esc(value="") {
    try { return escapeHtml(value); } catch {
      return String(value).replace(/[&<>"']/g,c=>({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
      }[c]));
    }
  }

  function isImageAvatar(value) {
    const raw=String(value||"");
    return Boolean(window.PtitBacProfilePhoto?.isImageAvatar?.(raw)) || /^data:image\//i.test(raw);
  }

  function avatar(player, cls="") {
    const raw=String(player?.avatar||"");
    if(isImageAvatar(raw)) {
      return `<div class="fsv1-avatar ${cls}"><img src="${raw}" alt="" draggable="false"></div>`;
    }
    return `<div class="fsv1-avatar ${cls}"><span>${esc(raw || String(player?.name||"?").slice(0,1).toUpperCase())}</span></div>`;
  }

  function coin() {
    return `<img src="/coin.png" alt="" draggable="false">`;
  }

  function difficultyInfo(value) {
    if (value === "hard") return { label: "Difficile", icon: "/difficulty-hard.png" };
    if (value === "medium") return { label: "Normal", icon: "/difficulty-normal.png" };
    return { label: "Facile", icon: "/difficulty-easy.png" };
  }

  function renderFinishedV1() {
    clearInterval(session.timerHandle);

    const state=session.state;
    const user=me();
    if(!state || state.phase!=="finished") return;

    const ranked=[...(state.players||[])].sort((a,b)=>
      Number(b.score||0)-Number(a.score||0) ||
      String(a.name||"").localeCompare(String(b.name||""))
    );

    const rewards=state.rewardsByPlayerId || {};
    const rewardFor=p=>Math.max(0,Number(rewards[p.id]||0));
    const myReward=Math.max(0,Number(state.myReward||0));
    const totalPlayers=ranked.length;
    const top3=ranked.slice(0,3);
    const difficulty=difficultyInfo(state.categoryDifficulty);

    const durationTotal=Math.max(0,
      Number(state.rounds||0) * Number(state.duration||0)
    );
    const durationText=durationTotal>=60
      ? `${Math.floor(durationTotal/60)} min`
      : `${durationTotal}s`;

    const podiumOrder = top3.length >= 3
      ? [top3[1], top3[0], top3[2]]
      : top3.length === 2
        ? [top3[1], top3[0]]
        : top3;

    const placeOf = player => ranked.findIndex(p=>p.id===player.id)+1;

    const podium=podiumOrder.map(player=>{
      const place=placeOf(player);
      const reward=rewardFor(player);
      const isMe=player.id===session.playerId;
      return `
        <article class="fsv1-podium-card place-${place} ${isMe?"is-me":""}">
          <div class="fsv1-medal">${place}</div>
          ${place===1 ? `<div class="fsv1-winner-crown">♛</div>` : ""}
          ${avatar(player,"fsv1-podium-avatar")}
          <strong>${esc(player.name)}</strong>
          <span>${Number(player.score||0)} pts</span>
          <div class="fsv1-podium-reward">${coin()} <b>+${reward} pièces</b></div>
        </article>
      `;
    }).join("");

    const rows=ranked.map((player,index)=>{
      const place=index+1;
      const isMe=player.id===session.playerId;
      return `
        <div class="fsv1-row ${isMe?"is-me":""} rank-${Math.min(place,4)}">
          <span class="fsv1-rank">${place}</span>
          <div class="fsv1-row-player">
            ${avatar(player,"fsv1-row-avatar")}
            <strong>${esc(player.name)}${isMe?` <small>Toi</small>`:""}</strong>
          </div>
          <b>${Number(player.score||0)}</b>
          <span class="fsv1-row-reward">${coin()} <strong>+${rewardFor(player)}</strong></span>
        </div>
      `;
    }).join("");

    setScreen(`
      <main class="fsv1-screen">
        <div class="fsv1-confetti" aria-hidden="true">
          <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          <i></i><i></i><i></i><i></i>
        </div>

        <header class="fsv1-top fsv2-top">
          <div class="fsv1-wallet">
            ${coin()}
            <strong>${typeof getCoins==="function" ? getCoins() : 0}</strong>
            <span>＋</span>
          </div>
        </header>

        <section class="fsv1-heading">
          <h1>Partie <span>terminée !</span></h1>
        </section>

        <section class="fsv1-podium fsv1-podium-${Math.min(3,top3.length)}">
          ${podium}
        </section>

        <section class="fsv1-ranking">
          <div class="fsv1-ranking-head">
            <span>#</span>
            <span>Joueur</span>
            <span>Points</span>
            <span>Pièces gagnées</span>
          </div>
          <div class="fsv1-ranking-body">${rows}</div>
        </section>

        <section class="fsv1-stats fsv2-stats">
          <div>
            <span class="fsv1-stat-icon"><img src="/friends.png" alt=""></span>
            <strong>${totalPlayers}</strong>
            <small>Joueur${totalPlayers>1?"s":""}</small>
          </div>
          <div>
            <span class="fsv1-stat-icon"><img src="/lightning.png" alt=""></span>
            <strong>${Number(state.rounds||0)}</strong>
            <small>Manche${Number(state.rounds||0)>1?"s":""}</small>
          </div>
          <div>
            <span class="fsv1-stat-icon"><img src="/lobby-clock.png" alt=""></span>
            <strong>${durationText}</strong>
            <small>Durée de la partie</small>
          </div>
          <div>
            <span class="fsv1-stat-icon"><img src="${difficulty.icon}" alt=""></span>
            <strong class="fsv2-difficulty">${difficulty.label}</strong>
            <small>Difficulté</small>
          </div>
        </section>

        <section class="fsv1-gain">
          <div class="fsv1-gain-coins">
            ${coin()}${coin()}${coin()}
          </div>
          <div class="fsv1-gain-copy">
            <small>Ton gain total</small>
            <strong>+${myReward} pièces</strong>
            <span>Nouveau solde : ${typeof getCoins==="function" ? getCoins() : 0} pièces</span>
          </div>
          <div class="fsv1-thanks">
            <span>🎁</span>
            <div><strong>Merci d’avoir joué !</strong><small>À très vite pour une nouvelle partie ! 💜</small></div>
          </div>
        </section>

        <div class="fsv1-actions">
          ${user?.isHost
            ? `<button class="fsv1-restart" id="fsv1Restart" type="button">↻ <span>Refaire une partie</span></button>`
            : `<div class="fsv1-wait-host">L’hôte peut relancer une partie.</div>`
          }
          <button class="fsv1-home" id="fsv1Home" type="button">
            ${typeof uiIcon==="function" ? uiIcon("home") : "⌂"}
            <span>Retour à l’accueil</span>
          </button>
        </div>

        <footer class="fsv1-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>
      </main>
    `);

    const leave=()=>{
      socket.emit("room:leave",{code:state.code,playerId:session.playerId});
      clearSession();
      renderHome();
    };

    document.getElementById("fsv1Home")?.addEventListener("click",leave);

    if(user?.isHost){
      document.getElementById("fsv1Restart")?.addEventListener("click",()=>{
        socket.emit("game:restart",{code:state.code,playerId:session.playerId});
      });
    }
  }

  window.renderFinished=renderFinishedV1;
  try { renderFinished=renderFinishedV1; } catch {}
})();