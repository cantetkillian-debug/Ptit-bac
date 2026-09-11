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
    if (coin) coin.textContent = String(Math.max(0, Number(state.coins) || 0));
    if (lives) lives.textContent = `${Math.max(0, Number(state.lives) || 0)}/${Math.max(1, Number(state.maxLives) || 5)}`;

    refreshResourcePopup();

    const quick = document.getElementById("homePlaqueQuick");
    if (quick) {
      quick.disabled = Number(state.lives) < 1;
      quick.setAttribute("aria-disabled", Number(state.lives) < 1 ? "true" : "false");
    }
  }

  function closeResourcePopup() {
    document.getElementById("homeResourcePopover")?.remove();
  }

  function resourcePopupContent(type) {
    const state = economyState();
    const coins = Math.max(0, Number(state.coins) || 0);
    const lives = Math.max(0, Number(state.lives) || 0);
    const maxLives = Math.max(1, Number(state.maxLives) || 5);
    const isFull = lives >= maxLives;

    if (type === "coins") {
      return `
        <div class="home-resource-popup-card" role="dialog" aria-label="Mes pièces">
          <strong class="home-resource-popup-value">${coins} pièce${coins > 1 ? "s" : ""}</strong>
          <button id="homeResourceShop" type="button">Ajouter des pièces</button>
        </div>`;
    }

    return `
      <div class="home-resource-popup-card" role="dialog" aria-label="Mes vies">
        <strong class="home-resource-popup-value">${lives}/${maxLives} vies</strong>
        <small>
          ${isFull
            ? "Vies rechargées"
            : `Prochaine vie dans ${formatRecharge(state.secondsToNext)}`}
        </small>
      </div>`;
  }

  function openResourcePopup(type, anchorEl) {
    const current = document.getElementById("homeResourcePopover");
    if (current?.dataset.type === type) {
      current.remove();
      return;
    }

    current?.remove();

    const layer = document.createElement("div");
    layer.id = "homeResourcePopover";
    layer.className = "home-resource-popover";
    layer.dataset.type = type;
    layer.innerHTML = resourcePopupContent(type);

    document.querySelector(".home-plaque-v1")?.appendChild(layer);

    const rect = anchorEl?.getBoundingClientRect?.();
    const host = document.querySelector(".home-plaque-v1")?.getBoundingClientRect?.();
    if (rect && host) {
      const center = rect.left - host.left + rect.width / 2;
      layer.style.setProperty("--popup-center", `${center}px`);
    }

    layer.addEventListener("click", event => {
      if (event.target === layer) closeResourcePopup();
    });

    document.getElementById("homeResourceShop")?.addEventListener("click", () => {
      closeResourcePopup();
      renderShop();
    });
  }

  function refreshResourcePopup() {
    const popup = document.getElementById("homeResourcePopover");
    if (!popup) return;
    const type = popup.dataset.type;
    const oldCard = popup.querySelector(".home-resource-popup-card");
    if (!oldCard) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = resourcePopupContent(type);
    const newCard = wrapper.firstElementChild;
    oldCard.replaceWith(newCard);

    document.getElementById("homeResourceShop")?.addEventListener("click", () => {
      closeResourcePopup();
      renderShop();
    });
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

    const coinsButton = document.getElementById("homePlaqueCoinsBtn");
    const livesButton = document.getElementById("homePlaqueLivesBtn");

    coinsButton?.addEventListener("click", event => {
      event.stopPropagation();
      openResourcePopup("coins", coinsButton);
    });

    livesButton?.addEventListener("click", event => {
      event.stopPropagation();
      openResourcePopup("lives", livesButton);
    });

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

            <button class="home-plaque-chip life-chip" id="homePlaqueLivesBtn" type="button" aria-label="Voir mes vies">
              <img class="pb-icon pb-icon-heart" src="/heart.png" alt="">
              <strong id="homePlaqueLives">${lives}/${maxLives}</strong>
            </button>
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
          </button>

          <button id="homePlaqueRewards" type="button">
            <span><img class="pb-icon pb-icon-shortcut" src="/rewards.png" alt=""></span>
            <strong>Récompenses</strong>
          </button>

          <button type="button" data-nav="friends">
            <span><img class="pb-icon pb-icon-shortcut" src="/friends.png" alt=""></span>
            <strong>Amis</strong>
          </button>

          <button id="homePlaqueSettings" type="button">
            <span><img class="pb-icon pb-icon-shortcut" src="/settings.png" alt=""></span>
            <strong>Paramètres</strong>
          </button>
        </nav>

        <footer class="home-plaque-footer">
          <button id="homePlaqueCrown" class="home-plaque-beta-bar" type="button" aria-label="Version bêta">
            <span class="home-plaque-beta-line"></span>
            <i></i>
            <span class="home-plaque-beta-line"></span>
          </button>
          <p>Version bêta</p>
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
