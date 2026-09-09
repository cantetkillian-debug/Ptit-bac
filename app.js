const socket = io();
const app = document.getElementById("app");
const toastEl = document.getElementById("toast");

const session = {
  code: localStorage.getItem("petitbac_code") || "",
  playerId: localStorage.getItem("petitbac_playerId") || "",
  state: null,
  localAnswers: {},
  timerHandle: null
};

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

socket.on("toast", toast);
socket.on("room:state", state => {
  session.state = state;
  render();
});

socket.on("connect", () => {
  if (session.code && session.playerId) {
    socket.emit("room:reconnect", { code: session.code, playerId: session.playerId }, res => {
      if (res?.ok) {
        session.state = res.state;
        render();
      } else {
        clearSession();
        renderHome();
      }
    });
  } else {
    renderHome();
  }
});

function saveSession(code, playerId) {
  session.code = code;
  session.playerId = playerId;
  localStorage.setItem("petitbac_code", code);
  localStorage.setItem("petitbac_playerId", playerId);
}

function clearSession() {
  session.code = "";
  session.playerId = "";
  session.state = null;
  session.localAnswers = {};
  localStorage.removeItem("petitbac_code");
  localStorage.removeItem("petitbac_playerId");
}

function me() {
  return session.state?.players.find(p => p.id === session.playerId);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function setScreen(html) {
  app.innerHTML = html;
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderHome() {
  if (session.state) return render();
  setScreen(`
    <main class="screen center-screen">
      <div class="home-logo">Petit Bac</div>
      <div class="home-actions">
        <button class="btn btn-primary" id="createBtn">Créer une partie</button>
        <button class="btn btn-outline" id="joinBtn">Rejoindre une partie</button>
      </div>
    </main>
  `);
  document.getElementById("createBtn").onclick = () => renderNameForm("create");
  document.getElementById("joinBtn").onclick = () => renderJoinForm();
}

function renderNameForm(mode) {
  setScreen(`
    <main class="screen form-screen">
      <button class="back" id="backBtn">← Retour</button>
      <div>
        <h1>Créer une partie</h1>
        <p class="subtitle">Choisis ton prénom pour commencer.</p>
      </div>
      <form id="nameForm" class="stack">
        <div>
          <label class="label" for="name">Ton prénom</label>
          <input class="input" id="name" maxlength="24" autocomplete="name" placeholder="Ex. Joris" autofocus />
        </div>
        <button class="btn btn-primary" type="submit">Continuer</button>
      </form>
    </main>
  `);
  document.getElementById("backBtn").onclick = renderHome;
  document.getElementById("nameForm").onsubmit = e => {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    socket.emit("room:create", { name }, res => {
      if (!res?.ok) return toast(res?.error || "Impossible de créer la partie.");
      saveSession(res.code, res.playerId);
      session.state = res.state;
      render();
    });
  };
}

function renderJoinForm() {
  setScreen(`
    <main class="screen form-screen">
      <button class="back" id="backBtn">← Retour</button>
      <div>
        <h1>Rejoindre une partie</h1>
        <p class="subtitle">Entre le code reçu et ton prénom.</p>
      </div>
      <form id="joinForm" class="stack">
        <div>
          <label class="label" for="code">Code de la partie</label>
          <input class="input" id="code" maxlength="5" autocapitalize="characters" placeholder="C9KL3" />
        </div>
        <div>
          <label class="label" for="name">Ton prénom</label>
          <input class="input" id="name" maxlength="24" autocomplete="name" placeholder="Ex. Sarah" />
        </div>
        <button class="btn btn-primary" type="submit">Rejoindre</button>
      </form>
    </main>
  `);
  document.getElementById("backBtn").onclick = renderHome;
  const codeInput = document.getElementById("code");
  codeInput.oninput = () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  };
  document.getElementById("joinForm").onsubmit = e => {
    e.preventDefault();
    socket.emit("room:join", {
      code: codeInput.value,
      name: document.getElementById("name").value
    }, res => {
      if (!res?.ok) return toast(res?.error || "Impossible de rejoindre.");
      saveSession(res.code, res.playerId);
      session.state = res.state;
      render();
    });
  };
}

function render() {
  if (!session.state) return renderHome();
  clearInterval(session.timerHandle);
  session.timerHandle = null;

  switch (session.state.phase) {
    case "lobby": return renderLobby();
    case "round": return me()?.submitted ? renderRoundWaiting() : renderRound();
    case "validation": return renderValidation();
    case "scoreboard": return renderScoreboard();
    case "finished": return renderFinished();
    default: return renderHome();
  }
}

function renderLobby() {
  const state = session.state;
  const user = me();
  const players = state.players.map(p => `
    <div class="player-row">
      <span class="dot ${p.connected ? "on" : ""}"></span>
      <span>${escapeHtml(p.name)}</span>
      ${p.isHost ? `<span class="host-pill">Hôte</span>` : ""}
    </div>
  `).join("");

  setScreen(`
    <main class="screen">
      <div class="brand">P'tit Bac</div>
      <h2 class="lobby-title">Code à partager</h2>
      <button class="code" id="copyCode">${escapeHtml(state.code)}</button>
      <p class="hint">Clique sur le code pour le copier et l’envoyer à tes amis</p>

      <h2 class="section-title">Joueurs :</h2>
      <div class="players">${players}</div>

      ${user?.isHost ? `
        <button class="btn btn-primary" id="startBtn" ${state.players.length < 2 ? "disabled" : ""}>
          Lancer la partie
        </button>
        ${state.players.length < 2 ? `<p class="hint">Il faut au moins 2 joueurs.</p>` : ""}
      ` : `
        <div class="wait-card">
          <div class="spinner"></div>
          <h3>En attente de l’hôte</h3>
          <p class="subtitle" style="margin-bottom:0">La partie commencera dès qu’il la lance.</p>
        </div>
      `}

      <div class="rules-mini">
        5 manches · 60 secondes · 6 catégories fixes · 1 point si la réponse est valide et unique
      </div>
    </main>
  `);

  document.getElementById("copyCode").onclick = async () => {
    try {
      await navigator.clipboard.writeText(state.code);
      toast("Code copié !");
    } catch {
      toast(`Code : ${state.code}`);
    }
  };

  if (user?.isHost) {
    document.getElementById("startBtn").onclick = () => {
      socket.emit("game:start", { code: state.code, playerId: session.playerId });
    };
  }
}

function answerKey(category) {
  return `${session.state.roundIndex}:${category}`;
}

function renderRound() {
  const state = session.state;
  const letter = state.currentLetter;

  const fields = state.categories.map(category => {
    const key = answerKey(category);
    const value = session.localAnswers[key] || "";
    return `
      <div class="answer-card">
        <label>${escapeHtml(category)}</label>
        <input
          class="answer-input"
          data-category="${escapeHtml(category)}"
          maxlength="60"
          autocomplete="off"
          autocapitalize="words"
          placeholder="${letter}..."
          value="${escapeHtml(value)}"
        />
      </div>
    `;
  }).join("");

  setScreen(`
    <main class="screen">
      <div class="game-top">
        <span class="round-chip">Manche ${state.roundIndex + 1}/5</span>
        <span class="timer" id="timer">60</span>
      </div>

      <div class="letter-card">
        <div class="letter-label">Lettre</div>
        <div class="letter">${escapeHtml(letter)}</div>
      </div>

      <div class="answer-list">${fields}</div>

      <div class="sticky-action">
        <button class="btn btn-primary" id="submitRound">J’ai terminé</button>
      </div>
    </main>
  `);

  document.querySelectorAll(".answer-input").forEach(input => {
    input.addEventListener("input", e => {
      const category = e.target.dataset.category;
      const key = answerKey(category);
      session.localAnswers[key] = e.target.value;
      socket.emit("answer:update", {
        code: state.code,
        playerId: session.playerId,
        category,
        value: e.target.value
      });
    });
  });

  document.getElementById("submitRound").onclick = () => {
    document.getElementById("submitRound").disabled = true;
    socket.emit("round:submit", { code: state.code, playerId: session.playerId });
  };

  const tick = () => {
    const timer = document.getElementById("timer");
    if (!timer) return;
    const seconds = Math.max(0, Math.ceil((state.roundEndsAt - Date.now()) / 1000));
    timer.textContent = String(seconds);
    timer.classList.toggle("danger", seconds <= 10);
    if (seconds <= 0) {
      document.querySelectorAll("input, button").forEach(el => el.disabled = true);
    }
  };
  tick();
  session.timerHandle = setInterval(tick, 200);
}

function renderRoundWaiting() {
  const state = session.state;
  setScreen(`
    <main class="screen">
      <div class="game-top">
        <span class="round-chip">Manche ${state.roundIndex + 1}/5</span>
        <span class="timer" id="timer">—</span>
      </div>
      <div class="letter-card">
        <div class="letter-label">Lettre</div>
        <div class="letter">${escapeHtml(state.currentLetter)}</div>
      </div>
      <div class="wait-card">
        <div class="spinner"></div>
        <h2>Réponses envoyées</h2>
        <p class="subtitle" style="margin-bottom:0">On attend les autres joueurs.</p>
      </div>
      <h3 class="section-title">Joueurs</h3>
      <div class="players">
        ${state.players.map(p => `
          <div class="player-row">
            <span>${escapeHtml(p.name)}</span>
            <span class="status-pill ${p.submitted ? "done" : ""}">${p.submitted ? "Prêt" : "Écrit…"}</span>
          </div>
        `).join("")}
      </div>
    </main>
  `);
}

function renderValidation() {
  const state = session.state;
  const user = me();
  const validation = state.validation;
  const pending = validation?.items?.[validation.cursor];

  if (!user?.isHost) {
    setScreen(`
      <main class="screen center-screen">
        <div class="wait-card">
          <div class="spinner"></div>
          <h2>Validation des réponses</h2>
          <p class="subtitle" style="margin-bottom:0">L’hôte vérifie les réponses uniques.</p>
        </div>
      </main>
    `);
    return;
  }

  if (!pending) {
    setScreen(`
      <main class="screen center-screen">
        <div class="wait-card"><div class="spinner"></div><h2>Calcul des scores…</h2></div>
      </main>
    `);
    return;
  }

  const remaining = validation.items.filter(i => i.status === "pending").length;
  setScreen(`
    <main class="screen center-screen">
      <div class="review-card">
        <div class="review-kicker">À valider · ${remaining} restante${remaining > 1 ? "s" : ""}</div>
        <div class="review-answer">${escapeHtml(pending.answer)}</div>
        <div class="review-meta">${escapeHtml(pending.category)} · ${escapeHtml(pending.playerName)}</div>
        <p>Cette réponse est-elle valide pour la lettre <strong>${escapeHtml(state.currentLetter)}</strong> ?</p>
        <div class="review-actions">
          <button class="btn btn-red" id="invalidBtn">✕ Invalide</button>
          <button class="btn btn-green" id="validBtn">✓ Valide</button>
        </div>
      </div>
      <p class="rules-mini">Les doublons, réponses vides et mauvaises lettres sont déjà mis à 0 automatiquement.</p>
    </main>
  `);

  const judge = status => socket.emit("validation:judge", {
    code: state.code,
    playerId: session.playerId,
    itemId: pending.id,
    status
  });
  document.getElementById("invalidBtn").onclick = () => judge("invalid");
  document.getElementById("validBtn").onclick = () => judge("valid");
}

function rankedPlayers() {
  return [...session.state.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function renderScoreboard() {
  const state = session.state;
  const user = me();
  const rows = rankedPlayers().map((p, index) => {
    const gain = state.lastRoundScores[p.id] ?? 0;
    return `
      <div class="score-row">
        <div class="rank">#${index + 1}</div>
        <div class="score-name">${escapeHtml(p.name)}</div>
        <div>
          <div class="score-total">${p.score}</div>
          <span class="round-gain">+${gain} cette manche</span>
        </div>
      </div>
    `;
  }).join("");

  setScreen(`
    <main class="screen">
      <div class="brand" style="margin-bottom:26px">P'tit Bac</div>
      <h1 style="font-size:3rem">Classement</h1>
      <p class="subtitle">Manche ${state.roundIndex + 1} terminée.</p>
      <div class="scoreboard">${rows}</div>

      ${user?.isHost
        ? `<button class="btn btn-primary" id="nextRound">Manche suivante</button>`
        : `<div class="wait-card"><div class="spinner"></div><h3>En attente de l’hôte</h3></div>`
      }

      <div class="category-pills">
        ${state.categories.map(c => `<span class="category-pill">${escapeHtml(c)}</span>`).join("")}
      </div>
    </main>
  `);

  if (user?.isHost) {
    document.getElementById("nextRound").onclick = () =>
      socket.emit("game:nextRound", { code: state.code, playerId: session.playerId });
  }
}

function renderFinished() {
  const state = session.state;
  const user = me();
  const ranked = rankedPlayers();
  const topScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter(p => p.score === topScore);
  const winnerText = winners.length === 1 ? winners[0].name : winners.map(w => w.name).join(" & ");

  const rows = ranked.map((p, index) => `
    <div class="score-row">
      <div class="rank">#${index + 1}</div>
      <div class="score-name">${escapeHtml(p.name)}</div>
      <div class="score-total">${p.score}/30</div>
    </div>
  `).join("");

  setScreen(`
    <main class="screen">
      <div class="winner-card">
        <div class="winner-emoji">🏆</div>
        <p class="review-kicker">${winners.length > 1 ? "Égalité !" : "Gagnant"}</p>
        <div class="winner-name">${escapeHtml(winnerText)}</div>
        <div class="winner-score">${topScore} point${topScore !== 1 ? "s" : ""}</div>
      </div>

      <h2 class="section-title">Classement final</h2>
      <div class="scoreboard">${rows}</div>

      ${user?.isHost
        ? `<button class="btn btn-primary" id="restartBtn">Rejouer</button>`
        : `<div class="wait-card"><h3>L’hôte peut relancer une partie.</h3></div>`
      }
      <button class="btn btn-ghost" id="leaveBtn">← Quitter la partie</button>
    </main>
  `);

  if (user?.isHost) {
    document.getElementById("restartBtn").onclick = () =>
      socket.emit("game:restart", { code: state.code, playerId: session.playerId });
  }
  document.getElementById("leaveBtn").onclick = () => {
    clearSession();
    location.reload();
  };
}

window.addEventListener("beforeunload", () => {
  clearInterval(session.timerHandle);
});
