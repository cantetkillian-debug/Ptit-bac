(() => {
  "use strict";

  const ecoSocket = io({forceNew:true});
  const eco = {
    coins:Number(localStorage.getItem("petitbac_walletBalance") || 0),
    lives:5,
    maxLives:5,
    nextLifeAt:null,
    secondsToNext:0,
    rewardedAdCoins:80
  };

  let refreshing = false;

  function walletToken() {
    return localStorage.getItem("petitbac_walletToken") || "";
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function localToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._ecoTimer);
    toast._ecoTimer = setTimeout(() => toast.classList.remove("show"), 2300);
  }

  function requestState() {
    const token = walletToken();
    if (!token || refreshing) return;

    refreshing = true;
    ecoSocket.emit("economy:get", {walletToken:token}, res => {
      refreshing = false;
      if (!res?.ok) return;
      Object.assign(eco, res);
      renderEconomyUI();
    });
  }

  function ensureHud() {
    let el = document.getElementById("economyHud");
    if (el) return el;

    el = document.createElement("div");
    el.id = "economyHud";
    el.className = "economy-hud";
    document.body.appendChild(el);
    return el;
  }

  function renderHud() {
    const waiting = eco.lives < eco.maxLives;

    ensureHud().innerHTML = `
      <div class="economy-pill coins">🪙 <b>${Math.max(0, Number(eco.coins) || 0)}</b></div>
      <div class="economy-pill life">
        <span class="economy-heart">♥</span>
        <b>${eco.lives}/${eco.maxLives}</b>
        ${waiting ? `<small>${fmt(eco.secondsToNext)}</small>` : ""}
      </div>`;
  }

  function patchCurrentScreen() {
    // L'ancien app.js affiche encore 5 pièces : on remplace toute l'UI par les vies.
    document.querySelectorAll(".home-v129-cost").forEach(el => {
      const wanted = `<span class="economy-heart">♥</span><b>1</b>`;
      if (el.innerHTML !== wanted) el.innerHTML = wanted;
    });

    document.querySelectorAll(".home-v129-no-coins").forEach(el => el.remove());

    const quick = document.getElementById("quickPlayBtn");
    if (quick) {
      quick.disabled = eco.lives < 1;
      quick.title = eco.lives < 1
        ? "Plus de vie. Une vie se recharge toutes les 30 minutes."
        : "1 vie par partie";
    }

    // Boutique: la nouvelle récompense est 80 pièces.
    const shopCard = document.querySelector(".shop-reward-card");
    if (shopCard) {
      const p = shopCard.querySelector(".shop-reward-copy p");
      const value = shopCard.querySelector(".shop-reward-value b");
      const rewardText = `Regarde une courte publicité et reçois <strong>80 pièces</strong>.`;
      if (p && p.innerHTML !== rewardText) p.innerHTML = rewardText;
      if (value && value.textContent !== "+80") value.textContent = "+80";
    }

    const info = document.querySelector(".shop-info");
    if (info) {
      const infoText = `ⓘ Les parties multijoueur coûtent <strong>1 vie</strong>. Une vie revient toutes les <strong>30 minutes</strong>.`;
      if (info.innerHTML !== infoText) info.innerHTML = infoText;
    }

    // Ancien panneau admin caché: cohérence visuelle avec 50 pièces.
    const reset = document.getElementById("resetCoins");
    if (reset) reset.textContent = "Remettre à 50";
  }

  function renderEconomyUI() {
    renderHud();
    patchCurrentScreen();
  }

  // L'ancien client vérifie encore les pièces avant certaines anciennes routes.
  // Le serveur est désormais la seule autorité pour l'accès aux parties.
  // On neutralise uniquement ce vieux contrôle côté client.
  if (typeof window.canAffordGame === "function") {
    window.canAffordGame = () => true;
  }

  ecoSocket.on("connect", requestState);

  ecoSocket.on("economy:update", value => {
    if (!value) return;
    Object.assign(eco, value);
    renderEconomyUI();
  });

  ecoSocket.on("wallet:update", ({balance} = {}) => {
    if (!Number.isFinite(Number(balance))) return;
    eco.coins = Math.max(0, Math.floor(Number(balance)));
    localStorage.setItem("petitbac_walletBalance", String(eco.coins));
    renderEconomyUI();
  });

  // Affiche un message correct si un utilisateur tente de lancer avec 0 vie.
  document.addEventListener("click", event => {
    const btn = event.target.closest?.("#quickPlayBtn");
    if (!btn || eco.lives > 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    localToast(`Plus de vie. Prochaine vie dans ${fmt(eco.secondsToNext)}.`);
  }, true);

  // Important: pas de MutationObserver ici.
  // patchCurrentScreen() modifie lui-même le DOM ; l'observer provoquerait une
  // boucle de mutations pouvant bloquer Safari et laisser un écran vide.
  setInterval(patchCurrentScreen, 500);

  // Filet de sécurité: l'accueil ne doit jamais rester vide uniquement parce
  // que Socket.IO / le portefeuille met du temps à répondre.
  setTimeout(() => {
    const app = document.getElementById("app");
    if (app && (!app.children.length || app.querySelector("[role=\"status\"]")) && typeof window.renderHome === "function") {
      try { window.renderHome(); } catch (err) {
        console.warn("Affichage accueil de secours:", err?.message || err);
      }
    }
  }, 1200);

  setInterval(() => {
    if (eco.lives < eco.maxLives && eco.nextLifeAt) {
      eco.secondsToNext = Math.max(
        0,
        Math.ceil((Number(eco.nextLifeAt) - Date.now()) / 1000)
      );

      if (eco.secondsToNext <= 0) requestState();
      else renderHud();
    }
  }, 1000);

  setInterval(requestState, 60000);

  window.PtitBacEconomy = {
    refresh:requestState,
    state:() => ({...eco}),
    rewardedAdCoins:80
  };
})();
