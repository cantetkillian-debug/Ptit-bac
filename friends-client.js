/**
 * P'tit Bac — interface Amis V2
 * Design harmonisé avec les dernières pages Profil / Accueil.
 */
(() => {
  "use strict";

  const friendSocket = io({ forceNew: true });
  let friendsState = {
    profile: null,
    friends: [],
    incoming: [],
    outgoing: [],
    activeTab: "friends"
  };
  let friendsOpen = false;
  let bootstrapTimer = null;
  let openedFriendId = "";

  function identityPayload(extra = {}) {
    return {
      walletToken: localStorage.getItem("petitbac_walletToken") || "",
      username: localStorage.getItem("petitbac_profile_name") || "Joueur",
      avatar: localStorage.getItem("petitbac_profile_icon") || "🐼",
      ...extra
    };
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[ch]);
  }

  function isImageAvatar(value) {
    if (window.PtitBacProfilePhoto?.isImageAvatar) {
      return window.PtitBacProfilePhoto.isImageAvatar(value);
    }
    return typeof value === "string" && /^data:image\//i.test(value);
  }

  function avatarMarkup(value, className = "") {
    const avatar = value || "🐼";
    if (isImageAvatar(avatar)) {
      return `<img class="${className}" src="${avatar}" alt="" draggable="false">`;
    }
    return `<span>${escapeHtml(avatar)}</span>`;
  }

  function copyIcon() {
    return `
      <svg class="friends-v2-copy-svg" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="7" width="10" height="12" rx="2"></rect>
        <path d="M6 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;
  }

  function tabIcon(type) {
    const icons = {
      friends: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="3"></circle>
          <path d="M3.5 18a5.5 5.5 0 0 1 11 0"></path>
          <circle cx="17" cy="9" r="2.3"></circle>
          <path d="M15.5 14.5c2.7.1 4.7 1.4 5 3.7"></path>
        </svg>`,
      requests: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="3"></circle>
          <path d="M3.5 18a5.5 5.5 0 0 1 11 0"></path>
          <path d="M18 7v6M15 10h6"></path>
        </svg>`,
      add: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="3"></circle>
          <path d="M3.5 18a5.5 5.5 0 0 1 11 0"></path>
          <path d="M18 7v6M15 10h6"></path>
        </svg>`
    };
    return icons[type] || icons.friends;
  }

  function localToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._friendTimer);
    toast._friendTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function prettyLastSeen(value) {
    if (!value) return "Hors ligne";
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "Hors ligne";
    const diff = Math.max(0, Date.now() - time);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 2) return "Vu récemment";
    if (minutes < 60) return `Vu il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Vu il y a ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Vu il y a ${days} j`;
  }

  function bootstrap(silent = true) {
    const token = identityPayload().walletToken;
    if (!token) {
      clearTimeout(bootstrapTimer);
      bootstrapTimer = setTimeout(() => bootstrap(silent), 900);
      return;
    }

    friendSocket.emit("friends:bootstrap", identityPayload(), res => {
      if (!res?.ok) {
        if (!silent) localToast(res?.error || "Impossible de charger les amis.");
        return;
      }

      friendsState.profile = res.profile || null;
      friendsState.friends = res.friends || [];
      friendsState.incoming = res.incoming || [];
      friendsState.outgoing = res.outgoing || [];

      if (friendsOpen) renderFriends();
    });
  }

  function refreshFriends(showError = false) {
    friendSocket.emit("friends:list", identityPayload(), res => {
      if (!res?.ok) {
        if (showError) localToast(res?.error || "Impossible de charger les amis.");
        return;
      }
      friendsState.profile = res.profile || friendsState.profile;
      friendsState.friends = res.friends || [];
      friendsState.incoming = res.incoming || [];
      friendsState.outgoing = res.outgoing || [];
      if (openedFriendId && !friendsState.friends.some(item => String(item.id) === String(openedFriendId))) {
        openedFriendId = "";
      }
      if (friendsOpen) renderFriends();
    });
  }

  function statusMarkup(user) {
    if (user.online) {
      return `<span class="friends-v2-status online"><i></i>En ligne</span>`;
    }
    return `<span class="friends-v2-status"><i></i>${escapeHtml(prettyLastSeen(user.lastSeen))}</span>`;
  }

  function friendCard(user) {
    return `
      <button class="friends-v2-card friends-v3-friend-card" type="button"
        data-friend-profile="${escapeHtml(user.id)}"
        aria-label="Voir le profil de ${escapeHtml(user.username)}">
        <div class="friends-v2-avatar">${avatarMarkup(user.avatar, "friends-v2-avatar-img")}</div>
        <div class="friends-v2-card-main">
          <strong>${escapeHtml(user.username)}</strong>
          ${statusMarkup(user)}
        </div>
        <span class="friends-v3-card-chevron" aria-hidden="true">›</span>
      </button>`;
  }

  function incomingCard(item) {
    const user = item.user;
    return `
      <article class="friends-v2-card request">
        <div class="friends-v2-avatar">${avatarMarkup(user.avatar, "friends-v2-avatar-img")}</div>
        <div class="friends-v2-card-main">
          <strong>${escapeHtml(user.username)}</strong>
          <small>${escapeHtml(user.friendCode || "")}</small>
        </div>
        <div class="friends-v2-request-actions">
          <button class="friends-v2-small-btn decline-request" data-request="${escapeHtml(item.requestId)}">Refuser</button>
          <button class="friends-v2-small-btn primary accept-request" data-request="${escapeHtml(item.requestId)}">Accepter</button>
        </div>
      </article>`;
  }

  function outgoingCard(item) {
    const user = item.user;
    return `
      <article class="friends-v2-card request">
        <div class="friends-v2-avatar">${avatarMarkup(user.avatar, "friends-v2-avatar-img")}</div>
        <div class="friends-v2-card-main">
          <strong>${escapeHtml(user.username)}</strong>
          <small>${escapeHtml(user.friendCode || "")}</small>
        </div>
        <span class="friends-v2-pending">En attente</span>
      </article>`;
  }

  function emptyFriendsState() {
    return `
      <div class="friends-v2-empty">
        <div class="friends-v2-empty-icon friends-v3-empty-icon">
          <img src="/friends.png" alt="" aria-hidden="true">
        </div>
        <strong>Pas encore d'amis</strong>
        <p>Ajoute quelqu'un avec son code ami<br>pour commencer !</p>
        <button id="friendsV2EmptyAdd" class="friends-v2-empty-add" type="button">
          ${tabIcon("add")}
          <span>Ajouter un ami</span>
        </button>
      </div>`;
  }

  function genericEmpty(icon, title, text) {
    return `
      <div class="friends-v2-empty compact">
        <span class="friends-v2-empty-emoji">${icon}</span>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
      </div>`;
  }

  function friendProfileModal() {
    if (!openedFriendId) return "";

    const user = friendsState.friends.find(item => String(item.id) === String(openedFriendId));
    if (!user) {
      openedFriendId = "";
      return "";
    }

    const roomCode = (localStorage.getItem("petitbac_code") || "").trim().toUpperCase();

    return `
      <div class="friends-v3-modal-backdrop" id="friendsProfileBackdrop">
        <section class="friends-v3-profile-modal" role="dialog" aria-modal="true" aria-label="Profil de ${escapeHtml(user.username)}">
          <button class="friends-v3-modal-close" id="friendsProfileClose" type="button" aria-label="Fermer">×</button>

          <div class="friends-v3-modal-avatar-wrap">
            <div class="friends-v3-modal-avatar">
              ${avatarMarkup(user.avatar, "friends-v3-modal-avatar-img")}
            </div>
            <i class="${user.online ? "online" : ""}"></i>
          </div>

          <h2>${escapeHtml(user.username)}</h2>
          ${statusMarkup(user)}

          <div class="friends-v3-friend-code">
            <div>
              <small>Code ami</small>
              <strong>${escapeHtml(user.friendCode || "—")}</strong>
            </div>
            <button id="copyOpenedFriendCode" type="button" ${user.friendCode ? "" : "disabled"} aria-label="Copier le code ami">
              ${copyIcon()}
            </button>
          </div>

          <div class="friends-v3-modal-actions">
            <button id="inviteOpenedFriend" class="primary" type="button" ${roomCode ? "" : "disabled"}>
              <span class="friends-v3-action-icon">🎮</span>
              <span>${roomCode ? "Inviter dans une partie" : "Aucun salon à inviter"}</span>
            </button>

            <button id="messageOpenedFriend" type="button">
              <span class="friends-v3-action-icon">💬</span>
              <span>Envoyer un message</span>
            </button>

            <button id="removeOpenedFriend" class="danger" type="button">
              <span class="friends-v3-action-icon">👤</span>
              <span>Supprimer l'ami</span>
            </button>
          </div>
        </section>
      </div>`;
  }

  function currentPanel() {
    if (friendsState.activeTab === "requests") {
      const incoming = friendsState.incoming.length
        ? friendsState.incoming.map(incomingCard).join("")
        : genericEmpty("💌", "Aucune demande", "Tes nouvelles demandes apparaîtront ici.");

      const outgoing = friendsState.outgoing.length
        ? `<h3 class="friends-v2-subtitle">Envoyées</h3>${friendsState.outgoing.map(outgoingCard).join("")}`
        : "";

      return `
        <section class="friends-v2-list">
          ${incoming}
          ${outgoing}
        </section>`;
    }

    if (friendsState.activeTab === "add") {
      return `
        <section class="friends-v2-add">
          <div class="friends-v2-add-icon">${tabIcon("add")}</div>
          <h2>Ajouter un ami</h2>
          <p>Entre son code ami, par exemple <b>KIKI#4821</b>.</p>
          <div class="friends-v2-add-row">
            <input id="friendCodeInput" maxlength="24" autocomplete="off" autocapitalize="characters" placeholder="CODE#0000" />
            <button id="friendSendBtn">Ajouter</button>
          </div>
        </section>`;
    }

    return `
      <section class="friends-v2-list ${friendsState.friends.length ? "friends-v3-list-populated" : ""}">
        ${friendsState.friends.length
          ? friendsState.friends.map(friendCard).join("")
          : emptyFriendsState()}
      </section>`;
  }

  function renderFriends() {
    friendsOpen = true;
    const app = document.getElementById("app");
    if (!app) return;

    const profile = friendsState.profile;
    const incomingCount = friendsState.incoming.length;

    app.innerHTML = `
      <main class="screen friends-v2">
        <div class="friends-v2-bg-glow glow-a"></div>
        <div class="friends-v2-bg-glow glow-b"></div>
        <div class="friends-v2-wave wave-left"></div>
        <div class="friends-v2-wave wave-right"></div>

        <header class="friends-v2-header">
          <button class="friends-v2-back" id="friendsBackBtn" aria-label="Retour">
            <img src="/back-arrow.png" alt="">
          </button>

          <div class="friends-v2-title">
            <h1>Amis</h1>
          </div>

          <div class="friends-v2-header-spacer" aria-hidden="true"></div>
        </header>

        <section class="friends-v2-code">
          <div>
            <small>Mon code ami</small>
            <strong>${escapeHtml(profile?.friendCode || "Chargement...")}</strong>
          </div>
          <button id="copyFriendCode" ${profile?.friendCode ? "" : "disabled"}>
            ${copyIcon()}
            <span>Copier</span>
          </button>
        </section>

        <nav class="friends-v2-tabs">
          <button data-friend-tab="friends" class="${friendsState.activeTab === "friends" ? "active" : ""}">
            <span class="friends-v2-tab-icon">${tabIcon("friends")}</span>
            <span>Mes amis</span>
          </button>

          <button data-friend-tab="requests" class="${friendsState.activeTab === "requests" ? "active" : ""}">
            <span class="friends-v2-tab-icon">${tabIcon("requests")}</span>
            <span>Demandes</span>
            ${incomingCount ? `<b>${incomingCount}</b>` : ""}
          </button>

          <button data-friend-tab="add" class="${friendsState.activeTab === "add" ? "active" : ""}">
            <span class="friends-v2-tab-icon">${tabIcon("add")}</span>
            <span>Ajouter</span>
          </button>
        </nav>

        <div class="friends-v2-content">
          ${currentPanel()}
        </div>

        <footer class="friends-v2-footer">
          <img src="/ptitbac.logo.png" alt="P'tit Bac">
          <small>Version bêta</small>
        </footer>

        ${friendProfileModal()}
      </main>`;

    bindFriendsUI();
  }

  function bindFriendsUI() {
    document.getElementById("friendsBackBtn")?.addEventListener("click", () => {
      if (openedFriendId) {
        openedFriendId = "";
        return renderFriends();
      }
      friendsOpen = false;
      if (typeof window.renderHome === "function") {
        window.renderHome();
      } else {
        window.location.reload();
      }
    });

    document.getElementById("copyFriendCode")?.addEventListener("click", async () => {
      const code = friendsState.profile?.friendCode;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        localToast("Code ami copié !");
      } catch {
        localToast(code);
      }
    });

    document.getElementById("friendsV2EmptyAdd")?.addEventListener("click", () => {
      friendsState.activeTab = "add";
      renderFriends();
    });

    document.querySelectorAll("[data-friend-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        openedFriendId = "";
        friendsState.activeTab = btn.dataset.friendTab;
        renderFriends();
      });
    });

    document.querySelectorAll("[data-friend-profile]").forEach(card => {
      card.addEventListener("click", () => {
        openedFriendId = card.dataset.friendProfile || "";
        renderFriends();
      });
    });

    const closeFriendProfile = () => {
      openedFriendId = "";
      renderFriends();
    };

    document.getElementById("friendsProfileClose")?.addEventListener("click", closeFriendProfile);

    document.getElementById("friendsProfileBackdrop")?.addEventListener("click", event => {
      if (event.target.id === "friendsProfileBackdrop") closeFriendProfile();
    });

    document.getElementById("copyOpenedFriendCode")?.addEventListener("click", async () => {
      const user = friendsState.friends.find(item => String(item.id) === String(openedFriendId));
      const code = user?.friendCode;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        localToast("Code ami copié !");
      } catch {
        localToast(code);
      }
    });

    document.getElementById("inviteOpenedFriend")?.addEventListener("click", () => {
      const user = friendsState.friends.find(item => String(item.id) === String(openedFriendId));
      const roomCode = (localStorage.getItem("petitbac_code") || "").trim();
      if (!user || !roomCode) return localToast("Crée ou rejoins d'abord un salon.");

      friendSocket.emit(
        "friends:invite",
        identityPayload({ friendId: user.id, roomCode }),
        res => {
          if (!res?.ok) return localToast(res?.error || "Invitation impossible.");
          localToast(res.delivered ? "Invitation envoyée !" : "Ami hors ligne pour le moment.");
        }
      );
    });

    document.getElementById("messageOpenedFriend")?.addEventListener("click", () => {
      localToast("La messagerie arrive bientôt.");
    });

    document.getElementById("removeOpenedFriend")?.addEventListener("click", () => {
      const user = friendsState.friends.find(item => String(item.id) === String(openedFriendId));
      if (!user) return;
      if (!confirm(`Supprimer ${user.username || "cet ami"} ?`)) return;

      friendSocket.emit(
        "friends:remove",
        identityPayload({ friendId: user.id }),
        res => {
          if (!res?.ok) return localToast(res?.error || "Suppression impossible.");
          openedFriendId = "";
          localToast("Ami supprimé.");
          refreshFriends();
        }
      );
    });

    const input = document.getElementById("friendCodeInput");
    if (input) {
      input.addEventListener("input", () => {
        input.value = input.value
          .toUpperCase()
          .replace(/[^A-Z0-9#]/g, "")
          .slice(0, 24);
      });
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") document.getElementById("friendSendBtn")?.click();
      });
    }

    document.getElementById("friendSendBtn")?.addEventListener("click", () => {
      const friendCode = input?.value.trim();
      if (!friendCode) return localToast("Entre un code ami.");

      friendSocket.emit("friends:send", identityPayload({ friendCode }), res => {
        if (!res?.ok) return localToast(res?.error || "Demande impossible.");
        localToast(`Demande envoyée à ${res.target?.username || "ce joueur"} !`);
        friendsState.activeTab = "requests";
        refreshFriends();
      });
    });

    document.querySelectorAll(".accept-request").forEach(btn => {
      btn.addEventListener("click", () => {
        friendSocket.emit(
          "friends:accept",
          identityPayload({ requestId: btn.dataset.request }),
          res => {
            if (!res?.ok) return localToast(res?.error || "Impossible d'accepter.");
            localToast("Ami ajouté !");
            refreshFriends();
          }
        );
      });
    });

    document.querySelectorAll(".decline-request").forEach(btn => {
      btn.addEventListener("click", () => {
        friendSocket.emit(
          "friends:decline",
          identityPayload({ requestId: btn.dataset.request }),
          res => {
            if (!res?.ok) return localToast(res?.error || "Impossible de refuser.");
            refreshFriends();
          }
        );
      });
    });

    document.querySelectorAll(".remove-friend").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!confirm("Supprimer cet ami ?")) return;
        friendSocket.emit(
          "friends:remove",
          identityPayload({ friendId: btn.dataset.id }),
          res => {
            if (!res?.ok) return localToast(res?.error || "Suppression impossible.");
            localToast("Ami supprimé.");
            refreshFriends();
          }
        );
      });
    });

    document.querySelectorAll(".invite-friend").forEach(btn => {
      btn.addEventListener("click", () => {
        const roomCode = (localStorage.getItem("petitbac_code") || "").trim();
        friendSocket.emit(
          "friends:invite",
          identityPayload({ friendId: btn.dataset.id, roomCode }),
          res => {
            if (!res?.ok) return localToast(res?.error || "Invitation impossible.");
            localToast(res.delivered ? "Invitation envoyée !" : "Ami hors ligne pour le moment.");
          }
        );
      });
    });
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.('[data-nav="friends"]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    friendsState.activeTab = "friends";
    renderFriends();
    refreshFriends(true);
  }, true);

  friendSocket.on("connect", () => bootstrap(true));

  friendSocket.on("friends:changed", () => {
    refreshFriends(false);
  });

  friendSocket.on("friends:presence", ({ userId, online } = {}) => {
    const friend = friendsState.friends.find(item => item.id === userId);
    if (friend) friend.online = Boolean(online);
    if (friendsOpen && friendsState.activeTab === "friends") renderFriends();
  });

  friendSocket.on("friends:room-invite", ({ from, roomCode } = {}) => {
    if (!roomCode) return;
    localToast(`${from?.username || "Un ami"} t'invite dans le salon ${roomCode}`);
  });

  bootstrap(true);
})();