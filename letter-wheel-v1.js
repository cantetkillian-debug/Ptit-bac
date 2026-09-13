(() => {
  "use strict";

  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const SEGMENT = 360 / LETTERS.length;
  const runtime = {
    rotation: 0,
    animating: false,
    animationFrame: 0,
    lastVersion: null,
    activeCode: "",
    dragged: false
  };

  const easeOutQuint = t => 1 - Math.pow(1 - t, 5);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function adminCoins() {
    const st = window.PtitBacAdminDisplayState;
    if (st?.admin && st?.infiniteCoins) return "∞";
    if (document.documentElement.classList.contains("ptb-admin-infinite-coins")) return "∞";
    return typeof getCoins === "function" ? String(getCoins()) : "0";
  }

  function stopAnimation() {
    if (runtime.animationFrame) cancelAnimationFrame(runtime.animationFrame);
    runtime.animationFrame = 0;
    runtime.animating = false;
  }

  function setRotation(value) {
    runtime.rotation = value;
    const wheel = document.getElementById("pbw1Wheel");
    if (!wheel) return;
    wheel.style.setProperty("--pbw1-rotation", `${value}deg`);
    wheel.style.transform = `rotate(${value}deg)`;
  }

  function exactTarget(letter, start, direction = 1) {
    const index = Math.max(0, LETTERS.indexOf(letter));
    // Pointer is at 12 o'clock. Sector centers start at 0deg.
    const desired = -index * SEGMENT;
    if (direction >= 0) {
      let target = desired;
      while (target <= start + 1440) target += 360;
      return target;
    }
    let target = desired;
    while (target >= start - 1440) target -= 360;
    return target;
  }

  function animateToLetter(letter, version) {
    const wheel = document.getElementById("pbw1Wheel");
    const zone = document.getElementById("pbw1WheelZone");
    const actions = document.getElementById("pbw1Actions");
    if (!wheel) return;

    stopAnimation();
    runtime.animating = true;
    zone?.classList.add("is-spinning");
    actions?.classList.remove("is-visible");

    const start = runtime.rotation || 0;
    const direction = 1;
    const base = exactTarget(letter, start, direction);
    const target = base + 360 * 3;
    const duration = 5000;
    const started = performance.now();

    const tick = now => {
      const t = clamp((now - started) / duration, 0, 1);
      // Garde une rotation visible jusqu'à la toute fin.
      // L'ancienne courbe quintique donnait l'impression que la roue
      // était déjà arrêtée avant l'affichage de la lettre.
      const eased = 1 - Math.pow(1 - t, 3);

      // Très léger rebond seulement sur les 3% finaux.
      let value = start + (target - start) * eased;
      if (t > 0.97) {
        const local = (t - 0.97) / 0.03;
        value += Math.sin(local * Math.PI) * 0.65;
      }

      setRotation(value);

      if (t < 1) {
        runtime.animationFrame = requestAnimationFrame(tick);
        return;
      }

      setRotation(target);

      // Affiche la lettre sur la même frame que l'arrêt exact de la roue.
      const center = document.getElementById("pbw1CenterLetter");
      if (center) center.textContent = letter;

      runtime.animating = false;
      runtime.lastVersion = version;
      zone?.classList.remove("is-spinning");
      zone?.classList.add("is-landed");
      actions?.classList.add("is-visible");
    };

    runtime.animationFrame = requestAnimationFrame(tick);
  }



  function renderLetterWheelV1() {
    clearInterval(session.timerHandle);

    const state = session.state;
    const user = me();
    if (!state || state.phase !== "letter_selection") return render();

    runtime.activeCode = state.code;

    const chooser = state.players.find(p => p.id === state.letterChooserPlayerId);
    const isChooser = user?.id === state.letterChooserPlayerId;
    const selectedLetter = String(state.pendingLetter || "").slice(0, 1);
    const version = Number(state.letterSpinVersion || 0);
    const rerollCost = Number(state.letterRerollCost || 10);
    const canReroll = typeof getCoins !== "function" || getCoins() >= rerollCost;

    const sectors = LETTERS.map((_, i) => {
      const start = i * SEGMENT;
      const end = (i + 1) * SEGMENT;
      const color = i === 0 ? "#fff0c8" : (i % 2 ? "#bc7d05" : "#f4b814");
      return `${color} ${start}deg ${end}deg`;
    }).join(",");

    const labels = LETTERS.map((letter, i) => {
      const angle = i * SEGMENT;
      return `
        <span class="pbw1-letter" style="--pbw1-angle:${angle}deg">
          <b>${letter}</b>
        </span>
      `;
    }).join("");

    const chooserName = chooser?.name || "Un joueur";

    setScreen(`
      <main class="pbw1-screen">
        <header class="pbw1-top">
          <button class="pbw1-exit" id="pbw1Exit" type="button" aria-label="Quitter">
            <img src="/lobby-exit.png" alt="">
          </button>

          <div class="pbw1-wallet">
            <img src="/coin.png" alt="">
            <strong>${adminCoins()}</strong>
          </div>
        </header>

        <section class="pbw1-chooser">
          <div class="pbw1-lightning"><img src="/lightning.png" alt=""></div>
          <div class="pbw1-chooser-copy">
            <small>C’est à</small>
            <strong>${escapeHtml(chooserName)}</strong>
            <span>de lancer la roue</span>
          </div>
        </section>

        <section
          class="pbw1-wheel-zone ${isChooser && !selectedLetter ? "is-ready" : ""}"
          id="pbw1WheelZone"
          ${isChooser && !selectedLetter ? 'role="button" tabindex="0" aria-label="Lancer la roue"' : ""}
        >
          <div class="pbw1-pointer" aria-hidden="true"></div>

          <div class="pbw1-wheel-shell">
            <div
              class="pbw1-wheel"
              id="pbw1Wheel"
              style="--pbw1-sectors: conic-gradient(from -${SEGMENT / 2}deg, ${sectors}); --pbw1-rotation:${runtime.rotation}deg"
            >
              ${labels}
            </div>

            <div class="pbw1-center" id="pbw1Center">
              <strong id="pbw1CenterLetter"></strong>
            </div>
          </div>
        </section>

        ${isChooser && selectedLetter ? `
          <section class="pbw1-actions ${runtime.lastVersion === version ? "is-visible" : ""}" id="pbw1Actions">
            <button class="pbw1-reroll" id="pbw1Reroll" type="button" ${canReroll ? "" : "disabled"}>
              <span>↻ Relancer</span>
              <b><img src="/coin.png" alt=""> ${rerollCost}</b>
            </button>

            <button class="pbw1-confirm" id="pbw1Confirm" type="button">
              Valider la lettre ${escapeHtml(selectedLetter)}
              <span>→</span>
            </button>
          </section>
        ` : '<div class="pbw1-actions-spacer"></div>'}

        <footer class="ptb-shared-footer pbw1-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>
      </main>
    `);

    setRotation(runtime.rotation);

    document.getElementById("pbw1Exit")?.addEventListener("click", () => gameExitModal(state, user, "pbw1"));

    if (selectedLetter) {
      if (runtime.lastVersion !== version) {
        requestAnimationFrame(() => animateToLetter(selectedLetter, version));
      } else {
        document.getElementById("pbw1Actions")?.classList.add("is-visible");
        const center = document.getElementById("pbw1CenterLetter");
        if (center) center.textContent = selectedLetter;
      }
    }

    if (isChooser && !selectedLetter) {
      const zone = document.getElementById("pbw1WheelZone");
      const wheel = document.getElementById("pbw1Wheel");

      let dragging = false;
      let moved = false;
      let previousAngle = 0;
      let localRotation = runtime.rotation;

      const pointerAngle = e => {
        const rect = zone.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      };

      const shortestDelta = (a, b) => {
        let d = a - b;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
      };

      const launch = () => {
        if (zone.classList.contains("is-requesting")) return;
        zone.classList.add("is-requesting");
        socket.emit("game:spinLetter", {
          code: state.code,
          playerId: session.playerId
        });
      };

      zone.addEventListener("pointerdown", e => {
        if (runtime.animating) return;
        dragging = true;
        moved = false;
        previousAngle = pointerAngle(e);
        localRotation = runtime.rotation;
        zone.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      });

      zone.addEventListener("pointermove", e => {
        if (!dragging) return;
        const angle = pointerAngle(e);
        const delta = shortestDelta(angle, previousAngle);
        if (Math.abs(delta) > 0.8) moved = true;
        localRotation += delta;
        previousAngle = angle;
        setRotation(localRotation);
        e.preventDefault();
      });

      const finish = e => {
        if (!dragging) return;
        dragging = false;
        zone.releasePointerCapture?.(e.pointerId);
        launch();
      };

      zone.addEventListener("pointerup", finish);
      zone.addEventListener("pointercancel", finish);
      zone.addEventListener("click", () => {
        if (!moved) launch();
      });
      zone.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        launch();
      });

      if (wheel) wheel.style.touchAction = "none";
    }

    document.getElementById("pbw1Reroll")?.addEventListener("click", () => {
      if (!canReroll) return toast(`Il te faut ${rerollCost} pièces pour relancer.`);
      const reroll = document.getElementById("pbw1Reroll");
      const confirm = document.getElementById("pbw1Confirm");
      if (reroll) reroll.disabled = true;
      if (confirm) confirm.disabled = true;

      socket.emit("game:rerollLetter", {
        code: state.code,
        playerId: session.playerId
      });
    });

    document.getElementById("pbw1Confirm")?.addEventListener("click", () => {
      const reroll = document.getElementById("pbw1Reroll");
      const confirm = document.getElementById("pbw1Confirm");
      if (reroll) reroll.disabled = true;
      if (confirm) confirm.disabled = true;

      socket.emit("game:confirmLetter", {
        code: state.code,
        playerId: session.playerId
      });
    });
  }

  // Nouveau point d'entrée unique pour la phase letter_selection.
  window.renderLetterSelection = renderLetterWheelV1;
  try { renderLetterSelection = renderLetterWheelV1; } catch {}
})();
