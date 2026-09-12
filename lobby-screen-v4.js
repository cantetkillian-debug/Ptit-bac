(() => {
  "use strict";

  const LOBBY_MAX_PLAYERS = 6;
  const DIFFICULTY_ICON_URLS = {
    beginner: "/difficulty-easy.png?v=lobby-v5",
    medium: "/difficulty-normal.png?v=lobby-v5",
    hard: "/difficulty-hard.png?v=lobby-v5"
  };

  let lobbyOpenedPlayerId = "";
  let lobbyDifficultyLockUntil = 0;

  Object.values(DIFFICULTY_ICON_URLS).forEach(src => {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  });

  function isImageAvatar(value) {
    return (
      window.PtitBacProfilePhoto?.isImageAvatar?.(value) ||
      /^data:image\//i.test(String(value || ""))
    );
  }

  function difficultyInfo(value) {
    if (value === "hard") return { label: "Difficile", icon: DIFFICULTY_ICON_URLS.hard };
    if (value === "medium") return { label: "Normal", icon: DIFFICULTY_ICON_URLS.medium };
    return { label: "Facile", icon: DIFFICULTY_ICON_URLS.beginner };
  }

  function avatarMarkup(player) {
    const raw = String(player?.avatar || "");
    if (isImageAvatar(raw)) {
      return `<img src="${raw}" alt="" draggable="false">`;
    }
    return `<span>${escapeHtml(raw || String(player?.name || "?").charAt(0).toUpperCase())}</span>`;
  }

  function friendCodeFor(player) {
    if (!player) return "";
    if (String(player.id) === String(session.playerId)) {
      const local = String(localStorage.getItem("petitbac_friendCode") || "").trim();
      if (/^\d{5}$/.test(local)) return local;
    }
    const remote = String(player.friendCode || "").trim();
    return /^\d{5}$/.test(remote) ? remote : "";
  }

  function playerProfileModal(state) {
    if (!lobbyOpenedPlayerId) return "";

    const player = state.players.find(p => String(p.id) === String(lobbyOpenedPlayerId));
    if (!player) {
      lobbyOpenedPlayerId = "";
      return "";
    }

    const self = String(player.id) === String(session.playerId);
    const code = friendCodeFor(player);
    const canSocial = !self && !player.isBot && !!code;

    return `
      <div class="lobby-v5-profile-backdrop" id="lobbyPlayerProfileBackdrop">
        <section class="lobby-v5-profile-modal" role="dialog" aria-modal="true">
          <button id="lobbyPlayerProfileClose" class="lobby-v5-profile-close" type="button">×</button>
          <div class="lobby-v5-profile-avatar">${avatarMarkup(player)}</div>
          <h2>${escapeHtml(player.name || "Joueur")}</h2>
          <p>${player.isBot ? "Joueur test" : (player.connected ? "En ligne" : "Hors ligne")}</p>
          <div class="lobby-v5-profile-code">
            <small>Code ami</small>
            <strong>${player.isBot ? "Joueur test" : (code ? `#${escapeHtml(code)}` : "Indisponible")}</strong>
          </div>

          ${self ? `<div class="lobby-v5-profile-self">C’est ton profil.</div>` :
            player.isBot ? `<div class="lobby-v5-profile-self">Les joueurs test ne peuvent pas recevoir de demande d’ami.</div>` :
            `<div class="lobby-v5-profile-actions">
              <button id="lobbyPlayerAddFriend" type="button" ${canSocial ? "" : "disabled"}>Ajouter en ami</button>
              <button id="lobbyPlayerReport" class="danger" type="button" ${code ? "" : "disabled"}>Signaler</button>
            </div>`}
        </section>
      </div>`;
  }

  function settingCard({ key, label, value, icon, difficulty = false }) {
    return `
      <article class="lobby-v5-setting-card ${difficulty ? "is-difficulty" : ""}">
        <img class="lobby-v5-setting-icon" src="${icon}" alt="">
        <small>${label}</small>
        <div class="lobby-v5-setting-value">
          <strong>${value}</strong>
        </div>
      </article>`;
  }

  function playerRow(player, index, user) {
    const online = player.connected || player.isBot;
    const canKick = user?.isHost && !player.isHost && String(player.id) !== String(session.playerId);
    const code = friendCodeFor(player);

    return `
      <article class="lobby-v5-player ${canKick ? "has-kick" : ""}"
        data-lobby-player-profile="${player.id}" tabindex="0" role="button">
        <div class="lobby-v5-avatar">${avatarMarkup(player)}</div>

        <div class="lobby-v5-player-copy">
          <div class="lobby-v5-player-name-row">
            <strong>${escapeHtml(player.name || "Joueur")}</strong>
            ${player.isHost
              ? `<span class="host-badge"><img src="/admin-crown.png" alt=""> Hôte</span>`
              : online
                ? `<span class="ready-badge">✓ Prêt</span>`
                : `<span class="offline-badge">Pas prêt</span>`}
          </div>
          ${code ? `<small># ${escapeHtml(code)}</small>` : ""}
        </div>

        ${canKick ? `<button class="lobby-v5-kick" data-kick-id="${player.id}" type="button" aria-label="Retirer">×</button>` : ""}
      </article>`;
  }

  function emptyPlayerRow(host, slot) {
    if (host) {
      return `
        <button class="lobby-v5-empty-player" data-add-bot="${slot}" type="button">
          <span class="lobby-v5-empty-plus">＋</span>
          <span>En attente d’un joueur…</span>
        </button>`;
    }
    return `
      <div class="lobby-v5-empty-player readonly">
        <span class="lobby-v5-empty-plus">＋</span>
        <span>En attente d’un joueur…</span>
      </div>`;
  }

  function renderLobbySettingsV5() {
    clearInterval(session.timerHandle);

    const state = session.state;
    const user = me();

    if (!state || state.phase !== "lobby") {
      return render();
    }

    if (!user?.isHost) {
      toast("Seul l’hôte peut modifier les paramètres.");
      return renderLobbyV5();
    }

    const difficulty = difficultyInfo(state.categoryDifficulty);
    const categoryCount = Number(state.categoryCount || state.categories?.length || 6);

    const optionCard = ({ key, label, value, icon, difficultyClass = "" }) => `
      <article class="lobby-settings-page-card ${difficultyClass}">
        <img src="${icon}" alt="">
        <small>${label}</small>

        <div class="lobby-settings-page-stepper">
          <button type="button" data-lobby-settings-step="${key}" data-dir="-1" aria-label="Diminuer">
            <img src="/lobby-minus.png" alt="">
          </button>

          <strong>${value}</strong>

          <button type="button" data-lobby-settings-step="${key}" data-dir="1" aria-label="Augmenter">
            <img src="/lobby-plus.png" alt="">
          </button>
        </div>
      </article>
    `;

    setScreen(`
      <main class="screen lobby-settings-page">
        <header class="lobby-settings-page-header">
          <button id="lobbySettingsBack" type="button" aria-label="Retour au salon">
            <img src="/back-arrow.png" alt="">
          </button>

          <div>
            <small>CONFIGURATION DU SALON</small>
            <h1>Paramètres</h1>
          </div>

          <img class="lobby-settings-header-icon" src="/settings.png" alt="">
        </header>

        <section class="lobby-settings-page-intro">
          <h2>Paramètres de la partie</h2>
          <p>Choisis les règles avant de lancer la partie.</p>
        </section>

        <section class="lobby-settings-page-grid">
          ${optionCard({
            key: "rounds",
            label: "Manches",
            value: state.rounds,
            icon: "/lightning.png"
          })}

          ${optionCard({
            key: "categoryCount",
            label: "Catégories",
            value: categoryCount,
            icon: "/lobby-categories.png"
          })}

          ${optionCard({
            key: "duration",
            label: "Temps",
            value: `${Number(state.duration || 60)}s`,
            icon: "/lobby-clock.png"
          })}

          ${optionCard({
            key: "categoryDifficulty",
            label: "Difficulté",
            value: difficulty.label,
            icon: difficulty.icon,
            difficultyClass: "difficulty"
          })}
        </section>

        <section class="lobby-settings-page-help">
          <img src="${difficulty.icon}" alt="">
          <div>
            <strong>Niveau ${difficulty.label}</strong>
            <small>
              ${state.categoryDifficulty === "hard"
                ? "Des catégories plus difficiles pour les joueurs expérimentés."
                : state.categoryDifficulty === "medium"
                  ? "Un équilibre entre catégories simples et plus originales."
                  : "Des catégories simples et rapides pour commencer."}
            </small>
          </div>
        </section>

        <button id="lobbySettingsDone" class="lobby-settings-page-done" type="button">
          Enregistrer et revenir au salon
        </button>

        <footer class="ptb-shared-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>
      </main>
    `);

    const updateSetting = (setting, dir) => {
      if (setting === "categoryDifficulty") {
        const now = Date.now();
        if (now < lobbyDifficultyLockUntil) return;
        lobbyDifficultyLockUntil = now + 260;
      }

      const rounds = [1, 3, 5];
      const durations = [30, 60, 90];
      const difficulties = ["beginner", "medium", "hard"];

      let nextRounds = Number(state.rounds || 1);
      let nextDuration = Number(state.duration || 60);
      let nextDifficulty = state.categoryDifficulty || "beginner";
      let nextCategoryCount = categoryCount;

      const cycle = (arr, current, direction) => {
        let index = arr.indexOf(current);
        if (index < 0) index = 0;
        return arr[(index + direction + arr.length) % arr.length];
      };

      if (setting === "rounds") {
        nextRounds = cycle(rounds, nextRounds, dir);
      }

      if (setting === "duration") {
        nextDuration = cycle(durations, nextDuration, dir);
      }

      if (setting === "categoryDifficulty") {
        nextDifficulty = cycle(difficulties, nextDifficulty, dir);
      }

      if (setting === "categoryCount") {
        nextCategoryCount = Math.max(5, Math.min(10, nextCategoryCount + dir));
      }

      document.querySelectorAll("[data-lobby-settings-step]").forEach(button => {
        button.disabled = true;
      });

      socket.emit("room:updateSettings", {
        code: state.code,
        playerId: session.playerId,
        rounds: nextRounds,
        duration: nextDuration,
        categoryCount: nextCategoryCount,
        categoryDifficulty: nextDifficulty
      }, res => {
        if (!res?.ok) {
          lobbyDifficultyLockUntil = 0;
          document.querySelectorAll("[data-lobby-settings-step]").forEach(button => {
            button.disabled = false;
          });
          return toast(res?.error || "Impossible de modifier ce paramètre.");
        }

        if (res.state) {
          session.state = res.state;
          renderLobbySettingsV5();
        }
      });
    };

    document.querySelectorAll("[data-lobby-settings-step]").forEach(button => {
      button.addEventListener("click", () => {
        updateSetting(
          button.dataset.lobbySettingsStep,
          Number(button.dataset.dir) || 1
        );
      });
    });

    const back = () => renderLobbyV5();

    document.getElementById("lobbySettingsBack")?.addEventListener("click", back);
    document.getElementById("lobbySettingsDone")?.addEventListener("click", back);
  }

  function renderLobbyV5() {
    clearInterval(session.timerHandle);
    session.localAnswers = {};

    const state = session.state;
    const user = me();
    if (!state || state.phase !== "lobby") return render();

    const playerCount = state.players.length;
    const difficulty = difficultyInfo(state.categoryDifficulty);
    const categoryCount = Number(state.categoryCount || state.categories?.length || 6);
    const coins = typeof getCoins === "function" ? getCoins() : 0;
    const adminDisplay = window.PtitBacAdminDisplayState || {};
    const coinDisplay =
      adminDisplay.admin && adminDisplay.infiniteCoins
        ? "∞"
        : String(coins);

    const players = state.players.map((p, index) => playerRow(p, index, user)).join("");
    const emptySlots =
      playerCount < LOBBY_MAX_PLAYERS
        ? emptyPlayerRow(!!user?.isHost, 0)
        : "";

    setScreen(`
      <main class="screen lobby-v5">
        <header class="lobby-v5-header">
          <button id="lobbyV5Leave" class="lobby-v5-back" type="button" aria-label="Quitter le salon">
            <img src="/lobby-exit.png" alt="">
          </button>

          <div class="lobby-v5-title">
            <h1>Salon</h1>
            <button id="copyCode" class="lobby-v5-code" type="button">
              <span>Code :</span>
              <strong>${escapeHtml(state.code)}</strong>
              <img src="/lobby-copy.png" alt="">
            </button>
          </div>

          <div class="lobby-v5-coin-pill">
            <img src="/coin.png" alt="">
            <strong>${coinDisplay}</strong>
          </div>
        </header>

        <section class="lobby-v5-host-card">
          <div class="lobby-v5-host-crown"><img src="/admin-crown.png" alt=""></div>
          <div class="lobby-v5-host-avatar">${avatarMarkup(user || state.players[0])}</div>
          <div class="lobby-v5-host-copy">
            <small>Hôte de la partie</small>
            <strong>${escapeHtml(state.players.find(p => p.isHost)?.name || user?.name || "Joueur")}</strong>
            ${friendCodeFor(state.players.find(p => p.isHost))
              ? `<span># ${escapeHtml(friendCodeFor(state.players.find(p => p.isHost)))}</span>`
              : ""}
          </div>
          <button class="lobby-v5-settings-shortcut" id="lobbySettingsShortcut" type="button">
            <img src="/settings.png" alt="">
            <span>Paramètres</span>
          </button>
        </section>

        <section class="lobby-v5-settings-panel" id="lobbySettingsPanel">
          <h2>
            <img src="/settings.png" alt="">
            Paramètres de la partie
          </h2>

          <div class="lobby-v5-settings-grid">
            ${settingCard({
              key: "rounds",
              label: "Manches",
              value: state.rounds,
              icon: "/lightning.png"
            })}
            ${settingCard({
              key: "categoryCount",
              label: "Catégories",
              value: categoryCount,
              icon: "/lobby-categories.png"
            })}
            ${settingCard({
              key: "duration",
              label: "Temps",
              value: `${Number(state.duration || 60)}s`,
              icon: "/lobby-clock.png"
            })}
            ${settingCard({
              key: "categoryDifficulty",
              label: "Difficulté",
              value: difficulty.label,
              icon: difficulty.icon,
              difficulty: true
            })}
          </div>
        </section>

        <section class="lobby-v5-players-section">
          <h2>Joueurs <span>(${playerCount}/${LOBBY_MAX_PLAYERS})</span></h2>
          <div class="lobby-v5-player-list">
            ${players}
            ${emptySlots}
          </div>
        </section>

        <section class="lobby-v5-actions">
          <button class="lobby-v5-invite" id="inviteFriendsBtn" type="button">
            <img src="/friends.png" alt="">
            <strong>Inviter des amis</strong>
          </button>

          ${user?.isHost
            ? `<button class="lobby-v5-start" id="startBtn" type="button" ${playerCount < 2 ? "disabled" : ""}>
                <span>▶</span>
                <strong>Lancer la partie</strong>
              </button>`
            : `<div class="lobby-v5-wait-host">
                <span class="spinner small-spinner"></span>
                En attente de l’hôte…
              </div>`}
        </section>

        <footer class="ptb-shared-footer" aria-hidden="true">
          <img src="/shared-footer-v1.png" alt="">
        </footer>

        ${playerProfileModal(state)}
      </main>
    `);

    const leave = () => {
      socket.emit("room:leave", { code: state.code, playerId: session.playerId });
      clearSession();
      renderHome();
    };

    document.getElementById("lobbyV5Leave")?.addEventListener("click", leave);

    document.getElementById("copyCode")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(state.code);
        toast("Code copié !");
      } catch {
        toast(`Code : ${state.code}`);
      }
    });

    document.getElementById("lobbySettingsShortcut")?.addEventListener("click", () => {
      if (!user?.isHost) {
        return toast("Seul l’hôte peut modifier les paramètres.");
      }
      renderLobbySettingsV5();
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

    document.querySelectorAll("[data-add-bot]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!user?.isHost) return;
        if (state.players.length >= LOBBY_MAX_PLAYERS) return toast("Salon complet.");
        socket.emit("room:addBot", { code: state.code, playerId: session.playerId });
      });
    });

    const openProfile = playerId => {
      lobbyOpenedPlayerId = String(playerId || "");
      renderLobbyV5();
    };

    document.querySelectorAll("[data-lobby-player-profile]").forEach(card => {
      card.addEventListener("click", event => {
        if (event.target.closest("[data-kick-id]")) return;
        openProfile(card.dataset.lobbyPlayerProfile);
      });
      card.addEventListener("keydown", event => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openProfile(card.dataset.lobbyPlayerProfile);
      });
    });

    const closeProfile = () => {
      lobbyOpenedPlayerId = "";
      renderLobbyV5();
    };

    document.getElementById("lobbyPlayerProfileClose")?.addEventListener("click", closeProfile);
    document.getElementById("lobbyPlayerProfileBackdrop")?.addEventListener("click", event => {
      if (event.target.id === "lobbyPlayerProfileBackdrop") closeProfile();
    });

    document.getElementById("lobbyPlayerAddFriend")?.addEventListener("click", () => {
      const target = state.players.find(p => String(p.id) === String(lobbyOpenedPlayerId));
      const code = friendCodeFor(target);
      if (!code) return toast("Code ami indisponible.");
      if (!window.PtitBacFriends?.sendRequestByCode) return toast("Le système d’amis n’est pas encore prêt.");

      window.PtitBacFriends.sendRequestByCode(code, res => {
        if (!res?.ok) return toast(res?.error || "Demande impossible.");
        toast(`Demande envoyée à ${target?.name || "ce joueur"} !`);
      });
    });

    document.getElementById("lobbyPlayerReport")?.addEventListener("click", () => {
      const target = state.players.find(p => String(p.id) === String(lobbyOpenedPlayerId));
      const code = friendCodeFor(target);
      if (!target || !code) return toast("Ce joueur ne peut pas être signalé.");

      socket.emit("players:report", {
        walletToken: session.walletToken || localStorage.getItem("petitbac_walletToken") || "",
        roomCode: state.code,
        targetPlayerId: target.id,
        targetFriendCode: code,
        targetName: target.name || ""
      }, res => {
        if (!res?.ok) return toast(res?.error || "Signalement impossible.");
        toast("Signalement envoyé.");
        closeProfile();
      });
    });

    if (user?.isHost) {
      document.querySelectorAll("[data-kick-id]").forEach(btn => {
        btn.addEventListener("click", event => {
          event.stopPropagation();
          socket.emit("room:kick", {
            code: state.code,
            playerId: session.playerId,
            targetPlayerId: btn.dataset.kickId
          });
        });
      });

      // Le vrai lancement est intercepté par lobby-polish-v1.js
      // qui affiche d'abord le compte à rebours synchronisé.
      document.getElementById("startBtn")?.addEventListener("click", () => {
        socket.emit("game:start", { code: state.code, playerId: session.playerId });
      });
    }
  }

  window.renderLobby = renderLobbyV5;
  window.renderLobbySettings = renderLobbySettingsV5;
  try { renderLobby = renderLobbyV5; } catch {}
})();