(() => {
  "use strict";

  function lobbyAvatarMarkup(player, index = 0) {
    const raw = player?.avatar || "";
    const isImage = window.PtitBacProfilePhoto?.isImageAvatar?.(raw) || /^data:image\//i.test(String(raw));

    if (isImage) {
      return `
        <div class="lobby-v3-avatar lobby-v3-avatar-${index % 6}">
          <img src="${raw}" alt="" draggable="false">
          <i></i>
        </div>`;
    }

    const value = raw || String(player?.name || "?").charAt(0).toUpperCase();
    return `
      <div class="lobby-v3-avatar lobby-v3-avatar-${index % 6}">
        <span>${escapeHtml(value)}</span>
        <i></i>
      </div>`;
  }

  function renderLobbyV3() {
    clearInterval(session.timerHandle);
    session.localAnswers = {};

    const state = session.state;
    const user = me();
    if (!state || state.phase !== "lobby") return render();

    const botCount = state.players.filter(p => p.isBot).length;
    const difficulty = state.categoryDifficulty === "hard"
      ? "Difficile"
      : state.categoryDifficulty === "medium"
        ? "Normal"
        : "Facile";
    const categoryCount = Number(state.categoryCount || state.categories?.length || 6);

    const players = state.players.map((p, index) => {
      const online = p.connected || p.isBot;
      const canKick = user?.isHost && !p.isHost && p.id !== session.playerId;

      return `
        <article class="lobby-v3-player">
          ${lobbyAvatarMarkup(p, index)}
          <div class="lobby-v3-player-copy">
            <div class="lobby-v3-player-name">
              <strong>${escapeHtml(p.name)}</strong>
              ${p.isHost ? `<span>Hôte</span>` : ""}
            </div>
            <small>${online ? "Prêt" : "Déconnecté"}</small>
          </div>
          <i class="lobby-v3-online ${online ? "on" : ""}"></i>
          ${canKick ? `<button class="lobby-v3-kick" type="button" data-kick-id="${p.id}" aria-label="Retirer ${escapeHtml(p.name)}">×</button>` : ""}
        </article>`;
    }).join("");

    const settingRow = (key, label, value, icon) => `
      <div class="lobby-v3-setting">
        <span class="lobby-v3-setting-icon">${icon}</span>
        <div class="lobby-v3-setting-main">
          <small>${label}</small>
          <div class="lobby-v3-picker ${user?.isHost ? "" : "readonly"}">
            ${user?.isHost
              ? `<button type="button" data-lobby-step="${key}" data-dir="-1" aria-label="Valeur précédente">‹</button>`
              : `<span></span>`}
            <strong>${value}</strong>
            ${user?.isHost
              ? `<button type="button" data-lobby-step="${key}" data-dir="1" aria-label="Valeur suivante">›</button>`
              : `<span></span>`}
          </div>
        </div>
      </div>`;

    setScreen(`
      <main class="screen lobby-v3">
        <span class="lobby-v3-bg-letter letter-a">A</span>
        <span class="lobby-v3-bg-letter letter-b">B</span>
        <span class="lobby-v3-bg-letter letter-c">C</span>
        <span class="lobby-v3-bg-letter letter-d">D</span>
        <i class="lobby-v3-spark spark-a"></i>
        <i class="lobby-v3-spark spark-b"></i>

        <header class="lobby-v3-header">
          <button id="lobbyV3Back" class="lobby-v3-back" type="button" aria-label="Quitter le salon">
            <img src="/back-arrow.png" alt="">
          </button>

          <div class="lobby-v3-heading">
            <h1>Salon</h1>
            <p>Partage ce code avec tes amis</p>
          </div>

          <span class="lobby-v3-head-spacer"></span>
        </header>

        <section class="lobby-v3-code-row">
          <button id="copyCode" class="lobby-v3-code" type="button" aria-label="Copier le code du salon">
            <strong>${escapeHtml(state.code)}</strong>
            <span class="lobby-v3-copy-icon" aria-hidden="true">
              <i></i><b></b>
            </span>
          </button>

          <div class="lobby-v3-count" aria-label="${state.players.length} joueurs sur 12">
            <strong>${state.players.length}/12</strong>
            <span>Joueurs</span>
          </div>
        </section>

        <section class="lobby-v3-grid">
          <div class="lobby-v3-left">
            <section class="lobby-v3-panel lobby-v3-players-panel">
              <h2>
                <img src="/friends.png" alt="">
                Joueurs <span>(${state.players.length}/12)</span>
              </h2>

              <div class="lobby-v3-player-list">
                ${players}
              </div>

              ${user?.isHost ? `
                <button class="lobby-v3-add-player" id="addBotBtn" type="button" ${state.players.length >= 12 ? "disabled" : ""}>
                  <span class="lobby-v3-plus">＋</span>
                  <span>
                    <strong>Ajouter un joueur</strong>
                    <small>${botCount
                      ? `${botCount} joueur${botCount > 1 ? "s" : ""} test ajouté${botCount > 1 ? "s" : ""}`
                      : "Pour tester une partie"}</small>
                  </span>
                </button>

                ${state.players.length < 12 ? `
                  <div class="lobby-v3-empty-player">
                    <span class="lobby-v3-plus muted">＋</span>
                    <small>En attente d’un joueur…</small>
                  </div>` : ""}
              ` : ""}
            </section>

            <button class="lobby-v3-invite" id="inviteFriendsBtn" type="button">
              <span class="lobby-v3-invite-icon">♙＋</span>
              <strong>Inviter des amis</strong>
              <b>›</b>
            </button>
          </div>

          <section class="lobby-v3-panel lobby-v3-settings">
            <h2>
              <img src="/settings.png" alt="">
              Paramètres de la partie
            </h2>

            ${settingRow("rounds", "Manches", state.rounds, "⚡")}
            ${settingRow("duration", "Temps par manche", formatDuration(state.duration), "◷")}
            ${settingRow("categoryDifficulty", "Difficulté", difficulty, "▥")}
            ${settingRow("categoryCount", "Catégories", categoryCount, "🏷️")}
          </section>
        </section>

        <section class="lobby-v3-actions">
          ${user?.isHost
            ? `<button class="lobby-v3-start" id="startBtn" type="button" ${state.players.length < 2 ? "disabled" : ""}>
                <span>▶</span><strong>Lancer la partie</strong>
              </button>`
            : `<div class="lobby-v3-wait-host"><span class="spinner small-spinner"></span> En attente de l’hôte…</div>`}

          <button class="lobby-v3-leave" id="leaveLobbyBottom" type="button">
            <span>⇥</span><strong>Quitter le salon</strong>
          </button>
        </section>

        <footer class="lobby-v3-footer">
          <img src="/ptitbac.logo.png" alt="P'tit Bac">
          <small>Version bêta</small>
        </footer>

        <div class="lobby-v3-wave wave-1"></div>
        <div class="lobby-v3-wave wave-2"></div>
      </main>
    `);

    const leave = () => {
      socket.emit("room:leave", { code: state.code, playerId: session.playerId });
      clearSession();
      renderHome();
    };

    document.getElementById("leaveLobbyBottom")?.addEventListener("click", leave);
    document.getElementById("lobbyV3Back")?.addEventListener("click", leave);

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

    document.querySelectorAll("[data-lobby-step]").forEach(btn => {
      btn.addEventListener("click", event => {
        event.preventDefault();
        updateSetting(btn.dataset.lobbyStep, Number(btn.dataset.dir) || 1);
      });
    });

    if (user?.isHost) {
      document.getElementById("addBotBtn")?.addEventListener("click", () => {
        if (state.players.length >= 12) return toast("Salon complet.");
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

  window.renderLobby = renderLobbyV3;
  try { renderLobby = renderLobbyV3; } catch {}
})();