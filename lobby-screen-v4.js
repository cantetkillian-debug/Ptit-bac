(() => {
  "use strict";

  const LOBBY_MAX_PLAYERS = 6;

  function lobbyV4Avatar(player, index = 0) {
    const raw = player?.avatar || "";
    const isImage = window.PtitBacProfilePhoto?.isImageAvatar?.(raw) || /^data:image\//i.test(String(raw));

    if (isImage) {
      return `
        <div class="lobby-v4-avatar lobby-v4-avatar-${index % 6}">
          <img src="${raw}" alt="" draggable="false">
          <i></i>
        </div>`;
    }

    const value = raw || String(player?.name || "?").charAt(0).toUpperCase();
    return `
      <div class="lobby-v4-avatar lobby-v4-avatar-${index % 6}">
        <span>${escapeHtml(value)}</span>
        <i></i>
      </div>`;
  }

  function difficultyInfo(value) {
    if (value === "hard") {
      return { label: "Difficile", icon: "/difficulty-hard.png" };
    }
    if (value === "medium") {
      return { label: "Normal", icon: "/difficulty-normal.png" };
    }
    return { label: "Facile", icon: "/difficulty-easy.png" };
  }

  function lobbyV4SettingRow({ key, label, value, icon, iconClass = "" }, isHost) {
    return `
      <div class="lobby-v4-setting">
        <img class="lobby-v4-setting-icon ${iconClass}" src="${icon}" alt="">
        <div class="lobby-v4-setting-main">
          <small>${label}</small>
          <div class="lobby-v4-stepper ${isHost ? "" : "readonly"}">
            ${isHost
              ? `<button type="button" data-lobby-v4-step="${key}" data-dir="-1" aria-label="Diminuer">
                  <img src="/lobby-minus.png" alt="">
                </button>`
              : `<span class="lobby-v4-step-spacer"></span>`}
            <strong>${value}</strong>
            ${isHost
              ? `<button type="button" data-lobby-v4-step="${key}" data-dir="1" aria-label="Augmenter">
                  <img src="/lobby-plus.png" alt="">
                </button>`
              : `<span class="lobby-v4-step-spacer"></span>`}
          </div>
        </div>
      </div>`;
  }

  function renderLobbyV4() {
    clearInterval(session.timerHandle);
    session.localAnswers = {};

    const state = session.state;
    const user = me();
    if (!state || state.phase !== "lobby") return render();

    const playerCount = state.players.length;
    const botCount = state.players.filter(p => p.isBot).length;
    const categoryCount = Number(state.categoryCount || state.categories?.length || 6);
    const difficulty = difficultyInfo(state.categoryDifficulty);

    const players = state.players.map((p, index) => {
      const online = p.connected || p.isBot;
      const canKick = user?.isHost && !p.isHost && p.id !== session.playerId;

      return `
        <article class="lobby-v4-player">
          ${lobbyV4Avatar(p, index)}
          <div class="lobby-v4-player-copy">
            <div class="lobby-v4-player-name">
              <strong>${escapeHtml(p.name)}</strong>
              ${p.isHost ? `<span>Hôte</span>` : ""}
            </div>
            <small>${online ? "Prêt" : "Déconnecté"}</small>
          </div>
          <i class="lobby-v4-online ${online ? "on" : ""}"></i>
          ${canKick ? `<button class="lobby-v4-kick" data-kick-id="${p.id}" type="button" aria-label="Retirer ${escapeHtml(p.name)}">×</button>` : ""}
        </article>`;
    }).join("");

    setScreen(`
      <main class="screen lobby-v4">
        <header class="lobby-v4-header">
          <button id="lobbyV4LeaveTop" class="lobby-v4-leave-top" type="button" aria-label="Quitter le salon">
            <img src="/lobby-exit.png" alt="">
          </button>
          <h1>Salon</h1>
          <span></span>
        </header>

        <section class="lobby-v4-room-row">
          <div class="lobby-v4-code-wrap">
            <button id="copyCode" class="lobby-v4-code" type="button" aria-label="Copier le code du salon">
              <strong>${escapeHtml(state.code)}</strong>
              <img src="/lobby-copy.png" alt="">
            </button>
            <p>Partage ce code à tes amis</p>
          </div>

          <div class="lobby-v4-count" aria-label="${playerCount} joueurs sur ${LOBBY_MAX_PLAYERS}">
            <strong>${playerCount}/${LOBBY_MAX_PLAYERS}</strong>
            <span>Joueurs</span>
          </div>
        </section>

        <section class="lobby-v4-grid">
          <div class="lobby-v4-left">
            <section class="lobby-v4-panel lobby-v4-players-panel">
              <h2>
                <img src="/friends.png" alt="">
                Joueurs <span>(${playerCount}/${LOBBY_MAX_PLAYERS})</span>
              </h2>

              <div class="lobby-v4-player-list">${players}</div>

              ${user?.isHost ? `
                <button class="lobby-v4-add-player" id="addBotBtn" type="button" ${playerCount >= LOBBY_MAX_PLAYERS ? "disabled" : ""}>
                  <span class="lobby-v4-plus">＋</span>
                  <span>
                    <strong>Ajouter un joueur</strong>
                    <small>${botCount
                      ? `${botCount} joueur${botCount > 1 ? "s" : ""} test ajouté${botCount > 1 ? "s" : ""}`
                      : "Pour tester une partie"}</small>
                  </span>
                </button>

                ${playerCount < LOBBY_MAX_PLAYERS ? `
                  <div class="lobby-v4-empty-player">
                    <span class="lobby-v4-plus muted">＋</span>
                    <small>En attente d’un joueur…</small>
                  </div>` : ""}
              ` : ""}
            </section>

            <button class="lobby-v4-invite" id="inviteFriendsBtn" type="button">
              <span class="lobby-v4-invite-icon">♙＋</span>
              <strong>Inviter des amis</strong>
              <b>›</b>
            </button>
          </div>

          <section class="lobby-v4-panel lobby-v4-settings">
            <h2>
              <img src="/settings.png" alt="">
              Paramètres de la partie
            </h2>

            ${lobbyV4SettingRow({
              key: "rounds",
              label: "Manches",
              value: state.rounds,
              icon: "/lightning.png",
              iconClass: "lightning"
            }, user?.isHost)}

            ${lobbyV4SettingRow({
              key: "duration",
              label: "Temps par manche",
              value: formatDuration(state.duration),
              icon: "/lobby-clock.png"
            }, user?.isHost)}

            ${lobbyV4SettingRow({
              key: "categoryDifficulty",
              label: "Difficulté",
              value: difficulty.label,
              icon: difficulty.icon,
              iconClass: "difficulty"
            }, user?.isHost)}

            ${lobbyV4SettingRow({
              key: "categoryCount",
              label: "Catégories",
              value: categoryCount,
              icon: "/lobby-categories.png",
              iconClass: "categories"
            }, user?.isHost)}
          </section>
        </section>

        <section class="lobby-v4-actions">
          ${user?.isHost
            ? `<button class="lobby-v4-start" id="startBtn" type="button" ${playerCount < 2 ? "disabled" : ""}>
                <span>▶</span>
                <strong>Lancer la partie</strong>
              </button>`
            : `<div class="lobby-v4-wait-host">
                <span class="spinner small-spinner"></span>
                En attente de l’hôte…
              </div>`}
        </section>

        <footer class="lobby-v4-footer">
          <img src="/ptitbac.logo.png" alt="P'tit Bac">
          <small>Version bêta</small>
        </footer>

        <div class="lobby-v4-wave wave-1"></div>
        <div class="lobby-v4-wave wave-2"></div>
      </main>
    `);

    const leave = () => {
      socket.emit("room:leave", { code: state.code, playerId: session.playerId });
      clearSession();
      renderHome();
    };

    document.getElementById("lobbyV4LeaveTop")?.addEventListener("click", leave);

    document.getElementById("copyCode")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(state.code);
        toast("Code copié !");
      } catch {
        toast(`Code : ${state.code}`);
      }
    });

    document.getElementById("inviteFriendsBtn")?.addEventListener("click", async () => {
      const text = `Rejoins mon salon P’tit Bac avec le code ${state.code}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: "P’tit Bac", text, url: window.location.origin });
        } else {
          await navigator.clipboard.writeText(`${text} — ${window.location.origin}`);
          toast("Invitation copiée !");
        }
      } catch (err) {
        if (err?.name !== "AbortError") toast(`Code : ${state.code}`);
      }
    });

    const updateSetting = (setting, dir) => {
      if (!user?.isHost) return;

      const rounds = [1, 3, 5];
      const durations = [30, 60, 90];
      const difficulties = ["beginner", "medium", "hard"];

      let nextRounds = Number(state.rounds || 1);
      let nextDuration = Number(state.duration || 60);
      let nextDifficulty = state.categoryDifficulty || "beginner";
      let nextCategoryCount = categoryCount;

      const cycle = (arr, current, direction) => {
        let i = arr.indexOf(current);
        if (i < 0) i = 0;
        return arr[(i + direction + arr.length) % arr.length];
      };

      if (setting === "rounds") nextRounds = cycle(rounds, nextRounds, dir);
      if (setting === "duration") nextDuration = cycle(durations, nextDuration, dir);
      if (setting === "categoryDifficulty") nextDifficulty = cycle(difficulties, nextDifficulty, dir);
      if (setting === "categoryCount") nextCategoryCount = Math.max(5, Math.min(10, nextCategoryCount + dir));

      socket.emit("room:updateSettings", {
        code: state.code,
        playerId: session.playerId,
        rounds: nextRounds,
        duration: nextDuration,
        categoryCount: nextCategoryCount,
        categoryDifficulty: nextDifficulty
      }, res => {
        if (!res?.ok) return toast(res?.error || "Impossible de modifier ce paramètre.");
        if (res.state) session.state = res.state;
        render();
      });
    };

    document.querySelectorAll("[data-lobby-v4-step]").forEach(btn => {
      btn.addEventListener("click", event => {
        event.preventDefault();
        updateSetting(btn.dataset.lobbyV4Step, Number(btn.dataset.dir) || 1);
      });
    });

    if (user?.isHost) {
      document.getElementById("addBotBtn")?.addEventListener("click", () => {
        if (playerCount >= LOBBY_MAX_PLAYERS) return toast("Salon complet (6 joueurs maximum).");
        socket.emit("room:addBot", { code: state.code, playerId: session.playerId });
      });

      document.getElementById("startBtn")?.addEventListener("click", () => {
        socket.emit("game:start", { code: state.code, playerId: session.playerId });
      });

      document.querySelectorAll("[data-kick-id]").forEach(btn => {
        btn.addEventListener("click", () => {
          socket.emit("room:kick", {
            code: state.code,
            playerId: session.playerId,
            targetPlayerId: btn.dataset.kickId
          });
        });
      });
    }
  }

  window.renderLobby = renderLobbyV4;
  try { renderLobby = renderLobbyV4; } catch {}
})();