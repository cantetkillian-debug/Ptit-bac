(() => {
  "use strict";

  const INTRO_MS = 5000;
  const introByRound = new Map();

  const originalRenderRound = window.renderRound;
  if (typeof originalRenderRound !== "function") {
    console.warn("P'tit Bac: renderRound introuvable, intro de manche désactivée.");
    return;
  }

  function roundKey(state) {
    return `${state?.code || "room"}:${Number(state?.roundIndex ?? -1)}`;
  }

  function getIntroState(state) {
    const key = roundKey(state);
    let entry = introByRound.get(key);

    if (!entry) {
      entry = {
        startedAt: Date.now(),
        endsAt: Date.now() + INTRO_MS,
        finished: false,
        timeoutId: null
      };

      entry.timeoutId = window.setTimeout(() => {
        if (entry.finished) return;
        entry.finished = true;

        const live = session?.state;
        if (!live || live.phase !== "round" || roundKey(live) !== key) return;

        originalRenderRound();
      }, INTRO_MS);

      introByRound.set(key, entry);
    }

    return entry;
  }

  function categoryEmoji(category) {
    try {
      if (typeof window.categoryIcon === "function") {
        return window.categoryIcon(category);
      }
      if (typeof categoryIcon === "function") {
        return categoryIcon(category);
      }
    } catch {}
    return "✨";
  }

  function escape(value) {
    try {
      if (typeof window.escapeHtml === "function") return window.escapeHtml(value);
      if (typeof escapeHtml === "function") return escapeHtml(value);
    } catch {}
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function leaveRound(state) {
    const ok = window.confirm("Quitter la partie ?");
    if (!ok) return;

    try {
      socket.emit("room:leave", {
        code: state.code,
        playerId: session.playerId
      });
      clearSession();
      renderHome();
    } catch (error) {
      console.warn("Impossible de quitter la partie :", error);
    }
  }

  function renderRoundIntro(state, entry) {
    clearInterval(session.timerHandle);

    const letter = String(state.currentLetter || state.letters?.[state.roundIndex] || "?")
      .slice(0, 1)
      .toUpperCase();

    const roundNumber = Math.max(1, Number(state.roundIndex || 0) + 1);
    const categories = Array.isArray(state.categories) ? state.categories : [];
    const duration = Math.max(0, Number(state.duration || 0));

    const categoryCards = categories.map(category => `
      <div class="pri-category">
        <span class="pri-category-icon" aria-hidden="true">${categoryEmoji(category)}</span>
        <strong>${escape(category)}</strong>
      </div>
    `).join("");

    setScreen(`
      <main class="pri-screen">
        <header class="pri-top">
          <button class="pri-exit" id="priExit" type="button" aria-label="Quitter la partie">
            <img src="/lobby-exit.png" alt="">
          </button>
        </header>

        <section class="pri-hero">
          <div class="pri-flag" aria-hidden="true">
            <img src="/round-flag.png" alt="">
          </div>
          <h1>Manche <span>${roundNumber}</span></h1>
          <p>C’est parti !</p>
        </section>

        <section class="pri-stats">
          <article class="pri-stat-card">
            <small>Lettre</small>
            <div class="pri-letter">${escape(letter)}</div>
          </article>

          <article class="pri-stat-card">
            <small>Catégories</small>
            <div class="pri-stat-icon"><img src="/lobby-categories.png" alt=""></div>
            <strong>${categories.length}</strong>
          </article>

          <article class="pri-stat-card pri-stat-time">
            <small>Temps de réponse</small>
            <div class="pri-stat-icon"><img src="/lobby-clock.png" alt=""></div>
            <strong>${duration}s</strong>
          </article>
        </section>

        <section class="pri-categories-panel">
          <div class="pri-panel-title">
            <i></i>
            <strong>Catégories de cette partie</strong>
            <i></i>
          </div>

          <div class="pri-categories-grid">
            ${categoryCards}
          </div>
        </section>

        <section class="pri-countdown-card">
          <p>La manche commence dans</p>
          <div class="pri-countdown-ring">
            <strong id="priCountdown">5</strong>
          </div>
          <small>Prépare tes réponses...</small>
        </section>

        <footer class="ptb-shared-footer pri-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>
      </main>
    `);

    document.getElementById("priExit")?.addEventListener("click", () => leaveRound(state));

    const countdown = document.getElementById("priCountdown");

    const finishIntro = () => {
      if (entry.finished) return;
      entry.finished = true;
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
        entry.timeoutId = null;
      }

      const live = session?.state;
      if (!live || live.phase !== "round" || roundKey(live) !== roundKey(state)) return;
      originalRenderRound();
    };

    const tick = () => {
      if (!countdown || !countdown.isConnected || entry.finished) return;

      const remaining = entry.endsAt - Date.now();
      if (remaining <= 0) {
        finishIntro();
        return;
      }

      // Affichage exact : 5, 4, 3, 2, 1.
      countdown.textContent = String(Math.ceil(remaining / 1000));
      window.requestAnimationFrame(tick);
    };

    tick();
  }

  function wrappedRenderRound() {
    const state = session?.state;

    if (!state || state.phase !== "round") {
      return originalRenderRound();
    }

    const entry = getIntroState(state);

    if (entry.finished || Date.now() >= entry.endsAt) {
      entry.finished = true;
      return originalRenderRound();
    }

    renderRoundIntro(state, entry);
  }

  // render() dans app.js appelle cette fonction globale.
  window.renderRound = wrappedRenderRound;
  try {
    renderRound = wrappedRenderRound;
  } catch {}

  // Nettoyage léger des anciennes manches.
  if (typeof socket !== "undefined") {
    socket.on("room:state", state => {
      if (!state) return;
      const currentIndex = Number(state.roundIndex ?? -1);
      for (const key of introByRound.keys()) {
        const index = Number(key.split(":").pop());
        if (index < currentIndex - 1) {
          const old = introByRound.get(key);
          if (old?.timeoutId) clearTimeout(old.timeoutId);
          introByRound.delete(key);
        }
      }
    });
  }
})();