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
  let lobbySettingsOpen = false;
  let lobbyInviteOpen = false;
  let lobbyInviteFriends = [];
  let lobbyInviteLoading = false;
  const lobbyInviteSocket = io({ forceNew: true });

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
    if (value === "medium") return { label: "Moyen", icon: DIFFICULTY_ICON_URLS.medium };
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

  function lobbySettingsOverlay(state, user) {
    if (!lobbySettingsOpen || !user?.isHost) return "";

    const difficulty = difficultyInfo(state.categoryDifficulty);
    const categoryCount = Number(state.categoryCount || state.categories?.length || 6);

    const card = ({ key, label, value, icon, difficultyClass = "" }) => `
      <article class="lobby-v5-edit-card ${difficultyClass}">
        <img src="${icon}" alt="">
        <small>${label}</small>
        <div class="lobby-v5-edit-stepper">
          <button type="button" data-lobby-inline-step="${key}" data-dir="-1" aria-label="Diminuer">
            <img src="/lobby-minus.png" alt="">
          </button>
          <strong>${value}</strong>
          <button type="button" data-lobby-inline-step="${key}" data-dir="1" aria-label="Augmenter">
            <img src="/lobby-plus.png" alt="">
          </button>
        </div>
      </article>
    `;

    return `
      <div class="lobby-v5-settings-overlay" id="lobbySettingsOverlay">
        <section class="lobby-v5-settings-sheet" role="dialog" aria-modal="true" aria-label="Modifier les paramètres">
          <header class="lobby-v5-settings-sheet-header">
            <div>
              <small>PARAMÈTRES DU SALON</small>
              <h2>Modifier la partie</h2>
            </div>
            <button id="lobbySettingsClose" type="button" aria-label="Fermer">×</button>
          </header>

          <div class="lobby-v5-edit-grid">
            ${card({
              key: "rounds",
              label: "Manches",
              value: state.rounds,
              icon: "/lightning.png"
            })}
            ${card({
              key: "categoryCount",
              label: "Catégories",
              value: categoryCount,
              icon: "/lobby-categories.png"
            })}
            ${card({
              key: "duration",
              label: "Temps",
              value: `${Number(state.duration || 60)}s`,
              icon: "/lobby-clock.png"
            })}
            ${card({
              key: "categoryDifficulty",
              label: "Difficulté",
              value: difficulty.label,
              icon: difficulty.icon,
              difficultyClass: "difficulty"
            })}
          </div>

          <button id="lobbySettingsApply" class="lobby-v5-settings-apply" type="button">
            Terminé
          </button>
        </section>
      </div>
    `;
  }

  function lobbyInviteIdentity(extra = {}) {
    return {
      walletToken: localStorage.getItem("petitbac_walletToken") || "",
      username: localStorage.getItem("petitbac_profile_name") || "Joueur",
      avatar: localStorage.getItem("petitbac_profile_icon") || "🐼",
      ...extra
    };
  }

  function lobbyInviteAvatar(user) {
    const raw = String(user?.avatar || "");
    if (isImageAvatar(raw)) {
      return `<img src="${raw}" alt="" draggable="false">`;
    }
    return `<span>${escapeHtml(raw || String(user?.username || "?").charAt(0).toUpperCase())}</span>`;
  }

  function lobbyInviteOverlay(state) {
    if (!lobbyInviteOpen) return "";

    const rows = lobbyInviteLoading
      ? `<div class="lobby-v5-invite-loading">
          <span class="spinner small-spinner"></span>
          Chargement des amis…
        </div>`
      : lobbyInviteFriends.length
        ? lobbyInviteFriends.map(friend => `
            <article class="lobby-v5-invite-friend">
              <div class="lobby-v5-invite-friend-avatar">
                ${lobbyInviteAvatar(friend)}
              </div>

              <div class="lobby-v5-invite-friend-copy">
                <strong>${escapeHtml(friend.username || "Joueur")}</strong>
                <small class="${friend.online ? "online" : ""}">
                  ${friend.online ? "En ligne" : "Hors ligne"}
                </small>
              </div>

              <button
                type="button"
                class="lobby-v5-invite-friend-btn"
                data-lobby-invite-friend="${escapeHtml(friend.id)}"
              >
                <img src="/friends.png" alt="">
                <span>Inviter</span>
              </button>
            </article>
          `).join("")
        : `<div class="lobby-v5-invite-empty">
            <img src="/friends.png" alt="">
            <strong>Aucun ami disponible</strong>
            <small>Ajoute des amis depuis ton profil pour les inviter ici.</small>
          </div>`;

    return `
      <div class="lobby-v5-invite-overlay" id="lobbyInviteOverlay">
        <section class="lobby-v5-invite-sheet" role="dialog" aria-modal="true" aria-label="Inviter des amis">
          <header class="lobby-v5-invite-sheet-header">
            <div>
              <small>SALON ${escapeHtml(state.code)}</small>
              <h2>Inviter des amis</h2>
            </div>

            <button id="lobbyInviteClose" type="button" aria-label="Fermer">×</button>
          </header>

          <div class="lobby-v5-invite-list">
            ${rows}
          </div>
        </section>
      </div>
    `;
  }

  function loadLobbyInviteFriends() {
    lobbyInviteLoading = true;
    renderLobbyV5();

    lobbyInviteSocket.emit("friends:list", lobbyInviteIdentity(), res => {
      lobbyInviteLoading = false;

      if (!res?.ok) {
        lobbyInviteFriends = [];
        toast(res?.error || "Impossible de charger tes amis.");
        return renderLobbyV5();
      }

      lobbyInviteFriends = Array.isArray(res.friends) ? res.friends : [];
      renderLobbyV5();
    });
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
        ? emptyPlayerRow(!!user?.isHost && state.mode !== "quick", 0)
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
        ${lobbySettingsOverlay(state, user)}
        ${lobbyInviteOverlay(state)}
      </main>
    `);

    const leave = () => {
      lobbySettingsOpen = false;
      lobbyInviteOpen = false;
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
      lobbySettingsOpen = true;
      renderLobbyV5();
    });

    const closeInlineSettings = () => {
      lobbySettingsOpen = false;
      renderLobbyV5();
    };

    document.getElementById("lobbySettingsClose")?.addEventListener("click", closeInlineSettings);
    document.getElementById("lobbySettingsApply")?.addEventListener("click", closeInlineSettings);

    document.getElementById("lobbySettingsOverlay")?.addEventListener("click", event => {
      if (event.target.id === "lobbySettingsOverlay") closeInlineSettings();
    });

    const updateInlineSetting = (setting, dir) => {
      if (!user?.isHost) return;

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
        let i = arr.indexOf(current);
        if (i < 0) i = 0;
        return arr[(i + direction + arr.length) % arr.length];
      };

      if (setting === "rounds") nextRounds = cycle(rounds, nextRounds, dir);
      if (setting === "duration") nextDuration = cycle(durations, nextDuration, dir);
      if (setting === "categoryDifficulty") nextDifficulty = cycle(difficulties, nextDifficulty, dir);
      if (setting === "categoryCount") nextCategoryCount = Math.max(5, Math.min(10, nextCategoryCount + dir));

      document.querySelectorAll("[data-lobby-inline-step]").forEach(button => {
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
          document.querySelectorAll("[data-lobby-inline-step]").forEach(button => {
            button.disabled = false;
          });
          return toast(res?.error || "Impossible de modifier ce paramètre.");
        }

        if (res.state) session.state = res.state;
        // La room:state va rerendre le salon ; garder l'overlay ouvert.
      });
    };

    document.querySelectorAll("[data-lobby-inline-step]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        updateInlineSetting(
          button.dataset.lobbyInlineStep,
          Number(button.dataset.dir) || 1
        );
      });
    });

    document.getElementById("inviteFriendsBtn")?.addEventListener("click", () => {
      lobbyInviteOpen = true;
      lobbyInviteFriends = [];
      renderLobbyV5();
      loadLobbyInviteFriends();
    });

    const closeLobbyInvite = () => {
      lobbyInviteOpen = false;
      lobbyInviteLoading = false;
      renderLobbyV5();
    };

    document.getElementById("lobbyInviteClose")?.addEventListener("click", closeLobbyInvite);

    document.getElementById("lobbyInviteOverlay")?.addEventListener("click", event => {
      if (event.target.id === "lobbyInviteOverlay") closeLobbyInvite();
    });

    document.querySelectorAll("[data-lobby-invite-friend]").forEach(button => {
      button.addEventListener("click", () => {
        const friendId = button.dataset.lobbyInviteFriend || "";
        if (!friendId) return;

        button.disabled = true;

        lobbyInviteSocket.emit(
          "friends:invite",
          lobbyInviteIdentity({
            friendId,
            roomCode: state.code
          }),
          res => {
            button.disabled = false;

            if (!res?.ok) {
              return toast(res?.error || "Invitation impossible.");
            }

            button.classList.add("sent");
            button.innerHTML = `<span>${res.delivered ? "Envoyé ✓" : "Hors ligne"}</span>`;
            toast(res.delivered ? "Invitation envoyée !" : "Ami hors ligne pour le moment.");
          }
        );
      });
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
  try { renderLobby = renderLobbyV5; } catch {}
})();
