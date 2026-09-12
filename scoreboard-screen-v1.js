(() => {
  "use strict";

  const originalRenderScoreboard = window.renderScoreboard;

  function esc(value="") {
    try { return escapeHtml(value); } catch {
      return String(value).replace(/[&<>"']/g,c=>({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
      }[c]));
    }
  }

  function categoryEmoji(category) {
    try { return categoryIcon(category); } catch { return "✨"; }
  }

  function isImageAvatar(value) {
    const raw=String(value||"");
    return Boolean(window.PtitBacProfilePhoto?.isImageAvatar?.(raw)) || /^data:image\//i.test(raw);
  }

  function playerAvatar(player) {
    const raw=String(player?.avatar||"");
    if(isImageAvatar(raw)) {
      return `<img src="${raw}" alt="" draggable="false">`;
    }
    return `<span>${esc(raw || String(player?.name||"?").slice(0,1).toUpperCase())}</span>`;
  }

  function exitModal(state,user) {
    document.querySelector(".ssv1-modal-backdrop")?.remove();

    const overlay=document.createElement("div");
    overlay.className="ssv1-modal-backdrop";
    overlay.innerHTML=`
      <section class="ssv1-modal" role="dialog" aria-modal="true">
        <h2>Quitter la partie ?</h2>
        <div class="ssv1-modal-actions">
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

  function roundWinner(state, players) {
    const scores=state.lastRoundScores || {};
    const ranked=[...players].sort((a,b)=>
      Number(scores[b.id]||0)-Number(scores[a.id]||0) ||
      String(a.name||"").localeCompare(String(b.name||""))
    );
    const best=ranked.length ? Number(scores[ranked[0].id]||0) : 0;
    const winners=ranked.filter(p=>Number(scores[p.id]||0)===best);
    return { winners, points:best };
  }

  function renderScoreboardV1() {
    const state=session.state;
    const user=me();

    if(!state || state.phase!=="scoreboard"){
      if(typeof originalRenderScoreboard==="function") return originalRenderScoreboard();
      return;
    }

    const players=[...(state.players||[])];
    const results=state.lastRoundResults || {
      byPlayer:{},
      categories:state.categories || [],
      letter:state.currentLetter || ""
    };
    const categories=(results.categories?.length ? results.categories : state.categories) || [];
    const letter=String(results.letter || state.currentLetter || "?").slice(0,1).toUpperCase();
    const isLastRound=Number(state.roundIndex||0)+1 >= Number(state.rounds||1);
    const winner=roundWinner(state,players);

    const winnerNames=winner.winners.map(p=>esc(p.name)).join(" & ");
    const winnerTitle=winner.winners.length>1 ? "Égalité sur la manche" : "Vainqueur de la manche";
    const winnerPoints=winner.winners.length>1
      ? `avec ${winner.points} point${winner.points!==1?"s":""} chacun !`
      : `avec ${winner.points} point${winner.points!==1?"s":""} !`;

    const headerCells=categories.map(category=>`
      <div class="ssv1-cat-head">
        <span>${categoryEmoji(category)}</span>
        <small>${esc(category)}</small>
      </div>
    `).join("");

    const rows=players.map((player,index)=>{
      const cells=categories.map(category=>{
        const result=results.byPlayer?.[player.id]?.[category] || {
          answer:"",
          status:"invalid",
          correction:"Aucune réponse"
        };

        const status=result.status==="valid"
          ? "valid"
          : result.status==="duplicate"
            ? "duplicate"
            : "invalid";

        const hasAnswer=Boolean(result.answer);
        const symbol=status==="valid" ? "✓" : status==="duplicate" ? "!" : (hasAnswer ? "×" : "");
        const answer=hasAnswer ? esc(result.answer) : "—";
        const correction=status==="valid"
          ? ""
          : esc(result.correction || (status==="duplicate" ? "Doublon" : "Incorrect"));

        const canReport=
          player.id===session.playerId &&
          status==="invalid" &&
          result.reportable;

        return `
          <div class="ssv1-answer ${status}">
            <strong>${answer}</strong>
            <b>${symbol}</b>
            ${correction ? `<small>${correction}</small>` : ""}
            ${canReport ? `
              <button
                type="button"
                class="ssv1-report ${result.reported?"is-reported":""}"
                data-category="${encodeURIComponent(category)}"
                data-round="${Number(results.roundIndex ?? state.roundIndex)}"
                ${result.reported?"disabled":""}
              >${result.reported?"Signalé ✓":"Signaler"}</button>
            ` : ""}
          </div>
        `;
      }).join("");

      return `
        <div class="ssv1-player-row">
          <div class="ssv1-player">
            <div class="ssv1-avatar">${playerAvatar(player)}</div>
            <div class="ssv1-player-copy">
              <strong>${esc(player.name || "Joueur")}</strong>
              <small>${Number(player.score || 0)} pt${Number(player.score || 0) !== 1 ? "s" : ""}</small>
            </div>
          </div>
          ${cells}
        </div>
      `;
    }).join("");

    setScreen(`
      <main class="ssv1-screen">
        <button class="ssv1-exit" id="ssv1Exit" type="button" aria-label="Quitter la partie">
          <img src="/lobby-exit.png" alt="">
        </button>

        <header class="ssv1-top">
          <div class="ssv1-info">
            <small>Manche</small>
            <strong>${Number(state.roundIndex||0)+1}/${Number(state.rounds||1)}</strong>
          </div>
          <div class="ssv1-info">
            <small>Lettre</small>
            <strong class="ssv1-letter">${esc(letter)}</strong>
          </div>
          <div class="ssv1-info">
            <small>Catégories</small>
            <strong>${categories.length}</strong>
          </div>
        </header>

        <section class="ssv1-heading">
          <h1>Résultats <span>de la manche</span></h1>
          <p>Voici toutes les réponses et leurs corrections !</p>
        </section>

        <section class="ssv1-board-wrap">
          <div class="ssv1-scroll-hint" aria-hidden="true">Glisse pour voir les autres catégories →</div>
          <div class="ssv1-board" style="--ssv1-cols:${Math.max(1,categories.length)}">
            <div class="ssv1-grid-head">
              <div class="ssv1-player-title">Joueurs</div>
              ${headerCells}
            </div>
            ${rows}
          </div>
        </section>

        <section class="ssv1-winner">
          <div class="ssv1-trophy">🏆</div>
          <div class="ssv1-winner-copy">
            <small>${winnerTitle}</small>
            <strong>${winnerNames || "Aucun vainqueur"}</strong>
            <span>${winnerNames ? winnerPoints : "Aucun point marqué."}</span>
          </div>
          <div class="ssv1-crown" aria-hidden="true">✦</div>
        </section>

        ${user?.isHost ? `
          <button class="ssv1-next" id="ssv1Next" type="button">
            ${isLastRound ? "Classement final" : "Manche suivante"}
            <span>›</span>
          </button>
          <button class="ssv1-lobby" id="ssv1Lobby" type="button">
            <span class="ssv1-home-icon" aria-hidden="true">⌂</span>
            Retour au salon
          </button>
        ` : `
          <div class="ssv1-wait-host">
            <span class="ssv1-mini-spinner"></span>
            En attente de l’hôte pour continuer
          </div>
        `}

        <footer class="ptb-shared-footer ssv1-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>
      </main>
    `);

    document.getElementById("ssv1Exit")?.addEventListener("click",()=>exitModal(state,user));

    document.getElementById("ssv1Next")?.addEventListener("click",()=>{
      socket.emit("game:nextRound",{code:state.code,playerId:session.playerId});
    });

    document.getElementById("ssv1Lobby")?.addEventListener("click",()=>{
      socket.emit("game:returnLobby",{code:state.code,playerId:session.playerId});
    });

    document.querySelectorAll(".ssv1-report:not(:disabled)").forEach(btn=>{
      btn.addEventListener("click",()=>{
        btn.disabled=true;
        btn.textContent="Envoi…";

        socket.emit("answer:report",{
          code:state.code,
          playerId:session.playerId,
          roundIndex:Number(btn.dataset.round),
          category:decodeURIComponent(btn.dataset.category||"")
        },res=>{
          if(!res?.ok){
            btn.disabled=false;
            btn.textContent="Signaler";
            return toast(res?.error || "Impossible d’envoyer le signalement.");
          }
          btn.textContent="Signalé ✓";
          btn.classList.add("is-reported");
          toast("Signalement envoyé.");
        });
      });
    });
  }

  window.renderScoreboard=renderScoreboardV1;
  try { renderScoreboard=renderScoreboardV1; } catch {}
})();