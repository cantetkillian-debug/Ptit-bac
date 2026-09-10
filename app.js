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

const GAME_COST = 5;
const DEFAULT_COINS = 25;
const ADMIN_COIN_CODE = "PTITBAC-ADMIN"; // mode test local, pas une sécurité serveur
const PROFILE_ICONS = ["🐼","🦊","🐯","🐸","🦁","🐨","🐙","🦄","🤖","😎","🧠","⭐"];

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
  return getCoins() >= GAME_COST;
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
  "Prénom": "👤", "Animal": "🐾", "Lieu": "📍", "Métier": "💼",
  "Nourriture": "🍽️", "Marque": "🏷️", "Film": "🎬", "Jeu vidéo": "🎮",
  "Personnage fictif": "🦸", "Fruit / Légume": "🍏", "Objet": "🧊", "Sport": "🏆"
};

function categoryIcon(category) {
  return CATEGORY_ICONS[category] || "✨";
}

function avatarMarkup(player, index = 0, extra = "") {
  const initial = player.isBot
    ? "🤖"
    : (player.avatar ? escapeHtml(player.avatar) : escapeHtml(player.name.charAt(0).toUpperCase()));
  return `<div class="avatar avatar-${index % 6} ${player.isBot ? "avatar-bot" : ""} ${player.avatar ? "avatar-emoji" : ""} ${extra}">${initial}</div>`;
}


function setScreen(html) {
  app.innerHTML = html;
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderHome() {
  if (session.state) return render();
  const profile = getProfile();
  const coins = getCoins();
  const decorativePool = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");
  const decorativeLetters = [];
  while (decorativeLetters.length < 3) {
    const i = Math.floor(Math.random() * decorativePool.length);
    decorativeLetters.push(decorativePool.splice(i, 1)[0]);
  }

  setScreen(`
    <main class="screen home-v2-screen">
      <div class="home-v2-blob home-v2-blob-a"></div>
      <div class="home-v2-blob home-v2-blob-b"></div>
      <div class="home-v2-blob home-v2-blob-c"></div>
      <div class="home-v2-letter home-v2-a">${decorativeLetters[0]}</div>
      <div class="home-v2-letter home-v2-b">${decorativeLetters[1]}</div>
      <div class="home-v2-letter home-v2-c">${decorativeLetters[2]}</div>

      <section class="home-v2-hero home-v2-hero-clean">
        <img src="petit-bac-logo.png" class="home-v2-logo" alt="P’tit Bac">
        <p>Le jeu de mots qui rassemble<br>tout le monde !</p>
        <span class="home-v2-underline"></span>
      </section>

      <section class="home-v2-dashboard home-v2-dashboard-compact">
        <button class="home-v2-panel home-v2-panel-compact profile-panel" id="profileBtn">
          <span class="home-v2-avatar home-v2-avatar-large">${escapeHtml(profile.icon)}</span>
          <strong>Mon profil</strong>
          <span class="home-v2-chevron home-v2-chevron-center">›</span>
        </button>

        <button class="home-v2-panel home-v2-panel-compact coin-panel" id="coinsBtn">
          <span class="coin-medal home-v2-main-coin">👑</span>
          <span class="home-v2-coin-copy"><strong>Mes pièces</strong><b>${coins}</b></span>
          <span class="home-v2-chevron home-v2-chevron-center">›</span>
        </button>
      </section>

      <button class="home-v2-category-card home-v2-rewards-card" id="rewardsBtn">
        <span class="home-v2-category-icon home-v2-rewards-icon">🎁</span>
        <span><strong>Récompenses</strong><small>Bientôt disponible !</small></span>
        <span>›</span>
      </button>

      <section class="home-v2-actions">
        <button class="home-v2-action primary" id="createBtn" ${coins < GAME_COST ? 'disabled' : ''}>
          <span class="action-symbol">＋</span>
          <span class="action-label">Créer une partie</span>
          <span class="cost-pill"><span class="mini-coin">👑</span>${GAME_COST}</span>
          <span class="action-arrow">›</span>
        </button>
        <button class="home-v2-action secondary" id="joinBtn" ${coins < GAME_COST ? 'disabled' : ''}>
          <span class="action-symbol">👥</span>
          <span class="action-label">Rejoindre une partie</span>
          <span class="cost-pill"><span class="mini-coin">👑</span>${GAME_COST}</span>
          <span class="action-arrow">›</span>
        </button>
      </section>

      ${coins < GAME_COST ? `<p class="home-v2-no-coins">Il te faut ${GAME_COST} pièces pour jouer.</p>` : ''}

      <button class="home-v2-howto" id="howToBtn">
        <span>💡</span>
        <span><strong>Comment jouer ?</strong><small>Règles simples et rapides</small></span>
        <span>›</span>
      </button>

      <footer class="home-v2-footer home-v2-beta" id="betaAdminTrigger" title="Version bêta">Version bêta</footer>
    </main>
  `);

  document.getElementById("createBtn").onclick = () => {
    if (!canAffordGame()) return toast(`Il te faut ${GAME_COST} pièces.`);
    renderNameForm("create");
  };
  document.getElementById("joinBtn").onclick = () => {
    if (!canAffordGame()) return toast(`Il te faut ${GAME_COST} pièces.`);
    renderJoinForm();
  };
  document.getElementById("profileBtn").onclick = renderProfile;
  document.getElementById("coinsBtn").onclick = renderCoins;
  document.getElementById("rewardsBtn").onclick = () => toast("Récompenses bientôt disponibles.");
  document.getElementById("howToBtn").onclick = renderHowTo;

  // Menu admin caché : 7 pressions rapides sur « Version bêta ».
  // Il agit uniquement sur les pièces stockées dans ce navigateur/appareil.
  const betaTrigger = document.getElementById("betaAdminTrigger");
  let adminTapCount = 0;
  let adminTapTimer = null;
  betaTrigger.onclick = () => {
    adminTapCount += 1;
    clearTimeout(adminTapTimer);
    adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 2200);
    if (adminTapCount >= 7) {
      adminTapCount = 0;
      clearTimeout(adminTapTimer);
      openAdminCoinAccess();
    }
  };
}

function openAdminCoinAccess() {
  const code = window.prompt("Code administrateur");
  if (code === null) return;
  if (code.trim() !== ADMIN_COIN_CODE) {
    toast("Code administrateur incorrect.");
    return;
  }
  session.adminCoinCode = code.trim();
  renderAdminCoins();
}

function renderAdminCoins() {
  const coins = getCoins();
  setScreen(`
    <main class="screen utility-screen admin-coins-screen">
      <button class="utility-back" id="backHome">←</button>
      <img src="petit-bac-logo.png" class="utility-logo" alt="P’tit Bac">
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
  setScreen(`
    <main class="screen utility-screen">
      <button class="utility-back" id="backHome">←</button>
      <img src="petit-bac-logo.png" class="utility-logo" alt="P’tit Bac">
      <div class="utility-heading">
        <h1>Mon profil</h1>
        <p>Choisis le pseudo et l’icône qui te représenteront dans les salons.</p>
      </div>
      <form class="utility-card" id="profileForm">
        <label class="label" for="profileName">Ton pseudo</label>
        <input class="input" id="profileName" maxlength="24" autocomplete="nickname" placeholder="Ton pseudo" value="${escapeHtml(profile.name)}">
        <div class="profile-icon-label">Ton icône</div>
        <div class="profile-icon-grid" id="profileIcons">
          ${PROFILE_ICONS.map(icon => `<button type="button" class="profile-icon-choice ${icon === profile.icon ? 'selected' : ''}" data-icon="${icon}">${icon}</button>`).join('')}
        </div>
        <button class="btn btn-primary utility-save" type="submit">Enregistrer</button>
      </form>
    </main>
  `);
  let selectedIcon = profile.icon;
  document.querySelectorAll('[data-icon]').forEach(btn => {
    btn.onclick = () => {
      selectedIcon = btn.dataset.icon;
      document.querySelectorAll('[data-icon]').forEach(b => b.classList.toggle('selected', b === btn));
    };
  });
  document.getElementById('profileForm').onsubmit = e => {
    e.preventDefault();
    const name = document.getElementById('profileName').value.trim();
    if (!name) return toast('Choisis un pseudo.');
    saveProfile(name, selectedIcon);
    toast('Profil enregistré !');
    renderHome();
  };
  document.getElementById('backHome').onclick = renderHome;
}

function renderCoins() {
  const coins = getCoins();
  setScreen(`
    <main class="screen utility-screen">
      <button class="utility-back" id="backHome">←</button>
      <img src="petit-bac-logo.png" class="utility-logo" alt="P’tit Bac">
      <div class="utility-heading"><h1>Mes pièces</h1><p>Les pièces servent à créer ou rejoindre une partie.</p></div>
      <section class="utility-card coins-screen-card">
        <div class="big-coin">👑</div>
        <div class="coin-total">${coins}</div>
        <div class="coin-caption">pièce${coins > 1 ? 's' : ''} disponible${coins > 1 ? 's' : ''}</div>
        <div class="coin-rule"><span>🎮</span><div><strong>Une partie = ${GAME_COST} pièces</strong><small>Les 5 pièces sont débitées au lancement réel de la partie.</small></div></div>
      </section>
    </main>
  `);
  document.getElementById('backHome').onclick = renderHome;
}

function renderCategoriesInfo() {
  const categories = Object.keys(CATEGORY_ICONS);
  setScreen(`
    <main class="screen utility-screen">
      <button class="utility-back" id="backHome">←</button>
      <img src="petit-bac-logo.png" class="utility-logo" alt="P’tit Bac">
      <div class="utility-heading"><h1>12 catégories</h1><p>Six catégories sont tirées au hasard au début de chaque partie.</p></div>
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
      <img src="petit-bac-logo.png" class="utility-logo" alt="P’tit Bac">
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

function renderNameForm(mode) {
  setScreen(`
    <main class="screen form-screen premium-form create-game-screen">
      <button class="back" id="backBtn" aria-label="Retour">←</button>

      <div class="form-heading create-heading">
        <img class="create-game-logo" src="./petit-bac-logo.png" alt="P’tit Bac" />
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
    <main class="screen form-screen premium-form">
      <button class="back" id="backBtn">←</button>
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

function renderLobby() {
  clearInterval(session.timerHandle);
  session.localAnswers = {};
  const state = session.state;
  const user = me();
  const hasBot = state.players.some(p => p.isBot);

  const players = state.players.map((p, index) => {
    const canKick = user?.isHost && !p.isHost && p.id !== session.playerId;
    return `
      <div class="ref-player ${p.isBot ? "ref-player-bot" : ""}">
        ${avatarMarkup(p, index)}
        <div class="ref-player-info">
          <div class="ref-player-name">
            ${escapeHtml(p.name)}
            ${p.id === session.playerId ? `<span class="you-pill">Toi</span>` : ""}
          </div>
          <div class="ref-player-state">${p.isBot ? "Bot de test" : (p.connected ? "Connecté" : "Déconnecté")}</div>
        </div>
        ${p.isHost ? `<span class="ref-host-crown" title="Hôte" aria-label="Hôte">👑</span>` : ""}
        ${canKick ? `<button class="ref-kick" data-kick-id="${p.id}" aria-label="Expulser ${escapeHtml(p.name)}">×</button>` : ""}
      </div>
    `;
  }).join("");

  setScreen(`
    <main class="screen ref-lobby-screen">
      <div class="ref-deco ref-deco-a"></div>
      <div class="ref-deco ref-deco-b"></div>
      <div class="ref-deco ref-deco-c"></div>

      <header class="ref-lobby-header">
        <button class="ref-close" id="leaveLobbyBtn" aria-label="Quitter le salon">×</button>
        <img class="ref-lobby-logo" src="petit-bac-logo.png" alt="Petit Bac">
        <div class="ref-room-meta">
          <div class="ref-room-pill">🔒 <span>Salon privé</span></div>
          <button class="ref-room-pill ref-code-pill" id="copyCode">🔑 <strong>${escapeHtml(state.code)}</strong></button>
        </div>
      </header>

      <section class="ref-stats" aria-label="Informations de la partie">
        <div class="ref-stat-card">
          <span class="ref-stat-icon">${statIcon("player")}</span>
          <div><strong>${state.players.length}</strong><span>joueur${state.players.length > 1 ? "s" : ""}</span></div>
        </div>
        <div class="ref-stat-card">
          <span class="ref-stat-icon">${statIcon("round")}</span>
          <div><strong>${state.rounds}</strong><span>manche${state.rounds > 1 ? "s" : ""}</span></div>
        </div>
        <div class="ref-stat-card">
          <span class="ref-stat-icon">${statIcon("timer")}</span>
          <div><strong>${state.duration}s</strong><span>chrono</span></div>
        </div>
      </section>

      <section class="ref-participants">
        <div class="ref-section-head">
          <div>
            <p class="ref-eyebrow">Participants</p>
            <h2>Dans le salon</h2>
          </div>
          <span class="ref-count">${state.players.length}/12</span>
        </div>

        <div class="ref-player-list">${players}</div>

        ${user?.isHost ? `
          <button class="ref-add-bot" id="addBotBtn" ${hasBot ? "disabled" : ""}>
            <span>🤖</span>
            <strong>${hasBot ? "Bot test ajouté" : "Ajouter un bot test"}</strong>
          </button>
        ` : ""}

        ${user?.isHost ? `
          <button class="ref-start-btn" id="startBtn" ${state.players.length < 2 ? "disabled" : ""}>▶&nbsp; Lancer la partie</button>
        ` : `
          <div class="waiting-host ref-waiting-host">
            <div class="spinner small-spinner"></div>
            <div><strong>En attente de l'hôte</strong><span>La manche va bientôt commencer.</span></div>
          </div>
        `}
      </section>

      <section class="ref-categories">
        <p class="ref-eyebrow">Cette partie</p>
        <h2>6 catégories</h2>
        <div class="ref-category-grid">
          ${state.categories.map(c => `
            <div class="ref-category-card">
              <span class="ref-category-icon">${categoryIcon(c)}</span>
              <span>${escapeHtml(c)}</span>
            </div>
          `).join("")}
        </div>
      </section>
    </main>
  `);

  document.getElementById("copyCode").onclick = async () => {
    try {
      await navigator.clipboard.writeText(state.code);
      toast("Code copié !");
    } catch {
      toast(`Code : ${state.code}`);
    }
  };

  document.getElementById("leaveLobbyBtn").onclick = () => {
    socket.emit("room:leave", { code: state.code, playerId: session.playerId });
    clearSession();
    renderHome();
  };

  if (user?.isHost) {
    const botBtn = document.getElementById("addBotBtn");
    if (botBtn && !hasBot) {
      botBtn.onclick = () => {
        botBtn.disabled = true;
        socket.emit("room:addBot", { code: state.code, playerId: session.playerId });
      };
    }

    const startBtn = document.getElementById("startBtn");
    if (startBtn) {
      startBtn.onclick = () => socket.emit("game:start", { code: state.code, playerId: session.playerId });
    }

    document.querySelectorAll("[data-kick-id]").forEach(btn => {
      btn.onclick = () => socket.emit("room:kick", {
        code: state.code,
        playerId: session.playerId,
        targetPlayerId: btn.dataset.kickId
      });
    });
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
            placeholder="${letter}..."
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

      <header class="play-header">
        <button class="play-back" id="leaveGameBtn" type="button" aria-label="Quitter la partie">‹</button>
        <img class="play-logo" src="./petit-bac-logo.png" alt="P’tit Bac" />
        <div class="play-round-badge">Manche <b>${state.roundIndex + 1}/${state.rounds}</b></div>
      </header>

      <section class="play-hero">
        <div class="play-timer-ring" id="timerRing" style="--progress:100%">
          <div class="play-timer-inner">
            <strong id="timer">${state.duration}</strong>
            <span>secondes</span>
          </div>
        </div>
        <div class="play-letter-label">Lettre</div>
        <div class="play-letter-box"><span>${escapeHtml(letter)}</span></div>
        <p class="play-instruction">Trouve un mot pour chaque catégorie !</p>
      </section>

      <div class="play-answer-list">${fields}</div>

      <div class="play-sticky-action">
        <button class="btn btn-primary play-submit" id="submitRound"><span>➤</span> Valider mes réponses</button>
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
  setScreen(`
    <main class="screen">
      <div class="game-top">
        <span class="round-chip">Manche ${state.roundIndex + 1}/${state.rounds}</span>
        <span class="timer" id="timer">—</span>
      </div>
      <div class="letter-card">
        <div class="letter-label">Lettre</div>
        <div class="letter">${escapeHtml(state.currentLetter)}</div>
      </div>
      <div class="wait-card">
        <div class="spinner"></div>
        <div class="wait-icon">⌛</div><h2>En attente des autres joueurs…</h2>
        <p class="subtitle" style="margin-bottom:0">Tes réponses sont enregistrées. Encore un peu de patience !</p>
      </div>
      <h3 class="section-title">Joueurs</h3>
      <div class="players">
        ${state.players.map(p => `
          <div class="player-row">
            <span>${escapeHtml(p.name)}</span>
            <span class="status-pill ${p.submitted ? "done" : ""}">${p.submitted ? "Prêt" : "Écrit…"}</span>
          </div>
        `).join("")}
      </div>
    </main>
  `);
}

function renderValidation() {
  const state = session.state;
  const user = me();
  const validation = state.validation;
  const pending = validation?.items?.[validation.cursor];

  if (!user?.isHost) {
    setScreen(`
      <main class="screen center-screen validation-screen validation-wait-screen">
        <img src="petit-bac-logo.png" class="validation-logo" alt="P’tit Bac">
        <div class="wait-card">
          <div class="spinner"></div>
          <h2>Validation des réponses</h2>
          <p class="subtitle" style="margin-bottom:0">L’hôte vérifie les réponses uniques.</p>
        </div>
      </main>
    `);
    return;
  }

  if (!pending) {
    setScreen(`
      <main class="screen center-screen validation-screen validation-wait-screen">
        <img src="petit-bac-logo.png" class="validation-logo" alt="P’tit Bac">
        <div class="wait-card"><div class="spinner"></div><h2>Calcul des scores…</h2></div>
      </main>
    `);
    return;
  }

  const remaining = validation.items.filter(i => i.status === "pending").length;
  setScreen(`
    <main class="screen center-screen validation-screen validation-v122">
      <div class="validation-blob validation-blob-a"></div>
      <div class="validation-blob validation-blob-b"></div>
      <section class="review-card">
        <button class="validation-close" id="validationLeave">×</button>
        <img src="petit-bac-logo.png" class="validation-logo" alt="P’tit Bac">
        <div class="review-icon">✓?</div>
        <div class="review-kicker">À valider · ${remaining} restante${remaining > 1 ? "s" : ""}</div>
        <div class="review-answer">${escapeHtml(pending.answer)}</div>
        <div class="review-meta"><span class="review-meta-icon">👤</span><strong>${escapeHtml(pending.category)}</strong> · ${escapeHtml(pending.playerName)}</div>
        <p>Cette réponse est-elle valide<br>pour la lettre <strong>${escapeHtml(state.currentLetter)}</strong> ?</p>
        <div class="review-actions">
          <button class="btn btn-red" id="invalidBtn">✕ Invalide</button>
          <button class="btn btn-green" id="validBtn">✓ Valide</button>
        </div>
      </section>
      <div class="rules-mini"><span>ⓘ</span><p>Les doublons, réponses vides et mauvaises lettres sont déjà mis à 0 automatiquement.</p></div>
    </main>
  `);

  const judge = status => socket.emit("validation:judge", {
    code: state.code,
    playerId: session.playerId,
    itemId: pending.id,
    status
  });
  document.getElementById("invalidBtn").onclick = () => judge("invalid");
  document.getElementById("validBtn").onclick = () => judge("valid");
  document.getElementById("validationLeave").onclick = () => {
    if (!confirm("Quitter la partie pendant la validation ?")) return;
    socket.emit("room:leave", { code: state.code, playerId: session.playerId });
    clearSession();
    renderHome();
  };
}

function rankedPlayers() {
  return [...session.state.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function renderScoreboard() {
  const state = session.state;
  const user = me();
  const rows = rankedPlayers().map((p, index) => {
    const gain = state.lastRoundScores[p.id] ?? 0;
    return `
      <div class="score-row">
        <div class="rank">#${index + 1}</div>
        <div class="score-name">${escapeHtml(p.name)}</div>
        <div>
          <div class="score-total">${p.score}</div>
          <span class="round-gain">+${gain} cette manche</span>
        </div>
      </div>
    `;
  }).join("");

  setScreen(`
    <main class="screen">
      <div class="brand" style="margin-bottom:26px">P'tit Bac</div>
      <h1 style="font-size:3rem">Classement</h1>
      <p class="subtitle">Manche ${state.roundIndex + 1}/${state.rounds} terminée.</p>
      <div class="scoreboard">${rows}</div>

      ${user?.isHost
        ? `<button class="btn btn-primary" id="nextRound">Manche suivante →</button>`
        : `<div class="wait-card"><div class="spinner"></div><h3>En attente de l’hôte</h3></div>`
      }

      <div class="category-pills">
        ${state.categories.map(c => `<span class="category-pill">${escapeHtml(c)}</span>`).join("")}
      </div>
    </main>
  `);

  if (user?.isHost) {
    document.getElementById("nextRound").onclick = () =>
      socket.emit("game:nextRound", { code: state.code, playerId: session.playerId });
  }
}

function renderFinished() {
  const state = session.state;
  const user = me();
  const ranked = rankedPlayers();
  const myReward = Math.max(0, Number(state.myReward || 0));
  const roundsLabel = `${state.rounds} manche${state.rounds > 1 ? "s" : ""} terminée${state.rounds > 1 ? "s" : ""}`;

  const podium = ranked.slice(0, 3).map((p, index) => {
    const isMe = p.id === session.playerId;
    return `
      <div class="podium-card podium-${index + 1}">
        <div class="podium-crown">${index === 0 ? "👑" : index === 1 ? "🥈" : "🥉"}</div>
        ${avatarMarkup(p, index, "podium-avatar")}
        <strong>${escapeHtml(p.name)}${isMe ? ' <small class="me-badge">Toi</small>' : ''}</strong>
        <span>${index + 1}</span>
        <b>${p.score} pt${p.score !== 1 ? "s" : ""}</b>
        ${isMe ? `<div class="private-coin-win">🪙 +${myReward} pièce${myReward !== 1 ? "s" : ""}</div>` : ''}
        ${index === 0 ? `<div class="winner-ribbon">🏆 Vainqueur !</div>` : ''}
      </div>
    `;
  }).join("");

  const rows = ranked.slice(3).map((p, index) => {
    const isMe = p.id === session.playerId;
    return `
      <div class="final-row">
        <span class="final-rank">${index + 4}</span>
        ${avatarMarkup(p, index + 3, "final-avatar")}
        <strong>${escapeHtml(p.name)}${isMe ? ' <small class="me-badge">Toi</small>' : ''}</strong>
        <b>${p.score} pts</b>
        ${isMe ? `<span class="private-row-win">🪙 +${myReward}</span>` : ''}
      </div>
    `;
  }).join("");

  setScreen(`
    <main class="screen finished-screen finished-v122">
      <div class="result-blob result-blob-a"></div>
      <div class="result-blob result-blob-b"></div>
      <div class="result-confetti">✦ ◆ ● ✦ ◆</div>

      <div class="result-topbar">
        <button class="result-back" id="leaveTopBtn">‹</button>
        <img src="petit-bac-logo.png" class="result-logo" alt="P’tit Bac">
        <div class="result-balance">🪙 <strong>${getCoins()}</strong></div>
      </div>

      <header class="final-header">
        <h1>Partie terminée !</h1>
        <p>${roundsLabel} · Bravo à tous !</p>
      </header>

      <section class="podium podium-count-${Math.min(ranked.length, 3)}">${podium}</section>
      ${rows ? `<section class="final-list">${rows}</section>` : ""}

      <section class="result-stats">
        <div><span>👥</span><strong>${ranked.length}</strong><small>Joueur${ranked.length > 1 ? "s" : ""}</small></div>
        <div><span>🎮</span><strong>${state.rounds}</strong><small>Manche${state.rounds > 1 ? "s" : ""}</small></div>
        <div><span>🕒</span><strong>${state.duration === 60 ? "1 min" : `${state.duration}s`}</strong><small>Durée</small></div>
      </section>

      <section class="my-coins-result">
        <div class="my-coins-stack">🪙</div>
        <div><strong>Pièces gagnées !</strong><p>Tu remportes <b>+${myReward} pièce${myReward !== 1 ? "s" : ""}</b>. Nouveau solde : <b>${getCoins()}</b>.</p></div>
      </section>

      <div class="final-actions">
        ${user?.isHost
          ? `<button class="btn btn-light" id="restartBtn">↻ Refaire une partie</button>`
          : `<div class="final-wait">L’hôte peut relancer la partie.</div>`
        }
        <button class="btn btn-primary" id="leaveBtn">⌂ Retour à l’accueil</button>
      </div>
    </main>
  `);

  if (user?.isHost) {
    document.getElementById("restartBtn").onclick = () =>
      socket.emit("game:restart", { code: state.code, playerId: session.playerId });
  }
  const leave = () => {
    socket.emit("room:leave", { code: state.code, playerId: session.playerId });
    clearSession();
    renderHome();
  };
  document.getElementById("leaveBtn").onclick = leave;
  document.getElementById("leaveTopBtn").onclick = leave;
}

window.addEventListener("beforeunload", () => {
  clearInterval(session.timerHandle);
});
