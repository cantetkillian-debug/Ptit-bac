const CLIENT_BUILD = "1.45.0";
const socket = io();
const app = document.getElementById("app");
const toastEl = document.getElementById("toast");

const session = {
  code: localStorage.getItem("petitbac_code") || "",
  playerId: localStorage.getItem("petitbac_playerId") || "",
  state: null,
  localAnswers: {},
  timerHandle: null,
  walletToken: localStorage.getItem("petitbac_walletToken") || "",
  walletBalance: Number(localStorage.getItem("petitbac_walletBalance") || "0"),
  adminCoinCode: ""
};

const GAME_COST = 0;
const DEFAULT_COINS = 50;
const PROFILE_ICONS = ["🐼","🦊","🐯","🐸","🦁","🐨","🐙","🦄","🤖","😎","🧠","⭐"];
const LETTER_WHEEL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function getProfile() {
  return {
    name: localStorage.getItem("petitbac_profile_name") || "",
    icon: localStorage.getItem("petitbac_profile_icon") || "🐼"
  };
}

function saveProfile(name, icon) {
  localStorage.setItem("petitbac_profile_name", String(name || "").trim().slice(0, 24));
  localStorage.setItem("petitbac_profile_icon", icon || "🐼");
}

function getCoins() {
  return Math.max(0, Math.floor(Number(session.walletBalance) || 0));
}

function setWalletState(token, balance) {
  if (token) {
    session.walletToken = token;
    localStorage.setItem("petitbac_walletToken", token);
  }
  if (Number.isFinite(Number(balance))) {
    session.walletBalance = Math.max(0, Math.floor(Number(balance)));
    localStorage.setItem("petitbac_walletBalance", String(session.walletBalance));
  }
}

function canAffordGame() {
  return true; // Participation contrôlée en vies par le serveur.
}

function initWallet(cb = () => {}) {
  socket.emit("wallet:init", { token: session.walletToken }, res => {
    if (!res?.ok) return cb(false);
    setWalletState(res.token, res.balance);
    cb(true);
  });
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

socket.on("toast", toast);
socket.on("wallet:update", ({ balance } = {}) => {
  setWalletState(session.walletToken, balance);
  if (!session.state) renderHome();
});
socket.on("room:kicked", () => {
  toast("Tu as été retiré du salon.");
  clearSession();
  renderHome();
});
socket.on("room:state", state => {
  session.state = state;
  render();
});

socket.on("connect", () => {
  initWallet(() => {
    if (session.code && session.playerId) {
      socket.emit("room:reconnect", { code: session.code, playerId: session.playerId, walletToken: session.walletToken }, res => {
        if (res?.ok) {
          setWalletState(session.walletToken, res.balance);
          session.state = res.state;
          render();
        } else {
          clearSession();
          renderHome();
        }
      });
    } else {
      renderHome();
    }
  });
});

function saveSession(code, playerId) {
  session.code = code;
  session.playerId = playerId;
  localStorage.setItem("petitbac_code", code);
  localStorage.setItem("petitbac_playerId", playerId);
}

function clearSession() {
  clearInterval(session.timerHandle);
  session.timerHandle = null;
  session.code = "";
  session.playerId = "";
  session.state = null;
  session.localAnswers = {};
  localStorage.removeItem("petitbac_code");
  localStorage.removeItem("petitbac_playerId");
}

function me() {
  return session.state?.players.find(p => p.id === session.playerId);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

const CATEGORY_ICONS = {
  "Prénom":"👤", "Animal":"🐾", "Lieu":"📍", "Métier":"💼", "Nourriture":"🍽️",
  "Marque":"🏷️", "Fruit / Légume":"🍏", "Objet":"🧊", "Sport":"🏆", "Mot":"🔤",
  "Vêtement":"👕", "Cadeau":"🎁", "Chose orange":"🟠", "Chose verte":"🟢",
  "Chose jaune":"🟡", "Cuisine":"🍳", "Maison":"🏠", "Salle de bain":"🚿",
  "Animal marin":"🐠", "Petit-déjeuner":"🥐", "Cinéma":"🎬", "Jeu vidéo":"🎮",
  "Personnage fictif":"🦸", "Dessert":"🍰", "Mobile":"📱",
  "Application / Réseau social":"📲", "Artiste / Chanteur":"🎤",
  "Chose dans une chambre":"🛏️", "Chose au supermarché":"🛒", "Vacances":"🧳",
  "Restaurant":"🍴", "Célébrité":"⭐", "Chose du frigo":"🧊",
  "Mot de 4 lettres":"🔡", "Chose qu’on achète sur Internet":"🛍️",
  "Chose qui fait peur":"😱", "Chose chère":"💰", "Chose à l’école":"🏫",
  "Plage":"🏖️", "Mode / Beauté":"💄", "Couleur":"🎨", "Ciel":"☁️", "Mythes":"🏛️"
};

function categoryIcon(category) {
  return CATEGORY_ICONS[category] || "✨";
}

function isImageAvatar(value) {
  return typeof value === "string" && /^data:image\/(?:png|jpeg|webp);base64,/i.test(value);
}

function avatarMarkup(player, index = 0, extra = "") {
    const raw = String(player?.avatar || "");
    const safeExtra = String(extra || "").replace(/[^a-zA-Z0-9 _-]/g, "");

    if (isImageAvatar(raw)) {
      return `
        <div class="avatar avatar-${index % 6} ptb-avatar-photo ${safeExtra}">
          <img src="${raw}" alt="" draggable="false">
        </div>`;
    }

    const fallback = raw || String(player?.name || "?").charAt(0).toUpperCase();
    return `
      <div class="avatar avatar-${index % 6} ${raw ? "avatar-emoji" : ""} ${safeExtra}">
        ${typeof escapeHtml === "function" ? escapeHtml(fallback) : fallback}
      </div>`;
  }

function setScreen(html) {
  app.innerHTML = html;
  window.scrollTo({ top: 0, behavior: "instant" });
}


function uiIcon(name, extraClass = "") {
  const icons = {
    settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19.1 13.2c.05-.4.05-.8 0-1.2l2-1.55-2-3.45-2.45.98a7.4 7.4 0 0 0-1.05-.6L15.25 4h-4.5l-.35 3.38c-.37.17-.72.37-1.05.6L6.9 7l-2 3.45L6.9 12a6.7 6.7 0 0 0 0 1.2l-2 1.55 2 3.45 2.45-.98c.33.23.68.43 1.05.6l.35 3.38h4.5l.35-3.38c.37-.17.72-.37 1.05-.6l2.45.98 2-3.45-2-1.55Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
    shop: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8.5h14l-1 11H6l-1-11Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 9V7a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    gift: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v10H4V10Zm-1-4h18v4H3V6Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v14M12 6c-1.3 0-4.2-.4-4.2-2.2C7.8 2.6 9 2 10 2c1.4 0 2 1.1 2 4Zm0 0c1.3 0 4.2-.4 4.2-2.2C16.2 2.6 15 2 14 2c-1.4 0-2 1.1-2 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
    users: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.7 14.7a4.7 4.7 0 0 1 4.8 4.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    bulb: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 15.5c-1.7-1.2-2.7-3-2.7-5a6.2 6.2 0 1 1 12.4 0c0 2-1 3.8-2.7 5-.7.5-1 1-1 1.7h-5c0-.7-.3-1.2-1-1.7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.5 20h5M10 17.3h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v9h-5v-6H9v6H4v-9Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    game: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 8h9a5.5 5.5 0 0 1 5.1 7.55l-.9 2.2a2.8 2.8 0 0 1-4.45 1.03L14.5 17h-5l-1.75 1.78a2.8 2.8 0 0 1-4.45-1.03l-.9-2.2A5.5 5.5 0 0 1 7.5 8Z" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M7 11v4M5 13h4M16.5 12.2h.01M18.6 14.1h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    trophy: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v3.5c0 3.7-1.7 6.2-4 6.2s-4-2.5-4-6.2V4Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 6H4v1.5c0 3 1.7 4.6 4.5 4.6M16 6h4v1.5c0 3-1.7 4.6-4.5 4.6M12 14v4M8 20h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    info: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 10v6M12 7.2h.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    chart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11M12 19V5M19 19v-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`,
    save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v15H5V3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 3v6h8V4M9 21v-7h6v7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };
  return `<span class="ui-icon ${extraClass}">${icons[name] || icons.chevron}</span>`;
}

function homeCoin(sizeClass = "") {
  return `<span class="home-coin ${sizeClass}" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor" opacity=".18"/><path d="M8.1 13.7h7.8M8.7 10.6l1.8 1.4 1.5-3 1.5 3 1.8-1.4-.8 5H9.5l-.8-5Z" fill="currentColor" stroke="currentColor" stroke-width=".7" stroke-linejoin="round"/></svg></span>`;
}

function renderHome() {
  if (session.state) return render();
  const profile = getProfile();
  const coins = getCoins();
  const decorativePool = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");
  const decorativeLetters = [];
  while (decorativeLetters.length < 2) decorativeLetters.push(decorativePool.splice(Math.floor(Math.random() * decorativePool.length), 1)[0]);

  setScreen(`
    <main class="screen home-v129 home-v130 home-v150">
      <section class="home-v129-hero home-v130-hero">
        <div class="home-v129-glow home-v129-glow-a"></div><div class="home-v129-glow home-v129-glow-b"></div>
        <div class="home-v129-letter home-v129-letter-left">${decorativeLetters[0]}</div>
        <div class="home-v129-letter home-v129-letter-right">${decorativeLetters[1]}</div>
        <header class="home-v129-topbar">
          <button class="home-v130-profile-top" id="profileBtn"><span class="home-v130-profile-avatar">${escapeHtml(profile.icon)}</span><strong>Mon profil</strong>${uiIcon("chevron")}</button>
          <button class="home-v129-wallet" id="topShopBtn" aria-label="Ouvrir la boutique">${homeCoin("home-coin-main")}<strong>${coins}</strong><span class="home-v129-wallet-plus">${uiIcon("plus")}</span></button>
        </header>
        <div class="home-v129-brand home-v130-brand home-v150-brand"><img src="ptit-bac-logo-v2.png" class="home-v129-logo home-v150-logo" alt="P’tit Bac"></div>
      </section>

      <section class="home-v129-content home-v130-content">
        <section class="home-v129-actions home-v130-actions">
          <button class="home-v129-action primary home-v130-play" id="quickPlayBtn" ${coins < GAME_COST ? 'disabled' : ''}>
            <span class="home-v129-action-symbol">⚡</span><span class="home-v129-action-copy"><strong>Jouer</strong><small>Lance une partie rapide</small></span>
            <span class="home-v129-cost">${homeCoin("home-coin-xs")}<b>${GAME_COST}</b></span>${uiIcon("chevron", "home-v129-action-arrow")}
          </button>
          <button class="home-v129-action secondary home-v130-create" id="createBtn">
            <span class="home-v129-action-symbol soft">${uiIcon("plus")}</span><span class="home-v129-action-copy"><strong>Créer un salon</strong><small>Invite tes amis et personnalise ta partie</small></span>${uiIcon("chevron", "home-v129-action-arrow")}
          </button>
          <div class="home-v130-join-card">
            <span class="home-v129-action-symbol soft">${uiIcon("users")}</span>
            <div class="home-v130-join-main"><strong>Rejoindre un salon</strong><div class="home-v130-code-row"><input id="homeRoomCode" maxlength="5" autocapitalize="characters" placeholder="Entrez le code du salon..." /><button id="joinBtn" aria-label="Rejoindre">${uiIcon("chevron")}</button></div></div>
          </div>
        </section>
        ${coins < GAME_COST ? `<p class="home-v129-no-coins">Il te faut ${GAME_COST} pièces pour lancer une partie rapide.</p>` : ''}
        <div class="home-v130-spacer"></div>
        <div class="home-v150-mini-actions"><button class="home-v150-mini" id="howToBtn">${uiIcon("bulb")}<span>Comment jouer ?</span></button><button class="home-v150-mini" id="creditsBtn">${uiIcon("info")}<span>Crédits</span></button></div>
        <footer class="home-v129-beta home-v130-beta" id="betaAdminTrigger" title="Version bêta">Version bêta</footer>
      </section>

      <nav class="home-v129-nav" aria-label="Navigation principale">
        <button class="active" data-nav="home">${uiIcon("home")}<small>Accueil</small></button>
        <button data-nav="rewards">${uiIcon("gift")}<small>Récompenses</small></button>
        <button data-nav="friends">${uiIcon("users")}<small>Amis</small></button>
        <button data-nav="shop">${uiIcon("shop")}<small>Boutique</small></button>
      </nav>
    </main>`);

  const ensureProfile = () => {
    const p = getProfile();
    if (!String(p.name || "").trim()) { toast("Choisis d’abord ton pseudo."); renderProfile(); return null; }
    return p;
  };
  document.getElementById("profileBtn").onclick = renderProfile;
  document.getElementById("topShopBtn").onclick = renderShop;
  document.getElementById("quickPlayBtn").onclick = () => {
    if (!canAffordGame()) return toast(`Il te faut ${GAME_COST} pièces.`);
    toast("Les parties rapides en ligne arrivent bientôt !");
  };
  document.getElementById("createBtn").onclick = () => {
    const p = ensureProfile(); if (!p) return;
    socket.emit("room:create", { name:p.name.trim(), rounds:1, categoryCount:6, categoryDifficulty:"beginner", duration:60, avatar:p.icon, walletToken:session.walletToken }, res => {
      if (!res?.ok) return toast(res?.error || "Impossible de créer le salon.");
      if (res.walletToken) setWalletState(res.walletToken, res.balance);
      saveSession(res.code, res.playerId); session.state=res.state; render();
    });
  };
  const codeInput = document.getElementById("homeRoomCode");
  codeInput.oninput = () => codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0,5);
  document.getElementById("joinBtn").onclick = () => {
    const p = ensureProfile(); if (!p) return;
    const code=codeInput.value.trim(); if (code.length !== 5) return toast("Entre le code à 5 caractères du salon.");
    socket.emit("room:join", { code, name:p.name.trim(), avatar:p.icon, walletToken:session.walletToken }, res => {
      if (!res?.ok) return toast(res?.error || "Impossible de rejoindre.");
      if (res.walletToken) setWalletState(res.walletToken, res.balance);
      saveSession(res.code,res.playerId); session.state=res.state; render();
    });
  };
  document.getElementById("howToBtn").onclick = renderHowTo;
  document.getElementById("creditsBtn")?.addEventListener("click", () => toast("Crédits P’tit Bac — bientôt disponible."));
  document.querySelectorAll('[data-nav]').forEach(btn => btn.onclick = () => {
    const t=btn.dataset.nav; if(t==='home') return; if(t==='shop') return renderShop();
    toast(t==='rewards' ? 'Récompenses bientôt disponibles.' : 'Amis bientôt disponibles.');
  });
  const betaTrigger=document.getElementById("betaAdminTrigger"); let adminTapCount=0,adminTapTimer=null;
  betaTrigger.onclick=()=>{adminTapCount++;clearTimeout(adminTapTimer);adminTapTimer=setTimeout(()=>adminTapCount=0,2200);if(adminTapCount>=7){adminTapCount=0;clearTimeout(adminTapTimer);openAdminCoinAccess();}};
}

function openAdminCoinAccess() {
  const code = window.prompt("Code administrateur");
  if (code === null) return;
  session.adminCoinCode = code.trim();
  renderAdminCoins();
}

function renderAdminCoins() {
  const coins = getCoins();
  setScreen(`
    <main class="screen utility-screen admin-coins-screen">
      <button class="utility-back" id="backHome">←</button>
      <img src="ptit-bac-logo-v2.png" class="utility-logo" alt="P’tit Bac">
      <div class="utility-heading">
        <h1>Pièces — Admin</h1>
        <p>Outil local de test pour ce navigateur.</p>
      </div>
      <section class="utility-card admin-coin-card">
        <div class="admin-coin-balance">
          <span class="coin-medal admin-coin-medal">👑</span>
          <div><small>Solde actuel</small><strong id="adminCoinTotal">${coins}</strong></div>
        </div>
        <div class="admin-coin-grid">
          <button type="button" class="admin-coin-btn" data-add="5">+5</button>
          <button type="button" class="admin-coin-btn" data-add="25">+25</button>
          <button type="button" class="admin-coin-btn" data-add="100">+100</button>
          <button type="button" class="admin-coin-btn secondary" id="resetCoins">Remettre à 25</button>
        </div>
        <form class="admin-custom-coins" id="customCoinsForm">
          <label class="label" for="customCoins">Définir un solde précis</label>
          <div class="admin-custom-row">
            <input class="input" id="customCoins" type="number" min="0" max="999999" inputmode="numeric" placeholder="Ex. 500">
            <button class="btn-primary admin-apply-btn" type="submit">Appliquer</button>
          </div>
        </form>
      </section>
    </main>
  `);

  const refresh = value => {
    document.getElementById("adminCoinTotal").textContent = value;
  };

  document.querySelectorAll("[data-add]").forEach(btn => {
    btn.onclick = () => {
      socket.emit("wallet:adminAdjust", { token: session.walletToken, code: session.adminCoinCode, mode: "add", value: Number(btn.dataset.add || 0) }, res => {
        if (!res?.ok) return toast(res?.error || "Impossible de modifier le solde.");
        setWalletState(res.token, res.balance); refresh(res.balance); toast(`Solde : ${res.balance} pièces`);
      });
    };
  });

  document.getElementById("resetCoins").onclick = () => {
    socket.emit("wallet:adminAdjust", { token: session.walletToken, code: session.adminCoinCode, mode: "set", value: DEFAULT_COINS }, res => {
      if (!res?.ok) return toast(res?.error || "Impossible de modifier le solde.");
      setWalletState(res.token, res.balance); refresh(res.balance); toast("Solde remis à 25 pièces.");
    });
  };

  document.getElementById("customCoinsForm").onsubmit = e => {
    e.preventDefault();
    const field = document.getElementById("customCoins");
    const value = Number(field.value);
    if (!Number.isFinite(value) || value < 0) return toast("Entre un nombre valide.");
    socket.emit("wallet:adminAdjust", { token: session.walletToken, code: session.adminCoinCode, mode: "set", value: Math.min(999999, value) }, res => {
      if (!res?.ok) return toast(res?.error || "Impossible de modifier le solde.");
      setWalletState(res.token, res.balance); refresh(res.balance); field.value = ""; toast(`Solde défini à ${res.balance} pièces.`);
    });
  };

  document.getElementById("backHome").onclick = renderHome;
}

function renderProfile() {
  const profile = getProfile();
  const coins = getCoins();
  const stats = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem("ptitbac_profile_stats") || "{}");
      const played = Math.max(0, Number(raw.played) || 0);
      const wins = Math.max(0, Math.min(played, Number(raw.wins) || 0));
      const streak = Math.max(0, Number(raw.streak) || 0);
      return { played, wins, streak, rate: played ? Math.round((wins / played) * 100) : 0 };
    } catch { return { played:0, wins:0, streak:0, rate:0 }; }
  })();

  setScreen(`
    <main class="screen profile-v150">
      <div class="profile-v150-glow profile-v150-glow-a"></div>
      <div class="profile-v150-glow profile-v150-glow-b"></div>
      <header class="profile-v150-topbar">
        <button class="profile-v150-back" id="backHome" aria-label="Retour">‹</button>
        <img src="ptit-bac-logo-v2.png" class="profile-v150-logo" alt="P’tit Bac">
        <button class="profile-v150-wallet" id="profileShopBtn" aria-label="Boutique">${homeCoin("home-coin-main")}<strong>${coins}</strong><span>${uiIcon("plus")}</span></button>
      </header>

      <h1 class="profile-v150-title">Mon <span>profil</span></h1>

      <form id="profileForm" class="profile-v150-form">
        <section class="profile-v150-card profile-v150-name-card">
          <div class="profile-v150-label">TON PSEUDO</div>
          <div class="profile-v150-name-row">
            <div class="profile-v150-user-icon">${uiIcon("users")}</div>
            <div class="profile-v150-input-wrap">
              <input id="profileName" maxlength="16" autocomplete="nickname" placeholder="Ton pseudo" value="${escapeHtml(profile.name)}">
              <button type="button" id="clearProfileName" class="profile-v150-clear" aria-label="Effacer">×</button>
            </div>
          </div>
          <div class="profile-v150-count" id="profileNameCount">${String(profile.name || '').length}/16</div>
        </section>

        <section class="profile-v150-card profile-v150-avatar-card">
          <div class="profile-v150-card-head"><div class="profile-v150-label">TON ICÔNE</div><span>Choisis un avatar</span></div>
          <div class="profile-v150-avatar-grid" id="profileIcons">
            ${PROFILE_ICONS.map(icon => `<button type="button" class="profile-v150-avatar ${icon === profile.icon ? 'selected' : ''}" data-icon="${icon}"><span>${icon}</span>${icon === profile.icon ? '<b>✓</b>' : ''}</button>`).join('')}
          </div>
        </section>

        <section class="profile-v150-card profile-v150-stats">
          <div class="profile-v150-stats-title"><span>${uiIcon("chart")}</span><strong>MES STATISTIQUES</strong></div>
          <div class="profile-v150-stats-grid">
            <div><strong>${stats.played}</strong><small>Parties jouées</small></div>
            <div><strong>${stats.wins}</strong><small>Victoires</small></div>
            <div><strong>${stats.rate}%</strong><small>Taux de victoire</small></div>
            <div><strong>${stats.streak}</strong><small>Série actuelle</small></div>
          </div>
        </section>

        <button class="profile-v150-save" type="submit">${uiIcon("save")}<span>Enregistrer</span></button>
      </form>
    </main>
  `);

  let selectedIcon = profile.icon;
  const repaintAvatarSelection = () => {
    document.querySelectorAll('[data-icon]').forEach(btn => {
      const selected = btn.dataset.icon === selectedIcon;
      btn.classList.toggle('selected', selected);
      btn.querySelector('b')?.remove();
      if (selected) btn.insertAdjacentHTML('beforeend','<b>✓</b>');
    });
  };
  document.querySelectorAll('[data-icon]').forEach(btn => btn.onclick = () => { selectedIcon = btn.dataset.icon; repaintAvatarSelection(); });
  const nameInput = document.getElementById('profileName');
  const count = document.getElementById('profileNameCount');
  nameInput.addEventListener('input', () => count.textContent = `${nameInput.value.length}/16`);
  document.getElementById('clearProfileName').onclick = () => { nameInput.value=''; count.textContent='0/16'; nameInput.focus(); };
  document.getElementById('profileShopBtn').onclick = renderShop;
  document.getElementById('profileForm').onsubmit = e => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return toast('Choisis un pseudo.');
    saveProfile(name, selectedIcon);
    toast('Profil enregistré !');
    renderHome();
  };
  document.getElementById('backHome').onclick = renderHome;
}

function renderShop() {
  const coins = getCoins();
  setScreen(`
    <main class="screen shop-screen">
      <header class="shop-topbar">
        <button class="utility-back shop-back" id="backHome">←</button>
        <img src="ptit-bac-logo-v2.png" class="shop-logo" alt="P’tit Bac">
        <div class="shop-wallet"><span class="home-mix-coin">♛</span><strong>${coins}</strong></div>
      </header>

      <div class="shop-heading">
        <h1>Boutique</h1>
        <p>Gagne des pièces, débloque des avantages et profite encore plus du jeu !</p>
      </div>

      <section class="shop-reward-card">
        <div class="shop-badge">GRATUIT</div>
        <div class="shop-reward-icon">🎬</div>
        <div class="shop-reward-copy">
          <h2>Pub récompensée</h2>
          <p>Regarde une courte publicité et reçois <strong>10 pièces</strong>.</p>
          <div class="shop-reward-value"><span class="home-mix-coin">♛</span><b>+10</b></div>
        </div>
        <button class="shop-reward-btn" id="rewardAdBtn">▶ <span>Regarder<br>une pub</span></button>
      </section>

      <div class="shop-section-title"><h2>Packs de pièces</h2><p>Pour participer à encore plus de parties.</p></div>
      <section class="shop-pack-grid">
        <article class="shop-pack-card">
          <div class="shop-coins-art">🪙🪙🪙</div>
          <small>Petit pack</small>
          <h3>25 pièces</h3>
          <p>Parfait pour commencer !</p>
          <button class="shop-buy-btn" data-product="25">0,99 €</button>
        </article>
        <article class="shop-pack-card popular">
          <span class="popular-label">LE PLUS POPULAIRE</span>
          <div class="shop-coins-art">🪙🪙🪙🪙</div>
          <small>Gros pack</small>
          <h3>100 pièces</h3>
          <p>Joue encore plus longtemps !</p>
          <button class="shop-buy-btn" data-product="100">2,99 €</button>
        </article>
      </section>

      <div class="shop-section-title"><h2>Pack Sans Pub</h2><p>Profite du jeu sans interruption.</p></div>
      <section class="shop-noads-card">
        <span class="best-label">MEILLEURE OFFRE</span>
        <div class="shop-noads-art">🚫</div>
        <div class="shop-noads-copy">
          <h2>Sans pub à vie</h2>
          <p>✓ Aucune publicité automatique</p>
          <p>✓ Pub récompensée toujours disponible si tu le souhaites</p>
          <p>✓ <strong>+100 pièces offertes</strong></p>
        </div>
        <button class="shop-noads-btn" data-product="noads">4,99 €</button>
      </section>

      <div class="shop-info">ⓘ Les pièces servent à participer aux parties : <strong>${GAME_COST} pièces par partie</strong>.</div>
    </main>
  `);

  document.getElementById('backHome').onclick = renderHome;
  document.getElementById('rewardAdBtn').onclick = () => toast('Les pubs récompensées seront activées dans l’application mobile.');
  document.querySelectorAll('[data-product]').forEach(btn => {
    btn.onclick = () => toast('Les achats seront activés avec les achats intégrés Apple.');
  });
}

function renderCoins() { renderShop(); }

function renderCategoriesInfo() {
  const categories = Object.keys(CATEGORY_ICONS);
  setScreen(`
    <main class="screen utility-screen">
      <button class="utility-back" id="backHome">←</button>
      <img src="ptit-bac-logo-v2.png" class="utility-logo" alt="P’tit Bac">
      <div class="utility-heading"><h1>43 catégories</h1><p>Les catégories sont classées en trois niveaux de difficulté et tirées selon les réglages du salon.</p></div>
      <section class="utility-card category-info-grid">
        ${categories.map(c => `<div><span>${categoryIcon(c)}</span><strong>${escapeHtml(c)}</strong></div>`).join('')}
      </section>
    </main>
  `);
  document.getElementById('backHome').onclick = renderHome;
}

function renderHowTo() {
  setScreen(`
    <main class="screen utility-screen">
      <button class="utility-back" id="backHome">←</button>
      <img src="ptit-bac-logo-v2.png" class="utility-logo" alt="P’tit Bac">
      <div class="utility-heading"><h1>Comment jouer ?</h1><p>Le principe du P’tit Bac en quelques secondes.</p></div>
      <section class="utility-card howto-list">
        <div><b>1</b><span>Crée ou rejoins un salon avec tes amis.</span></div>
        <div><b>2</b><span>Une lettre est tirée pour chaque manche.</span></div>
        <div><b>3</b><span>Écris un mot qui commence par cette lettre dans chaque catégorie.</span></div>
        <div><b>4</b><span>Les réponses uniques et validées rapportent 1 point.</span></div>
        <div><b>5</b><span>Le meilleur score cumulé gagne la partie.</span></div>
      </section>
    </main>
  `);
  document.getElementById('backHome').onclick = renderHome;
}

function gameCoin(sizeClass = "") {
  return `<span class="game-coin ${sizeClass}" aria-hidden="true"><span class="game-coin-crown">♛</span></span>`;
}

function walletBadge(extraClass = "") {
  return `<div class="wallet-badge ${extraClass}">${gameCoin("game-coin-sm")}<strong>${getCoins()}</strong></div>`;
}

function renderNameForm(mode) {
  setScreen(`
    <main class="screen form-screen premium-form create-game-screen">
      <button class="back" id="backBtn" aria-label="Retour">←</button>
      ${walletBadge("form-wallet-badge")}

      <div class="form-heading create-heading">
        <img class="create-game-logo" src="./ptit-bac-logo-v2.png" alt="P’tit Bac" />
        <h1>Créer une partie</h1>
        <p class="subtitle">Choisis ton prénom et lance ton salon.</p>
      </div>

      <form id="nameForm" class="stack form-card create-game-card">
        <div>
          <label class="label" for="name">Ton prénom</label>
          <div class="input-wrap"><span class="field-icon">♟</span><input class="input" id="name" maxlength="24" autocomplete="name" placeholder="Ton prénom" value="${escapeHtml(getProfile().name)}" autofocus /></div>
        </div>

        <fieldset class="choice-fieldset">
          <legend class="label">Nombre de manches</legend>
          <div class="choice-grid rounds-grid" id="roundChoices">
            <button type="button" class="choice-btn selected" data-value="1">1</button>
            <button type="button" class="choice-btn" data-value="3">3</button>
            <button type="button" class="choice-btn" data-value="5">5</button>
          </div>
        </fieldset>

        <fieldset class="choice-fieldset">
          <legend class="label">Temps par manche</legend>
          <div class="choice-grid time-grid" id="timeChoices">
            <button type="button" class="choice-btn time-choice selected" data-value="30"><span class="choice-icon lightning">⚡</span><span>30 secondes</span></button>
            <button type="button" class="choice-btn time-choice" data-value="60"><span class="choice-icon clock">◴</span><span>60 secondes</span></button>
            <button type="button" class="choice-btn time-choice" data-value="90"><span class="choice-icon clock">◴</span><span>1 min 30</span></button>
          </div>
        </fieldset>

        <button class="btn btn-primary create-continue" type="submit">Continuer →</button>
      </form>
    </main>
  `);

  let rounds = 1;
  let duration = 30;
  const bindChoiceGroup = (id, setter) => {
    const group = document.getElementById(id);
    group.querySelectorAll('.choice-btn').forEach(btn => {
      btn.onclick = () => {
        group.querySelectorAll('.choice-btn').forEach(item => item.classList.remove('selected'));
        btn.classList.add('selected');
        setter(Number(btn.dataset.value));
      };
    });
  };
  bindChoiceGroup('roundChoices', value => rounds = value);
  bindChoiceGroup('timeChoices', value => duration = value);

  document.getElementById("backBtn").onclick = renderHome;
  document.getElementById("nameForm").onsubmit = e => {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    if (!canAffordGame()) return toast(`Il te faut ${GAME_COST} pièces.`);
    const avatar = getProfile().icon;
    socket.emit("room:create", { name, rounds, duration, avatar, walletToken: session.walletToken }, res => {
      if (!res?.ok) return toast(res?.error || "Impossible de créer la partie.");
      if (res.walletToken) setWalletState(res.walletToken, res.balance);
      if (name) saveProfile(name, avatar);
      saveSession(res.code, res.playerId);
      session.state = res.state;
      render();
    });
  };
}

function renderJoinForm() {
  setScreen(`
    <main class="screen form-screen premium-form join-game-screen">
      <button class="back" id="backBtn">←</button>
      ${walletBadge("form-wallet-badge")}
      <div class="form-heading">
        <span class="screen-icon">🤝</span>
        <h1>Rejoindre une partie</h1>
        <p class="subtitle">Entre le code du salon et ton prénom.</p>
      </div>
      <form id="joinForm" class="stack form-card">
        <div>
          <label class="label" for="code">Code de la partie</label>
          <div class="input-wrap code-wrap"><span>🎮</span><input class="input" id="code" maxlength="5" autocapitalize="characters" placeholder="AB12C" /></div>
        </div>
        <div>
          <label class="label" for="name">Ton prénom</label>
          <div class="input-wrap"><span>👤</span><input class="input" id="name" maxlength="24" autocomplete="name" placeholder="Ton prénom" value="${escapeHtml(getProfile().name)}" /></div>
        </div>
        <button class="btn btn-primary" type="submit">Rejoindre →</button>
      </form>
    </main>
  `);
  document.getElementById("backBtn").onclick = renderHome;
  const codeInput = document.getElementById("code");
  codeInput.oninput = () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  };
  document.getElementById("joinForm").onsubmit = e => {
    e.preventDefault();
    if (!canAffordGame()) return toast(`Il te faut ${GAME_COST} pièces.`);
    const joinName = document.getElementById("name").value.trim();
    const avatar = getProfile().icon;
    socket.emit("room:join", {
      code: codeInput.value,
      name: joinName,
      avatar,
      walletToken: session.walletToken
    }, res => {
      if (!res?.ok) return toast(res?.error || "Impossible de rejoindre.");
      if (res.walletToken) setWalletState(res.walletToken, res.balance);
      if (joinName) saveProfile(joinName, avatar);
      saveSession(res.code, res.playerId);
      session.state = res.state;
      render();
    });
  };
}

function render() {
  if (!session.state) return renderHome();
  clearInterval(session.timerHandle);
  session.timerHandle = null;

  switch (session.state.phase) {
    case "lobby": return renderLobby();
    case "category_selection": return renderCategorySelection();
    case "letter_selection": return renderLetterSelection();
    case "round": return me()?.submitted ? renderRoundWaiting() : renderRound();
    case "validation": return renderValidation();
    case "scoreboard": return renderScoreboard();
    case "finished": return renderFinished();
    default: return renderHome();
  }
}

function statIcon(type) {
  const icons = {
    player: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0H4.5Z" fill="currentColor"/></svg>`,
    round: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M7 4h10l-2.3 4L17 12H7V4Z" fill="currentColor"/></svg>`,
    timer: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 13V8.5M9 3h6M16.8 6.2l1.5-1.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`
  };
  return icons[type] || "";
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  if (value === 90) return "1m30";
  if (value === 60) return "60s";
  return `${value}s`;
}

function renderLobby() {
  clearInterval(session.timerHandle);
  session.localAnswers = {};
  const state = session.state;
  const user = me();
  const botCount = state.players.filter(p => p.isBot).length;

  const players = state.players.map((p, index) => {
    const canKick = user?.isHost && !p.isHost && p.id !== session.playerId;
    return `
      <div class="v141-lobby-player">
        ${avatarMarkup(p, index)}
        <div class="v141-lobby-player-main">
          <div class="v141-lobby-player-name">${escapeHtml(p.name)} ${p.isHost ? `<span class="v141-host-pill">Hôte</span>` : ""}</div>
          <div class="v141-lobby-player-sub">${p.connected || p.isBot ? "Prêt" : "Déconnecté"}</div>
        </div>
        <span class="v141-lobby-status ${p.connected || p.isBot ? "ready" : "off"}">${p.connected || p.isBot ? "● Prêt" : "● Hors ligne"}</span>
        ${canKick ? `<button class="v141-kick" data-kick-id="${p.id}" aria-label="Retirer ${escapeHtml(p.name)}">×</button>` : ""}
      </div>
    `;
  }).join("");

  const difficultyLabel = state.categoryDifficulty === "hard" ? "Difficile" : state.categoryDifficulty === "medium" ? "Normal" : "Facile";
  const categoryCount = Number(state.categoryCount || state.categories?.length || 6);

  const inlineControl = (key, label, value, icon) => `
    <div class="v147-setting-row" data-setting="${key}">
      <span class="v147-setting-icon">${icon}</span>
      <div class="v147-setting-content">
        <small>${label}</small>
        <div class="v147-inline-picker ${!user?.isHost ? "is-readonly" : ""}">
          ${user?.isHost ? `<button type="button" class="v147-step" data-setting-step="${key}" data-dir="-1" aria-label="Valeur précédente">‹</button>` : ""}
          <strong>${value}</strong>
          ${user?.isHost ? `<button type="button" class="v147-step" data-setting-step="${key}" data-dir="1" aria-label="Valeur suivante">›</button>` : ""}
        </div>
      </div>
    </div>`;

  setScreen(`
    <main class="screen v141-lobby-screen v147-lobby-screen">
      <div class="v141-glow v141-glow-a"></div><div class="v141-glow v141-glow-b"></div>

      <header class="v147-lobby-top">
        <div class="v147-room-head">
          <div class="v147-room-label">Salon</div>
          <div class="v147-room-subtitle">Partage ce code avec tes amis</div>
          <button class="v147-code" id="copyCode">${escapeHtml(state.code)} <span aria-hidden="true">⧉</span></button>
        </div>
        <div class="v147-player-count" aria-label="${state.players.length} joueurs sur 12">
          <span class="v147-player-count-icon">♟</span>
          <strong>${state.players.length}/12</strong>
          <span>Joueurs</span>
        </div>
      </header>

      <section class="v147-lobby-grid">
        <div class="v147-left-column">
          <div class="v141-panel v141-players-panel v147-players-panel">
            <div class="v141-panel-title"><h2>Joueurs <span>(${state.players.length}/12)</span></h2></div>
            <div class="v141-lobby-player-list">${players}</div>
            ${user?.isHost ? `
              <button class="v141-add-bot" id="addBotBtn" ${state.players.length >= 12 ? "disabled" : ""}>
                <span class="v141-add-circle">＋</span><strong>Ajouter un joueur</strong><small>${botCount ? `${botCount} joueur${botCount > 1 ? "s" : ""} test ajouté${botCount > 1 ? "s" : ""}` : "Pour tester une partie"}</small>
              </button>
              ${state.players.length < 12 ? `<div class="v143-empty-player"><span>＋</span><small>En attente d’un joueur…</small></div>` : ""}
            ` : ""}
          </div>

          <button class="v147-invite" id="inviteFriendsBtn" type="button">
            <span class="v147-invite-icon">♙＋</span>
            <strong>Inviter des amis</strong>
            <b>›</b>
          </button>
        </div>

        <section class="v141-panel v141-settings-card v147-settings-card">
          <h2>Paramètres de la partie</h2>
          ${inlineControl("rounds", "Manches", state.rounds, "⚡")}
          ${inlineControl("duration", "Temps par manche", formatDuration(state.duration), "◷")}
          ${inlineControl("categoryDifficulty", "Difficulté", difficultyLabel, "▥")}
          ${inlineControl("categoryCount", "Catégories", categoryCount, "🏷️")}
        </section>
      </section>

      <div class="v147-actions">
        ${user?.isHost ? `
          <button class="v141-start v147-start" id="startBtn" ${state.players.length < 2 ? "disabled" : ""}>▶ <span>Lancer la partie</span></button>
        ` : `<div class="v141-wait-host v147-wait-host"><span class="spinner small-spinner"></span> En attente de l'hôte…</div>`}
        <button class="v141-quit v147-quit" id="leaveLobbyBottom">⇥ <span>Quitter le salon</span></button>
      </div>
    </main>
  `);

  const leave = () => {
    socket.emit("room:leave", { code: state.code, playerId: session.playerId });
    clearSession();
    renderHome();
  };
  document.getElementById("leaveLobbyBottom").onclick = leave;

  document.getElementById("copyCode").onclick = async () => {
    try { await navigator.clipboard.writeText(state.code); toast("Code copié !"); }
    catch { toast(`Code : ${state.code}`); }
  };

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

  document.querySelectorAll("[data-setting-step]").forEach(btn => {
    btn.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      updateSetting(btn.dataset.settingStep, Number(btn.dataset.dir) || 1);
    });
  });

  if (user?.isHost) {
    const botBtn = document.getElementById("addBotBtn");
    if (botBtn) botBtn.onclick = () => {
      if (state.players.length >= 12) return toast("Salon complet.");
      socket.emit("room:addBot", { code: state.code, playerId: session.playerId });
    };
    const startBtn = document.getElementById("startBtn");
    if (startBtn) startBtn.onclick = () => socket.emit("game:start", { code: state.code, playerId: session.playerId });
    document.querySelectorAll("[data-kick-id]").forEach(btn => {
      btn.onclick = () => socket.emit("room:kick", { code: state.code, playerId: session.playerId, targetPlayerId: btn.dataset.kickId });
    });
  }
}

function openLobbySettingPopover(setting, anchor) {
  const state = session.state;
  const user = me();
  if (!state || !user?.isHost || state.phase !== "lobby" || !anchor) return;

  document.querySelector(".v146-popover-layer")?.remove();

  const current = {
    rounds: Number(state.rounds || 1),
    duration: Number(state.duration || 60),
    categoryDifficulty: state.categoryDifficulty || "beginner",
    categoryCount: Number(state.categoryCount || state.categories?.length || 6)
  };
  let draft = current[setting];

  const titleBySetting = {
    rounds: "Nombre de manches",
    duration: "Temps par manche",
    categoryDifficulty: "Choisir la difficulté",
    categoryCount: "Nombre de catégories"
  };

  const layer = document.createElement("div");
  layer.className = "v146-popover-layer";
  layer.innerHTML = `<div class="v146-popover" role="dialog" aria-modal="true" aria-label="${titleBySetting[setting]}"></div>`;
  document.body.appendChild(layer);
  const popover = layer.querySelector(".v146-popover");

  const renderContent = () => {
    if (setting === "rounds") {
      popover.innerHTML = `
        <div class="v146-popover-arrow"></div>
        <h3>Nombre de manches</h3>
        <div class="v146-choice-list compact-three">
          ${[1,3,5].map(v => `<button type="button" class="v146-choice ${draft === v ? "selected" : ""}" data-value="${v}"><span>${v}</span>${draft === v ? '<b>✓</b>' : ''}</button>`).join("")}
        </div>
        <button type="button" class="v146-validate" id="v146ValidateSetting">Valider</button>`;
    } else if (setting === "duration") {
      const labels = {30:"30 secondes",60:"60 secondes",90:"1 minute 30"};
      popover.innerHTML = `
        <div class="v146-popover-arrow"></div>
        <h3>Temps par manche</h3>
        <div class="v146-choice-list">
          ${[30,60,90].map(v => `<button type="button" class="v146-choice ${draft === v ? "selected" : ""}" data-value="${v}"><span>${labels[v]}</span>${draft === v ? '<b>✓</b>' : '<i></i>'}</button>`).join("")}
        </div>
        <button type="button" class="v146-validate" id="v146ValidateSetting">Valider</button>`;
    } else if (setting === "categoryDifficulty") {
      const options = [
        ["beginner","Facile","Des catégories plus simples"],
        ["medium","Normal","Un bon équilibre"],
        ["hard","Difficile","Un vrai challenge"]
      ];
      popover.innerHTML = `
        <div class="v146-popover-arrow"></div>
        <h3>Choisir la difficulté</h3>
        <div class="v146-choice-list">
          ${options.map(([v,label,sub]) => `<button type="button" class="v146-choice difficulty ${draft === v ? "selected" : ""}" data-value="${v}"><span><strong>${label}</strong><small>${sub}</small></span>${draft === v ? '<b>✓</b>' : '<i></i>'}</button>`).join("")}
        </div>
        <button type="button" class="v146-validate" id="v146ValidateSetting">Valider</button>`;
    } else {
      draft = Math.max(5, Math.min(10, Number(draft) || 6));
      popover.innerHTML = `
        <div class="v146-popover-arrow"></div>
        <h3>Nombre de catégories</h3>
        <div class="v146-stepper">
          <button type="button" class="v146-step-btn" id="v146CategoryPrev" ${draft <= 5 ? "disabled" : ""} aria-label="Moins de catégories">‹</button>
          <strong class="v146-step-value">${draft}</strong>
          <button type="button" class="v146-step-btn" id="v146CategoryNext" ${draft >= 10 ? "disabled" : ""} aria-label="Plus de catégories">›</button>
        </div>
        <p class="v146-range-note">Entre 5 et 10</p>
        <button type="button" class="v146-validate" id="v146ValidateSetting">Valider</button>`;
    }

    popover.querySelectorAll(".v146-choice").forEach(btn => {
      btn.onclick = () => {
        draft = setting === "categoryDifficulty" ? btn.dataset.value : Number(btn.dataset.value);
        renderContent();
        positionPopover();
      };
    });
    popover.querySelector("#v146CategoryPrev")?.addEventListener("click", () => {
      draft = Math.max(5, Number(draft) - 1); renderContent(); positionPopover();
    });
    popover.querySelector("#v146CategoryNext")?.addEventListener("click", () => {
      draft = Math.min(10, Number(draft) + 1); renderContent(); positionPopover();
    });
    popover.querySelector("#v146ValidateSetting")?.addEventListener("click", saveSetting);
  };

  const positionPopover = () => {
    const rect = anchor.getBoundingClientRect();
    const margin = 10;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const desiredWidth = Math.min(setting === "categoryCount" ? 250 : 270, viewportW - 24);
    popover.style.width = `${desiredWidth}px`;
    popover.style.left = "0px";
    popover.style.top = "0px";
    const popRect = popover.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - desiredWidth / 2;
    left = Math.max(12, Math.min(viewportW - desiredWidth - 12, left));
    let top = rect.bottom + margin;
    let above = false;
    if (top + popRect.height > viewportH - 12) {
      top = Math.max(12, rect.top - popRect.height - margin);
      above = true;
    }
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.classList.toggle("above", above);
    const arrow = popover.querySelector(".v146-popover-arrow");
    if (arrow) {
      const center = rect.left + rect.width / 2 - left;
      arrow.style.left = `${Math.max(22, Math.min(desiredWidth - 22, center))}px`;
    }
  };

  const close = () => {
    window.removeEventListener("resize", positionPopover);
    window.removeEventListener("scroll", positionPopover, true);
    layer.remove();
  };

  const saveSetting = () => {
    const button = popover.querySelector("#v146ValidateSetting");
    if (button) { button.disabled = true; button.textContent = "Enregistrement…"; }
    const payload = {
      code: state.code,
      playerId: session.playerId,
      rounds: current.rounds,
      duration: current.duration,
      categoryCount: current.categoryCount,
      categoryDifficulty: current.categoryDifficulty
    };
    payload[setting] = draft;
    socket.emit("room:updateSettings", payload, res => {
      if (!res?.ok) {
        if (button) { button.disabled = false; button.textContent = "Valider"; }
        return toast(res?.error || "Impossible de modifier ce paramètre.");
      }
      if (res.state) session.state = res.state;
      close();
      render();
    });
  };

  layer.addEventListener("pointerdown", e => { if (e.target === layer) close(); });
  window.addEventListener("resize", positionPopover);
  window.addEventListener("scroll", positionPopover, true);
  renderContent();
  requestAnimationFrame(positionPopover);
}

function difficultyLabel(value) {
  return value === "hard" ? "Difficile" : value === "medium" ? "Normal" : "Facile";
}

function renderCategorySelection() {
  clearInterval(session.timerHandle);
  const state = session.state;
  const user = me();
  const categories = state.categories || [];
  const categoryRerollCost = Number(state.categoryRerollCost || 10);

  setScreen(`
    <main class="screen category-pick-screen">
      <div class="category-pick-blob category-pick-blob-a"></div>
      <div class="category-pick-blob category-pick-blob-b"></div>

      <header class="category-pick-header">
        ${user?.isHost ? `<button class="pregame-return-btn" id="returnLobbyCategoriesBtn" type="button" aria-label="Retour au salon">‹ <span>Retour au salon</span></button>` : `<span class="pregame-return-spacer"></span>`}
        <img src="ptit-bac-logo-v2.png" class="category-pick-logo" alt="P’tit Bac">
        ${walletBadge("category-pick-wallet")}
      </header>

      <section class="category-pick-heading">
        <p class="ref-eyebrow">Sélection des catégories</p>
        <h1>Voici votre tirage !</h1>
        <p>${categories.length} catégories · Niveau ${difficultyLabel(state.categoryDifficulty)}</p>
      </section>

      <section class="category-pick-grid" aria-label="Catégories tirées">
        ${categories.map((category, index) => `
          <article class="category-pick-card" style="--pick-index:${index}">
            <span class="category-pick-icon">${categoryIcon(category)}</span>
            <strong>${escapeHtml(category)}</strong>
          </article>
        `).join("")}
      </section>

      ${user?.isHost ? `
        <section class="category-pick-actions">
          <button class="category-reroll-btn" id="rerollCategoriesBtn" ${getCoins() < categoryRerollCost ? "disabled" : ""}>
            <span>↻ Relancer le tirage</span>
            <span class="letter-reroll-cost">${gameCoin("game-coin-tiny")}<b>${categoryRerollCost}</b></span>
          </button>
          ${getCoins() < categoryRerollCost ? `<p class="letter-cost-note">Il te faut ${categoryRerollCost} pièces pour relancer les catégories.</p>` : ""}
          <button class="btn btn-primary category-confirm-btn" id="confirmCategoriesBtn">Continuer vers la lettre →</button>
        </section>
      ` : `
        <div class="category-pick-wait">
          <div class="spinner small-spinner"></div>
          <div><strong>En attente de l’hôte</strong><span>L’hôte valide le tirage des catégories.</span></div>
        </div>
      `}
    </main>
  `);

  document.getElementById("returnLobbyCategoriesBtn")?.addEventListener("click", () => {
    if (!confirm("Retourner au salon ? Les 5 pièces de participation seront remboursées.")) return;
    socket.emit("game:returnLobby", { code: state.code, playerId: session.playerId });
  });

  if (user?.isHost) {
    const rerollBtn = document.getElementById("rerollCategoriesBtn");
    const confirmBtn = document.getElementById("confirmCategoriesBtn");
    rerollBtn.onclick = () => {
      rerollBtn.disabled = true;
      confirmBtn.disabled = true;
      socket.emit("game:rerollCategories", { code: state.code, playerId: session.playerId });
    };
    confirmBtn.onclick = () => {
      rerollBtn.disabled = true;
      confirmBtn.disabled = true;
      socket.emit("game:confirmCategories", { code: state.code, playerId: session.playerId });
    };
  }
}


function renderLetterSelection() {
  clearInterval(session.timerHandle);
  const state = session.state;
  const user = me();
  const chooser = state.players.find(p => p.id === state.letterChooserPlayerId);
  const isChooser = user?.id === state.letterChooserPlayerId;
  const selectedLetter = state.pendingLetter || "";
  const rerollCost = Number(state.letterRerollCost || 10);
  const nextRound = state.roundIndex + 2;
  const segmentAngle = 360 / LETTER_WHEEL.length;

  const wheelLabels = LETTER_WHEEL.map((letter, index) => {
    const angle = index * segmentAngle;
    return `<span class="letter-wheel-label" style="--letter-angle:${angle}deg"><b class="letter-wheel-glyph">${letter}</b></span>`;
  }).join("");

  const wheelStops = LETTER_WHEEL.map((_, index) => {
    const start = index * segmentAngle;
    const end = (index + 1) * segmentAngle;
    const color = index % 2 === 0 ? "#5830c8" : "#7147ed";
    return `${color} ${start}deg ${end}deg`;
  }).join(",");

  setScreen(`
    <main class="screen letter-pick-screen letter-pick-v135">
      <div class="letter-pick-blob letter-pick-blob-a"></div>
      <div class="letter-pick-blob letter-pick-blob-b"></div>
      <div class="letter-pick-spark spark-a">✦</div>
      <div class="letter-pick-spark spark-b">✦</div>

      <header class="letter-pick-header v135-letter-header">
        ${user?.isHost
          ? `<button class="v135-letter-back pregame-letter-return" id="returnLobbyLetterBtn" type="button" aria-label="Retour au salon"><span class="v137-back-arrow">‹</span><span class="v137-back-label">Retour<br>au salon</span></button>`
          : `<button class="v135-letter-back" id="leaveLetterBtn" type="button" aria-label="Quitter la partie"><span class="v137-back-arrow">‹</span><span class="v137-back-label">Quitter<br>la partie</span></button>`}
        <img src="ptit-bac-logo-v2.png" class="letter-pick-logo" alt="P’tit Bac">
        ${walletBadge("letter-pick-wallet")}
      </header>

      <section class="letter-pick-heading v135-letter-heading">
        <p class="v135-round-pill">Manche ${nextRound}/${state.rounds}</p>
        <h1>Tirage de la <span>lettre</span></h1>
        <p>${isChooser ? (selectedLetter ? "La lettre est prête !" : "Appuie sur la roue pour la faire tourner !") : `${escapeHtml(chooser?.name || "Un joueur")} lance la roue.`}</p>
      </section>

      <section class="letter-wheel-zone ${isChooser && !selectedLetter ? "is-tappable" : ""}" id="letterWheelTapZone" role="${isChooser && !selectedLetter ? "button" : "presentation"}" ${isChooser && !selectedLetter ? 'tabindex="0" aria-label="Lancer la roue"' : ''}>
        <div class="letter-wheel-pointer"><span></span></div>
        <div class="letter-wheel-shell">
          <div class="letter-wheel" id="letterWheel" style="background:conic-gradient(${wheelStops})">
            ${wheelLabels}
            <div class="letter-wheel-center"><span class="v135-wheel-crown">♛</span></div>
          </div>
        </div>
      </section>

      ${selectedLetter ? `
        <div class="letter-result-card v135-letter-result v137-letter-result">
          <div class="v135-result-letter">${escapeHtml(selectedLetter)}</div>
          <div class="v137-result-copy"><span>Lettre sélectionnée</span><strong>${escapeHtml(selectedLetter)}</strong></div>
        </div>
      ` : `
        <div class="v135-letter-status ${isChooser ? "ready" : "waiting"}">
          <span>${isChooser ? "La roue est prête" : `En attente de ${escapeHtml(chooser?.name || "ce joueur")}`}</span>
        </div>
      `}

      ${isChooser ? `
        <section class="letter-pick-actions v135-letter-actions">
          ${selectedLetter ? `
            <button class="letter-reroll-btn" id="rerollLetterBtn" ${getCoins() < rerollCost ? "disabled" : ""}>
              <span>↻ Relancer</span>
              <span class="letter-reroll-cost">${gameCoin("game-coin-tiny")}<b>${rerollCost}</b></span>
            </button>
            <button class="btn btn-primary letter-confirm-btn v135-confirm-letter" id="confirmLetterBtn">
              <span>Valider la lettre</span><strong>${escapeHtml(selectedLetter)}</strong><span class="v135-confirm-arrow">›</span>
            </button>
            ${getCoins() < rerollCost ? `<p class="letter-cost-note">Il te faut ${rerollCost} pièces pour relancer.</p>` : ""}
          ` : ``}
        </section>
      ` : `
        <div class="letter-pick-wait v135-letter-wait">
          <div class="spinner small-spinner"></div>
          <div><strong>${selectedLetter ? `Lettre ${escapeHtml(selectedLetter)}` : "Tirage en cours"}</strong><span>${selectedLetter ? `En attente de ${escapeHtml(chooser?.name || "ce joueur")} pour confirmer.` : `La roue va bientôt tourner.`}</span></div>
        </div>
      `}
    </main>
  `);

  document.getElementById("returnLobbyLetterBtn")?.addEventListener("click", () => {
    if (!confirm("Retourner au salon ? Les 5 pièces de participation seront remboursées.")) return;
    socket.emit("game:returnLobby", { code: state.code, playerId: session.playerId });
  });

  document.getElementById("leaveLetterBtn")?.addEventListener("click", () => {
    socket.emit("room:leave", { code: state.code, playerId: session.playerId });
    session.state = null;
    session.code = null;
    renderHome();
  });

  const wheel = document.getElementById("letterWheel");
  if (wheel && selectedLetter) {
    const targetIndex = Math.max(0, LETTER_WHEEL.indexOf(selectedLetter));
    const targetAngle = -(targetIndex * segmentAngle);
    const turns = 5 + ((Number(state.letterSpinVersion || 0) % 3));
    const finalRotation = turns * 360 + targetAngle;
    wheel.style.setProperty("--wheel-final-rotation", `${finalRotation}deg`);
    wheel.style.setProperty("--wheel-counter-rotation", `${-finalRotation}deg`);
    requestAnimationFrame(() => wheel.classList.add("is-spinning"));

    const rerollBtn = document.getElementById("rerollLetterBtn");
    const confirmBtn = document.getElementById("confirmLetterBtn");
    if (rerollBtn) rerollBtn.disabled = true;
    if (confirmBtn) confirmBtn.disabled = true;
    setTimeout(() => {
      if (rerollBtn) rerollBtn.disabled = getCoins() < rerollCost;
      if (confirmBtn) confirmBtn.disabled = false;
    }, 2900);
  }

  if (!isChooser) return;

  const triggerSpin = () => {
    if (selectedLetter) return;
    const zone = document.getElementById("letterWheelTapZone");
    if (zone?.classList.contains("is-spinning-request")) return;
    zone?.classList.add("is-spinning-request");
    socket.emit("game:spinLetter", { code: state.code, playerId: session.playerId });
  };

  const tapZone = document.getElementById("letterWheelTapZone");
  if (tapZone && !selectedLetter) {
    tapZone.onclick = triggerSpin;
    tapZone.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        triggerSpin();
      }
    };
  }

  const rerollBtn = document.getElementById("rerollLetterBtn");
  if (rerollBtn) {
    rerollBtn.onclick = () => {
      if (getCoins() < rerollCost) return toast(`Il te faut ${rerollCost} pièces.`);
      rerollBtn.disabled = true;
      const confirmBtn = document.getElementById("confirmLetterBtn");
      if (confirmBtn) confirmBtn.disabled = true;
      socket.emit("game:rerollLetter", { code: state.code, playerId: session.playerId });
    };
  }

  const confirmBtn = document.getElementById("confirmLetterBtn");
  if (confirmBtn) {
    confirmBtn.onclick = () => {
      confirmBtn.disabled = true;
      const rerollBtn = document.getElementById("rerollLetterBtn");
      if (rerollBtn) rerollBtn.disabled = true;
      socket.emit("game:confirmLetter", { code: state.code, playerId: session.playerId });
    };
  }
}

function answerKey(category) {
  return `${session.state.roundIndex}:${category}`;
}

function renderRound() {
  const state = session.state;
  const letter = state.currentLetter;

  const fields = state.categories.map(category => {
    const key = answerKey(category);
    const value = session.localAnswers[key] || "";
    return `
      <div class="play-answer-row">
        <div class="play-answer-label">
          <span class="play-answer-icon">${categoryIcon(category)}</span>
          <strong>${escapeHtml(category)}</strong>
        </div>
        <div class="play-input-wrap">
          <input
            class="answer-input play-answer-input"
            data-category="${escapeHtml(category)}"
            maxlength="60"
            autocomplete="off"
            autocapitalize="words"
            placeholder="Ta réponse..."
            value="${escapeHtml(value)}"
          />
          <button type="button" class="play-clear-answer" data-clear-category="${escapeHtml(category)}" aria-label="Effacer la réponse">×</button>
        </div>
      </div>
    `;
  }).join("");

  setScreen(`
    <main class="screen play-screen">
      <div class="play-bg-letter play-bg-letter-left">${escapeHtml(String.fromCharCode(65 + ((state.roundIndex + 7) % 26)))}</div>
      <div class="play-bg-letter play-bg-letter-right-top">${escapeHtml(String.fromCharCode(65 + ((state.roundIndex + 12) % 26)))}</div>
      <div class="play-bg-letter play-bg-letter-right-bottom">${escapeHtml(String.fromCharCode(65 + ((state.roundIndex + 16) % 26)))}</div>

      <header class="play-header play-header-v136">
        <button class="play-back play-quit-v136" id="leaveGameBtn" type="button" aria-label="Quitter la partie">
          <span class="play-quit-arrow">‹</span>
          <span class="play-quit-copy">Quitter<br>la partie</span>
        </button>
        <img class="play-logo" src="./ptit-bac-logo-v2.png" alt="P’tit Bac" />
        <div class="play-round-badge">Manche <b>${state.roundIndex + 1}/${state.rounds}</b></div>
      </header>

      <section class="play-hero play-hero-v136">
        <div class="play-current-letter-v136">
          <div class="play-letter-label">Lettre actuelle</div>
          <div class="play-letter-box"><span>${escapeHtml(letter)}</span></div>
        </div>

        <div class="play-timer-ring" id="timerRing" style="--progress:100%">
          <div class="play-timer-inner">
            <strong id="timer">${state.duration}</strong>
            <span>secondes</span>
          </div>
        </div>

        <div class="play-tip-v136">
          <span class="play-tip-bolt">ϟ</span>
          <strong>Trouve un mot<br>pour chaque<br>catégorie !</strong>
        </div>
      </section>

      <div class="play-answer-list">${fields}</div>

      <div class="play-sticky-action">
        <button class="btn btn-primary play-submit" id="submitRound"><span>➤</span> Valider mes réponses</button>
      </div>

      <div class="play-rule-v136">
        <span class="play-rule-icon">i</span>
        <p>Une réponse rapporte <b>1 point uniquement</b> si elle est valide et qu’aucun autre joueur n’a donné la même réponse.</p>
      </div>
    </main>
  `);

  document.querySelectorAll(".answer-input").forEach(input => {
    input.addEventListener("input", e => {
      const category = e.target.dataset.category;
      const key = answerKey(category);
      session.localAnswers[key] = e.target.value;
      socket.emit("answer:update", {
        code: state.code,
        playerId: session.playerId,
        category,
        value: e.target.value
      });
    });
  });

  document.querySelectorAll("[data-clear-category]").forEach(btn => {
    btn.onclick = () => {
      const category = btn.dataset.clearCategory;
      const input = document.querySelector(`.answer-input[data-category="${CSS.escape(category)}"]`);
      if (!input) return;
      input.value = "";
      const key = answerKey(category);
      session.localAnswers[key] = "";
      socket.emit("answer:update", {
        code: state.code,
        playerId: session.playerId,
        category,
        value: ""
      });
      input.focus();
    };
  });

  document.getElementById("leaveGameBtn").onclick = () => {
    if (!confirm("Quitter la partie en cours ?")) return;
    socket.emit("room:leave", { code: state.code, playerId: session.playerId });
    clearSession();
    renderHome();
  };

  document.getElementById("submitRound").onclick = () => {
    document.getElementById("submitRound").disabled = true;
    socket.emit("round:submit", { code: state.code, playerId: session.playerId });
  };

  const tick = () => {
    const timer = document.getElementById("timer");
    const ring = document.getElementById("timerRing");
    if (!timer) return;
    const seconds = Math.max(0, Math.ceil((state.roundEndsAt - Date.now()) / 1000));
    timer.textContent = String(seconds);
    const progress = state.duration > 0 ? Math.max(0, Math.min(100, (seconds / state.duration) * 100)) : 0;
    if (ring) {
      ring.style.setProperty("--progress", `${progress}%`);
      ring.classList.toggle("danger", seconds <= 10);
    }
    if (seconds <= 0) {
      document.querySelectorAll("input, button").forEach(el => el.disabled = true);
    }
  };
  tick();
  session.timerHandle = setInterval(tick, 200);
}

function renderRoundWaiting() {
  const state = session.state;
  const readyCount = state.players.filter(p => p.submitted).length;
  setScreen(`
    <main class="screen v141-wait-screen">
      <div class="v141-glow v141-glow-a"></div><div class="v141-glow v141-glow-b"></div>
      <header class="v141-wait-top">
        <div><small>Manche</small><strong>${state.roundIndex + 1}/${state.rounds}</strong></div>
        <div class="v141-letter-mini"><small>Lettre</small><strong>${escapeHtml(state.currentLetter)}</strong></div>
        <div><small>Catégories</small><strong>${state.categories?.length || state.categoryCount || 6}</strong></div>
      </header>

      <section class="v141-wait-card">
        <div class="v141-hourglass-ring"><span>⌛</span></div>
        <h1>En attente des autres joueurs…</h1>
        <p>Tes réponses sont bien enregistrées.<br>Encore un peu de patience !</p>
      </section>

      <section class="v141-wait-players">
        <h2>Joueurs <span>(${readyCount}/${state.players.length})</span></h2>
        <div class="v141-wait-player-grid">
          ${state.players.map((p, index) => `
            <div class="v141-wait-player ${p.submitted ? "done" : "writing"}">
              ${avatarMarkup(p, index)}
              <strong>${escapeHtml(p.name)}</strong>
              <span>${p.submitted ? "✓ Prêt" : "◌ En cours…"}</span>
            </div>
          `).join("")}
        </div>
      </section>
    </main>
  `);

  const tick = () => {
    const remaining = Math.max(0, Math.ceil((state.roundEndsAt - Date.now()) / 1000));
    const ring = document.querySelector('.v141-hourglass-ring');
    if (ring) ring.style.setProperty('--wait-progress', `${state.duration ? Math.max(0, Math.min(100, remaining / state.duration * 100)) : 0}%`);
  };
  tick();
  session.timerHandle = setInterval(tick, 250);
}

function renderValidation() {
  const state = session.state;
  const user = me();
  const validation = state.validation || {};
  const total = Number(validation.total || 0);
  const checked = Math.min(total, Number(validation.checked || 0));
  const complete = validation.status === "complete";
  const unavailable = validation.status === "unavailable";
  const percent = total ? Math.max(8, Math.round((checked / total) * 100)) : 100;
  const errorMessage = validation.error?.code === "not_configured"
    ? "La clé OpenAI n’est pas configurée sur le serveur."
    : "La vérification IA est temporairement indisponible. Aucun point ne sera perdu : la manche reste en attente.";

  setScreen(`
    <main class="screen center-screen validation-screen validation-auto-v131">
      <div class="validation-auto-blob validation-auto-blob-a"></div>
      <div class="validation-auto-blob validation-auto-blob-b"></div>
      <section class="auto-review-card ${unavailable ? "is-unavailable" : ""}">
        <img src="ptit-bac-logo-v2.png" class="validation-logo" alt="P’tit Bac">
        <div class="auto-review-icon ${complete ? "done" : unavailable ? "unavailable" : ""}">
          ${complete ? "✓" : unavailable ? "!" : '<span class="auto-review-spinner"></span>'}
        </div>
        <div class="auto-review-kicker">${complete ? "Vérification terminée" : unavailable ? "Vérification en pause" : "Vérification automatique"}</div>
        <h2>${complete ? "C’est bon !" : unavailable ? "Impossible de vérifier pour le moment" : "On vérifie les réponses…"}</h2>
        <p>${complete
          ? "Les points de cette manche sont en cours de calcul."
          : unavailable
            ? errorMessage
            : `Le jeu contrôle automatiquement les réponses pour la lettre <strong>${escapeHtml(state.currentLetter || "")}</strong>.`}
        </p>

        <div class="auto-validation-progress" aria-label="Progression de la vérification">
          <div class="auto-validation-progress-fill ${complete ? "done" : unavailable ? "paused" : ""}" style="width:${complete ? 100 : percent}%"></div>
        </div>
        <div class="auto-validation-count">${complete ? "Terminé" : unavailable ? `${checked} / ${total} réponses vérifiées avant la pause` : `${checked} / ${total} réponses analysées`}</div>

        ${unavailable && user?.isHost
          ? `<button class="btn btn-primary validation-retry-btn" id="retryValidationBtn" type="button">↻ Réessayer la vérification</button>`
          : unavailable
            ? `<div class="validation-retry-wait">En attente de l’hôte pour réessayer.</div>`
            : ""}

        <div class="auto-check-grid">
          <div class="auto-check-item"><span>✓</span><div><strong>Lettre</strong><small>Mauvaise lettre = 0</small></div></div>
          <div class="auto-check-item"><span>↔</span><div><strong>Doublons</strong><small>Réponses identiques = 0</small></div></div>
          <div class="auto-check-item"><span>✦</span><div><strong>Catégorie</strong><small>Le sens de la réponse est vérifié</small></div></div>
        </div>
      </section>
      <div class="auto-validation-note">${unavailable ? "La manche ne sera pas comptée tant que la vérification n’a pas abouti." : "Aucune validation manuelle n’est nécessaire."}</div>
    </main>
  `);

  document.getElementById("retryValidationBtn")?.addEventListener("click", () => {
    socket.emit("validation:retry", { code: state.code, playerId: session.playerId });
  });
}

function rankedPlayers() {
  return [...session.state.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function renderScoreboard() {
  const state = session.state;
  const user = me();
  const ranked = rankedPlayers();
  const results = state.lastRoundResults || { byPlayer: {}, categories: state.categories || [], letter: state.currentLetter || "" };
  const categories = results.categories?.length ? results.categories : (state.categories || []);
  const letter = results.letter || state.currentLetter || "";
  const isLastRound = state.roundIndex + 1 >= state.rounds;
  const winner = ranked[0];
  const topGain = winner ? (state.lastRoundScores?.[winner.id] ?? 0) : 0;

  const categoryHeaders = categories.map(category => `
    <div class="round-results-category-head" title="${escapeHtml(category)}">
      <span>${categoryIcon(category)}</span>
      <small>${escapeHtml(category)}</small>
    </div>
  `).join("");

  const playerRows = ranked.map((player, playerIndex) => {
    const cells = categories.map(category => {
      const result = results.byPlayer?.[player.id]?.[category] || { answer: "", status: "invalid", correction: "Aucune réponse" };
      const statusClass = result.status === "valid" ? "is-valid" : result.status === "duplicate" ? "is-duplicate" : "is-invalid";
      const answer = result.answer ? escapeHtml(result.answer) : "—";
      const correction = result.status === "valid" ? "" : escapeHtml(result.correction || (result.status === "duplicate" ? "Doublon" : "Incorrect"));
      const symbol = result.status === "valid" ? "✓" : result.status === "duplicate" ? "!" : "×";
      const canReport = player.id === session.playerId && result.status === "invalid" && result.reportable;
      const reportButton = canReport
        ? `<button class="answer-report-btn ${result.reported ? "is-reported" : ""}" type="button" data-category="${encodeURIComponent(category)}" data-round="${Number(results.roundIndex ?? state.roundIndex)}" ${result.reported ? "disabled" : ""}>${result.reported ? "Signalé ✓" : "Signaler"}</button>`
        : "";
      return `<div class="round-results-answer ${statusClass}" title="${escapeHtml(category)}"><strong>${answer}</strong><span class="round-results-status">${symbol}</span>${correction ? `<small>${correction}</small>` : ""}${reportButton}</div>`;
    }).join("");
    return `
      <div class="round-results-player">
        <div class="round-results-player-card ${playerIndex === 0 ? "is-leader" : ""}">
          ${playerIndex === 0 ? '<span class="round-results-crown">♛</span>' : ""}
          ${avatarMarkup(player, playerIndex, "round-results-avatar")}
          <div class="round-results-player-copy"><strong>${escapeHtml(player.name)}</strong><small>${player.score} pt${player.score !== 1 ? "s" : ""}</small></div>
        </div>
        <div class="round-results-cells">${cells}</div>
      </div>`;
  }).join("");

  setScreen(`
    <main class="round-results-v133">
      <div class="round-results-glow round-results-glow-a"></div><div class="round-results-glow round-results-glow-b"></div>
      <header class="round-results-top v133-top">
        <div class="round-results-round-pill v133-letter-pill"><span class="round-results-letter">${escapeHtml(letter)}</span><div><small>Lettre</small><strong>${escapeHtml(letter)}</strong></div></div>
        <img src="ptit-bac-logo-v2.png" class="round-results-logo" alt="P’tit Bac">
        <div class="v133-top-actions">
          <div class="round-results-state-pill v133-round-pill"><div><small>Manche</small><strong>${state.roundIndex + 1}/${state.rounds}</strong></div></div>
          <button class="v133-quit" id="leaveResultsBtn" type="button" aria-label="Quitter la partie">${uiIcon("logout")}<span>Quitter<br>la partie</span></button>
        </div>
      </header>
      <section class="round-results-heading"><h1>Résultats <em>de la manche</em></h1><p>Voici toutes les réponses et leurs corrections !</p></section>
      <section class="round-results-board-wrap"><div class="round-results-board" style="--result-cols:${Math.max(1,categories.length)}"><div class="round-results-grid-head"><div class="round-results-player-label">Joueurs</div><div class="round-results-category-row">${categoryHeaders}</div></div>${playerRows}</div></section>
      ${winner ? `<section class="round-results-winner v133-winner"><div class="round-results-trophy">🏆</div><div class="round-results-winner-copy"><small>En tête après cette manche</small><strong>${escapeHtml(winner.name)}</strong><span>avec ${topGain} point${topGain !== 1 ? "s" : ""} !</span></div></section>` : ""}
      ${user?.isHost ? `<button class="round-results-next v133-next" id="nextRound">${isLastRound ? "Classement final" : "Manche suivante"}${uiIcon("chevron")}</button>` : `<div class="round-results-wait v133-wait"><span class="spinner"></span><small>En attente de l’hôte pour continuer</small></div>`}
      <div class="round-results-rule"><span>i</span><p>Une réponse rapporte <strong>1 point</strong> uniquement si elle est valide et qu’aucun autre joueur n’a donné la même réponse.</p></div>
    </main>`);

  document.getElementById("leaveResultsBtn")?.addEventListener("click", () => {
    if (!confirm("Quitter la partie en cours ?")) return;
    socket.emit("room:leave", { code: state.code, playerId: session.playerId });
    clearSession(); renderHome();
  });
  document.querySelectorAll(".answer-report-btn:not(:disabled)").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = "Envoi…";
      socket.emit("answer:report", {
        code: state.code,
        playerId: session.playerId,
        roundIndex: Number(btn.dataset.round),
        category: decodeURIComponent(btn.dataset.category || "")
      }, res => {
        if (!res?.ok) {
          btn.disabled = false;
          btn.textContent = "Signaler";
          return toast(res?.error || "Impossible d’envoyer le signalement.");
        }
        btn.textContent = "Signalé ✓";
        btn.classList.add("is-reported");
        toast("Signalement envoyé. L’IA le réexaminera en arrière-plan.");
      });
    });
  });

  if (user?.isHost) document.getElementById("nextRound")?.addEventListener("click", () => socket.emit("game:nextRound", { code: state.code, playerId: session.playerId }));
}

function renderFinished() {
  const state = session.state;
  const user = me();
  const ranked = rankedPlayers();
  const rewards = state.rewardsByPlayerId || {};
  const myReward = Math.max(0, Number(state.myReward || 0));
  const totalPlayers = ranked.length;
  const podiumPlayers = ranked.slice(0, 3);

  const rewardFor = p => Math.max(0, Number(rewards[p.id] || 0));
  const placeLabel = place => place === 1 ? "1" : String(place);
  const podiumClass = place => place === 1 ? "gold" : place === 2 ? "silver" : "bronze";

  const podium = podiumPlayers.map((p, index) => {
    const place = index + 1;
    const isMe = p.id === session.playerId;
    const reward = rewardFor(p);
    return `
      <article class="final-v134-podium-card place-${place} ${isMe ? "is-me" : ""}">
        <div class="final-v134-medal ${podiumClass(place)}">${placeLabel(place)}</div>
        ${place === 1 ? '<div class="final-v134-crown">♛</div>' : ''}
        ${avatarMarkup(p, index, "final-v134-podium-avatar")}
        <strong class="final-v134-podium-name">${escapeHtml(p.name)}${isMe ? ' <small>Toi</small>' : ''}</strong>
        <span class="final-v134-podium-score">${p.score} pt${p.score !== 1 ? "s" : ""}</span>
        <span class="final-v134-podium-reward">${gameCoin("game-coin-xs")} +${reward} pièce${reward !== 1 ? "s" : ""}</span>
      </article>`;
  }).join("");

  const rankingRows = ranked.map((p, index) => {
    const place = index + 1;
    const isMe = p.id === session.playerId;
    const reward = rewardFor(p);
    return `
      <div class="final-v134-row ${isMe ? "is-me" : ""}">
        <span class="final-v134-rank rank-${Math.min(place,4)}">${place}</span>
        <div class="final-v134-player">
          ${avatarMarkup(p, index, "final-v134-row-avatar")}
          <strong>${escapeHtml(p.name)}${isMe ? ' <small>Toi</small>' : ''}</strong>
        </div>
        <b>${p.score}</b>
        <span class="final-v134-row-reward">${gameCoin("game-coin-tiny")} +${reward}</span>
      </div>`;
  }).join("");

  setScreen(`
    <main class="screen final-v134">
      <div class="final-v134-glow final-v134-glow-a"></div>
      <div class="final-v134-glow final-v134-glow-b"></div>
      <div class="final-v134-confetti" aria-hidden="true">◆ ✦ ◆ ● ✦ ◆ ● ✦</div>

      <header class="final-v134-topbar">
        <button class="final-v134-back" id="leaveTopBtn" type="button" aria-label="Retour à l’accueil">${uiIcon("chevron", "final-v134-back-icon")}</button>
        <img src="ptit-bac-logo-v2.png" class="final-v134-logo" alt="P’tit Bac">
        ${walletBadge("final-v134-wallet")}
      </header>

      <section class="final-v134-heading">
        <h1>Partie <em>terminée !</em></h1>
      </section>

      <section class="final-v134-podium final-v134-podium-${Math.min(3,totalPlayers)}">
        ${podium}
      </section>

      <section class="final-v134-ranking">
        <div class="final-v134-ranking-head">
          <span>#</span><span>Joueur</span><span>Points</span><span>Pièces gagnées</span>
        </div>
        ${rankingRows}
      </section>

      <section class="final-v134-stats">
        <div><span>${statIcon("player")}</span><strong>${totalPlayers}</strong><small>Joueur${totalPlayers > 1 ? "s" : ""}</small></div>
        <div><span>${statIcon("round")}</span><strong>${state.rounds}</strong><small>Manche${state.rounds > 1 ? "s" : ""}</small></div>
        <div><span>${statIcon("timer")}</span><strong>${state.duration === 90 ? "1m30" : state.duration === 60 ? "1 min" : `${state.duration}s`}</strong><small>Temps / manche</small></div>
      </section>

      <section class="final-v134-myreward">
        <div class="final-v134-myreward-coin">${gameCoin("game-coin-xl")}</div>
        <div>
          <small>Ton gain</small>
          <strong>+${myReward} pièce${myReward !== 1 ? "s" : ""}</strong>
          <span>Nouveau solde : ${getCoins()} pièces</span>
        </div>
      </section>

      <div class="final-v134-actions">
        <button class="final-v134-home" id="leaveBtn" type="button">${uiIcon("home")}<span>Retour à l’accueil</span></button>
        ${user?.isHost
          ? `<button class="final-v134-restart" id="restartBtn" type="button">↻ <span>Refaire une partie</span></button>`
          : `<div class="final-v134-wait">L’hôte peut relancer une partie.</div>`
        }
      </div>
    </main>
  `);

  if (user?.isHost) {
    document.getElementById("restartBtn")?.addEventListener("click", () =>
      socket.emit("game:restart", { code: state.code, playerId: session.playerId })
    );
  }

  const leave = () => {
    socket.emit("room:leave", { code: state.code, playerId: session.playerId });
    clearSession();
    renderHome();
  };
  document.getElementById("leaveBtn")?.addEventListener("click", leave);
  document.getElementById("leaveTopBtn")?.addEventListener("click", leave);
}

window.addEventListener("beforeunload", () => {
  clearInterval(session.timerHandle);
});

// Shared by all six in-game exit buttons. Prefix keeps each screen’s CSS.
function gameExitModal(state, user, prefix) {
  document.querySelector(`.${prefix}-modal-backdrop`)?.remove();
  const overlay = document.createElement("div");
  overlay.className = `${prefix}-modal-backdrop`;
  overlay.innerHTML = `
    <section class="${prefix}-modal" role="dialog" aria-modal="true">
      <h2>Quitter la partie ?</h2>
      <div class="${prefix}-modal-actions">
        <button type="button" data-action="cancel">Non</button>
        ${user?.isHost ? '<button type="button" data-action="lobby">Revenir au salon</button>' : ""}
        <button type="button" class="danger" data-action="home">Revenir à l’accueil</button>
      </div>
    </section>
  `;

  overlay.addEventListener("click", e => {
    const action = e.target?.dataset?.action;
    if (e.target === overlay || action === "cancel") {
      overlay.remove();
      return;
    }
    if (action === "lobby") {
      socket.emit("game:returnLobby", { code: state.code, playerId: session.playerId });
      overlay.remove();
      return;
    }
    if (action === "home") {
      socket.emit("room:leave", { code: state.code, playerId: session.playerId });
      clearSession();
      overlay.remove();
      renderHome();
    }
  });
  document.body.appendChild(overlay);
}
