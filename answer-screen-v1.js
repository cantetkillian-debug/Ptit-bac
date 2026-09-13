(() => {
  "use strict";




  const originalRenderRound = window.renderRound;
  if (typeof originalRenderRound !== "function") return;

  function esc(v="") {
    try { return escapeHtml(v); } catch {
      return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
    }
  }

  function icon(category) {
    try { return categoryIcon(category); } catch { return "✨"; }
  }

  function adminCoins() {
    const infinite = document.documentElement.classList.contains("ptb-admin-infinite-coins") ||
      Boolean(window.PtitBacAdminDisplayState?.infiniteCoins);
    return infinite ? "∞" : String(typeof getCoins === "function" ? getCoins() : 0);
  }

  function renderAnswerScreenV1() {
    clearInterval(session.timerHandle);
    const state = session.state;
    if (!state || state.phase !== "round") return originalRenderRound();

    const letter = String(state.currentLetter || "?").slice(0,1).toUpperCase();
    const fields = (state.categories || []).map(category => {
      const key = answerKey(category);
      const value = session.localAnswers[key] || "";
      return `
        <div class="asv1-row">
          <div class="asv1-category">
            <span>${icon(category)}</span>
            <strong>${esc(category)}</strong>
          </div>
          <div class="asv1-input-wrap">
            <input class="answer-input asv1-input" data-category="${esc(category)}"
              maxlength="60" autocomplete="off" autocapitalize="words" enterkeyhint="next"
              aria-label="${esc(category)}"
              placeholder="Ta réponse..." value="${esc(value)}">
            <button type="button" class="asv1-clear" data-clear-category="${esc(category)}" aria-label="Effacer">×</button>
          </div>
        </div>`;
    }).join("");

    setScreen(`
      <main class="asv1-screen">
        <header class="asv1-header">
          <button class="asv1-quit" id="leaveGameBtn" type="button" aria-label="Quitter la partie">
            <img src="/lobby-exit.png" alt="">
          </button>
          <div class="asv1-status">
            <div class="asv1-coins"><img src="/coin.png" alt=""><b>${adminCoins()}</b></div>
            <div class="asv1-round">Manche <b>${Number(state.roundIndex||0)+1}/${state.rounds}</b></div>
          </div>
        </header>

        <section class="asv1-hero">
          <div class="asv1-letter-card">
            <small>Lettre actuelle</small>
            <strong class="asv1-letter-plain">${esc(letter)}</strong>
          </div>

          <div class="asv1-timer" id="timerRing" style="--progress:100%">
            <div><strong id="timer">${state.duration}</strong><span>secondes</span></div>
          </div>

          <div class="asv1-tip">
            <img src="/lightning.png" alt="">
            <p>Trouve un mot<br>pour chaque<br>catégorie !</p>
          </div>
        </section>

        <section class="asv1-list">${fields}</section>

        <button class="asv1-submit" id="submitRound" type="button">
          <span>➤</span> Valider mes réponses
        </button>

        <aside class="asv1-rule">
          <span>i</span>
          <p>Une réponse rapporte <b>1 point</b> uniquement si elle est valide et qu’aucun autre joueur n’a donné la même réponse.</p>
        </aside>

        <footer class="ptb-shared-footer asv1-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>
      </main>
    `);

    document.querySelectorAll(".answer-input").forEach(input => {
      input.addEventListener("input", e => {
        const category=e.target.dataset.category;
        session.localAnswers[answerKey(category)]=e.target.value;
        socket.emit("answer:update",{code:state.code,playerId:session.playerId,category,value:e.target.value});
      });
    });

    document.querySelectorAll("[data-clear-category]").forEach(btn => {
      btn.onclick=()=>{
        const category=btn.dataset.clearCategory;
        const input=document.querySelector(`.answer-input[data-category="${CSS.escape(category)}"]`);
        if(!input)return;
        input.value="";
        session.localAnswers[answerKey(category)]="";
        socket.emit("answer:update",{code:state.code,playerId:session.playerId,category,value:""});
        input.focus();
      };
    });

    document.getElementById("leaveGameBtn").onclick=()=>{
      gameExitModal(state, me(), "asv1-exit");
    };

    document.getElementById("submitRound").onclick=()=>{
      if (!socket.connected) return toast("Connexion interrompue. Attends la reconnexion.");
      document.getElementById("submitRound").disabled=true;
      socket.emit("round:submit",{code:state.code,playerId:session.playerId});
    };

    const tick=()=>{
      const timer=document.getElementById("timer");
      const ring=document.getElementById("timerRing");
      if(!timer)return;
      const remaining=Math.max(0,state.roundEndsAt-Date.now());
      const seconds=Math.ceil(remaining/1000);
      timer.textContent=String(seconds);
      const progress=state.duration>0?Math.max(0,Math.min(100,(remaining/(state.duration*1000))*100)):0;
      if(ring){
        ring.style.setProperty("--progress",`${progress}%`);
        ring.classList.toggle("danger",seconds<=10);
      }
      if(seconds<=0) document.querySelectorAll(".asv1-input,.asv1-clear,#submitRound").forEach(el=>el.disabled=true);
    };
    tick();
    session.timerHandle=setInterval(tick,100);
  }

  window.renderRound=renderAnswerScreenV1;
  try { renderRound=renderAnswerScreenV1; } catch {}
})();
