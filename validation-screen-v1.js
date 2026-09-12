(() => {
  "use strict";

  const originalRenderValidation = window.renderValidation;

  function esc(value="") {
    try { return escapeHtml(value); } catch {
      return String(value).replace(/[&<>"']/g,c=>({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
      }[c]));
    }
  }

  function exitModal(state, user) {
    document.querySelector(".vsv1-modal-backdrop")?.remove();

    const overlay=document.createElement("div");
    overlay.className="vsv1-modal-backdrop";
    overlay.innerHTML=`
      <section class="vsv1-modal" role="dialog" aria-modal="true">
        <h2>Quitter la partie ?</h2>
        <div class="vsv1-modal-actions">
          <button type="button" data-action="cancel">Non</button>
          ${user?.isHost ? '<button type="button" data-action="lobby">Revenir au salon</button>' : ""}
          <button type="button" class="danger" data-action="home">Revenir à l’accueil</button>
        </div>
      </section>
    `;

    overlay.addEventListener("click",e=>{
      const action=e.target?.dataset?.action;
      if(e.target===overlay || action==="cancel"){
        overlay.remove();
        return;
      }
      if(action==="lobby"){
        socket.emit("game:returnLobby",{code:state.code,playerId:session.playerId});
        overlay.remove();
        return;
      }
      if(action==="home"){
        socket.emit("room:leave",{code:state.code,playerId:session.playerId});
        clearSession();
        overlay.remove();
        renderHome();
      }
    });

    document.body.appendChild(overlay);
  }

  function renderValidationV1() {
    clearInterval(session.timerHandle);

    const state=session.state;
    const user=me();
    if(!state || state.phase!=="validation"){
      if(typeof originalRenderValidation==="function") return originalRenderValidation();
      return;
    }

    const validation=state.validation || {};
    const unavailable=validation.status==="unavailable";
    const complete=validation.status==="complete";
    const letter=esc(String(state.currentLetter || "?").slice(0,1).toUpperCase());
    const roundNumber=Number(state.roundIndex || 0)+1;
    const rounds=Number(state.rounds || 1);
    const categories=Array.isArray(state.categories) ? state.categories.length : Number(state.categoryCount || 0);

    setScreen(`
      <main class="vsv1-screen">
        <button class="vsv1-exit" id="vsv1Exit" type="button" aria-label="Quitter la partie">
          <img src="/lobby-exit.png" alt="">
        </button>

        <header class="vsv1-top">
          <div class="vsv1-info">
            <small>Manche</small>
            <strong>${roundNumber}/${rounds}</strong>
          </div>
          <div class="vsv1-info">
            <small>Lettre</small>
            <strong class="vsv1-letter">${letter}</strong>
          </div>
          <div class="vsv1-info">
            <small>Catégories</small>
            <strong>${categories}</strong>
          </div>
        </header>

        <section class="vsv1-card ${unavailable ? "is-unavailable" : ""}">
          <div class="vsv1-spinner ${complete ? "is-complete" : unavailable ? "is-error" : ""}">
            ${complete ? "✓" : unavailable ? "!" : ""}
          </div>

          <h1>
            ${complete
              ? "Vérification terminée !"
              : unavailable
                ? "Vérification en pause"
                : "Vérification des réponses…"}
          </h1>

          <p>
            ${complete
              ? "Les résultats de la manche arrivent."
              : unavailable
                ? "La vérification est temporairement indisponible."
                : `L’IA analyse les réponses de tous les joueurs pour la lettre ${letter}.`}
          </p>

          ${unavailable && user?.isHost
            ? `<button class="vsv1-retry" id="vsv1Retry" type="button">↻ Réessayer</button>`
            : ""}
        </section>

        <footer class="ptb-shared-footer vsv1-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>
      </main>
    `);

    document.getElementById("vsv1Exit")?.addEventListener("click",()=>exitModal(state,user));

    document.getElementById("vsv1Retry")?.addEventListener("click",()=>{
      const btn=document.getElementById("vsv1Retry");
      if(btn) btn.disabled=true;
      socket.emit("validation:retry",{code:state.code,playerId:session.playerId});
    });
  }

  window.renderValidation=renderValidationV1;
  try { renderValidation=renderValidationV1; } catch {}
})();