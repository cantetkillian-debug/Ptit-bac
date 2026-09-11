(() => {
  "use strict";

  const LOBBY_MAX_PLAYERS = 6;

  const DIFFICULTY_ICON_URLS = {
    beginner: "/difficulty-easy.png?v=lobby11",
    medium: "/difficulty-normal.png?v=lobby11",
    hard: "/difficulty-hard.png?v=lobby11"
  };

  let lobbyLastDifficulty = null;
  let lobbyLastCode = "";
  let lobbyDifficultyLockUntil = 0;
  let lobbyOpenedPlayerId = "";

  // Précharge/décode les 3 icônes pour éviter un freeze au premier changement.
  Object.values(DIFFICULTY_ICON_URLS).forEach(src => {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    if (typeof img.decode === "function") img.decode().catch(() => {});
  });

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

  function lobbyFriendCode(player) {
    if (!player) return "";
    if (player.id === session.playerId) {
      const local = String(localStorage.getItem("petitbac_friendCode") || "").trim();
      if (/^\d{5}$/.test(local)) return local;
    }
    const remote = String(player.friendCode || "").trim();
    return /^\d{5}$/.test(remote) ? remote : "";
  }

  function lobbyProfileAvatar(player) {
    const raw = player?.avatar || "";
    const isImage =
      window.PtitBacProfilePhoto?.isImageAvatar?.(raw) ||
      /^data:image\//i.test(String(raw));

    if (isImage) {
      return `<img src="${raw}" alt="" draggable="false">`;
    }

    return `<span>${escapeHtml(raw || String(player?.name || "?").charAt(0).toUpperCase())}</span>`;
  }

  function lobbyPlayerProfileModal(state) {
    if (!lobbyOpenedPlayerId) return "";

    const player = state.players.find(p => String(p.id) === String(lobbyOpenedPlayerId));
    if (!player) {
      lobbyOpenedPlayerId = "";
      return "";
    }

    const self = String(player.id) === String(session.playerId);
    const code = lobbyFriendCode(player);
    const canSocial = !self && !player.isBot && !!code;

    return `
      <div class="lobby-player-modal-backdrop" id="lobbyPlayerProfileBackdrop">
        <section class="lobby-player-modal" role="dialog" aria-modal="true"
          aria-label="Profil de ${escapeHtml(player.name || "Joueur")}">
          <button id="lobbyPlayerProfileClose" class="lobby-player-modal-close"
            type="button" aria-label="Fermer">×</button>

          <div class="lobby-player-modal-avatar">
            ${lobbyProfileAvatar(player)}
          </div>

          <h2>${escapeHtml(player.name || "Joueur")}</h2>
          <p class="lobby-player-modal-status">
            <i class="${player.connected || player.isBot ? "on" : ""}"></i>
            ${player.isBot ? "Joueur test" : (player.connected ? "En ligne" : "Hors ligne")}
          </p>

          <div class="lobby-player-modal-code">
            <small>Code ami</small>
            <strong>${player.isBot ? "Joueur test" : (code || "Indisponible")}</strong>
          </div>

          ${self ? `
            <div class="lobby-player-modal-self">C’est ton profil.</div>
          ` : player.isBot ? `
            <div class="lobby-player-modal-self">Les joueurs test ne peuvent pas recevoir de demande d’ami.</div>
          ` : `
            <div class="lobby-player-modal-actions">
              <button id="lobbyPlayerAddFriend" class="primary" type="button" ${canSocial ? "" : "disabled"}>
                Envoyer une demande d’ami
              </button>
              <button id="lobbyPlayerReport" class="danger" type="button" ${code ? "" : "disabled"}>
                Signaler
              </button>
            </div>
          `}
        </section>
      </div>`;
  }

  function difficultyInfo(value) {
    if (value === "hard") {
      return { label: "Difficile", icon: DIFFICULTY_ICON_URLS.hard };
    }
    if (value === "medium") {
      return { label: "Normal", icon: DIFFICULTY_ICON_URLS.medium };
    }
    return { label: "Facile", icon: DIFFICULTY_ICON_URLS.beginner };
  }

  function lobbyV4SettingRow({ key, label, value, icon, iconClass = "", animate = false }, isHost) {
    return `
      <div class="lobby-v4-setting lobby-v4-setting-${key} ${animate ? "is-swapping" : ""}">
        <img
          class="lobby-v4-setting-icon ${iconClass}"
          src="${icon}"
          alt=""
          width="64"
          height="64"
          decoding="async"
          draggable="false"
        >
        <div class="lobby-v4-setting-main">
          <small>${label}</small>
          <div class="lobby-v4-stepper ${isHost ? "" : "readonly"}">
            ${isHost
              ? `<button type="button" data-lobby-v4-step="${key}" data-dir="-1" aria-label="Diminuer">
                  <img src="/lobby-minus.png" alt="">
                </button>`
              : `<span class="lobby-v4-step-spacer"></span>`}
            <strong class="lobby-v4-setting-value">${value}</strong>
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

    if (state.code !== lobbyLastCode) {
      lobbyLastCode = state.code;
      lobbyLastDifficulty = state.categoryDifficulty;
    }
    const difficultyChanged =
      lobbyLastDifficulty !== null &&
      lobbyLastDifficulty !== state.categoryDifficulty;

    const players = state.players.map((p, index) => {
      const online = p.connected || p.isBot;
      const canKick = user?.isHost && !p.isHost && p.id !== session.playerId;

      return `
        <article class="lobby-v4-player ${canKick ? "has-kick" : ""}"
          data-lobby-player-profile="${p.id}"
          tabindex="0"
          role="button"
          aria-label="Voir le profil de ${escapeHtml(p.name)}">
          ${lobbyV4Avatar(p, index)}
          <div class="lobby-v4-player-copy">
            <div class="lobby-v4-player-name">
              <strong>${escapeHtml(p.name)}</strong>
              <i class="lobby-v4-online ${online ? "on" : ""}"></i>
              ${p.isHost ? `<span>Hôte</span>` : ""}
            </div>
            <small>${online ? "Prêt" : "Déconnecté"}</small>
          </div>
          ${canKick ? `<button class="lobby-v4-kick" data-kick-id="${p.id}" type="button" aria-label="Retirer ${escapeHtml(p.name)}">×</button>` : ""}
        </article>`;
    }).join("");

    setScreen(`
      <main class="screen lobby-v4">
        <span class="lobby-v4-bg-letter lobby-v4-bg-a">A</span>
        <span class="lobby-v4-bg-letter lobby-v4-bg-b">B</span>
        <span class="lobby-v4-bg-letter lobby-v4-bg-c">C</span>
        <span class="lobby-v4-bg-letter lobby-v4-bg-d">D</span>
        <span class="lobby-v4-bg-letter lobby-v4-bg-e">E</span>
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
                <img src="/join.png" alt="">
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
              <img class="lobby-v4-invite-icon" src="/friends.png" alt="">
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
              iconClass: "difficulty",
              animate: difficultyChanged
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

        ${lobbyPlayerProfileModal(state)}

        <div class="lobby-v4-wave wave-1"></div>
        <div class="lobby-v4-wave wave-2"></div>
      </main>
    `);

    lobbyLastDifficulty = state.categoryDifficulty;

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

      if (setting === "categoryDifficulty") {
        const now = Date.now();
        if (now < lobbyDifficultyLockUntil) return;
        lobbyDifficultyLockUntil = now + 320;
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
          return toast(res?.error || "Impossible de modifier ce paramètre.");
        }
        // Ne pas appeler render() ici :
        // le serveur envoie juste après room:state, qui déclenche déjà le rendu global.
        // Cela évite deux reconstructions complètes de la page par clic.
        if (res.state) session.state = res.state;
      });
    };

    document.querySelectorAll("[data-lobby-v4-step]").forEach(btn => {
      btn.addEventListener("click", event => {
        event.preventDefault();
        updateSetting(btn.dataset.lobbyV4Step, Number(btn.dataset.dir) || 1);
      });
    });

    const openPlayerProfile = playerId => {
      lobbyOpenedPlayerId = String(playerId || "");
      renderLobbyV4();
    };

    document.querySelectorAll("[data-lobby-player-profile]").forEach(card => {
      card.addEventListener("click", event => {
        if (event.target.closest("[data-kick-id]")) return;
        openPlayerProfile(card.dataset.lobbyPlayerProfile);
      });

      card.addEventListener("keydown", event => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openPlayerProfile(card.dataset.lobbyPlayerProfile);
      });
    });

    const closePlayerProfile = () => {
      lobbyOpenedPlayerId = "";
      renderLobbyV4();
    };

    document.getElementById("lobbyPlayerProfileClose")?.addEventListener("click", closePlayerProfile);

    document.getElementById("lobbyPlayerProfileBackdrop")?.addEventListener("click", event => {
      if (event.target.id === "lobbyPlayerProfileBackdrop") closePlayerProfile();
    });

    document.getElementById("lobbyPlayerAddFriend")?.addEventListener("click", () => {
      const target = state.players.find(p => String(p.id) === String(lobbyOpenedPlayerId));
      const friendCode = lobbyFriendCode(target);
      if (!friendCode) return toast("Code ami indisponible.");

      if (!window.PtitBacFriends?.sendRequestByCode) {
        return toast("Le système d’amis n’est pas encore prêt.");
      }

      window.PtitBacFriends.sendRequestByCode(friendCode, res => {
        if (!res?.ok) return toast(res?.error || "Demande impossible.");
        toast(`Demande envoyée à ${target?.name || "ce joueur"} !`);
      });
    });

    document.getElementById("lobbyPlayerReport")?.addEventListener("click", () => {
      const target = state.players.find(p => String(p.id) === String(lobbyOpenedPlayerId));
      const friendCode = lobbyFriendCode(target);
      if (!target || !friendCode) return toast("Ce joueur ne peut pas être signalé.");
      if (!confirm(`Signaler ${target.name || "ce joueur"} ?`)) return;

      socket.emit("players:report", {
        walletToken: session.walletToken || localStorage.getItem("petitbac_walletToken") || "",
        roomCode: state.code,
        targetPlayerId: target.id,
        targetFriendCode: friendCode,
        targetName: target.name || ""
      }, res => {
        if (!res?.ok) return toast(res?.error || "Signalement impossible.");
        toast("Signalement envoyé.");
        closePlayerProfile();
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