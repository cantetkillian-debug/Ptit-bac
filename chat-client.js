(() => {
  "use strict";

  const chatSocket = io({ forceNew: true });
  const state = {
    me: null,
    friends: [],
    conversations: [],
    currentFriend: null,
    messages: [],
    screen: "",
    previousScreen: "friends",
    menuOpen: false,
    search: ""
  };

  function walletToken() {
    return localStorage.getItem("petitbac_walletToken") || "";
  }

  function payload(extra = {}) {
    return { walletToken: walletToken(), ...extra };
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
    })[ch]);
  }

  function isImageAvatar(value) {
    if (window.PtitBacProfilePhoto?.isImageAvatar) {
      return window.PtitBacProfilePhoto.isImageAvatar(value);
    }
    return /^data:image\//i.test(String(value || ""));
  }

  function avatar(value, cls = "") {
    const v = value || "🐼";
    if (isImageAvatar(v)) return `<img class="${cls}" src="${v}" alt="" draggable="false">`;
    return `<span>${escapeHtml(v)}</span>`;
  }

  function toast(message) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._chatT);
    el._chatT = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function formatTime(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
  }

  function prettyDate(value) {
    const d = new Date(value);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Hier";
    return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit" });
  }

  function prettyLastSeen(value, online) {
    if (online) return "En ligne";
    const t = new Date(value || 0).getTime();
    if (!t) return "Hors ligne";
    const min = Math.floor(Math.max(0, Date.now() - t) / 60000);
    if (min < 2) return "Vu récemment";
    if (min < 60) return `Vu il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `Vu il y a ${h} h`;
    return `Vu il y a ${Math.floor(h/24)} j`;
  }

  function backArrow() {
    return `<img src="/back-arrow.png" alt="">`;
  }

  function searchIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg>`;
  }

  function sendIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Z"></path><path d="M7 12h8"></path></svg>`;
  }

  function composeIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"></path><path d="m13 7 4 4"></path></svg>`;
  }

  function refresh(cb = () => {}) {
    if (!walletToken()) return cb(false);
    chatSocket.emit("chat:list", payload(), res => {
      if (!res?.ok) {
        toast(res?.error || "Messages indisponibles.");
        return cb(false);
      }
      state.me = res.me || state.me;
      state.friends = res.friends || [];
      state.conversations = res.conversations || [];
      cb(true);
    });
  }

  function renderList() {
    state.screen = "list";
    state.menuOpen = false;
    const app = document.getElementById("app");
    if (!app) return;

    const q = state.search.trim().toLowerCase();
    const rows = state.conversations.filter(item => {
      if (!q) return true;
      return String(item.friend?.username || "").toLowerCase().includes(q);
    });

    app.innerHTML = `
      <main class="screen chat-v1 chat-list-v1">
        <header class="chat-list-header">
          <button id="chatListBack" class="chat-back" type="button">${backArrow()}</button>
          <h1>Messages</h1>
          <button id="chatCompose" class="chat-compose" type="button" aria-label="Nouveau message">${composeIcon()}</button>
        </header>

        ${state.conversations.length ? `
          <label class="chat-search">
            ${searchIcon()}
            <input id="chatSearchInput" type="search" autocomplete="off" placeholder="Rechercher une conversation..." value="${escapeHtml(state.search)}">
          </label>

          <section class="chat-conversation-list">
            ${rows.map(item => `
              <button type="button" class="chat-conversation-row" data-chat-friend="${escapeHtml(item.friend.id)}">
                <div class="chat-list-avatar">${avatar(item.friend.avatar, "chat-avatar-img")}<i class="${item.friend.online ? "online" : ""}"></i></div>
                <div class="chat-row-copy">
                  <strong>${escapeHtml(item.friend.username)}</strong>
                  <small>${escapeHtml(item.lastMessage?.content || "")}</small>
                </div>
                <div class="chat-row-meta">
                  <time>${formatTime(item.lastMessage?.created_at)}</time>
                  ${item.unread ? `<b>${item.unread > 99 ? "99+" : item.unread}</b>` : ""}
                </div>
              </button>
            `).join("")}
            ${rows.length ? "" : `<p class="chat-no-result">Aucune conversation trouvée.</p>`}
          </section>
        ` : `
          <section class="chat-empty">
            <div class="chat-empty-icon">💬</div>
            <h2>Aucune conversation</h2>
            <p>Commence à discuter avec tes amis<br>pour ne plus jamais jouer seul !</p>
            <button id="chatEmptyFriends" type="button">Voir mes amis</button>
          </section>
        `}

        <footer class="chat-footer">
          <img src="/ptitbac.logo.png" alt="P'tit Bac">
          <small>Version bêta</small>
        </footer>
      </main>
    `;

    document.getElementById("chatListBack")?.addEventListener("click", () => {
      if (window.PtitBacFriends?.open) return window.PtitBacFriends.open();
      if (typeof window.renderHome === "function") window.renderHome();
    });

    document.getElementById("chatCompose")?.addEventListener("click", renderNewMessage);
    document.getElementById("chatEmptyFriends")?.addEventListener("click", () => window.PtitBacFriends?.open?.());

    document.getElementById("chatSearchInput")?.addEventListener("input", event => {
      state.search = event.target.value || "";
      renderList();
      const input = document.getElementById("chatSearchInput");
      input?.focus({ preventScroll:true });
      try { input?.setSelectionRange(input.value.length, input.value.length); } catch {}
    });

    document.querySelectorAll("[data-chat-friend]").forEach(btn => {
      btn.addEventListener("click", () => {
        const friend = state.friends.find(x => String(x.id) === String(btn.dataset.chatFriend));
        if (friend) openConversation(friend, "list");
      });
    });
  }

  function renderNewMessage() {
    state.screen = "new";
    const app = document.getElementById("app");
    if (!app) return;

    app.innerHTML = `
      <main class="screen chat-v1 chat-new-v1">
        <header class="chat-list-header">
          <button id="chatNewBack" class="chat-back" type="button">${backArrow()}</button>
          <h1>Nouveau message</h1>
          <span></span>
        </header>

        <label class="chat-search">
          ${searchIcon()}
          <input id="chatFriendSearch" type="search" autocomplete="off" placeholder="Rechercher un ami...">
        </label>

        <section class="chat-new-list" id="chatNewList">
          ${newMessageFriendsMarkup("")}
        </section>
      </main>
    `;

    document.getElementById("chatNewBack")?.addEventListener("click", renderList);
    document.getElementById("chatFriendSearch")?.addEventListener("input", event => {
      document.getElementById("chatNewList").innerHTML = newMessageFriendsMarkup(event.target.value || "");
      bindNewFriendRows();
    });
    bindNewFriendRows();
  }

  function newMessageFriendsMarkup(query) {
    const q = String(query || "").trim().toLowerCase();
    const list = state.friends.filter(f => !q || String(f.username || "").toLowerCase().includes(q));

    if (!list.length) {
      return `<div class="chat-new-empty">Aucun ami trouvé.</div>`;
    }

    return list.map(friend => `
      <button type="button" class="chat-new-row" data-new-friend="${escapeHtml(friend.id)}">
        <div class="chat-list-avatar">${avatar(friend.avatar, "chat-avatar-img")}<i class="${friend.online ? "online" : ""}"></i></div>
        <div>
          <strong>${escapeHtml(friend.username)}</strong>
          <small>${escapeHtml(prettyLastSeen(friend.lastSeen, friend.online))}</small>
        </div>
        <span>›</span>
      </button>
    `).join("");
  }

  function bindNewFriendRows() {
    document.querySelectorAll("[data-new-friend]").forEach(btn => {
      btn.addEventListener("click", () => {
        const friend = state.friends.find(x => String(x.id) === String(btn.dataset.newFriend));
        if (friend) openConversation(friend, "list");
      });
    });
  }

  function openConversation(friend, previous = "friends") {
    if (!friend?.id) return;
    state.currentFriend = friend;
    state.previousScreen = previous;
    state.screen = "conversation";
    state.menuOpen = false;

    chatSocket.emit("chat:history", payload({ friendId: friend.id }), res => {
      if (!res?.ok) return toast(res?.error || "Conversation indisponible.");
      state.me = res.me || state.me;
      state.currentFriend = res.friend || friend;
      state.messages = res.messages || [];
      renderConversation();
    });
  }

  function groupedMessagesMarkup() {
    if (!state.messages.length) {
      return `<div class="chat-history-empty">Envoie le premier message 👋</div>`;
    }

    let lastDay = "";
    return state.messages.map(message => {
      const day = prettyDate(message.created_at);
      const separator = day !== lastDay
        ? `<div class="chat-day"><span>${escapeHtml(day)}</span></div>`
        : "";
      lastDay = day;

      const mine = String(message.sender_id) === String(state.me?.id);
      return `${separator}
        <div class="chat-message-wrap ${mine ? "mine" : "theirs"}">
          <div class="chat-bubble">${escapeHtml(message.content)}</div>
          <div class="chat-message-meta">
            <time>${formatTime(message.created_at)}</time>
            ${mine ? `<span>${message.read_at ? "✓✓" : "✓"}</span>` : ""}
          </div>
        </div>`;
    }).join("");
  }

  function renderConversation() {
    const friend = state.currentFriend;
    if (!friend) return renderList();

    const app = document.getElementById("app");
    if (!app) return;

    app.innerHTML = `
      <main class="screen chat-v1 chat-conversation-v1">
        <header class="chat-conversation-header">
          <button id="chatConversationBack" class="chat-back" type="button">${backArrow()}</button>

          <button id="chatFriendHeader" class="chat-person" type="button">
            <div class="chat-header-avatar">${avatar(friend.avatar, "chat-avatar-img")}<i class="${friend.online ? "online" : ""}"></i></div>
            <div>
              <strong>${escapeHtml(friend.username)}</strong>
              <small class="${friend.online ? "online" : ""}">${escapeHtml(prettyLastSeen(friend.lastSeen, friend.online))}</small>
            </div>
          </button>

          <button id="chatMenuBtn" class="chat-menu-btn" type="button" aria-label="Options">⋮</button>
        </header>

        <section id="chatHistory" class="chat-history">
          ${groupedMessagesMarkup()}
        </section>

        <form id="chatComposer" class="chat-composer">
          <button id="chatAttach" type="button" class="chat-plus" aria-label="Ajouter">＋</button>
          <input id="chatMessageInput" maxlength="500" autocomplete="off" placeholder="Écrire un message...">
          <button id="chatSend" type="submit" class="chat-send" aria-label="Envoyer">${sendIcon()}</button>
        </form>

        ${state.menuOpen ? `
          <div class="chat-menu-panel" id="chatMenuPanel">
            <button id="chatViewFriend" type="button">Voir le profil</button>
            <button id="chatDeleteConversation" class="danger" type="button">Supprimer la conversation</button>
            <button id="chatReportConversation" class="danger" type="button">Signaler</button>
          </div>
        ` : ""}
      </main>
    `;

    requestAnimationFrame(() => {
      const history = document.getElementById("chatHistory");
      if (history) history.scrollTop = history.scrollHeight;
    });

    document.getElementById("chatConversationBack")?.addEventListener("click", () => {
      if (state.previousScreen === "friends" && window.PtitBacFriends?.open) return window.PtitBacFriends.open();
      refresh(ok => ok && renderList());
    });

    document.getElementById("chatFriendHeader")?.addEventListener("click", () => {
      window.PtitBacFriends?.openFriendProfile?.(friend.id);
    });

    document.getElementById("chatMenuBtn")?.addEventListener("click", () => {
      state.menuOpen = !state.menuOpen;
      renderConversation();
    });

    document.getElementById("chatViewFriend")?.addEventListener("click", () => {
      window.PtitBacFriends?.openFriendProfile?.(friend.id);
    });

    document.getElementById("chatDeleteConversation")?.addEventListener("click", () => {
      if (!confirm("Supprimer cette conversation de ta liste ?")) return;
      chatSocket.emit("chat:hide", payload({ friendId: friend.id }), res => {
        if (!res?.ok) return toast(res?.error || "Suppression impossible.");
        state.messages = [];
        state.currentFriend = null;
        refresh(ok => ok && renderList());
      });
    });

    document.getElementById("chatReportConversation")?.addEventListener("click", () => {
      if (!confirm("Signaler cette conversation ?")) return;
      chatSocket.emit("chat:report", payload({ friendId: friend.id, note:"Conversation signalée depuis l'application." }), res => {
        if (!res?.ok) return toast(res?.error || "Signalement impossible.");
        state.menuOpen = false;
        toast("Signalement envoyé.");
        renderConversation();
      });
    });

    document.getElementById("chatAttach")?.addEventListener("click", () => {
      toast("Les photos et pièces jointes arriveront plus tard.");
    });

    document.getElementById("chatComposer")?.addEventListener("submit", event => {
      event.preventDefault();
      const input = document.getElementById("chatMessageInput");
      const content = String(input?.value || "").trim();
      if (!content) return;

      input.disabled = true;
      chatSocket.emit("chat:send", payload({ friendId: friend.id, content }), res => {
        input.disabled = false;
        if (!res?.ok) {
          input.focus();
          return toast(res?.error || "Envoi impossible.");
        }
        input.value = "";
        if (!state.messages.some(m => m.id === res.message.id)) {
          state.messages.push(res.message);
        }
        renderConversation();
      });
    });

    chatSocket.emit("chat:read", payload({ friendId: friend.id }), () => {});
  }

  function bootstrap() {
    if (!walletToken()) return setTimeout(bootstrap, 900);
    chatSocket.emit("chat:bootstrap", payload(), res => {
      if (!res?.ok) return;
      state.me = res.me || null;
      state.friends = res.friends || [];
      state.conversations = res.conversations || [];
    });
  }

  chatSocket.on("chat:message", ({ message, from } = {}) => {
    if (!message) return;

    if (
      state.screen === "conversation" &&
      state.currentFriend &&
      (
        String(message.sender_id) === String(state.currentFriend.id) ||
        String(message.receiver_id) === String(state.currentFriend.id)
      )
    ) {
      if (!state.messages.some(m => m.id === message.id)) state.messages.push(message);
      renderConversation();
      if (String(message.sender_id) === String(state.currentFriend.id)) {
        chatSocket.emit("chat:read", payload({ friendId: state.currentFriend.id }), () => {});
      }
    } else {
      refresh(() => {
        if (state.screen === "list") renderList();
      });
    }
  });

  chatSocket.on("chat:read", ({ messageIds = [], readAt } = {}) => {
    if (!messageIds.length || state.screen !== "conversation") return;
    const set = new Set(messageIds.map(String));
    state.messages.forEach(m => {
      if (set.has(String(m.id))) m.read_at = readAt || new Date().toISOString();
    });
    renderConversation();
  });

  chatSocket.on("connect", bootstrap);

  window.PtitBacChat = {
    openList() {
      refresh(ok => ok && renderList());
    },
    openConversation(friend) {
      refresh(ok => {
        if (!ok) return;
        const fresh = state.friends.find(x => String(x.id) === String(friend?.id)) || friend;
        openConversation(fresh, "friends");
      });
    },
    refresh
  };

  bootstrap();
})();