(() => {
  "use strict";

  let homeTimer = null;

  function economyState() {
    try {
      const live = window.PtitBacEconomy?.state?.();
      if (live) return live;
    } catch {}
    return {
      coins: Number(localStorage.getItem("petitbac_walletBalance") || 0),
      lives: 5,
      maxLives: 5,
      secondsToNext: 0
    };
  }

  function formatRecharge(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    if (min >= 1) return `${min} min`;
    return `${sec}s`;
  }

  function refreshHomeResources() {
    const state = economyState();
    const coin = document.getElementById("homePlaqueCoins");
    const lives = document.getElementById("homePlaqueLives");
    const recharge = document.getElementById("homePlaqueRecharge");

    if (coin) coin.textContent = String(Math.max(0, Number(state.coins) || 0));
    if (lives) lives.textContent = `${Math.max(0, Number(state.lives) || 0)}/${Math.max(1, Number(state.maxLives) || 5)}`;

    if (recharge) {
      const isFull = Number(state.lives) >= Number(state.maxLives || 5);
      recharge.textContent = isFull ? "Vies au maximum" : `Recharge dans ${formatRecharge(state.secondsToNext)}`;
      recharge.classList.toggle("is-full", isFull);
    }

    const quick = document.getElementById("homePlaqueQuick");
    if (quick) {
      quick.disabled = Number(state.lives) < 1;
      quick.setAttribute("aria-disabled", Number(state.lives) < 1 ? "true" : "false");
    }
  }

  function bindHomeActions(profile) {
    const ensureProfile = () => {
      const p = getProfile();
      if (!String(p.name || "").trim()) {
        toast("Choisis d’abord ton pseudo.");
        renderProfile();
        return null;
      }
      return p;
    };

    document.getElementById("homePlaqueAvatar")?.addEventListener("click", renderProfile);
    document.getElementById("homePlaqueCoinsBtn")?.addEventListener("click", renderShop);

    document.getElementById("homePlaqueQuick")?.addEventListener("click", () => {
      const p = ensureProfile();
      if (!p) return;

      const eco = economyState();
      if (Number(eco.lives) < 1) {
        return toast(`Plus de vie. Recharge dans ${formatRecharge(eco.secondsToNext)}.`);
      }

      toast("La partie rapide en ligne arrive bientôt !");
    });

    document.getElementById("homePlaqueCreate")?.addEventListener("click", () => {
      const p = ensureProfile();
      if (!p) return;

      socket.emit("room:create", {
        name: p.name.trim(),
        rounds: 5,
        categoryCount: 6,
        categoryDifficulty: "beginner",
        duration: 60,
        avatar: p.icon,
        walletToken: session.walletToken
      }, res => {
        if (!res?.ok) return toast(res?.error || "Impossible de créer le salon.");
        if (res.walletToken) setWalletState(res.walletToken, res.balance);
        saveSession(res.code, res.playerId);
        session.state = res.state;
        render();
      });
    });

    const codeInput = document.getElementById("homePlaqueCode");
    if (codeInput) {
      codeInput.addEventListener("input", () => {
        codeInput.value = codeInput.value
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 5);
      });
      codeInput.addEventListener("keydown", event => {
        if (event.key === "Enter") document.getElementById("homePlaqueJoin")?.click();
      });
    }

    document.getElementById("homePlaqueJoin")?.addEventListener("click", () => {
      const p = ensureProfile();
      if (!p) return;

      const code = String(codeInput?.value || "").trim();
      if (code.length !== 5) return toast("Entre le code à 5 caractères du salon.");

      socket.emit("room:join", {
        code,
        name: p.name.trim(),
        avatar: p.icon,
        walletToken: session.walletToken
      }, res => {
        if (!res?.ok) return toast(res?.error || "Impossible de rejoindre.");
        if (res.walletToken) setWalletState(res.walletToken, res.balance);
        saveSession(res.code, res.playerId);
        session.state = res.state;
        render();
      });
    });

    document.getElementById("homePlaqueShop")?.addEventListener("click", renderShop);
    document.getElementById("homePlaqueRewards")?.addEventListener("click", () => {
      toast("La page Récompenses sera la prochaine à finaliser.");
    });
    document.getElementById("homePlaqueSettings")?.addEventListener("click", () => {
      toast("La page Paramètres sera finalisée ensuite.");
    });

    const betaTrigger = document.getElementById("homePlaqueCrown");
    let adminTapCount = 0;
    let adminTapTimer = null;
    betaTrigger?.addEventListener("click", () => {
      adminTapCount += 1;
      clearTimeout(adminTapTimer);
      adminTapTimer = setTimeout(() => adminTapCount = 0, 2200);
      if (adminTapCount >= 7) {
        adminTapCount = 0;
        clearTimeout(adminTapTimer);
        openAdminCoinAccess();
      }
    });
  }

  function renderPlaquetteHome() {
    if (session.state) return render();

    clearInterval(homeTimer);

    const profile = getProfile();
    const coins = getCoins();
    const eco = economyState();
    const lives = Math.max(0, Number(eco.lives) || 0);
    const maxLives = Math.max(1, Number(eco.maxLives) || 5);
    const rechargeText = lives >= maxLives
      ? "Vies au maximum"
      : `Recharge dans ${formatRecharge(eco.secondsToNext)}`;

    setScreen(`
      <main class="screen home-plaque-v1">
        <div class="home-plaque-bg-letter letter-a">A</div>
        <div class="home-plaque-bg-letter letter-b">B</div>
        <div class="home-plaque-bg-letter letter-c">C</div>
        <div class="home-plaque-bg-letter letter-d">D</div>
        <div class="home-plaque-bg-letter letter-e">E</div>
        <i class="home-plaque-spark spark-1"></i>
        <i class="home-plaque-spark spark-2"></i>
        <i class="home-plaque-spark spark-3"></i>

        <header class="home-plaque-top">
          <div class="home-plaque-resources">
            <button class="home-plaque-chip coin-chip" id="homePlaqueCoinsBtn" type="button" aria-label="Ouvrir la boutique">
              <img class="pb-icon pb-icon-coin" src="/coin.png" alt="">
              <strong id="homePlaqueCoins">${coins}</strong>
            </button>

            <div class="home-plaque-life-wrap">
              <div class="home-plaque-chip life-chip">
                <img class="pb-icon pb-icon-heart" src="/heart.png" alt="">
                <strong id="homePlaqueLives">${lives}/${maxLives}</strong>
              </div>
              <small id="homePlaqueRecharge" class="${lives >= maxLives ? "is-full" : ""}">${rechargeText}</small>
            </div>
          </div>

          <button class="home-plaque-avatar" id="homePlaqueAvatar" type="button" aria-label="Mon profil">
            ${window.PtitBacProfilePhoto?.isImageAvatar?.(profile.icon)
              ? `<img class="home-plaque-avatar-photo" src="${profile.icon}" alt="" draggable="false">`
              : `<span>${escapeHtml(profile.icon || "🐼")}</span>`}
            <i></i>
          </button>
        </header>

        <section class="home-plaque-brand" aria-label="P'tit Bac">
          <div class="home-plaque-logo-glow"></div>
          <img src="/ptitbac.logo.png" alt="P'tit Bac" class="home-plaque-logo">
        </section>

        <section class="home-plaque-actions">
          <button class="home-plaque-main quick" id="homePlaqueQuick" type="button" ${lives < 1 ? "disabled" : ""}>
            <span class="home-plaque-action-icon lightning"><img class="pb-icon pb-icon-action" src="/lightning.png" alt=""></span>
            <span class="home-plaque-action-copy">
              <strong>Partie rapide</strong>
              <small><img class="pb-icon pb-icon-life-inline" src="/heart.png" alt=""> 1 vie</small>
            </span>
            <span class="home-plaque-chevron">›</span>
          </button>

          <button class="home-plaque-main create" id="homePlaqueCreate" type="button">
            <span class="home-plaque-action-icon plus"><img class="pb-icon pb-icon-action" src="/plus.png" alt=""></span>
            <span class="home-plaque-action-copy">
              <strong>Créer un salon</strong>
            </span>
            <span class="home-plaque-chevron">›</span>
          </button>

          <section class="home-plaque-join">
            <div class="home-plaque-join-icon"><img class="pb-icon pb-icon-join" src="/join.png" alt=""></div>
            <div class="home-plaque-join-main">
              <strong>Rejoindre une partie</strong>
              <div class="home-plaque-code-row">
                <input id="homePlaqueCode" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Entrez le code..." aria-label="Code du salon">
                <button id="homePlaqueJoin" type="button">Rejoindre</button>
              </div>
            </div>
          </section>
        </section>

        <nav class="home-plaque-shortcuts" aria-label="Navigation">
          <button id="homePlaqueShop" type="button">
            <span><img class="pb-icon pb-icon-shortcut" src="/shop.png" alt=""></span>
            <strong>Boutique</strong>
            <small>Achat de pièces</small>
          </button>

          <button id="homePlaqueRewards" type="button">
            <span><img class="pb-icon pb-icon-shortcut" src="/rewards.png" alt=""></span>
            <strong>Récompenses</strong>
            <small>Gagner des pièces</small>
          </button>

          <button type="button" data-nav="friends">
            <span><img class="pb-icon pb-icon-shortcut" src="/friends.png" alt=""></span>
            <strong>Amis</strong>
            <small>Joue avec eux</small>
          </button>

          <button id="homePlaqueSettings" type="button">
            <span><img class="pb-icon pb-icon-shortcut" src="/settings.png" alt=""></span>
            <strong>Paramètres</strong>
            <small>Personnaliser</small>
          </button>
        </nav>

        <footer class="home-plaque-footer">
          <button id="homePlaqueCrown" class="home-plaque-crown" type="button" aria-label="Version bêta"><img class="pb-icon pb-icon-crown" src="/crown.png" alt=""></button>
          <div><span></span><p>Des lettres, des mots, des fous rires !</p><span></span></div>
        </footer>

        <div class="home-plaque-wave wave-1"></div>
        <div class="home-plaque-wave wave-2"></div>
      </main>
    `);

    bindHomeActions(profile);
    refreshHomeResources();
    homeTimer = setInterval(refreshHomeResources, 1000);
  }

  window.renderHome = renderPlaquetteHome;
  try { renderHome = renderPlaquetteHome; } catch {}

  if (!session.state && document.getElementById("app")?.children.length) {
    renderPlaquetteHome();
  }
})();
