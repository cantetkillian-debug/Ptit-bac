(() => {
  "use strict";

  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  function adminCoinDisplay() {
    const admin = window.PtitBacAdminDisplayState || {};
    if (admin.admin && admin.infiniteCoins) return "∞";
    return String(typeof getCoins === "function" ? getCoins() : 0);
  }

  function chooserAvatar(player) {
    const raw = String(player?.avatar || "");
    const isImage =
      window.PtitBacProfilePhoto?.isImageAvatar?.(raw) ||
      /^data:image\//i.test(raw);

    if (isImage) {
      return `<img src="${raw}" alt="" draggable="false">`;
    }

    return `<span>${escapeHtml(raw || String(player?.name || "?").charAt(0).toUpperCase())}</span>`;
  }

  function exitModal(state, user) {
    return `
      <div class="letter-v2-exit-overlay" id="letterV2ExitOverlay">
        <section class="letter-v2-exit-modal" role="dialog" aria-modal="true">
          <h2>Voulez-vous quitter la partie ?</h2>
          <div>
            <button id="letterV2ExitCancel" type="button">Non</button>
            ${user?.isHost
              ? `<button id="letterV2ReturnLobby" type="button">Revenir au salon</button>`
              : ""}
            <button id="letterV2ExitHome" class="danger" type="button">Revenir à l’accueil</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderLetterSelectionV2() {
    clearInterval(session.timerHandle);

    const state = session.state;
    const user = me();

    if (!state || state.phase !== "letter_selection") return render();

    const chooser = state.players.find(p => p.id === state.letterChooserPlayerId);
    const chooserName = chooser?.name || "Un joueur";
    const isChooser = user?.id === state.letterChooserPlayerId;

    const selectedLetter = state.pendingLetter || "";
    const rerollCost = Number(state.letterRerollCost || 10);
    const roundNumber = Math.max(1, Number(state.roundIndex || -1) + 2);
    const totalRounds = Math.max(1, Number(state.rounds || 1));
    const segmentAngle = 360 / LETTERS.length;

    const wheelLabels = LETTERS.map((letter, index) => {
      const angle = index * segmentAngle;
      return `
        <span class="letter-v2-wheel-label" style="--letter-angle:${angle}deg">
          <b>${letter}</b>
        </span>
      `;
    }).join("");

    const wheelStops = LETTERS.map((_, index) => {
      const start = index * segmentAngle;
      const end = (index + 1) * segmentAngle;
      const color = index % 2 === 0 ? "#38208f" : "#6637df";
      return `${color} ${start}deg ${end}deg`;
    }).join(",");

    const roundDots = Array.from({ length: totalRounds }, (_, index) =>
      `<i class="${index < roundNumber ? "active" : ""}"></i>`
    ).join("");

    const missingCoins = Math.max(0, rerollCost - (typeof getCoins === "function" ? getCoins() : 0));

    setScreen(`
      <main class="screen letter-v2-screen">
        <div class="letter-v2-bg-glow glow-a"></div>
        <div class="letter-v2-bg-glow glow-b"></div>
        <span class="letter-v2-spark spark-a">✦</span>
        <span class="letter-v2-spark spark-b">✦</span>

        <header class="letter-v2-top">
          <button id="letterV2ExitBtn" class="letter-v2-exit-btn" type="button" aria-label="Quitter">
            <img src="/lobby-exit.png" alt="">
          </button>

          <div class="letter-v2-wallet">
            <img src="/coin.png" alt="">
            <strong>${adminCoinDisplay()}</strong>
          </div>
        </header>

        <section class="letter-v2-chooser">
          <div class="letter-v2-chooser-avatar">
            ${chooserAvatar(chooser)}
          </div>
          <div class="letter-v2-chooser-copy">
            <small>C’est à</small>
            <strong>${escapeHtml(chooserName)}</strong>
            <span>de choisir la lettre</span>
          </div>
        </section>

        <div class="letter-v2-round-dots" aria-label="Manche ${roundNumber} sur ${totalRounds}">
          ${roundDots}
        </div>

        <section class="letter-v2-heading">
          <h1>Tirage de la <span>lettre</span></h1>
          <p>
            ${isChooser
              ? (selectedLetter ? "La lettre est prête !" : "Appuie sur la roue pour la faire tourner !")
              : `En attente du tirage de ${escapeHtml(chooserName)}.`}
          </p>
        </section>

        <section
          class="letter-v2-wheel-zone ${isChooser && !selectedLetter ? "is-tappable" : ""}"
          id="letterV2WheelTapZone"
          role="${isChooser && !selectedLetter ? "button" : "presentation"}"
          ${isChooser && !selectedLetter ? 'tabindex="0" aria-label="Lancer la roue"' : ""}
        >
          <div class="letter-v2-pointer">
            <span></span>
          </div>

          <div class="letter-v2-wheel-shell">
            <div
              class="letter-v2-wheel"
              id="letterV2Wheel"
              style="background:conic-gradient(${wheelStops})"
            >
              ${wheelLabels}

              <div class="letter-v2-wheel-center">
                <img src="/admin-crown.png" alt="">
              </div>
            </div>
          </div>
        </section>

        ${selectedLetter ? `
          <section class="letter-v2-selected">
            <strong>${escapeHtml(selectedLetter)}</strong>
          </section>
        ` : `
          <div class="letter-v2-wait-status">
            <span></span>
            <strong>En attente de ${escapeHtml(chooserName)} …</strong>
          </div>
        `}

        ${isChooser && selectedLetter ? `
          <section class="letter-v2-actions">
            <button
              class="letter-v2-reroll"
              id="letterV2Reroll"
              type="button"
              ${typeof getCoins === "function" && getCoins() < rerollCost ? "disabled" : ""}
            >
              <span>↻ Relancer la lettre</span>
              <b><img src="/coin.png" alt=""> ${rerollCost}</b>
            </button>

            ${missingCoins > 0 ? `
              <p>Il te manque ${missingCoins} pièce${missingCoins > 1 ? "s" : ""} pour relancer.</p>
            ` : ""}

            <button class="letter-v2-confirm" id="letterV2Confirm" type="button">
              Valider la lettre ${escapeHtml(selectedLetter)}
              <span>→</span>
            </button>
          </section>
        ` : ""}

        <footer class="ptb-shared-footer letter-v2-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>
      </main>
    `);

    const exitButton = document.getElementById("letterV2ExitBtn");
    exitButton?.addEventListener("click", () => {
      if (document.getElementById("letterV2ExitOverlay")) return;
      document.body.insertAdjacentHTML("beforeend", exitModal(state, user));

      const close = () => document.getElementById("letterV2ExitOverlay")?.remove();

      document.getElementById("letterV2ExitCancel")?.addEventListener("click", close);
      document.getElementById("letterV2ExitOverlay")?.addEventListener("click", event => {
        if (event.target.id === "letterV2ExitOverlay") close();
      });

      document.getElementById("letterV2ReturnLobby")?.addEventListener("click", () => {
        socket.emit("game:returnLobby", {
          code: state.code,
          playerId: session.playerId
        });
        close();
      });

      document.getElementById("letterV2ExitHome")?.addEventListener("click", () => {
        socket.emit("room:leave", {
          code: state.code,
          playerId: session.playerId
        });
        clearSession();
        close();
        renderHome();
      });
    });

    const wheel = document.getElementById("letterV2Wheel");

    if (wheel && selectedLetter) {
      const targetIndex = Math.max(0, LETTERS.indexOf(selectedLetter));
      const targetAngle = -(targetIndex * segmentAngle);
      const turns = 7 + (Number(state.letterSpinVersion || 0) % 3);
      const finalRotation = turns * 360 + targetAngle;
      const spinDuration = 3400;

      wheel.style.setProperty("--wheel-final-rotation", `${finalRotation}deg`);
      wheel.style.setProperty("--wheel-counter-rotation", `${-finalRotation}deg`);

      const zone = document.getElementById("letterV2WheelTapZone");
      zone?.classList.add("is-wheel-spinning");

      // Web Animations API = animation visible et fluide sur Safari/iPhone.
      if (typeof wheel.animate === "function") {
        const animation = wheel.animate(
          [
            { transform: "rotate(0deg)", offset: 0 },
            { transform: `rotate(${finalRotation * 0.18}deg)`, offset: 0.16 },
            { transform: `rotate(${finalRotation * 0.68}deg)`, offset: 0.62 },
            { transform: `rotate(${finalRotation * 0.93}deg)`, offset: 0.88 },
            { transform: `rotate(${finalRotation}deg)`, offset: 1 }
          ],
          {
            duration: spinDuration,
            easing: "cubic-bezier(.10,.72,.12,1)",
            fill: "forwards"
          }
        );

        animation.onfinish = () => {
          wheel.style.transform = `rotate(${finalRotation}deg)`;
          zone?.classList.remove("is-wheel-spinning");
          zone?.classList.add("is-wheel-landed");
        };
      } else {
        requestAnimationFrame(() => wheel.classList.add("is-spinning"));
        setTimeout(() => {
          zone?.classList.remove("is-wheel-spinning");
          zone?.classList.add("is-wheel-landed");
        }, spinDuration);
      }

      const rerollButton = document.getElementById("letterV2Reroll");
      const confirmButton = document.getElementById("letterV2Confirm");

      if (rerollButton) rerollButton.disabled = true;
      if (confirmButton) confirmButton.disabled = true;

      setTimeout(() => {
        if (rerollButton) {
          rerollButton.disabled =
            typeof getCoins === "function" &&
            getCoins() < rerollCost;
        }
        if (confirmButton) confirmButton.disabled = false;
      }, spinDuration + 120);
    }

    if (!isChooser) return;

    const triggerSpin = () => {
      if (selectedLetter) return;

      const zone = document.getElementById("letterV2WheelTapZone");
      if (zone?.classList.contains("is-spinning-request")) return;

      zone?.classList.add("is-spinning-request");
      wheel?.classList.add("is-request-spinning");

      socket.emit("game:spinLetter", {
        code: state.code,
        playerId: session.playerId
      });
    };

    const tapZone = document.getElementById("letterV2WheelTapZone");

    if (tapZone && !selectedLetter) {
      tapZone.addEventListener("click", triggerSpin);
      tapZone.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        triggerSpin();
      });
    }

    const rerollButton = document.getElementById("letterV2Reroll");
    rerollButton?.addEventListener("click", () => {
      if (typeof getCoins === "function" && getCoins() < rerollCost) {
        const missing = rerollCost - getCoins();
        return toast(`Il te manque ${missing} pièce${missing > 1 ? "s" : ""}.`);
      }

      rerollButton.disabled = true;
      const confirmButton = document.getElementById("letterV2Confirm");
      if (confirmButton) confirmButton.disabled = true;

      socket.emit("game:rerollLetter", {
        code: state.code,
        playerId: session.playerId
      });
    });

    const confirmButton = document.getElementById("letterV2Confirm");
    confirmButton?.addEventListener("click", () => {
      confirmButton.disabled = true;
      if (rerollButton) rerollButton.disabled = true;

      socket.emit("game:confirmLetter", {
        code: state.code,
        playerId: session.playerId
      });
    });
  }

  window.renderLetterSelection = renderLetterSelectionV2;

  try {
    renderLetterSelection = renderLetterSelectionV2;
  } catch {}
})();