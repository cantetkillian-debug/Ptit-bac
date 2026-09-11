/**
 * P'tit Bac — interface Amis V1
 * Extension cliente indépendante de app.js.
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
      if (friendsOpen) renderFriends();
    });
  }

  function statusMarkup(user) {
    if (user.online) {
      return `<span class="friends-v1-status online"><i></i>En ligne</span>`;
    }
    return `<span class="friends-v1-status"><i></i>${escapeHtml(prettyLastSeen(user.lastSeen))}</span>`;
  }

  function friendCard(user) {
    const roomCode = (localStorage.getItem("petitbac_code") || "").trim().toUpperCase();
    return `
      <article class="friends-v1-card">
        <div class="friends-v1-avatar">${escapeHtml(user.avatar || "🐼")}</div>
        <div class="friends-v1-card-main">
          <strong>${escapeHtml(user.username)}</strong>
          ${statusMarkup(user)}
        </div>
        <div class="friends-v1-card-actions">
          ${roomCode ? `<button class="friends-v1-icon-btn invite-friend" data-id="${escapeHtml(user.id)}" title="Inviter dans le salon">↗</button>` : ""}
          <button class="friends-v1-icon-btn danger remove-friend" data-id="${escapeHtml(user.id)}" title="Supprimer">×</button>
        </div>
      </article>`;
  }

  function incomingCard(item) {
    const user = item.user;
    return `
      <article class="friends-v1-card request">
        <div class="friends-v1-avatar">${escapeHtml(user.avatar || "🐼")}</div>
        <div class="friends-v1-card-main">
          <strong>${escapeHtml(user.username)}</strong>
          <small>${escapeHtml(user.friendCode || "")}</small>
        </div>
        <div class="friends-v1-request-actions">
          <button class="friends-v1-small-btn decline-request" data-request="${escapeHtml(item.requestId)}">Refuser</button>
          <button class="friends-v1-small-btn primary accept-request" data-request="${escapeHtml(item.requestId)}">Accepter</button>
        </div>
      </article>`;
  }

  function outgoingCard(item) {
    const user = item.user;
    return `
      <article class="friends-v1-card request">
        <div class="friends-v1-avatar">${escapeHtml(user.avatar || "🐼")}</div>
        <div class="friends-v1-card-main">
          <strong>${escapeHtml(user.username)}</strong>
          <small>${escapeHtml(user.friendCode || "")}</small>
        </div>
        <span class="friends-v1-pending">En attente</span>
      </article>`;
  }

  function emptyState(icon, title, text) {
    return `
      <div class="friends-v1-empty">
        <span>${icon}</span>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
      </div>`;
  }

  function currentPanel() {
    if (friendsState.activeTab === "requests") {
      const incoming = friendsState.incoming.length
        ? friendsState.incoming.map(incomingCard).join("")
        : emptyState("💌", "Aucune demande", "Tes nouvelles demandes apparaîtront ici.");

      const outgoing = friendsState.outgoing.length
        ? `<h3 class="friends-v1-subtitle">Envoyées</h3>${friendsState.outgoing.map(outgoingCard).join("")}`
        : "";

      return `
        <section class="friends-v1-list">
          ${incoming}
          ${outgoing}
        </section>`;
    }

    if (friendsState.activeTab === "add") {
      return `
        <section class="friends-v1-add">
          <div class="friends-v1-add-icon">＋</div>
          <h2>Ajouter un ami</h2>
          <p>Entre son code ami, par exemple <b>KIKI#4821</b>.</p>
          <div class="friends-v1-add-row">
            <input id="friendCodeInput" maxlength="24" autocomplete="off" autocapitalize="characters" placeholder="CODE#0000" />
            <button id="friendSendBtn">Ajouter</button>
          </div>
        </section>`;
    }

    return `
      <section class="friends-v1-list">
        ${friendsState.friends.length
          ? friendsState.friends.map(friendCard).join("")
          : emptyState("👥", "Pas encore d'amis", "Ajoute quelqu'un avec son code ami.")}
      </section>`;
  }

  function renderFriends() {
    friendsOpen = true;
    const app = document.getElementById("app");
    if (!app) return;

    const profile = friendsState.profile;
    const incomingCount = friendsState.incoming.length;

    app.innerHTML = `
      <main class="screen friends-v1">
        <div class="friends-v1-glow friends-v1-glow-a"></div>
        <div class="friends-v1-glow friends-v1-glow-b"></div>

        <header class="friends-v1-header">
          <button class="friends-v1-back" id="friendsBackBtn" aria-label="Retour">‹</button>
          <div>
            <h1>Amis</h1>
            <p>${friendsState.friends.length} ami${friendsState.friends.length > 1 ? "s" : ""}</p>
          </div>
          <div class="friends-v1-mini-avatar">${escapeHtml(profile?.avatar || "🐼")}</div>
        </header>

        <section class="friends-v1-code">
          <div>
            <small>Mon code ami</small>
            <strong>${escapeHtml(profile?.friendCode || "Chargement...")}</strong>
          </div>
          <button id="copyFriendCode" ${profile?.friendCode ? "" : "disabled"}>Copier</button>
        </section>

        <nav class="friends-v1-tabs">
          <button data-friend-tab="friends" class="${friendsState.activeTab === "friends" ? "active" : ""}">
            Mes amis
          </button>
          <button data-friend-tab="requests" class="${friendsState.activeTab === "requests" ? "active" : ""}">
            Demandes ${incomingCount ? `<b>${incomingCount}</b>` : ""}
          </button>
          <button data-friend-tab="add" class="${friendsState.activeTab === "add" ? "active" : ""}">
            Ajouter
          </button>
        </nav>

        <div class="friends-v1-content">
          ${currentPanel()}
        </div>
      </main>`;

    bindFriendsUI();
  }

  function bindFriendsUI() {
    document.getElementById("friendsBackBtn")?.addEventListener("click", () => {
      friendsOpen = false;
      window.location.reload();
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

    document.querySelectorAll("[data-friend-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        friendsState.activeTab = btn.dataset.friendTab;
        renderFriends();
      });
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

  // Intercepte l'onglet "Amis" de l'accueil AVANT le onclick historique de app.js.
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

  // Si app.js a déjà reçu son walletToken, crée/synchronise le profil en arrière-plan.
  bootstrap(true);
})();
