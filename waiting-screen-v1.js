(() => {
  "use strict";

  function gameExitModal(state, user, prefix) {
    document.querySelector(`.${prefix}-modal-backdrop`)?.remove();
    const overlay = document.createElement("div");
    overlay.className = `${prefix}-modal-backdrop`;
    overlay.innerHTML = `
      <section class="${prefix}-modal" role="dialog" aria-modal="true">
        <h2>Quitter la partie ?</h2>
        <div class="${prefix}-modal-actions">
          <button type="button" data-action="cancel">Non</button>
          ${user?.isHost ? '<button type="button" data-action="lobby">Revenir au salon</button>' : ""}
          <button type="button" class="danger" data-action="home">Revenir à l’accueil</button>
        </div>
      </section>
    `;

    overlay.addEventListener("click", e => {
      const action = e.target?.dataset?.action;
      if (e.target === overlay || action === "cancel") {
        overlay.remove();
        return;
      }
      if (action === "lobby") {
        socket.emit("game:returnLobby", { code: state.code, playerId: session.playerId });
        overlay.remove();
        return;
      }
      if (action === "home") {
        socket.emit("room:leave", { code: state.code, playerId: session.playerId });
        clearSession();
        overlay.remove();
        renderHome();
      }
    });
    document.body.appendChild(overlay);
  }


  function esc(value="") {
    try { return escapeHtml(value); } catch {
      return String(value).replace(/[&<>"']/g, c => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
      }[c]));
    }
  }

  function coinsLabel() {
    const infinite =
      document.documentElement.classList.contains("ptb-admin-infinite-coins") ||
      Boolean(window.PtitBacAdminDisplayState?.infiniteCoins);
    return infinite ? "∞" : String(typeof getCoins === "function" ? getCoins() : 0);
  }

  function playerAvatar(player, index) {
    const raw = String(player?.avatar || "");
    const isImage =
      Boolean(window.PtitBacProfilePhoto?.isImageAvatar?.(raw)) ||
      /^data:image\//i.test(raw);

    if (isImage) {
      return `<div class="wsv1-avatar"><img src="${raw}" alt="" draggable="false"></div>`;
    }

    const content = raw || String(player?.name || "?").slice(0,1).toUpperCase();
    return `<div class="wsv1-avatar"><span>${esc(content)}</span></div>`;
  }

  function renderWaitingV1() {
    clearInterval(session.timerHandle);
    const state=session.state;
    if(!state || state.phase!=="round") return;

    const players=Array.isArray(state.players) ? state.players : [];
    const readyCount=players.filter(p=>p.submitted).length;
    const total=players.length;
    const allReady=total>0 && readyCount===total;
    const letter=esc(String(state.currentLetter || "?").slice(0,1).toUpperCase());

    setScreen(`
      <main class="wsv1-screen">
        <button class="wsv1-exit" id="wsv1Exit" type="button" aria-label="Quitter la partie">
          <img src="/lobby-exit.png" alt="">
        </button>

        <header class="wsv1-top">
          <div class="wsv1-round">
            <small>Manche</small>
            <strong>${Number(state.roundIndex||0)+1}/${Number(state.rounds||1)}</strong>
          </div>

          <div class="wsv1-letter">
            <small>Lettre</small>
            <strong>${letter}</strong>
          </div>

          <div class="wsv1-categories">
            <img src="/lobby-categories.png" alt="">
            <div><small>Catégories</small><strong>${Array.isArray(state.categories) ? state.categories.length : 0}</strong></div>
          </div>
        </header>

        <section class="wsv1-main">
          <div class="wsv1-timer" id="wsv1TimerRing" style="--wsv1-progress:100%">
            <div>
              <strong id="wsv1Timer">${Math.max(0, Number(state.duration||0))}</strong>
              <span>secondes</span>
            </div>
          </div>

          <h1 id="wsv1Title">${allReady ? "Tout le monde est prêt !" : "En attente des autres joueurs…"}</h1>
          <p>Tes réponses sont enregistrées.</p>
        </section>

        <section class="wsv1-players">
          <div class="wsv1-players-head">
            <h2>Joueurs prêts <span>(${readyCount}/${total})</span></h2>
            ${!allReady ? `<small>${total-readyCount} restant${total-readyCount>1?"s":""}</small>` : ""}
          </div>

          <div class="wsv1-player-list">
            ${players.map((p,index)=>`
              <article class="wsv1-player ${p.submitted?"is-ready":"is-writing"}">
                ${playerAvatar(p,index)}
                <strong>${esc(p.name)}</strong>
                <span class="wsv1-state">
                  ${p.submitted
                    ? `<b class="wsv1-check">✓</b> Prêt`
                    : `<i class="wsv1-spinner" aria-hidden="true"></i> En cours…`}
                </span>
              </article>
            `).join("")}
          </div>
        </section>

        <footer class="ptb-shared-footer wsv1-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>
      </main>
    `);

    document.getElementById("wsv1Exit")?.addEventListener("click", () => {
      gameExitModal(state, me(), "wsv1-exit");
    });

    const tick=()=>{
      const timer=document.getElementById("wsv1Timer");
      const ring=document.getElementById("wsv1TimerRing");
      if(!timer || !ring) return;

      // Exactement le même roundEndsAt que la page Réponses :
      // le chrono ne redémarre jamais après validation.
      const remainingMs=Math.max(0, Number(state.roundEndsAt||0)-Date.now());
      const seconds=Math.ceil(remainingMs/1000);
      timer.textContent=String(seconds);

      const durationMs=Math.max(1, Number(state.duration||0)*1000);
      const progress=Math.max(0,Math.min(100,(remainingMs/durationMs)*100));
      ring.style.setProperty("--wsv1-progress",`${progress}%`);
      ring.classList.toggle("is-danger",seconds<=10);

      if(seconds<=0){
        ring.classList.add("is-finished");
      }
    };

    tick();
    session.timerHandle=setInterval(tick,100);
  }

  // render() d'app.js appelle ce binding global quand me().submitted === true.
  window.renderRoundWaiting=renderWaitingV1;
  try { renderRoundWaiting=renderWaitingV1; } catch {}
})();