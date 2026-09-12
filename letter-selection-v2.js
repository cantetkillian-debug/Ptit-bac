(() => {
  "use strict";

  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const WHEEL_SEGMENT = 360 / LETTERS.length;

  const wheelRuntime = {
    currentRotation: 0,
    velocity: 0,
    direction: 1,
    requestedAt: 0,
    activeCode: "",
    activeVersion: -1,
    revealTimer: null,
    animation: null
  };

  function normalizeAngle(value) {
    let angle = value % 360;
    if (angle < 0) angle += 360;
    return angle;
  }

  function shortestDelta(next, previous) {
    let delta = next - previous;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
  }

  function wheelTargetForLetter(letter, baseRotation, direction = 1) {
    const index = Math.max(0, LETTERS.indexOf(letter));
    // Segment A is centered at 0deg under the pointer.
    const desired = -(index * WHEEL_SEGMENT);
    const baseNorm = normalizeAngle(baseRotation);
    const desiredNorm = normalizeAngle(desired);

    if (direction >= 0) {
      let delta = desiredNorm - baseNorm;
      if (delta < 0) delta += 360;
      return baseRotation + delta;
    }

    let delta = baseNorm - desiredNorm;
    if (delta < 0) delta += 360;
    return baseRotation - delta;
  }

  function readWheelRotation(element) {
    if (!element) return Number(wheelRuntime.currentRotation || 0);

    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") {
      return Number(wheelRuntime.currentRotation || 0);
    }

    try {
      const matrix = new DOMMatrixReadOnly(transform);
      const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
      const previous = Number(wheelRuntime.currentRotation || 0);
      const previousNorm = normalizeAngle(previous);
      const angleNorm = normalizeAngle(angle);

      let delta = angleNorm - previousNorm;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      return previous + delta;
    } catch {
      return Number(wheelRuntime.currentRotation || 0);
    }
  }

  function stopWheelAnimation(element) {
    if (!element) return;

    const current = readWheelRotation(element);
    wheelRuntime.currentRotation = current;

    try {
      wheelRuntime.animation?.cancel?.();
    } catch {}

    wheelRuntime.animation = null;

    element.getAnimations?.().forEach(animation => {
      try { animation.cancel(); } catch {}
    });

    element.style.transform = `rotate(${current}deg)`;
  }

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
    const segmentAngle = WHEEL_SEGMENT;

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
            </div>

            <div class="letter-v2-wheel-center ${selectedLetter ? "is-pending" : ""}" id="letterV2WheelCenter">
              <img src="/admin-crown.png" alt="">
              <strong id="letterV2CenterLetter">
                ${selectedLetter ? escapeHtml(selectedLetter) : ""}
              </strong>
            </div>
          </div>
        </section>

        <div class="letter-v2-wait-status ${selectedLetter ? "has-result" : ""}">
          ${selectedLetter ? "" : "<span></span>"}
          <strong>${selectedLetter ? `En attente de ${escapeHtml(chooserName)} …` : `En attente de ${escapeHtml(chooserName)} …`}</strong>
        </div>

        ${isChooser && selectedLetter ? `
          <section class="letter-v2-actions letter-v2-delayed-result is-hidden">
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

    if (wheelRuntime.revealTimer) {
      clearTimeout(wheelRuntime.revealTimer);
      wheelRuntime.revealTimer = null;
    }

    const revealLetterResult = () => {
      const center = document.getElementById("letterV2WheelCenter");
      center?.classList.remove("is-pending");
      center?.classList.add("is-revealed");

      document.querySelectorAll(".letter-v2-delayed-result").forEach(element => {
        element.classList.remove("is-hidden");
        element.classList.add("is-revealed");
      });
    };

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
      const zone = document.getElementById("letterV2WheelTapZone");
      const version = Number(state.letterSpinVersion || 0);

      // Continue from the exact angle reached by the player's finger/flick.
      let startRotation = Number(wheelRuntime.currentRotation || 0);

      if (
        wheelRuntime.activeCode !== state.code ||
        wheelRuntime.activeVersion === version
      ) {
        startRotation = Number(wheelRuntime.currentRotation || 0);
      }

      const direction = wheelRuntime.direction || 1;
      const baseLanding = wheelTargetForLetter(
        selectedLetter,
        startRotation,
        direction
      );

      // Add real full turns before the final exact segment.
      const speedBonus = Math.min(4, Math.max(0, Math.abs(wheelRuntime.velocity) * 0.55));
      const fullTurns = 5 + speedBonus;
      const finalRotation =
        baseLanding + direction * fullTurns * 360;

      const spinDuration = 3000 + Math.min(900, Math.abs(wheelRuntime.velocity) * 95);

      // Le nouvel élément DOM reprend exactement l'angle mémorisé.
      wheel.style.transform = `rotate(${startRotation}deg)`;
      wheel.classList.add("is-js-spinning");
      zone?.classList.add("is-wheel-spinning");

      // Annule tout ancien moteur d'animation : une seule animation contrôle transform.
      try {
        wheelRuntime.animation?.cancel?.();
      } catch {}
      wheelRuntime.animation = null;

      const frames = [
        { transform: `rotate(${startRotation}deg)`, offset: 0 },
        {
          transform: `rotate(${startRotation + (finalRotation - startRotation) * 0.44}deg)`,
          offset: 0.22
        },
        {
          transform: `rotate(${startRotation + (finalRotation - startRotation) * 0.78}deg)`,
          offset: 0.58
        },
        {
          transform: `rotate(${startRotation + (finalRotation - startRotation) * 0.95}deg)`,
          offset: 0.86
        },
        { transform: `rotate(${finalRotation}deg)`, offset: 1 }
      ];

      if (typeof wheel.animate === "function") {
        const animation = wheel.animate(frames, {
          duration: spinDuration,
          easing: "cubic-bezier(.08,.68,.10,1)",
          fill: "forwards"
        });

        wheelRuntime.animation = animation;

        animation.onfinish = () => {
          // Committe le résultat exact avant d'annuler l'animation.
          wheelRuntime.currentRotation = finalRotation;
          wheelRuntime.activeVersion = version;
          wheelRuntime.velocity = 0;

          wheel.style.transform = `rotate(${finalRotation}deg)`;

          try { animation.cancel(); } catch {}
          if (wheelRuntime.animation === animation) {
            wheelRuntime.animation = null;
          }

          wheel.classList.remove("is-js-spinning");
          zone?.classList.remove("is-wheel-spinning");
          zone?.classList.add("is-wheel-landed");

          wheelRuntime.revealTimer = setTimeout(() => {
            revealLetterResult();
          }, 180);
        };
      } else {
        wheel.style.transition = `transform ${spinDuration}ms cubic-bezier(.08,.68,.10,1)`;
        requestAnimationFrame(() => {
          wheel.style.transform = `rotate(${finalRotation}deg)`;
        });

        setTimeout(() => {
          wheelRuntime.currentRotation = finalRotation;
          wheelRuntime.activeVersion = version;
          wheelRuntime.velocity = 0;
          zone?.classList.remove("is-wheel-spinning");
          zone?.classList.add("is-wheel-landed");

          wheelRuntime.revealTimer = setTimeout(() => {
            revealLetterResult();
          }, 180);
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

      wheelRuntime.activeCode = state.code;
      wheelRuntime.requestedAt = Date.now();
      wheelRuntime.direction = wheelRuntime.direction || 1;

      if (wheel && typeof wheel.animate === "function") {
        const start = Number(wheelRuntime.currentRotation || 0);
        const direction = wheelRuntime.direction || 1;
        const previewTarget = start + direction * 1080;

        stopWheelAnimation(wheel);

        const preview = wheel.animate(
          [
            { transform: `rotate(${start}deg)` },
            { transform: `rotate(${previewTarget}deg)` }
          ],
          {
            duration: 1500,
            easing: "cubic-bezier(.08,.72,.12,1)",
            fill: "forwards"
          }
        );

        wheelRuntime.animation = preview;

        preview.onfinish = () => {
          wheelRuntime.currentRotation = previewTarget;
          wheel.style.transform = `rotate(${previewTarget}deg)`;
          try { preview.cancel(); } catch {}
          if (wheelRuntime.animation === preview) wheelRuntime.animation = null;
        };
      }

      socket.emit("game:spinLetter", {
        code: state.code,
        playerId: session.playerId
      });
    };

    const tapZone = document.getElementById("letterV2WheelTapZone");

    if (tapZone && !selectedLetter) {
      let dragging = false;
      let moved = false;
      let previousAngle = 0;
      let startPointerAngle = 0;
      let lastTime = 0;
      let velocity = 0;
      let rotation = Number(wheelRuntime.currentRotation || 0);

      const pointerAngle = event => {
        const rect = tapZone.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(
          event.clientY - cy,
          event.clientX - cx
        ) * 180 / Math.PI;
      };

      const beginDrag = event => {
        if (tapZone.classList.contains("is-spinning-request")) return;

        dragging = true;
        moved = false;
        velocity = 0;

        startPointerAngle = pointerAngle(event);
        previousAngle = startPointerAngle;
        lastTime = performance.now();

        stopWheelAnimation(wheel);
        rotation = Number(wheelRuntime.currentRotation || rotation);
        wheel?.classList.remove("is-spinning", "is-js-spinning");

        tapZone.classList.add("is-dragging");
        tapZone.setPointerCapture?.(event.pointerId);

        if (wheel) {
          wheel.style.transition = "none";
          wheel.style.transform = `rotate(${rotation}deg)`;
        }

        event.preventDefault();
      };

      const moveDrag = event => {
        if (!dragging) return;

        const now = performance.now();
        const angle = pointerAngle(event);
        const delta = shortestDelta(angle, previousAngle);
        const dt = Math.max(8, now - lastTime);

        rotation += delta;
        velocity = delta / dt * 16.67;

        if (Math.abs(shortestDelta(angle, startPointerAngle)) > 3 || Math.abs(delta) > 1) {
          moved = true;
        }

        wheelRuntime.currentRotation = rotation;
        wheelRuntime.velocity = velocity;
        wheelRuntime.direction = velocity === 0
          ? wheelRuntime.direction
          : (velocity > 0 ? 1 : -1);

        if (wheel) {
          wheel.style.transform = `rotate(${rotation}deg)`;
        }

        previousAngle = angle;
        lastTime = now;
        event.preventDefault();
      };

      const endDrag = event => {
        if (!dragging) return;

        dragging = false;
        tapZone.classList.remove("is-dragging");
        tapZone.releasePointerCapture?.(event.pointerId);

        if (!moved) {
          triggerSpin();
          return;
        }

        if (tapZone.classList.contains("is-spinning-request")) return;
        tapZone.classList.add("is-spinning-request");

        const direction = velocity === 0
          ? (wheelRuntime.direction || 1)
          : (velocity > 0 ? 1 : -1);

        const flickPower = Math.max(1.2, Math.min(6.5, Math.abs(velocity)));
        const inertiaTurns = 2.2 + flickPower * 0.62;
        const inertiaTarget = rotation + direction * inertiaTurns * 360;
        const inertiaDuration = 1150 + Math.min(850, flickPower * 110);

        wheelRuntime.direction = direction;
        wheelRuntime.velocity = velocity;
        wheelRuntime.activeCode = state.code;
        wheelRuntime.requestedAt = Date.now();

        if (wheel && typeof wheel.animate === "function") {
          stopWheelAnimation(wheel);

          const inertia = wheel.animate(
            [
              { transform: `rotate(${rotation}deg)` },
              { transform: `rotate(${inertiaTarget}deg)` }
            ],
            {
              duration: inertiaDuration,
              easing: "cubic-bezier(.08,.72,.12,1)",
              fill: "forwards"
            }
          );

          wheelRuntime.animation = inertia;

          inertia.onfinish = () => {
            wheelRuntime.currentRotation = inertiaTarget;
            wheel.style.transform = `rotate(${inertiaTarget}deg)`;
            try { inertia.cancel(); } catch {}
            if (wheelRuntime.animation === inertia) wheelRuntime.animation = null;
          };
        } else if (wheel) {
          wheel.style.transition =
            `transform ${inertiaDuration}ms cubic-bezier(.08,.72,.12,1)`;
          wheel.style.transform = `rotate(${inertiaTarget}deg)`;

          setTimeout(() => {
            wheelRuntime.currentRotation = inertiaTarget;
          }, inertiaDuration);
        }

        socket.emit("game:spinLetter", {
          code: state.code,
          playerId: session.playerId
        });
      };

      tapZone.addEventListener("pointerdown", beginDrag);
      tapZone.addEventListener("pointermove", moveDrag);
      tapZone.addEventListener("pointerup", endDrag);
      tapZone.addEventListener("pointercancel", endDrag);

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

      wheelRuntime.requestedAt = Date.now();
      wheelRuntime.activeCode = state.code;

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