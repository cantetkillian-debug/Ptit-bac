(() => {
  "use strict";

  let countdownTimer = null;
  let countdownFinishTimer = null;
  let countdownActive = false;
  let countdownCode = "";
  let countdownAudio = null;
  let lastCountdownValue = "";

  function isLobbyVisible() {
    return !!document.querySelector(".lobby-v5");
  }

  function currentPlayer() {
    try {
      return typeof me === "function" ? me() : null;
    } catch {
      return null;
    }
  }

  function removeCountdown() {
    clearInterval(countdownTimer);
    clearTimeout(countdownFinishTimer);
    countdownTimer = null;
    countdownFinishTimer = null;
    countdownActive = false;
    countdownCode = "";
    lastCountdownValue = "";

    if (countdownAudio) {
      try {
        countdownAudio.pause();
        countdownAudio.currentTime = 0;
      } catch {}
      countdownAudio = null;
    }

    document.getElementById("lobbyStartCountdown")?.remove();
  }

  function ensureCountdownOverlay() {
    let overlay = document.getElementById("lobbyStartCountdown");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "lobbyStartCountdown";
    overlay.className = "lobby-start-countdown";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "assertive");
    overlay.innerHTML = `
      <div class="lobby-start-countdown-card">
        <div class="lobby-countdown-rocket" aria-hidden="true">🚀</div>
        <h2>La partie commence dans</h2>

        <div class="lobby-countdown-ring" aria-hidden="true">
          <div class="lobby-countdown-ring-track"></div>
          <div class="lobby-countdown-ring-glow"></div>
          <strong id="lobbyCountdownNumber">3</strong>
          <i class="spark s1"></i>
          <i class="spark s2"></i>
          <i class="spark s3"></i>
          <i class="spark s4"></i>
        </div>

        <p>Préparez-vous !</p>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function startCountdown(payload = {}) {
    if (!payload.code || String(payload.code) !== String(session?.state?.code || session?.code || "")) {
      return;
    }

    removeCountdown();

    countdownActive = true;
    countdownCode = String(payload.code);

    const overlay = ensureCountdownOverlay();
    const number = overlay.querySelector("#lobbyCountdownNumber");
    const card = overlay.querySelector(".lobby-start-countdown-card");
    const ring = overlay.querySelector(".lobby-countdown-ring");

    try {
      countdownAudio = new Audio("/ptitbac-countdown-neon.wav");
      countdownAudio.preload = "auto";
      countdownAudio.volume = 0.78;
      countdownAudio.currentTime = 0;
      const playPromise = countdownAudio.play();
      if (playPromise?.catch) playPromise.catch(() => {});
    } catch {}

    const startedAt = Number(payload.startedAt || Date.now());
    const durationMs = Math.max(3000, Number(payload.durationMs || 3200));
    const deadline = startedAt + durationMs;

    const update = () => {
      const remaining = deadline - Date.now();
      let nextValue = "3";

      if (remaining > 2200) {
        nextValue = "3";
      } else if (remaining > 1200) {
        nextValue = "2";
      } else if (remaining > 250) {
        nextValue = "1";
      } else {
        nextValue = "!";
      }

      if (number && nextValue !== lastCountdownValue) {
        number.textContent = nextValue;
        lastCountdownValue = nextValue;

        ring?.classList.remove("pulse");
        void ring?.offsetWidth;
        ring?.classList.add("pulse");
      }

      if (nextValue === "!") card?.classList.add("is-go");
    };

    update();
    countdownTimer = setInterval(update, 70);

    const user = currentPlayer();
    const amHost =
      !!user?.isHost &&
      String(user.id) === String(payload.hostPlayerId || "");

    if (amHost) {
      countdownFinishTimer = setTimeout(() => {
        // Vérifie qu'on est toujours dans le même salon avant de lancer.
        if (
          countdownActive &&
          isLobbyVisible() &&
          String(session?.state?.code || session?.code || "") === countdownCode
        ) {
          socket.emit("game:start", {
            code: countdownCode,
            playerId: session.playerId
          });
        }
      }, durationMs);
    }

    // Filet de sécurité si l'état serveur tarde à arriver.
    setTimeout(() => {
      if (isLobbyVisible()) removeCountdown();
    }, durationMs + 1800);
  }

  socket.on("lobby:countdown", startCountdown);

  // Dès qu'on quitte le salon pour la page suivante, on retire l'overlay.
  socket.on("room:state", state => {
    if (state?.phase !== "lobby") {
      removeCountdown();
    }
  });

  /*
   * Le lobby historique possède déjà un listener direct sur #startBtn
   * qui envoie game:start immédiatement.
   *
   * Ce listener en capture passe AVANT lui, bloque son exécution,
   * puis demande le compte à rebours au serveur.
   */
  document.addEventListener("click", event => {
    const button = event.target.closest?.("#startBtn");
    if (!button || !isLobbyVisible()) return;

    const user = currentPlayer();
    if (!user?.isHost || button.disabled || countdownActive) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    button.disabled = true;
    button.classList.add("is-counting-down");

    socket.emit("lobby:startCountdown", {
      code: session.state?.code || session.code,
      playerId: session.playerId
    }, res => {
      if (res?.ok) return;

      countdownActive = false;
      button.disabled = false;
      button.classList.remove("is-counting-down");
      toast(res?.error || "Impossible de lancer le compte à rebours.");
    });
  }, true);
})();